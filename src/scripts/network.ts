// 子页面顶部的动态神经网络背景（节点 + 连线 + 流动的信号脉冲）
type Node = { x: number; y: number; vx: number; vy: number; r: number; c: string };
type Pulse = { a: Node; b: Node; t: number; speed: number };

const DARK = ['56,225,255', '96,140,255', '170,122,255', '190,215,255'];
// 浅色标题带上用成电蓝系
const LIGHT = ['11,94,178', '47,134,222', '9,59,109', '120,165,215'];
// 背景网络动效很轻微，始终播放（不受系统「减少动画」设置影响）
const reduceMotion = false;

function setup(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const density = Number(canvas.dataset.density) || 1;
  const light = canvas.dataset.theme === 'light';
  const COLORS = light ? LIGHT : DARK;
  const lineAlpha = light ? 0.16 : 0.3;
  const mouseRgb = light ? '245,124,64' : '160,215,255';
  const host = canvas.parentElement ?? canvas;
  const LINK = 150;
  const LINK2 = LINK * LINK;
  const MOUSE = 190;
  let w = 0;
  let h = 0;
  let nodes: Node[] = [];
  let pulses: Pulse[] = [];
  const mouse = { x: 0, y: 0, on: false };
  let visible = true;
  let frame = 0;
  let raf = 0;

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const spawn = (): Node => {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(0.12, 0.36);
    return {
      x: rand(0, w),
      y: rand(0, h),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: rand(0.8, 2.2),
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(150, Math.round(((w * h) / 10000) * density));
    nodes = nodes.slice(0, count);
    while (nodes.length < count) nodes.push(spawn());
    for (const n of nodes) {
      if (n.x > w) n.x = rand(0, w);
      if (n.y > h) n.y = rand(0, h);
    }
    pulses = [];
    if (reduceMotion) draw();
  }

  function neighbor(a: Node, exclude?: Node) {
    const near = nodes.filter((b) => b !== a && b !== exclude && (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < LINK2 * 0.7);
    return near[Math.floor(Math.random() * near.length)];
  }

  function update() {
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -10) n.x = w + 10;
      else if (n.x > w + 10) n.x = -10;
      if (n.y < -10) n.y = h + 10;
      else if (n.y > h + 10) n.y = -10;
    }
    if (frame % 16 === 0 && pulses.length < 8 * density + 2 && nodes.length) {
      const a = nodes[Math.floor(Math.random() * nodes.length)];
      const b = neighbor(a);
      if (b) pulses.push({ a, b, t: 0, speed: rand(0.01, 0.02) });
    }
    const next: Pulse[] = [];
    for (const p of pulses) {
      p.t += p.speed;
      const far = (p.a.x - p.b.x) ** 2 + (p.a.y - p.b.y) ** 2 > LINK2;
      if (far) continue;
      if (p.t < 1) next.push(p);
      else if (Math.random() < 0.6) {
        const b = neighbor(p.b, p.a);
        if (b) next.push({ a: p.b, b, t: 0, speed: p.speed });
      }
    }
    pulses = next;
  }

  function draw() {
    const c = ctx!;
    c.clearRect(0, 0, w, h);
    c.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (d2 > LINK2) continue;
        c.strokeStyle = `rgba(${a.c},${(1 - Math.sqrt(d2) / LINK) * lineAlpha})`;
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
    }
    if (mouse.on) {
      for (const n of nodes) {
        const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        if (d > MOUSE) continue;
        c.strokeStyle = `rgba(${mouseRgb},${(1 - d / MOUSE) * 0.5})`;
        c.beginPath();
        c.moveTo(mouse.x, mouse.y);
        c.lineTo(n.x, n.y);
        c.stroke();
      }
    }
    for (const n of nodes) {
      c.fillStyle = `rgba(${n.c},${light ? 0.45 : 0.9})`;
      c.beginPath();
      c.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      c.fill();
    }
    for (const p of pulses) {
      const x = p.a.x + (p.b.x - p.a.x) * p.t;
      const y = p.a.y + (p.b.y - p.a.y) * p.t;
      c.strokeStyle = light ? 'rgba(11,94,178,0.28)' : 'rgba(140,215,255,0.35)';
      c.beginPath();
      c.moveTo(p.a.x, p.a.y);
      c.lineTo(p.b.x, p.b.y);
      c.stroke();
      const g = c.createRadialGradient(x, y, 0, x, y, 10);
      if (light) {
        g.addColorStop(0, 'rgba(245,124,64,0.95)');
        g.addColorStop(0.35, 'rgba(245,124,64,0.35)');
        g.addColorStop(1, 'rgba(245,124,64,0)');
      } else {
        g.addColorStop(0, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.3, 'rgba(120,220,255,0.55)');
        g.addColorStop(1, 'rgba(59,91,253,0)');
      }
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, 10, 0, Math.PI * 2);
      c.fill();
    }
  }

  function loop() {
    raf = 0;
    if (!visible || document.hidden) return;
    frame++;
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (!reduceMotion && !raf) raf = requestAnimationFrame(loop);
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) start();
  });
  host.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.on = true;
  });
  host.addEventListener('pointerleave', () => (mouse.on = false));
  resize();
  start();
}

document.querySelectorAll<HTMLCanvasElement>('[data-net]').forEach(setup);
