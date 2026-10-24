// 学生获奖三维档案阵列的入口：区块接近视口时再加载 three.js 场景（单独打包，不拖慢其他页面）
// 浏览器不支持 WebGL2 或加载失败时，保留区块内的文字列表
const root = document.querySelector<HTMLElement>('[data-rl]');

function webgl2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

if (root) {
  if (!webgl2()) {
    root.classList.add('is-fallback');
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        import('./award-archive-scene')
          .then((m) => m.mount(root))
          .catch((err) => {
            console.error(err);
            root.classList.add('is-fallback');
          });
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(root);
  }
}
