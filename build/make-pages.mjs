/* ============================================================
   HOTEND HQ — writes the model generator pages from their content
   in build/page-content.mjs, rebuilds the generators hub, and
   refreshes the "More generators" section on every generator page.
   Run:  node build/make-pages.mjs   (then node build/stamp.mjs)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATORS, CATEGORIES, RELATED } from './site-generators.mjs';
import { PAGES } from './page-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://hotendhq.com';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (slug) => `/generators/${slug}`;
const img = (slug) => `/assets/img/generators/${slug}.webp`;
const bySlug = Object.fromEntries(GENERATORS.map(g => [g.slug, g]));
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const HEAD = ({ title, desc, canonical, image, extra = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} — Hotend HQ</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hotend HQ">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}${canonical}">
<meta property="og:image" content="${BASE}${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#00091c">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/css/fonts.css">
<link rel="stylesheet" href="/assets/css/theme.css">
<link rel="stylesheet" href="/assets/css/pages.css">
${extra}<script src="/assets/js/config.js" defer></script>
<script src="/assets/js/nav.js" defer></script>
<script src="/assets/js/site.js" defer></script>
<script src="/assets/js/api.js" defer></script>
`;

export const card = (g) => `      <a class="card card--link gens-card" href="${url(g.slug)}" data-cat="${g.cat}">
        <img src="${img(g.slug)}" alt="${esc(g.name)} preview" width="800" height="500" loading="lazy" decoding="async">
        <div class="gens-body">
          <h3>${esc(g.name)}</h3>
          <p class="muted">${esc(g.blurb)}</p>
          <div class="gens-tags">${g.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          <span class="gens-go">Open generator ${ARROW}</span>
        </div>
      </a>`;
export const moreSection = (slug) => `  <section class="wrap section--tight" id="more-generators">
    <div class="sec-head between"><div><span class="eyebrow">More generators</span><h2>Make something else</h2></div>
      <a class="btn btn-ghost btn-sm" href="/generators">All ${GENERATORS.length} generators</a></div>
    <div class="grid g3 gens-grid">
${(RELATED[slug] || GENERATORS.filter(g => g.slug !== slug).slice(0, 3).map(g => g.slug)).map(s => card(bySlug[s])).join('\n')}
    </div>
  </section>`;

/* ---------------- one engine-generator page ---------------- */
function page(slug, c) {
  const g = bySlug[slug];
  const lds = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: `Hotend HQ ${g.name}`, url: BASE + url(slug), image: BASE + img(slug),
      applicationCategory: 'DesignApplication', operatingSystem: 'Any (runs in the browser)', isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: c.desc, featureList: c.features },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: `How to make ${c.howName}`, step: c.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s[0], text: s[1] })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: c.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: '3D model generators', item: BASE + '/generators' },
      { '@type': 'ListItem', position: 3, name: c.crumb, item: BASE + url(slug) }] },
  ];
  const TOOL = (id, label, svg) => `<button type="button" class="gf-tool" id="${id}" aria-label="${label}" title="${label}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg></button>`;
  return HEAD({ title: c.title, desc: c.desc, canonical: url(slug), image: img(slug), extra: `<link rel="stylesheet" href="/assets/css/gridfinity.css">
<link rel="stylesheet" href="/assets/css/make.css">
<link rel="preload" href="/assets/vendor/manifold/manifold.wasm" as="fetch" type="application/wasm" crossorigin>
<script type="importmap">
{"imports":{
  "three":"/assets/vendor/three/three.module.js",
  "three/addons/":"/assets/vendor/three/addons/"
}}
</script>
${lds.map(ld).join('\n')}
` }) + `</head>
<body data-gen="${slug}">
<main id="main" class="gf-page">
  <section class="wrap gf-hero">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/generators">3D model generators</a><span aria-hidden="true">/</span><span>${esc(c.crumb)}</span></nav>
    <h1>${esc(c.h1)}</h1>
    <p class="lede">${esc(c.lede)}</p>
  </section>

  <section class="wrap gf-wrap" aria-label="Generator">
    <div class="gf">
      <div class="gf-panel">
        <div class="gf-tabs mk-tabs" id="mk-tabs" role="group" aria-label="What to make"></div>
        <h2 id="mk-title" class="gf-h"></h2>
        <p id="mk-blurb" class="faint gf-blurb"></p>
        <div class="gf-presets chips" id="mk-presets"></div>
        <ul id="mk-warn" class="gf-warn hidden" aria-live="polite"></ul>
        <div id="mk-controls"></div>
      </div>
      <div class="gf-view">
        <div class="gf-stage" id="mk-stage">
          <span class="gen-badge">Drag to orbit · scroll or pinch to zoom</span>
          <div class="gf-tools">
            ${TOOL('mk-fit', 'Reset the view', '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>')}
            ${TOOL('mk-full', 'Full screen', '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}
          </div>
          <div class="gen-readout" id="mk-readout"></div>
          <div class="gf-busy" aria-hidden="true"><span class="spin"></span></div>
        </div>
        <div class="ch-parts chips hidden" id="mk-parts" role="group" aria-label="Parts (tap to show or hide)"></div>
        <p id="mk-status" class="gf-status" role="status" aria-live="polite">Loading…</p>
        <div class="gf-bar">
          <div class="gf-actions">
            <button class="btn btn-primary" id="mk-stl" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>Download STL</button>
            <button class="btn btn-ghost" id="mk-3mf" type="button">3MF</button>
            <button class="btn btn-ghost" id="mk-link" type="button" aria-label="Copy a link to this design">Copy link</button>
            <button class="btn btn-ghost" id="mk-reset" type="button">Reset</button>
          </div>
        </div>
        <div class="card mk-info hidden"><h3>Printing this model</h3><ul id="mk-info"></ul></div>
      </div>
    </div>
  </section>

  <section class="wrap section">
    <div class="sec-head"><span class="eyebrow">How it works</span><h2>${esc(c.howTitle)}</h2></div>
    <div class="card mk-howto"><ol>
${c.steps.map(([a, b]) => `      <li><strong>${esc(a)}.</strong> ${esc(b)}</li>`).join('\n')}
    </ol></div>
  </section>

  <section class="wrap section--tight">
    <div class="sec-head"><span class="eyebrow">Printing it</span><h2>Settings that work</h2></div>
    <div class="grid g3">
${c.cards.map(([h, t]) => `      <div class="card"><h3>${esc(h)}</h3><p class="muted gf-card-p">${t}</p></div>`).join('\n')}
    </div>
  </section>

  <section class="wrap section--tight">
    <div class="sec-head"><span class="eyebrow">Questions</span><h2>${esc(c.crumb)} FAQ</h2></div>
    <div class="gens-faq">
${c.faq.map(([q, a]) => `      <details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('\n')}
    </div>
  </section>

