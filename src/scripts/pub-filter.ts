// 论文页 / 专利页 / 科研项目页共用的筛选：类型标签页（URL ?type=）、分类（?category=）、关键词（?q=）、年份
// 条目需带 data-pub / data-type / data-category / data-year / data-search 属性
const root = document.querySelector<HTMLElement>('[data-pubs]');
if (root) {
  const params = new URLSearchParams(location.search);
  const input = root.querySelector<HTMLInputElement>('[data-pub-search]')!;
  const yearSel = root.querySelector<HTMLSelectElement>('[data-pub-year]')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-type-tab]')];
  const indicator = root.querySelector<HTMLElement>('.tab-indicator')!;
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-cat-chip]')];
  const items = [...root.querySelectorAll<HTMLElement>('[data-pub]')];
  const groups = [...root.querySelectorAll<HTMLElement>('[data-year-group]')];
  const empty = root.querySelector<HTMLElement>('[data-pub-empty]')!;
  // 论文页顶部的「高影响因子论文」：只在全部分类、未按年份 / 关键词筛选、且不是只看会议或预印本时显示
  const top = root.querySelector<HTMLElement>('[data-pub-top]');
  // 论文页：条数只在筛选或搜索时显示；列表末尾的省略号在按年份筛选或没有结果时隐藏
  const more = root.querySelector<HTMLElement>('[data-pub-more]');
  const count = root.querySelector<HTMLElement>('[data-pub-count]')!;
  const hideUnfiltered = count.hasAttribute('data-hide-unfiltered');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pick = (value: string | null, options: string[]) => (value && options.includes(value) ? value : 'all');
  let type = pick(params.get('type'), tabs.map((t) => t.dataset.typeTab!));
  let cat = pick(params.get('category'), chips.map((c) => c.dataset.catChip!));
  input.value = params.get('q') ?? '';

  // 标签页下方的滑动指示条
  function moveIndicator() {
    const active = tabs.find((t) => t.dataset.typeTab === type);
    if (!active) return;
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  function syncUrl() {
    const url = new URL(location.href);
    const set = (k: string, v: string) => (v && v !== 'all' ? url.searchParams.set(k, v) : url.searchParams.delete(k));
    set('type', type);
    set('category', cat);
    set('q', input.value.trim());
    history.replaceState(history.state, '', url);
  }

  function apply(animate = true) {
    const q = input.value.trim().toLowerCase();
    const year = yearSel.value;
    const shown: HTMLElement[] = [];
    for (const it of items) {
      const ok =
        (type === 'all' || it.dataset.type === type) &&
        (cat === 'all' || it.dataset.category === cat) &&
        (year === 'all' || it.dataset.year === year) &&
        (!q || (it.dataset.search ?? '').includes(q));
      it.hidden = !ok;
      if (ok) shown.push(it);
    }
    for (const g of groups) g.hidden = !g.querySelector('[data-pub]:not([hidden])');
    if (top) top.hidden = !(cat === 'all' && (type === 'all' || type === 'journal') && year === 'all' && !q);
    tabs.forEach((t) => {
      const on = t.dataset.typeTab === type;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    chips.forEach((c) => {
      const on = c.dataset.catChip === cat;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    empty.hidden = shown.length !== 0;
    count.textContent = (count.dataset.template ?? '{n}').replace('{n}', String(shown.length));
    if (hideUnfiltered) count.hidden = type === 'all' && cat === 'all' && year === 'all' && !q;
    if (more) more.hidden = year !== 'all' || shown.length === 0;
    moveIndicator();
    // 切换时列表依次淡入
    if (animate && !reduce) {
      shown.slice(0, 14).forEach((el, i) =>
        el.animate(
          [
            { opacity: 0, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 420, delay: i * 35, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'backwards' },
        ),
      );
    }
  }

  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      type = t.dataset.typeTab ?? 'all';
      syncUrl();
      apply();
    }),
  );
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      cat = c.dataset.catChip ?? 'all';
      syncUrl();
      apply();
    }),
  );
  let timer = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      syncUrl();
      apply();
    }, 160);
  });
  yearSel.addEventListener('change', () => apply());
  window.addEventListener('resize', moveIndicator);
  apply(false);
  requestAnimationFrame(() => root.classList.add('tabs-ready'));
}
