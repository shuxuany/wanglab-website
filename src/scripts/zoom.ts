// 点击证书 / 活动照片放大查看（获奖证书页、学术交流页共用）
// 触发元素：<button data-zoom="图片地址" data-caption="说明">；弹窗：<dialog data-zoom-box>
const box = document.querySelector<HTMLDialogElement>('[data-zoom-box]');
if (box) {
  const img = box.querySelector<HTMLImageElement>('img')!;
  const cap = box.querySelector<HTMLElement>('[data-zoom-caption]')!;
  document.querySelectorAll<HTMLElement>('[data-zoom]').forEach((el) =>
    el.addEventListener('click', () => {
      img.src = el.dataset.zoom ?? '';
      img.alt = el.dataset.caption ?? '';
      cap.textContent = el.dataset.caption ?? '';
      box.showModal();
      document.documentElement.classList.add('lb-open');
    }),
  );
  const close = () => box.close();
  box.querySelector('[data-zoom-close]')?.addEventListener('click', close);
  // 点击图片以外的区域关闭
  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });
  box.addEventListener('close', () => document.documentElement.classList.remove('lb-open'));
}
