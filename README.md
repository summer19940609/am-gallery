# Answer me with HTML 画廊

收录用 [answer-me-with-html](https://github.com/QingYunA/answer-me-with-html)（[官网](https://answer-me-with-html.com/)）生成的单页 HTML 解释页。每个页面都是自包含的单文件 HTML（无 CDN、无网络字体），首页由构建脚本自动生成目录。

同一个仓库部署两份，方便对比国内访问速度：

| 平台 | 项目名 | 地址 |
| --- | --- | --- |
| Cloudflare Pages | `am-cf` | 部署后填写（预期 `https://am-cf.12156844.xyz`） |
| Vercel | `am-vercel` | 部署后填写（预期 `https://am-vercel.12156844.xyz`） |

## 添加一篇页面

1. 用 `am render 草稿.md --no-open` 生成页面（默认输出在 `~/.answer-me-with-html/pages/`）。
2. 把生成的 `.html` 复制到 `pages/`，可选地把 Markdown 草稿复制到 `drafts/`。
3. 文件名只用小写字母、数字和连字符，建议以日期开头，例如 `2026-11-12-enterprise-ai-coding.html`。日期前缀用于排序；没有时退回 `<meta name="date">` 或最后一次提交时间。
4. 提交并推送到 `main`，两个平台都会自动重新构建。

本地预览：

```bash
npm run build          # 只需要 Node 20+，无依赖
npx serve dist         # 或 python3 -m http.server -d dist
```

## 部署方式

两个平台使用相同的设置：

- 生产分支：`main`
- 构建命令：`npm run build`
- 输出目录：`dist`
- Node 版本：22（见 `.nvmrc`，20 及以上均可）

构建脚本 `scripts/build-index.js` 会把 `pages/*.html` 复制到 `dist/pages/`，读取每页的标题、副标题和摘要生成 `dist/index.html`，并复制 `public/` 里的静态资源。

缓存和安全响应头在两处保持一致：Cloudflare Pages 读取 `_headers`（构建时复制进 `dist/`），Vercel 读取 `vercel.json`（Vercel 会忽略 `_headers`）。修改其中一个时请同步另一个。

## 注意

- **这是公开仓库。** 不要提交包含私有代码、内部地址、密钥或个人信息的页面。页面里隐藏的 `#am-source` 会保留完整草稿原文。
- 页面请作为独立网页打开，不要用 iframe 嵌入：每个页面自带内容安全策略（CSP），嵌套可能出问题。

## 许可

MIT。本站是个人画廊，不是 answer-me-with-html 的官方站点。