${moreSection(slug)}
</main>
<script type="module" src="/assets/js/make/ui.js"></script>
<script>
setTimeout(function () {
  var t = document.getElementById('mk-controls'), s = document.getElementById('mk-status');
  if (t && !t.children.length && s) { s.textContent = 'The 3D generator could not start in this browser. Update it, or open this page in Chrome, Edge, Firefox or Safari.'; s.setAttribute('data-kind', 'bad'); }
}, 12000);
</script>
</body>
</html>
`;
}

/* ---------------- the hub ---------------- */
function hub() {
  const items = { '@context': 'https://schema.org', '@type': 'ItemList', name: '3D model generators',
    itemListElement: GENERATORS.map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.name, url: BASE + url(g.slug) })) };
  const count = (k) => GENERATORS.filter(g => g.cat === k).length;
  return HEAD({ title: `3D Model Generators: ${GENERATORS.length} Free Parametric STL Makers`,
    desc: `${GENERATORS.length} free 3D model generators that run in your browser: Gridfinity, print-in-place chains, dice, stencils, layered signs, plant markers, drone frames, mic clips and more. Set your sizes and download STL or 3MF.`,
    canonical: '/generators', image: '/assets/img/articles/generators-spotlight.webp', extra: ld(items) + '\n' }) + `</head>
<body>
<main id="main">
  <section class="wrap section--tight gens-hero">
    <span class="eyebrow">3D model generators</span>
    <h1>Make it to size, print it today</h1>
    <p class="lede">${GENERATORS.length} free generators. Pick one, set your sizes and download a file that's ready to slice.
      Everything runs in your browser: no account, no upload, no waiting.</p>
  </section>

  <section class="wrap section--tight" style="padding-top:0">
    <div class="chips gens-filter" role="group" aria-label="Filter generators">
      <button type="button" class="chip" data-f="all" aria-pressed="true">All <span class="faint">${GENERATORS.length}</span></button>
${Object.entries(CATEGORIES).map(([k, v]) => `      <button type="button" class="chip" data-f="${k}" aria-pressed="false">${esc(v)} <span class="faint">${count(k)}</span></button>`).join('\n')}
    </div>
    <div class="grid g3 gens-grid" id="gens-grid">
