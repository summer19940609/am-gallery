'use strict';

// Bind user theme JSON from themes/ onto a prepared gallery page at build time.
// Uploaded files in pages/ are not modified. The page already carries the
// built-in themes; this adds every themes/*.json file to the stylesheet and
// the toolbar picker, and sets the default theme and mode.

const fs = require('fs');
const path = require('path');

const DEFAULT_THEME = 'feishu-clean';
const DEFAULT_MODE = 'light';

// Layout tokens a user theme does not have to repeat; same defaults as
// Answer me with HTML's theme normalizer (blueprint common + font stacks).
const DEFAULT_COMMON = {
  '--font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--font-mono': 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace',
  '--radius': '0px',
  '--shadow': 'none',
  '--bw': '1.5px',
  '--head-font': 'var(--font-sans)',
};

function themesDir() {
  return path.join(__dirname, '..', 'themes');
}

function loadUserThemes(dir = themesDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json'))
    .sort()
    .map((f) => readTheme(path.join(dir, f)));
}

function readTheme(file) {
  const name = path.basename(file).replace(/\.json$/i, '');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tokens = data.tokens || {};
  return {
    name,
    label: data.label && typeof data.label === 'object' ? data.label : { en: name, zh: name },
    tokens: {
      common: { ...DEFAULT_COMMON, ...(tokens.common || {}) },
      light: { ...(tokens.light || {}) },
      dark: { ...(tokens.dark || {}) },
    },
    css: typeof data.css === 'string' ? data.css : '',
  };
}

function block(selector, vars) {
  const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `${selector} {\n${body}\n}`;
}

function tokenCss(name, tokens) {
  const sel = `html[data-theme="${name}"]`;
  const parts = [
    block(`${sel}, ${sel}[data-mode="light"]`, { ...tokens.common, ...tokens.light }),
    block(`${sel}[data-mode="dark"]`, { ...tokens.dark }),
  ];
  if (Object.keys(tokens.dark).length) {
    parts.push(`@media (prefers-color-scheme: dark) {\n${block(`${sel}[data-mode="auto"]`, tokens.dark)}\n}`);
  }
  return parts.join('\n');
}

function decorationCss(name, css) {
  if (!css) return '';
  return css.replace(/&/g, `html[data-theme="${name}"]`);
}

function userThemeCss(themes) {
  const tokens = themes.map((t) => tokenCss(t.name, t.tokens)).join('\n\n');
  const decos = themes.map((t) => decorationCss(t.name, t.css)).filter(Boolean).join('\n\n');
  return [tokens, decos].filter(Boolean).join('\n\n');
}

function labelFor(theme, lang) {
  const labels = theme.label || {};
  const tag = String(lang || '');
  if (/^zh-Hant/i.test(tag) && labels['zh-Hant']) return labels['zh-Hant'];
  if (/^zh/i.test(tag) && labels.zh) return labels.zh;
  if (labels.en) return labels.en;
  const first = Object.values(labels)[0];
  return first || theme.name;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setOrReplaceAttr(attrs, name, value) {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[^"']*\\2`, 'i');
  if (re.test(attrs)) return attrs.replace(re, `$1$2${value}$2`);
  return `${attrs} ${name}="${value}"`;
}

function setSelected(inner, value) {
  const cleaned = inner.replace(/\sselected(?:="[^"]*")?/gi, '');
  const re = new RegExp(`(<option\\b[^>]*\\bvalue\\s*=\\s*(["'])${value}\\2[^>]*)>`, 'i');
  if (!re.test(cleaned)) return cleaned;
  return cleaned.replace(re, (m, start) => `${start} selected>`);
}

function htmlLang(html) {
  const m = String(html).match(/<html\b[^>]*\blang\s*=\s*(["'])([^"']*)\1/i);
  return m ? m[2] : '';
}

function applyUserThemes(html, opts = {}) {
  const list = opts.themes || loadUserThemes();
  const defaultTheme = opts.defaultTheme || DEFAULT_THEME;
  const defaultMode = opts.defaultMode || DEFAULT_MODE;
  if (!list.length) return String(html);

  let out = String(html);
  const missing = list.filter((t) => !out.includes(`html[data-theme="${t.name}"]`));
  if (missing.length) {
    const inject = userThemeCss(missing);
    const close = out.lastIndexOf('</style>');
    if (close === -1) {
      out = out.replace(/<\/head>/i, `<style>\n${inject}\n</style>\n</head>`);
    } else {
      out = `${out.slice(0, close)}\n${inject}\n${out.slice(close)}`;
    }
  }

  const lang = htmlLang(out);
  out = out.replace(
    /(<select\b[^>]*\bdata-am\s*=\s*(["'])theme\2[^>]*>)([\s\S]*?)(<\/select>)/i,
    (all, open, _q, inner, close) => {
      let next = inner;
      for (const t of list) {
        if (new RegExp(`<option\\b[^>]*\\bvalue\\s*=\\s*(["'])${t.name}\\1`, 'i').test(next)) continue;
        next += `<option value="${escapeHtml(t.name)}">${escapeHtml(labelFor(t, lang))}</option>`;
      }
      if (list.some((t) => t.name === defaultTheme)) next = setSelected(next, defaultTheme);
      return open + next + close;
    },
  );

  out = out.replace(
    /(<select\b[^>]*\bdata-am\s*=\s*(["'])mode\2[^>]*>)([\s\S]*?)(<\/select>)/i,
    (all, open, _q, inner, close) => open + setSelected(inner, defaultMode) + close,
  );

  if (list.some((t) => t.name === defaultTheme)) {
    out = out.replace(/<html\b([^>]*)>/i, (all, attrs) => {
      let a = setOrReplaceAttr(attrs, 'data-theme', defaultTheme);
      a = setOrReplaceAttr(a, 'data-mode', defaultMode);
      return `<html${a}>`;
    });
    out = out.replace(
      /<div\b([^>]*\bclass\s*=\s*(["'])[^"']*\bam-toolbar\b[^"']*\2[^>]*)>/i,
      (all, attrs) => {
        let a = setOrReplaceAttr(attrs, 'data-am-root-theme', defaultTheme);
        a = setOrReplaceAttr(a, 'data-am-root-mode', defaultMode);
        return `<div${a}>`;
      },
    );
  }

  return out;
}

module.exports = {
  DEFAULT_THEME,
  DEFAULT_MODE,
  applyUserThemes,
  loadUserThemes,
  userThemeCss,
  tokenCss,
  themesDir,
};
