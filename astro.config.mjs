// @ts-check
import { defineConfig } from 'astro/config';

// 部署地址：迁移到自有域名或其他服务器时，只需修改这两项（或通过环境变量传入）
//   site —— 网站的完整域名，例如 https://www.xxlab.cn
//   base —— 网站所在的子路径；放在域名根目录时为 '/'
export default defineConfig({
  site: process.env.SITE_URL || 'https://example.github.io',
  base: process.env.BASE_PATH || '/',
  // 获奖证书页的三维档案阵列单独打包了 three.js（约 550 KB，gzip 后约 140 KB），只在该页按需加载
  vite: { build: { chunkSizeWarningLimit: 700 } },
});