${GENERATORS.map(card).join('\n')}
    </div>
  </section>

  <section class="wrap section">
    <div class="sec-head"><span class="eyebrow">How they work</span><h2>Built for people who print</h2></div>
    <div class="grid g3">
      <div class="card"><div class="card-ico" id="w1"></div><h3>Sized to your printer</h3>
        <p class="muted" style="font-size:.93rem;margin:0">Pick your machine from 40+ printers and every generator checks the model fits your bed. The size you type is the size in the file.</p></div>
      <div class="card"><div class="card-ico" id="w2"></div><h3>Nothing to install</h3>
        <p class="muted" style="font-size:.93rem;margin:0">Models are built on your own device, in the browser. Nothing is uploaded and there's no queue.</p></div>
      <div class="card"><div class="card-ico" id="w3"></div><h3>Yours to keep and sell</h3>
        <p class="muted" style="font-size:.93rem;margin:0">Print it, change it, sell it. Every file you make here is yours.</p></div>
    </div>
  </section>
</main>

<script>
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('w1').innerHTML = icon('calc');
  document.getElementById('w2').innerHTML = icon('bolt');
  document.getElementById('w3').innerHTML = icon('check');
  const chips = document.querySelectorAll('.gens-filter .chip'), cards = document.querySelectorAll('#gens-grid .gens-card');
  chips.forEach(c => c.addEventListener('click', () => {
    chips.forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    cards.forEach(k => { k.hidden = c.dataset.f !== 'all' && k.dataset.cat !== c.dataset.f; });
  }));
});
</script>
</body>
</html>
`;
}

/* ---------------- write ---------------- */
let n = 0;
for (const [slug, c] of Object.entries(PAGES)) { fs.writeFileSync(path.join(ROOT, 'generators', slug + '.html'), page(slug, c)); n++; }
fs.writeFileSync(path.join(ROOT, 'generators.html'), hub());
// refresh "More generators" on every generator page (engine pages included, for the up-to-date count)
let m = 0;
for (const g of GENERATORS) {
  const f = path.join(ROOT, 'generators', g.slug + '.html');
  if (!fs.existsSync(f)) { console.warn('missing page', f); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const re = /  <section class="wrap section--tight"(?: id="more-generators")?>\n    <div class="sec-head between"><div><span class="eyebrow">More generators<\/span>[\s\S]*?<\/section>/;
  if (!re.test(s)) { console.warn('no More generators section in', g.slug); continue; }
  fs.writeFileSync(f, s.replace(re, () => moreSection(g.slug))); m++;
}
// the home page: generator count and a row of featured generators (plain links search engines can follow)
{
  const f = path.join(ROOT, 'index.html');
  let s = fs.readFileSync(f, 'utf8');
  const featured = ['chain', 'gridfinity', 'dice', 'layered-signs', 'drone-frame', 'mic-accessories'].map(k => bySlug[k]).filter(Boolean);
  s = s.replace(/<!--gens:home-->[\s\S]*?<!--\/gens:home-->/, () => `<!--gens:home-->
  <section class="wrap section" id="home-gens">
    <div class="sec-head between"><div><span class="eyebrow">Free model generators</span><h2>Make it to size, print it today</h2></div>
      <a class="btn btn-ghost btn-sm" href="/generators">All ${GENERATORS.length} generators</a></div>
    <div class="grid g3 gens-grid">
${featured.map(card).join('\n')}
    </div>
  </section>
  <!--/gens:home-->`);
  s = s.replace(/(<b id="s-models">)\d+(<\/b>)/, `$1${GENERATORS.length}$2`);
  s = s.replace(/with \d+ model generators/, `with ${GENERATORS.length} model generators`);
  fs.writeFileSync(f, s);
}
// llms.txt: a plain summary of the site for AI search assistants
fs.writeFileSync(path.join(ROOT, 'llms.txt'), `# Hotend HQ

> Hotend HQ is a free 3D printing reference: step-by-step troubleshooting, ${GENERATORS.length} browser-based 3D model generators that export STL and 3MF, calculators, a filament database, guides and tested gear picks. Nothing to install and no account needed.

## Model generators
${GENERATORS.map(g => `- [${g.name}](${BASE}${url(g.slug)}): ${g.blurb}`).join('\n')}

## Everything else
- [Troubleshooting](${BASE}/troubleshoot): answer a few questions about a print problem and get the likely cause, the check that confirms it and the fix.
- [Calculators & filament database](${BASE}/tools): flow rate and max speed, filament cost, e-steps, shrinkage, spool remaining, and properties of common filaments.
- [News & guides](${BASE}/news): hands-on 3D printing guides.
- [Gear](${BASE}/gear): hardware we recommend.
- [All generators](${BASE}/generators)
`);
console.log(`[pages] ${n} generator page(s), hub, ${m} "More generators" section(s)`);
