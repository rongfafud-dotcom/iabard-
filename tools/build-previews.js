#!/usr/bin/env node
/**
 * Generates one small HTML page per creative entry under /p/.
 *
 * Why this exists: a URL fragment (#anchor) is never sent to the server, and
 * link-preview crawlers do not run JavaScript. So a shared "#poem" link can
 * only ever show the homepage's meta tags. These per-entry pages carry the
 * entry's own og:title / og:description / og:image and bounce real visitors
 * to the site anchor. No meta-refresh: some crawlers follow it and would
 * then read the homepage's tags instead of these.
 *
 * Slug + panel-code logic must stay identical to slugify()/_panelCode() in
 * index.html; verify-previews.js checks that against a real browser.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'p');
const SITE = 'https://iabard.com';

const TR = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};

function slugify(s, max) {
  max = max || 28;
  let out = String(s || '').toLowerCase().split('')
    .map(c => (TR[c] !== undefined ? TR[c] : c)).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (out.length > max) {
    out = out.slice(0, max);
    const i = out.lastIndexOf('-');
    if (i >= 10) out = out.slice(0, i);
    out = out.replace(/-+$/, '');
    out = out.replace(/-[a-z0-9]{1,2}$/, '');
  }
  return out || 'item';
}

const PANEL_CODE = {poems: 'poems', tales: 'tales', 'poetry-en': 'en', novosti: 'zodiac', author: 'author', shop: 'shop'};

function ytId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Split a content file into raw entries, newest first (the site reverses). */
function readEntries(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, 'utf8')
    .split(/^===$/m).map(e => e.trim()).filter(Boolean).reverse();
}

/**
 * Pull title / description / media out of one raw entry.
 * `style` mirrors the two title conventions the site renderers use.
 */
