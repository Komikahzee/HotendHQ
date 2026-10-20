/* ============================================================
   HOTEND HQ — share cards (Open Graph / Twitter images)
   Renders a 1200×630 JPG for every generator and every guide into
   assets/img/og/, so links shared on Facebook, X, Discord, iMessage
   etc. show a full-size picture with the page's name on it.
   The cards are committed, so the deploy build never needs a browser.
   Run after adding a generator or a guide (needs Playwright):
     node build/og-cards.mjs   (then node build/make-pages.mjs, node build/seo.mjs, node build/build.mjs --source)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GENERATORS } from './site-generators.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/img/og');
const only = process.argv.slice(2);

/* Playwright is a dev-only tool: use a local copy if there is one, else the global install */
let pw;
try { pw = createRequire(import.meta.url)('playwright'); }
catch { pw = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x'))('playwright'); }

const W = { window: {} };
W.window = W;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/js/data-articles.js'), 'utf8'), W);
const strip = (s) => String(s || '').replace(/[*_`]/g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const cards = [
  ...GENERATORS.map(g => ({ id: g.slug, kicker: 'Free 3D model generator', title: cap(g.name),
    chips: g.tags, foot: 'Free, runs in your browser', image: `/assets/img/generators/${g.slug}.webp` })),
  ...(W.HHQ_SEED_ARTICLES || [])
    .filter(a => !/\/og-[^/]+\.jpg$/.test(a.cover_url || ''))            // already a finished 1200×630 card
    .map(a => ({ id: `guide-${a.slug}`, kicker: (a.tags || []).includes('new feature') ? 'News' : 'Guide',
      title: strip(a.title), chips: [], foot: '3D printing fixes and free tools', image: a.cover_url || null })),
].filter(c => !only.length || only.includes(c.id));

const font = (w) => `@font-face{font-family:Inter;font-weight:${w};src:url('/assets/fonts/inter-latin-${w}-normal.woff2') format('woff2')}`;
const page = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
${[600, 800].map(font).join('\n')}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#00091c;font-family:Inter,sans-serif}
.art{position:absolute;inset:0 0 0 auto;width:900px;
  -webkit-mask-image:linear-gradient(to right,transparent 0,#000 42%);mask-image:linear-gradient(to right,transparent 0,#000 42%)}
.art img{width:100%;height:100%;object-fit:cover;object-position:center}
.art.logo{width:620px;-webkit-mask-image:none;mask-image:none;display:grid;place-items:center;
  background:radial-gradient(closest-side,rgba(17,130,201,.28),transparent)}
.art.logo img{width:520px;height:auto;object-fit:contain}
.shade{position:absolute;inset:0;background:linear-gradient(to right,#00091c 0,rgba(0,9,28,.92) 34%,rgba(0,9,28,.2) 62%,transparent 80%)}
.txt{position:absolute;left:64px;top:56px;bottom:56px;width:600px;display:flex;flex-direction:column}
.brand{height:36px;width:auto;align-self:flex-start}
.kicker{margin-top:auto;color:#ffa32e;font:800 22px Inter;letter-spacing:.14em;text-transform:uppercase}
h1{margin-top:14px;color:#fff;font:800 64px/1.06 Inter;letter-spacing:-.02em;text-shadow:0 2px 24px rgba(0,9,28,.8)}
.chips{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}
.chips span{font:600 20px Inter;color:#d3dbe3;padding:7px 14px;border-radius:999px;border:1px solid rgba(112,178,255,.32);background:rgba(0,20,58,.7)}
.foot{margin-top:28px;font:600 22px Inter;color:#8fd0f2}
.foot b{color:#fff;font-weight:800}
.bar{position:absolute;left:0;right:0;bottom:0;height:8px;background:linear-gradient(90deg,#c4451a,#f87b1e,#ffa32e)}
</style></head><body>
<div class="art${c.image ? '' : ' logo'}"><img src="${c.image || '/assets/img/logo-mark.png'}" alt=""></div>
${c.image ? '<div class="shade"></div>' : ''}
<div class="txt">
  ${c.image ? '<img class="brand" src="/generators/pendant/assets/hq-wordmark.png" alt="">' : ''}
  <div class="kicker">${c.kicker}</div>
  <h1 id="t">${c.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</h1>
  ${c.chips.length ? `<div class="chips">${c.chips.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
  <div class="foot"><b>hotendhq.com</b> · ${c.foot}</div>
</div>
<div class="bar"></div>
</body></html>`;

fs.mkdirSync(OUT, { recursive: true });
const browser = await pw.chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// serve the repo to the page so the card can load the site's own fonts and images
await tab.route('http://card.local/**', (r) => {
  const p = decodeURIComponent(new URL(r.request().url()).pathname);
  if (p === '/') return r.fulfill({ contentType: 'text/html', body: tab.__html });
  const f = path.join(ROOT, p);
  return fs.existsSync(f) ? r.fulfill({ path: f }) : r.fulfill({ status: 404 });
});
for (const c of cards) {
  tab.__html = page(c);
  await tab.goto('http://card.local/', { waitUntil: 'networkidle' });
  await tab.evaluate(async () => {
    await document.fonts.ready;
    // shrink long titles so they never run past three lines
    const t = document.getElementById('t'); let s = 64;
    while (t.getClientRects().length && t.offsetHeight > s * 1.06 * 3 + 4 && s > 36) t.style.fontSize = (s -= 2) + 'px';
  });
  await tab.screenshot({ path: path.join(OUT, `${c.id}.jpg`), type: 'jpeg', quality: 86 });
  console.log('[og] ', c.id);
}
await browser.close();
console.log(`[og] wrote ${cards.length} card(s) to assets/img/og/`);
