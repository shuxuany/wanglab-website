// 生成可以拷贝到其他电脑、离线打开的网站压缩包：release/VCID-Lab网站.zip
// 用法：npm run pack   （加 -- --no-build 可跳过重新构建）
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dist = join(root, 'dist');
const outFile = join(root, 'release', 'VCID-Lab网站.zip');
// 压缩包内只用英文路径，避免不同系统解压后文件名乱码
const top = 'WangLab-Website';

if (!process.argv.includes('--no-build')) execSync('npm run build', { cwd: root, stdio: 'inherit' });

const entries = [];
const add = (name, data, mode = 0o644) => entries.push({ name: `${top}/${name}`, data, mode });
const text = (file, eol) => Buffer.from(readFileSync(join(here, file), 'utf8').replace(/\r?\n/g, eol));

(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else add(`site/${relative(dist, p).split('\\').join('/')}`, readFileSync(p));
  }
})(dist);
add('Open-Website.bat', text('open-site.bat', '\r\n'));
add('serve.ps1', text('serve.ps1', '\r\n'));
add('Open-Website-Mac.command', text('open-site-mac.command', '\n'), 0o755);
add('README.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text('README.txt', '\r\n')]));

// ---------- 写入 zip ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

const parts = [];
const central = [];
let offset = 0;
for (const e of entries) {
  const name = Buffer.from(e.name, 'utf8');
  const packed = deflateRawSync(e.data, { level: 9 });
  const deflate = packed.length < e.data.length;
  const body = deflate ? packed : e.data;
  const crc = crc32(e.data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  parts.push(local, name, body);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(0x031e, 4); // Unix 格式，保留 Mac 脚本的可执行权限
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(deflate ? 8 : 0, 10);
  cen.writeUInt16LE(dosTime, 12);
  cen.writeUInt16LE(dosDate, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(body.length, 20);
  cen.writeUInt32LE(e.data.length, 24);
  cen.writeUInt16LE(name.length, 28);
  cen.writeUInt32LE(((0o100000 | e.mode) << 16) >>> 0, 38);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, name);
  offset += 30 + name.length + body.length;
}

const cenBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cenBuf.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dirname(outFile), { recursive: true });
const zip = Buffer.concat([...parts, cenBuf, end]);
writeFileSync(outFile, zip);
console.log(`\n已生成 ${relative(root, outFile)}（${entries.length} 个文件，${(zip.length / 1024 / 1024).toFixed(1)} MB）`);
