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
const https = require('https');
const {execFileSync} = require('child_process');
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


/**
 * Read a JPEG's real pixel size from its SOF marker, so og:image:width/height
 * never has to be guessed per variant.
 */
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return {h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7)};
    }
    i += 2 + len;
  }
  return null;
}

/** Fetch just enough of an image to read its header. */
function probeImage(url) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    try {
      const req = https.get(url, {timeout: 8000}, res => {
        if (res.statusCode !== 200) { res.resume(); return finish(null); }
        const chunks = []; let got = 0;
        res.on('data', d => {
          chunks.push(d); got += d.length;
          if (got >= 65536) { res.destroy(); }
        });
        const done_ = () => finish(jpegSize(Buffer.concat(chunks)));
        res.on('end', done_);
        res.on('close', done_);
        res.on('error', () => finish(null));
      });
      req.on('error', () => finish(null));
      req.on('timeout', () => { req.destroy(); finish(null); });
    } catch (e) { finish(null); }
  });
}

/**
 * Choose a thumbnail. For a vertical Short, maxresdefault is a 16:9 frame with
 * the clip letterboxed between blurred copies of itself; oardefault keeps the
 * original aspect, so try that first. hqdefault always exists and ends the
 * chain, and any network trouble lands there too.
 */
async function bestThumb(id, isShort) {
  const names = isShort
    ? ['oardefault', 'maxresdefault', 'sddefault']
    : ['maxresdefault', 'sddefault'];
  for (const n of names) {
    const url = 'https://i.ytimg.com/vi/' + id + '/' + n + '.jpg';
    const size = await probeImage(url);
    if (size && size.w > 0 && size.h > 0) return {image: url, imgW: size.w, imgH: size.h};
  }
  return {image: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg', imgW: 480, imgH: 360};
}


/**
 * When was this entry added? Uses git history: -S finds the commit that
 * introduced the title line. Returns 0 when history is unavailable (a
 * shallow clone, or no git at all), so callers can degrade quietly.
 */
function addedAt(file, titleLine) {
  if (!titleLine) return 0;
  try {
    const out = execFileSync('git',
      ['log', '-1', '--format=%ct', '-S', titleLine, '--', file],
      {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    return out ? parseInt(out, 10) || 0 : 0;
  } catch (e) { return 0; }
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

  return {title, desc, yt: ytId(yt), isShort: /youtube\.com\/shorts\//.test(yt || ''),
          image: images[0] || null, hasAudio: audio.length > 0};
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

async function main() {
  const sources = [
    {file: 'poems.txt', panel: 'poems', sectionLabel: 'Поэзия', style: 'first', lang: 'ru', locale: 'ru_RU'},
    {file: 'tales.txt', panel: 'tales', sectionLabel: 'Сказки', style: 'first', lang: 'ru', locale: 'ru_RU'},
    {file: 'poems-en.txt', panel: 'poetry-en', sectionLabel: 'Songs EN', style: 'hlines', lang: 'en', locale: 'en_US'},
    {file: 'astrology.txt', panel: 'novosti', sectionLabel: 'Зодиак', style: 'hlines', lang: 'ru', locale: 'ru_RU'},
  ];

  const secFile = path.join(ROOT, 'sections.json');
  if (fs.existsSync(secFile)) {
    let data = JSON.parse(fs.readFileSync(secFile, 'utf8'));
    const secs = Array.isArray(data) ? data : (data && data.sections) || [];
    secs.forEach(s => {
      if (!s.file) return;
      sources.push({file: s.file, panel: s.id, code: slugify(s.label, 20),
                    sectionLabel: s.label, style: 'first', lang: 'ru', locale: 'ru_RU'});
    });
  }

  fs.rmSync(OUT, {recursive: true, force: true});
  fs.mkdirSync(OUT, {recursive: true});

  const used = Object.create(null);
  const manifest = [];
  let latest = null;
  const variants = Object.create(null);

  for (const src of sources) {
    const code = src.code || PANEL_CODE[src.panel] || slugify(src.panel, 20);
    // readEntries() is newest-first, so index 0 is this section's newest entry
    let isSectionNewest = true;
    for (const raw of readEntries(src.file)) {
      const e = parseEntry(raw, src.style);
      if (!e) continue;
      const base = code + '--' + slugify(e.title);
      let anchor = base, n = 2;
      while (used[anchor]) anchor = base + '-' + (n++);
      used[anchor] = 1;

      let image = SITE + '/background.jpg', imgW = 864, imgH = 1536;
      if (e.yt) {
        const t = await bestThumb(e.yt, e.isShort);
        image = t.image; imgW = t.imgW; imgH = t.imgH;
        const vn = (image.match(/\/([a-z0-9]+)\.jpg$/) || [, '?'])[1];
        const key = vn + ' ' + imgW + 'x' + imgH;
        variants[key] = (variants[key] || 0) + 1;
      } else if (e.image) {
        image = SITE + '/images/' + encodeURIComponent(e.image);
        imgW = 1200; imgH = 1200;
      }

      fs.writeFileSync(path.join(OUT, anchor + '.html'),
        page({anchor, title: e.title, desc: e.desc || 'Ипатия Бард — стихи и духовная поэзия',
              image, imgW, imgH, lang: src.lang, locale: src.locale}), 'utf8');
      manifest.push({anchor, title: e.title, yt: e.yt || null, image});

      if (isSectionNewest) {
        isSectionNewest = false;
        const when = addedAt(src.file, e.title);
        if (when && (!latest || when > latest.when)) {
          latest = {when, anchor, panel: src.panel, title: e.title, section: src.sectionLabel || src.panel};
        }
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest, null, 1), 'utf8');
  if (latest) {
    fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify(latest, null, 1), 'utf8');
    console.log('Newest entry: ' + latest.title + '  (' + latest.section + ')');
  } else {
    console.log('Newest entry: unknown (no git history) — nav falls back to Поэзия');
  }
  console.log('Generated ' + manifest.length + ' preview pages in /p');
  const withImg = manifest.filter(x => x.yt).length;
  console.log('  with video thumbnail: ' + withImg);
  console.log('  fallback image:       ' + (manifest.length - withImg));
  Object.keys(variants).sort().forEach(k => console.log('    ' + k + ': ' + variants[k]));
}

main().catch(err => { console.error(err); process.exit(1); });
