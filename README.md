# 视觉计算与智能决策实验室（VCID Lab）网站

王正宁教授领导的视觉计算与智能决策实验室（Visual Computing and Intelligent Decision Lab，简称 VCID Lab）的中英双语网站，用 [Astro](https://astro.build) 生成纯静态网页，可以放到 GitHub Pages 或自己的服务器上。

## 发布到 GitHub Pages

1. 在 GitHub 新建一个仓库（公开仓库才能免费使用 Pages），把本项目推送到 `main` 分支：

   ```bash
   git init -b main
   git add .
   git commit -m "课题组网站初版"
   git remote add origin https://github.com/你的用户名/仓库名.git
   git push -u origin main
   ```

   也可以用 GitHub Desktop：File → Add local repository 选择本文件夹，再点 Publish repository。

2. 打开仓库 **Settings → Pages**，在 Build and deployment 的 Source 中选择 **GitHub Actions**。
3. 回到 **Actions** 页面，等 “Deploy to GitHub Pages” 运行完成（约 1–2 分钟），网址会显示在运行结果里：
   - 仓库名为 `用户名.github.io` 时，网址是 `https://用户名.github.io/`
   - 其他仓库名时，网址是 `https://用户名.github.io/仓库名/`（网站会自动适配这个子路径）

之后每次推送到 `main`，网站都会自动重新发布。

> GitHub Pages 在国内访问速度一般，且基本不会被百度收录。正式对外宣传时，建议迁移到自有域名 + 国内服务器（需要 ICP 备案）。

## 本地预览

第一次使用需要安装依赖（电脑上需有 Node.js 22.12 以上版本）：

```bash
npm install
```

启动本地预览，然后在浏览器打开 http://localhost:4321 ：

```bash
npm run dev
```

修改内容并保存后，页面会自动刷新。

## 修改内容

日常更新只需要改 `src/data/` 里的文本文件，每个文件开头都有填写说明：

| 文件 | 内容 |
|---|---|
| `site.yaml` | 实验室名称、标志图片、简介、首页数据、联系方式、页脚链接、图片水印文字 |
| `research.yaml` | 六个研究方向 |
| `members.yaml` | 导师与学生信息：summary 为首页轮播中的简短介绍，bio / research_content / representative 等用于导师详细介绍页 `/people/wangzhengning/` |
| `publications.yaml` | 论文列表 |
| `patents.yaml` | 相关专利 |
| `projects.yaml` | 科研项目与成果应用（科研成果 → 科研项目） |
| `awards.yaml` | 获奖证书与荣誉（证书照片放在 `assets/originals/images/awards/`） |
| `exchange.yaml` | 学术交流：媒体报道与公众号、学术报告、国际会议、访问考察、学术与社会服务 |
| `news.yaml` | 新闻动态，只放学术相关内容（首页显示最新 6 条） |
| `life.yaml` | 团队生活相册（首页展示前 5 个） |
| `join.yaml` | 招生信息 |

图片位置：

| 文件夹 | 内容 |
|---|---|
| `public/images/members/` | 成员照片 |
| `public/images/papers/` | 论文结构图 |
| `public/images/life/` | 团队生活照片，每个相册一个文件夹 |
| `public/images/news/` | 新闻缩略图 |
| `public/images/` | 刊头背景照片 `campus.jpg` |

实验室标志：透明底图片在 `public/images/brand/`（`vcid-logo-full.webp` 完整标志用于刊头，`vcid-logo.webp` 简版用于导航栏，`vcid-logo-white.webp` 反白版用于页脚），网站图标为 `public/favicon-*.png` 和 `apple-touch-icon.png`；路径在 `site.yaml` 的 `logo` 中设置。

图片水印：`public/images/` 下的照片都带浅色「VCID Lab」平铺水印，由 `npm run watermark` 从 `assets/originals/`（未加水印的原图，不提交到 Git）生成。新增或替换照片时，把原图放进 `assets/originals/` 的对应位置再运行该命令；要换水印文字，改 `site.yaml` 里的 `watermark.text` 后重新运行。

其他：

- 按钮、导航等固定文字在 `src/lib/i18n.ts`
- 颜色、间距等样式在 `src/styles/`：`global.css` 是基础样式，`refine.css` 最后加载，用于整体微调

## 拷到其他电脑查看

```bash
npm run pack
```

会生成 `release/VCID-Lab网站.zip`。拷到其他电脑解压后，双击 `Open-Website.bat` 即可离线打开（Windows 不用安装任何软件；Mac 用 `Open-Website-Mac.command`）。压缩包里的 `README.txt` 有详细说明。

## 发布到其他服务器

```bash
npm run build
```

生成的 `dist/` 文件夹就是完整的网站，复制到任何静态网站服务器即可。

- **自有域名**：构建前设置环境变量 `SITE_URL`（如 `https://www.example.cn`）；网站放在子路径时再设置 `BASE_PATH`（如 `/lab/`）
- **国内服务器**：完成 ICP 备案后，把备案号填进 `site.yaml` 的 `icp`，会显示在页脚

## 数据说明

- 论文列表整理自 OpenAlex 学术数据库（2026 年 10 月检索），已剔除重名误归属和重复的预印本，可能有遗漏
- 专利整理自国家知识产权局公开信息（经 Google Patents 检索），只列出已授权和审查中的申请
- 导师简介、教育与工作经历由课题组提供；研究方向是根据近年论文归纳的
- 硕士生名单、毕业校友目前是占位内容，待补充
- 论文全文 PDF 只链接 arXiv、开放获取等可以合法公开的版本
