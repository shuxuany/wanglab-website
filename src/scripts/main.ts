// 全站通用交互：丝滑滚动、导航栏（吸顶、滑动指示条、移动端菜单）、轮播图、滚动浮现、数字滚动、逐字点亮
import Lenis from 'lenis';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
(window as any).__mainReady = true;

const navbar = document.querySelector<HTMLElement>('[data-navbar]');
const navH = () => navbar?.offsetHeight ?? 54;

// ---------- 丝滑滚动 ----------
let lenis: Lenis | null = null;
if (!reduce) {
  const stickyNav = document.querySelector<HTMLElement>('.dir-nav');
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true, anchors: { offset: -(navH() + (stickyNav?.offsetHeight ?? 0) + 20) } });
  const raf = (time: number) => {
    lenis!.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

// ---------- 导航栏：吸顶后显示小标志并加阴影 ----------
function onNavScroll() {
  if (!navbar) return;
  navbar.classList.toggle('is-stuck', navbar.getBoundingClientRect().top <= 0 && window.scrollY > 10);
}
onNavScroll();
window.addEventListener('scroll', onNavScroll, { passive: true });

// ---------- 导航栏：跟随鼠标滑动的指示条 ----------
const navList = navbar?.querySelector<HTMLElement>('[data-nav]');
const indicator = navList?.querySelector<HTMLElement>('.nav-indicator');
const navLinks = [...(navList?.querySelectorAll<HTMLElement>('.nav-item > .nav-link') ?? [])];
const activeLink = navLinks.find((a) => a.classList.contains('active'));

function moveIndicator(target?: HTMLElement) {
  if (!indicator || !navList) return;
  if (!target) {
    indicator.style.opacity = '0';
    return;
  }
  const item = target.parentElement as HTMLElement;
  const cs = getComputedStyle(target);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  indicator.style.opacity = '1';
  indicator.style.width = `${target.offsetWidth - padL - padR}px`;
  indicator.style.transform = `translateX(${item.offsetLeft + padL}px)`;
}

if (indicator) {
  moveIndicator(activeLink);
  requestAnimationFrame(() => indicator.classList.add('is-ready'));
  navLinks.forEach((a) => {
    a.parentElement!.addEventListener('mouseenter', () => moveIndicator(a));
    a.addEventListener('focus', () => moveIndicator(a));
  });
  navList!.addEventListener('mouseleave', () => moveIndicator(activeLink));
  window.addEventListener('resize', () => moveIndicator(activeLink));
  document.fonts?.ready.then(() => moveIndicator(activeLink));
}

// ---------- 移动端菜单 ----------
const toggle = navbar?.querySelector<HTMLButtonElement>('.menu-toggle');
function setMenu(open: boolean) {
  navbar?.classList.toggle('nav-open', open);
  toggle?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('nav-locked', open);
  if (open) lenis?.stop();
  else lenis?.start();
}
toggle?.addEventListener('click', () => setMenu(!navbar?.classList.contains('nav-open')));
navList?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});

// ---------- 轮播图 ----------
document.querySelectorAll<HTMLElement>('[data-slider]').forEach((slider) => {
  const slides = [...slider.querySelectorAll<HTMLElement>('[data-slide]')];
  const dots = [...slider.querySelectorAll<HTMLButtonElement>('[data-dot]')];
  const play = slider.querySelector<HTMLButtonElement>('[data-play]');
  const interval = Number(slider.dataset.interval) || 7000;
  slider.style.setProperty('--interval', `${interval}ms`);
  let index = 0;
  let timer = 0;
  // 轮播始终自动播放（鼠标停留时暂停）；系统「减少动画」设置不影响
  let paused = false;
  let hovering = false;

  function show(i: number) {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, k) => {
      const on = k === index;
      s.classList.toggle('is-active', on);
      s.setAttribute('aria-hidden', String(!on));
      s.querySelectorAll<HTMLElement>('a, button').forEach((el) => (el.tabIndex = on ? 0 : -1));
    });
    dots.forEach((d, k) => {
      d.classList.remove('is-active');
      // 重新触发进度条动画
      void d.offsetWidth;
      d.classList.toggle('is-active', k === index);
      d.setAttribute('aria-current', String(k === index));
    });
    slider.dispatchEvent(new CustomEvent('slide:change', { detail: index }));
    schedule();
  }

  function schedule() {
    window.clearTimeout(timer);
    if (!paused && !hovering && slides.length > 1) timer = window.setTimeout(() => show(index + 1), interval);
  }

  function setPaused(p: boolean) {
    paused = p;
    slider.classList.toggle('is-paused', paused || hovering);
    play?.setAttribute('aria-label', (paused ? play.dataset.labelPlay : play.dataset.labelPause) ?? '');
    schedule();
  }

  slider.querySelector('[data-prev]')?.addEventListener('click', () => show(index - 1));
  slider.querySelector('[data-next]')?.addEventListener('click', () => show(index + 1));
  dots.forEach((d) => d.addEventListener('click', () => show(Number(d.dataset.dot))));
  play?.addEventListener('click', () => setPaused(!paused));

  // 鼠标停留在轮播图上时暂停（方便阅读）
  slider.addEventListener('mouseenter', () => {
    hovering = true;
    slider.classList.add('is-paused');
    window.clearTimeout(timer);
  });
  slider.addEventListener('mouseleave', () => {
    hovering = false;
    slider.classList.toggle('is-paused', paused);
    // 鼠标离开后从头开始当前张的计时，进度条也重新开始
    show(index);
  });

  // 键盘左右键
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // 触屏左右滑动
  let x0: number | null = null;
  slider.addEventListener('touchstart', (e) => (x0 = e.touches[0].clientX), { passive: true });
  slider.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  // 页面切到后台时暂停
  document.addEventListener('visibilitychange', () => (document.hidden ? window.clearTimeout(timer) : schedule()));

  setPaused(paused);
  show(0);
});

