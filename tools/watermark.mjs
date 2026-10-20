// 给网站上的照片加浅色平铺水印
// 用法：npm run watermark
//
// - 原图放在 assets/originals/ 下，目录结构与 public/ 相同，例如
//     assets/originals/images/life/2026-graduation/01.jpg → public/images/life/2026-graduation/01.jpg
// - 水印文字和透明度在 src/data/site.yaml 的 watermark 中设置；改完重新运行本命令即可
// - assets/originals/ 不提交到 Git（仓库公开，原图不对外发布），请自行备份
// - 新增照片：先把原图放进 assets/originals/ 对应位置，再运行本命令
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'assets', 'originals');
const outDir = join(root, 'public');
const site = parse(readFileSync(join(root, 'src', 'data', 'site.yaml'), 'utf8')) ?? {};
const text = String(site.watermark?.text ?? 'AI Lab');
const opacity = Number(site.watermark?.opacity ?? 0.16);

if (!existsSync(srcDir)) {
  console.error(`找不到原图目录 ${relative(root, srcDir)}`);
  process.exit(1);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 斜向平铺的文字，白字配极淡的深色描边，浅色和深色背景上都能看见又不抢画面
function overlay(width, height) {
  const size = Math.round(Math.min(56, Math.max(16, Math.min(width, height) * 0.05)));
  const tileW = Math.round(size * (text.length * 0.62 + 8));
  const tileH = Math.round(size * 6.5);
  const stroke = Math.max(1, size * 0.04).toFixed(1);
  const glyph = (x, y) =>
    `<text x="${x}" y="${y}" font-size="${size}">${esc(text)}</text>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
      <g font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="600" fill="#ffffff" fill-opacity="${opacity}"
         stroke="#0b1b33" stroke-opacity="${(opacity * 0.45).toFixed(3)}" stroke-width="${stroke}" paint-order="stroke">
        ${glyph(0, size)}
        ${glyph(Math.round(tileW / 2), Math.round(size + tileH / 2))}
      </g>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)"/>
</svg>`);
}

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jpe?g|png|webp)$/i.test(f)) files.push(p);
  }
})(srcDir);

let done = 0;
for (const file of files) {
  const rel = relative(srcDir, file);
  const out = join(outDir, rel);
  mkdirSync(dirname(out), { recursive: true });
  const img = sharp(file).rotate();
  const { width, height } = await img.metadata().then((m) => (m.orientation >= 5 ? { width: m.height, height: m.width } : m));
  const composed = img.composite([{ input: overlay(width, height), top: 0, left: 0 }]);
  const ext = extname(file).toLowerCase();
  if (ext === '.png') await composed.png({ compressionLevel: 9 }).toFile(out);
  else if (ext === '.webp') await composed.webp({ quality: 84 }).toFile(out);
  else await composed.jpeg({ quality: 84, mozjpeg: true }).toFile(out);
  done++;
}
console.log(`已为 ${done} 张图片加上水印「${text}」（透明度 ${opacity}）→ public/`);
