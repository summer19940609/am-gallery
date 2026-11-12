#!/usr/bin/env node
// Build the gallery: copy pages/*.html to dist/pages/ and write dist/index.html.
// Only Node built-ins. No network, no CDN.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PAGES = path.join(ROOT, 'pages');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;

function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function text(fragment) {
  return decode(String(fragment || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function meta(html, key) {
  const re = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return '';
  const c = tag[0].match(/content=["']([^"']*)["']/i);
  return c ? decode(c[1]).trim() : '';
}

function truncate(s, n) {
  const chars = Array.from(s);
  return chars.length > n ? chars.slice(0, n).join('') + '…' : s;
}

function gitDate(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    return out ? new Date(out) : null;
  } catch { return null; }
}

function validDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

function findDate(file, html) {
  // 1. Filename prefix: 2026-11-12-xxx.html
  const fromName = path.basename(file).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (fromName) {
    const d = validDate(new Date(`${fromName[1]}-${fromName[2]}-${fromName[3]}T00:00:00+08:00`));
    if (d) return d;
  }
  // 2. Meta tags
  for (const key of ['date', 'article:published_time', 'dcterms.created', 'created']) {
    const v = meta(html, key);
    const d = v && validDate(new Date(v));
    if (d) return d;
  }
  // 3. A leading HTML comment that contains an ISO date
  const comment = html.slice(0, 4000).match(/<!--[\s\S]*?(\d{4}-\d{2}-\d{2}(?:[T ][\d:]+)?)[\s\S]*?-->/);
  if (comment) {
    const d = validDate(new Date(comment[1]));
    if (d) return d;
  }
  // 4. Last git commit that touched the file, then file mtime
  return validDate(gitDate(file)) || fs.statSync(file).mtime;
}

function extract(file) {
  const html = fs.readFileSync(file, 'utf8');
  const name = path.basename(file);
  const title = text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1])
    || text((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1])
    || name.replace(/\.html$/, '');
  const subtitle = text((html.match(/<p class="am-sub"[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
  // Drop the hidden draft and scripts before looking for prose.
  const body = html
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const intro = text((body.match(/class="am-intro[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
  const firstP = text((body.match(/<p(?![^>]*am-(?:sub|colophon))[^>]*>([\s\S]*?)<\/p>/i) || [])[1]);
  const excerpt = meta(html, 'description') || intro || firstP;
  const generator = meta(html, 'generator');
  return {
    file: name,
    title,
    subtitle,
    excerpt: truncate(excerpt, 120),
    date: findDate(file, html),
    generator,
  };
}

function fmtDate(d) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  return p; // YYYY-MM-DD
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function card(p) {
  const href = `/pages/${encodeURI(p.file)}`;
  return `      <li class="card">
        <a href="${href}">
          <time datetime="${p.date.toISOString()}">${fmtDate(p.date)}</time>
          <h2>${escapeHtml(p.title)}</h2>
          ${p.subtitle ? `<p class="sub">${escapeHtml(p.subtitle)}</p>` : ''}
          ${p.excerpt ? `<p class="excerpt">${escapeHtml(p.excerpt)}</p>` : ''}
          <span class="open">阅读全文 →</span>
        </a>
      </li>`;
}

function render(pages) {
  const list = pages.length
    ? `<ol class="grid">\n${pages.map(card).join('\n')}\n    </ol>`
    : `<div class="empty">
      <p class="empty-title">这里还空着</p>
      <p>把 <code>am render</code> 生成的 <code>.html</code> 放进仓库的 <code>pages/</code> 目录，推送到 <code>main</code> 后就会出现在这里。</p>
    </div>`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Answer me with HTML 画廊</title>
<meta name="description" content="用 Answer me with HTML 生成的单页 HTML 解释页合集。">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="site">
    <h1>Answer me with HTML 画廊</h1>
    <p class="lede">一页一个问题。这里收录用 Answer me with HTML 生成的单页 HTML 解释页，点开即读。</p>
    <p class="count">共 ${pages.length} 篇</p>
  </header>
  <main>
    ${list}
  </main>
  <footer class="site">
    <p>页面由开源项目 <a href="https://github.com/QingYunA/answer-me-with-html" rel="noopener">answer-me-with-html</a> 生成（<a href="https://answer-me-with-html.com/" rel="noopener">answer-me-with-html.com</a>）。本站为个人画廊，非官方站点。</p>
  </footer>
</body>
</html>
`;
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'pages'), { recursive: true });

  copyDir(PUBLIC, DIST);
  for (const f of ['_headers', '_redirects']) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
  }

  const files = fs.existsSync(PAGES)
    ? fs.readdirSync(PAGES).filter((f) => f.toLowerCase().endsWith('.html')).sort()
    : [];

  const pages = [];
  for (const f of files) {
    if (!SAFE_NAME.test(f)) {
      console.warn(`skip ${f}: use lowercase letters, digits and hyphens only (e.g. 2026-11-12-my-topic.html)`);
      continue;
    }
    const src = path.join(PAGES, f);
    try {
      pages.push(extract(src));
      fs.copyFileSync(src, path.join(DIST, 'pages', f));
    } catch (err) {
      console.warn(`skip ${f}: ${err.message}`);
    }
  }

  pages.sort((a, b) => b.date - a.date || a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(DIST, 'index.html'), render(pages));
  console.log(`built dist/ with ${pages.length} page(s)`);
  for (const p of pages) console.log(`  ${fmtDate(p.date)}  /pages/${p.file}  ${p.title}`);
}

main();