// ---------- 滚动条（新闻播报、期刊滚动）：按内容长度设定速度，保证匀速 ----------
document.querySelectorAll<HTMLElement>('[data-marquee]').forEach((box) => {
  const track = box.querySelector<HTMLElement>('.marquee-track');
  const first = track?.firstElementChild as HTMLElement | null;
  if (!track || !first) return;
  const speed = Number(box.dataset.speed) || 45; // 像素/秒
  const apply = () => track.style.setProperty('--dur', `${Math.max(12, first.offsetWidth / speed).toFixed(1)}s`);
  apply();
  window.addEventListener('resize', apply);
  document.fonts?.ready.then(apply);
});

// ---------- 滚动浮现 ----------
const reveals = document.querySelectorAll('[data-reveal]');
let ioAlive = false;
const revealIO = new IntersectionObserver(
  (entries) => {
    ioAlive = true;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-visible');
      revealIO.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
);
reveals.forEach((el) => revealIO.observe(el));
// 保险：如果浏览器迟迟没有回调（例如页面在后台），直接显示全部内容
window.setTimeout(() => {
  if (!ioAlive) reveals.forEach((el) => el.classList.add('is-visible'));
}, 2000);

// ---------- 数字滚动 ----------
const countIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countIO.unobserve(e.target);
      const el = e.target as HTMLElement;
      const target = Number(el.dataset.count);
      if (reduce || !Number.isFinite(target)) continue;
      const suffix = el.dataset.suffix ?? '';
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / 1600);
        el.textContent = `${Math.round(target * (1 - (1 - p) ** 3))}${suffix}`;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  },
  { threshold: 0.4 },
);
document.querySelectorAll('[data-count]').forEach((el) => countIO.observe(el));

// ---------- 复制邮箱 ----------
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const label = btn.querySelector<HTMLElement>('[data-copy-label]');
    try {
      await navigator.clipboard.writeText(btn.dataset.copy ?? '');
      if (label) {
        const old = label.textContent;
        label.textContent = btn.dataset.copied ?? 'OK';
        window.setTimeout(() => (label.textContent = old), 2000);
      }
    } catch {
      /* 浏览器不允许时忽略 */
    }
  });
});

// ---------- 逐字点亮 ----------
const wordBlocks = [...document.querySelectorAll<HTMLElement>('[data-words]')];

// 把文字拆成单个字符（中文）或单词（英文）
const wordSpans = wordBlocks.map((block) => {
  const text = block.textContent ?? '';
  const parts = /[㐀-鿿]/.test(text) ? [...text] : text.split(/(\s+)/);
  block.textContent = '';
  const spans: HTMLElement[] = [];
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      block.append(part);
      continue;
    }
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = part;
    block.append(s);
    spans.push(s);
  }
  block.setAttribute('aria-label', text);
  return { block, spans, lit: -1 };
});

let ticking = false;
function updateWords() {
  ticking = false;
  const vh = window.innerHeight;
  for (const w of wordSpans) {
    const r = w.block.getBoundingClientRect();
    const p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.92 - r.top) / (r.height + vh * 0.3)));
    const lit = Math.round(p * w.spans.length);
    if (lit === w.lit) continue;
    w.spans.forEach((s, i) => s.classList.toggle('on', i < lit));
    w.lit = lit;
  }
}

if (wordSpans.length) {
  updateWords();
  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateWords);
      }
    },
    { passive: true },
  );
  window.addEventListener('resize', updateWords);
}