function parseEntry(raw, style) {
  const audio = [];
  let m;
  const aRe = /^[ \t]*#\s*audio:\s*(.+)$/gm;
  while ((m = aRe.exec(raw)) !== null) audio.push(m[1].trim());

  const images = [];
  const iRe = /^[ \t]*#\s*image:\s*(.+)$/gm;
  while ((m = iRe.exec(raw)) !== null) images.push(m[1].trim());

  let yt = null;
  const ytTag = raw.match(/^[ \t]*#\s*youtube:\s*(.+)$/mi);
  if (ytTag) yt = ytTag[1].trim();

  let body = raw.replace(/^[ \t]*#[^\n]*$/gm, '').trim();
  if (!yt) {
    const bare = body.match(/^(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\S*)$/m);
    if (bare) { yt = bare[1].trim(); }
  }
  body = body.replace(/^https?:\/\/\S*$/gm, '').trim();

  const stanzas = body.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  if (!stanzas.length) return null;

  let title, rest;
  if (style === 'hlines') {
    // poetry-en / zodiac: title is the first non-URL line of the first stanza
    const hl = stanzas[0].split('\n').map(l => l.trim()).filter(Boolean);
    title = hl.find(l => !/^https?:\/\//.test(l)) || '';
    rest = stanzas.slice(1);
  } else {
    // poems / tales / custom: first line of the first stanza
    title = (stanzas[0].split('\n')[0] || '').trim();
    rest = stanzas.slice(1);
  }
  title = title.replace(/((?:\s+#\S+)+)$/, '').trim();
  if (!title) return null;

  // Skip part markers ("1.", "Часть 2", "Присказка") when picking the blurb
  const isMarker = t => {
    const flat = t.replace(/\s+/g, ' ').trim();
    return flat.length < 22 && !/[,;:!?]/.test(flat);
  };
  const descSrc = rest.find(t => !isMarker(t)) || rest[0] || stanzas[0];
  let desc = descSrc.split('\n').map(l => l.trim()).filter(Boolean).join(' ');
  if (desc.length > 180) desc = desc.slice(0, 177).replace(/\s+\S*$/, '') + '…';

  return {title, desc, yt: ytId(yt), image: images[0] || null, hasAudio: audio.length > 0};
}

function page(a) {
  const target = SITE + '/#' + a.anchor;   // absolute: for og:url / canonical
  const go = '/#' + a.anchor;              // relative: works on any host
  return `<!DOCTYPE html>
<html lang="${a.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.title)} — Ипатия Бард</title>
<link rel="canonical" href="${esc(target)}">
<meta name="description" content="${esc(a.desc)}">
<meta property="og:site_name" content="Ипатия Бард — iabard.com">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(a.title)} — Ипатия Бард">
<meta property="og:description" content="${esc(a.desc)}">
<meta property="og:url" content="${esc(target)}">
<meta property="og:image" content="${esc(a.image)}">
<meta property="og:image:width" content="${a.imgW}">
<meta property="og:image:height" content="${a.imgH}">
<meta property="og:image:alt" content="${esc(a.title)} — Ипатия Бард">
<meta property="og:locale" content="${a.locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@ia_bard">
<meta name="twitter:creator" content="@ia_bard">
<meta name="twitter:title" content="${esc(a.title)} — Ипатия Бард">
<meta name="twitter:description" content="${esc(a.desc)}">
<meta name="twitter:image" content="${esc(a.image)}">
<style>
html,body{height:100%}
body{margin:0;display:flex;align-items:center;justify-content:center;
background:#1e1220;color:#e8ddd0;font-family:Georgia,'Times New Roman',serif;text-align:center;padding:24px}
a{color:#c9a96e}
</style>
</head>
<body>
<div>
<p>${esc(a.title)}</p>
<p><a href="${esc(go)}">Открыть на iabard.com →</a></p>
</div>
<script>location.replace(${JSON.stringify(go)});</script>
</body>
</html>
`;
}

function main() {
  const sources = [
    {file: 'poems.txt', panel: 'poems', style: 'first', lang: 'ru', locale: 'ru_RU'},
    {file: 'tales.txt', panel: 'tales', style: 'first', lang: 'ru', locale: 'ru_RU'},
    {file: 'poems-en.txt', panel: 'poetry-en', style: 'hlines', lang: 'en', locale: 'en_US'},
    {file: 'astrology.txt', panel: 'novosti', style: 'hlines', lang: 'ru', locale: 'ru_RU'},
  ];

  const secFile = path.join(ROOT, 'sections.json');
  if (fs.existsSync(secFile)) {
    let data = JSON.parse(fs.readFileSync(secFile, 'utf8'));
    const secs = Array.isArray(data) ? data : (data && data.sections) || [];
    secs.forEach(s => {
      if (!s.file) return;
      sources.push({file: s.file, panel: s.id, code: slugify(s.label, 20),
                    style: 'first', lang: 'ru', locale: 'ru_RU'});
    });
  }

  fs.rmSync(OUT, {recursive: true, force: true});
  fs.mkdirSync(OUT, {recursive: true});

  const used = Object.create(null);
  const manifest = [];

  sources.forEach(src => {
    const code = src.code || PANEL_CODE[src.panel] || slugify(src.panel, 20);
    readEntries(src.file).forEach(raw => {
      const e = parseEntry(raw, src.style);
      if (!e) return;
      const base = code + '--' + slugify(e.title);
      let anchor = base, n = 2;
      while (used[anchor]) anchor = base + '-' + (n++);
      used[anchor] = 1;

      let image = SITE + '/background.jpg', imgW = 864, imgH = 1536;
      if (e.yt) {
        // hqdefault always exists; maxresdefault is missing on some uploads
        image = 'https://img.youtube.com/vi/' + e.yt + '/hqdefault.jpg';
        imgW = 480; imgH = 360;
      } else if (e.image) {
        image = SITE + '/images/' + encodeURIComponent(e.image);
        imgW = 1200; imgH = 1200;
      }

      fs.writeFileSync(path.join(OUT, anchor + '.html'),
        page({anchor, title: e.title, desc: e.desc || 'Ипатия Бард — стихи и духовная поэзия',
              image, imgW, imgH, lang: src.lang, locale: src.locale}), 'utf8');
      manifest.push({anchor, title: e.title, yt: e.yt || null});
    });
  });

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest, null, 1), 'utf8');
  console.log('Generated ' + manifest.length + ' preview pages in /p');
  const withImg = manifest.filter(x => x.yt).length;
  console.log('  with video thumbnail: ' + withImg);
  console.log('  fallback image:       ' + (manifest.length - withImg));
}

main();
