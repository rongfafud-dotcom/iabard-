#!/usr/bin/env node
/**
 * Renders a share card per entry: the site's colours and typeface, the title
 * and the opening lines. Messengers show it beside the link, so the poem is
 * read in the feed instead of a generic site picture.
 *
 * Cards are committed, and only missing ones are rendered — a new poem costs
 * one render, not 400. Without a browser the build carries on and the entry
 * keeps the fallback image.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'cards');
const TPL = path.join(__dirname, 'card', 'template.html');

/** Title and opening lines get their own sizes so short and long both sit well. */
function fit(title, lines) {
  const t = title.length;
  const titleSize = t <= 22 ? 62 : t <= 34 ? 52 : t <= 48 ? 44 : 38;
  const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
  let lineSize = longest <= 34 ? 38 : longest <= 44 ? 33 : longest <= 54 ? 29 : 26;
  // four lines can breathe; six need to be tighter
  if (lines.length >= 6) lineSize = Math.min(lineSize, 30);
  return {titleSize, lineSize};
}

async function render(browser, entry, file) {
  const page = await browser.newPage({viewport: {width: 1200, height: 630}, deviceScaleFactor: 1});
  await page.goto('file://' + TPL, {waitUntil: 'load'});
  await page.evaluate(d => {
    document.getElementById('title').textContent = d.title;
    document.getElementById('title').style.fontSize = d.titleSize + 'px';
    const box = document.getElementById('lines');
    box.style.fontSize = d.lineSize + 'px';
    box.innerHTML = '';
    d.lines.forEach(l => {
      const el = document.createElement('div');
      el.textContent = l;
      box.appendChild(el);
    });
  }, Object.assign({title: entry.title, lines: entry.lines}, fit(entry.title, entry.lines)));
  await page.waitForTimeout(120);          // let the webfont paint
  await page.screenshot({path: file, type: 'jpeg', quality: 88});
  await page.close();
}

async function main() {
  const manifestPath = path.join(ROOT, 'p', 'cards-input.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('cards: no input manifest, nothing to do');
    return;
  }
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.mkdirSync(OUT, {recursive: true});

  const todo = entries.filter(e => !fs.existsSync(path.join(OUT, e.anchor + '.jpg')));
  console.log('Cards: ' + entries.length + ' entries, ' + todo.length + ' to render');
  if (!todo.length) return;

  let chromium;
  try {
    ({chromium} = require('playwright'));
  } catch (e) {
    try { ({chromium} = require('/opt/node22/lib/node_modules/playwright')); }
    catch (e2) {
      console.log('cards: no browser available — skipping, entries keep the fallback image');
      return;
    }
  }

  const launch = {};
  if (process.env.PLAYWRIGHT_CHROMIUM) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM;
  else if (fs.existsSync('/opt/pw-browsers/chromium')) launch.executablePath = '/opt/pw-browsers/chromium';

  let browser;
  try { browser = await chromium.launch(launch); }
  catch (e) {
    console.log('cards: browser would not start (' + e.message.split('\n')[0] + ') — skipping');
    return;
  }

  let done = 0;
  for (const e of todo) {
    try {
      await render(browser, e, path.join(OUT, e.anchor + '.jpg'));
      done++;
      if (done % 50 === 0) console.log('  ' + done + '/' + todo.length);
    } catch (err) {
      console.log('  failed: ' + e.anchor + ' — ' + err.message.split('\n')[0]);
    }
  }
  await browser.close();
  console.log('Cards: rendered ' + done);
}

main().catch(err => { console.error(err); process.exit(1); });
