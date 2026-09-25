#!/usr/bin/env node
/* ============================================================
   HOTEND HQ — static build
   Runs in Cloudflare Workers Builds before `wrangler deploy`.

     node build/build.mjs

   1. Copies the site into ./dist (leaving out the repo-only files).
   2. Loads the same browser data files the pages use (config, nav,
      articles, gear, filaments) plus published articles from
      Supabase when it is configured.
   3. Writes /guides/<slug>/index.html for every published article,
      with title, meta description, canonical, Open Graph, JSON-LD
      and the full article HTML already in the file.
   4. Pre-renders the gear picks, the filament table, the article
      lists, and the site header/footer into the HTML itself.
   5. Rewrites internal links and canonicals to the clean URLs
      Cloudflare actually serves (/gear, not /gear.html), and writes
      sitemap.xml.

   No dependencies: plain Node 18+. If Supabase is configured but
   unreachable, the build fails on purpose so the last good
   deployment stays live instead of shipping a site with missing
   articles.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const t0 = Date.now();
const log = (...a) => console.log('[build]', ...a);

/* ---------------- 1. copy ---------------- */
const SKIP = new Set(['dist', 'build', 'worker', 'supabase', 'node_modules', 'hotendhq updates',
  'README.md', 'wrangler.jsonc', 'wrangler.toml', 'package.json', 'package-lock.json']);
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name) || /\.zip$/i.test(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(ROOT, OUT);
// mark the output as built: article links and canonicals then point at /guides/<slug>/
fs.appendFileSync(path.join(OUT, 'assets/js/config.js'), '\nwindow.HHQ_BUILT = true;\n');

/* ---------------- 2. load the browser data in a sandbox ---------------- */
const noop = () => {};
const sandbox = {
  console, URL, URLSearchParams, Intl, Date, Math, JSON, encodeURIComponent, decodeURIComponent,
  location: { pathname: '/', search: '', origin: 'https://hotendhq.com' },
  localStorage: { getItem: () => null, setItem: noop },
  navigator: {},
  addEventListener: noop, dispatchEvent: noop, CustomEvent: class {},
  document: {
    title: '', querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, getElementById: () => null,
    head: { insertAdjacentHTML: noop }, body: { insertAdjacentHTML: noop },
  },
};
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
for (const f of ['config.js', 'nav.js', 'site.js', 'md.js', 'render.js',
                 'data-articles.js', 'data-gear.js', 'data-filament.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8'), sandbox, { filename: f });
}
const W = sandbox;
W.HHQ_BUILT = true;   // pages rendered here link to the built /guides/ pages
const CFG = W.HHQ_CONFIG, BASE = CFG.baseUrl.replace(/\/+$/, '');
const esc = W.HHQ.esc;

/* ---------------- articles: seed + Supabase ---------------- */
async function loadArticles() {
  const bySlug = new Map();
  for (const a of W.HHQ_SEED_ARTICLES || [])
    bySlug.set(a.slug, { status: 'published', tags: [], featured: false, ...a });

  const url = process.env.SUPABASE_URL || CFG.supabase.url;
  const key = process.env.SUPABASE_ANON_KEY || CFG.supabase.anonKey;
  if (url && key) {
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/articles?select=*&status=eq.published&order=published_at.desc&limit=2000`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    rows.forEach(r => bySlug.set(r.slug, r));
    log(`Supabase: ${rows.length} published article(s)`);
  } else log('Supabase not configured, using bundled articles only');

  const out = [];
  for (const a of bySlug.values()) {
    if (a.status !== 'published') continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug || '')) { console.warn(`[build] skipped article with invalid slug "${a.slug}"`); continue; }
    out.push(a);
  }
  return out.sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
}

/* ---------------- HTML helpers ---------------- */
const PAGES = ['index', 'news', 'troubleshoot', 'generator', 'generators', 'gridfinity', 'chain',
  'storage-box', 'grid-organiser', 'cable-clip', 'spool-holder', 'wall-bracket', 'tools', 'gear', 'about',
  'login', 'admin', 'article', '404'];
/* Every generator is served under /generators/<name>; /generators itself is the index page. */
const GENERATORS = ['gridfinity', 'chain', 'storage-box', 'grid-organiser', 'cable-clip', 'spool-holder', 'wall-bracket'];
const clean = p => (p === 'index' ? '/' : GENERATORS.includes(p) ? `/generators/${p}` : `/${p}`);
const jsonLd = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const iso = d => { const x = new Date(d); return isNaN(x) ? undefined : x.toISOString(); };
const guideUrl = a => `${BASE}/guides/${a.slug}/`;
const absUrl = u => (!u ? '' : /^https?:/i.test(u) ? u : BASE + '/' + String(u).replace(/^\.?\//, ''));

/** Everything every built page gets: absolute asset paths, clean links, baked chrome. */
function finishPage(html, pagePath) {
  // bake header & footer (site.js skips injecting them when present)
  if (!html.includes('class="site-head"'))
    html = html.replace(/<body([^>]*)>/, `<body$1>\n${W.HHQ_CHROME.headerHTML(pagePath)}`);
  if (!html.includes('class="site-foot"'))
    html = html.replace(/<\/body>/, `${W.HHQ_CHROME.footerHTML(new Date().getFullYear())}\n</body>`);
  // absolute asset paths so nested URLs (/guides/x/) and 404s resolve
  html = html.replace(/(\s(?:href|src|srcset)=["'])(?:\.\/)?(assets\/|site\.webmanifest|favicon\.ico)/g, '$1/$2')
             .replace(/"\.\/assets\//g, '"/assets/');
  // clean internal links: news.html → /news, index.html / ./ → /
  html = rewriteLinks(html);
  // canonical + og:url on the served (clean) URL
  html = html.replace(new RegExp(`${BASE.replace(/[.]/g, '\\.')}/(${PAGES.join('|')})\\.html`, 'g'),
    (_, p) => BASE + (p === 'index' ? '/' : '/' + p));
  return html;
}
function rewriteLinks(src) {
  return src
    .replace(new RegExp(`(["'\`])(?:\\./|/)?(${PAGES.join('|')})\\.html(?=["'\`#?])`, 'g'),
      (_, q, p) => q + clean(p))
    .replace(/href=(["'])\.\/\1/g, 'href=$1/$1');
}
/** Fill <!--prerender:name--> (bare) or <!--prerender:name-->placeholder<!--/prerender--> (wrapped). */
function fillSlot(html, name, content) {
  const open = `<!--prerender:${name}-->`;
  if (!html.includes(open)) throw new Error(`prerender slot "${name}" not found`);
  const wrapped = new RegExp(open + '(?:(?!<!--prerender:)[\\s\\S])*?<!--/prerender-->');
  if (wrapped.test(html)) return html.replace(wrapped, () => content);
  return html.replace(open, () => content);
}

/* ---------------- 3. guide pages ---------------- */
function guidePage(a, all) {
  const title = a.seo_title || `${a.title} — ${CFG.siteName}`;
  const desc = a.meta_description || a.excerpt || '';
  const url = guideUrl(a);
  const img = absUrl(a.cover_url) || `${BASE}/assets/img/og-image.png`;
  const pub = iso(a.published_at || a.created_at), mod = iso(a.updated_at || a.published_at || a.created_at);
  const rel = W.HHQ_RENDER.related(a, all);
  const ld = [{
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.title, description: desc, image: [img],
    datePublished: pub, dateModified: mod,
    author: a.author_name && a.author_name !== CFG.siteName
      ? { '@type': 'Person', name: a.author_name } : { '@type': 'Organization', name: CFG.siteName, url: BASE + '/' },
    publisher: { '@type': 'Organization', name: CFG.siteName, logo: { '@type': 'ImageObject', url: `${BASE}/assets/img/icon-512.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: a.category, keywords: (a.tags || []).join(', ') || undefined,
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: BASE + '/news' },
      { '@type': 'ListItem', position: 3, name: a.title, item: url },
    ],
  }];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#00091c">
<meta property="og:site_name" content="${esc(CFG.siteName)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(a.seo_title || a.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(img)}">
${pub ? `<meta property="article:published_time" content="${pub}">` : ''}
${mod ? `<meta property="article:modified_time" content="${mod}">` : ''}
<meta property="article:section" content="${esc(a.category)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/css/fonts.css">
<link rel="stylesheet" href="/assets/css/theme.css">
<link rel="stylesheet" href="/assets/css/pages.css">
<script src="/assets/js/config.js" defer></script>
<script src="/assets/js/nav.js?v=2" defer></script>
<script src="/assets/js/site.js?v=2" defer></script>
<script src="/assets/js/api.js?v=2" defer></script>
${jsonLd(ld)}
</head>
<body>
<main id="main">
  <article class="wrap section--tight" id="art">${W.HHQ_RENDER.article(a)}
  </article>
  ${rel.length ? `<section class="wrap section" id="related-wrap">
    <div class="sec-head"><span class="eyebrow">Keep reading</span><h2>Related</h2></div>
    <div class="grid g3" id="related">${rel.map(W.postCard).join('')}</div>
  </section>` : ''}
</main>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const b = document.getElementById('share'); if (!b) return;
  b.addEventListener('click', async () => {
    const url = location.href, title = ${JSON.stringify(a.title).replace(/</g, '\\u003c')};
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); HHQ.toast('Link copied.'); }
    catch { HHQ.toast('Copy the address bar link.', 'warn'); }
  });
});
</script>
</body>
</html>
`;
}

/* ---------------- main ---------------- */
const articles = await loadArticles();
for (const a of articles) {
  const dir = path.join(OUT, 'guides', a.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), finishPage(guidePage(a, articles), `/guides/${a.slug}/`));
}
log(`wrote ${articles.length} guide page(s)`);

/* ---------------- 4. pre-render the data-driven pages ---------------- */
const edit = (file, fn) => { const p = path.join(OUT, file); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };

edit('gear.html', h => {
  h = fillSlot(h, 'gear-disc', W.icon('info') + `<p>${esc(CFG.affiliate.disclosure)}</p>`);
  h = fillSlot(h, 'gear-chips', W.HHQ_RENDER.gearChips('all'));
  h = fillSlot(h, 'gear', W.HHQ_RENDER.gearSections('all'));
  // ItemList of the picks for search engines
  const items = (W.HHQ_GEAR || []).map((g, i) => ({ '@type': 'ListItem', position: i + 1, name: g.name }));
  return h.replace('</head>', jsonLd({ '@context': 'https://schema.org', '@type': 'ItemList', name: '3D printing gear we recommend', itemListElement: items }) + '\n</head>');
});
edit('tools.html', h => fillSlot(h, 'filaments', W.HHQ_RENDER.filamentRows(W.HHQ_FILAMENTS || [])));
edit('news.html', h => {
  h = fillSlot(h, 'feed', articles.map(W.postCard).join(''));
  return fillSlot(h, 'feed-count', `${articles.length} of ${articles.length} article${articles.length === 1 ? '' : 's'}`);
});
edit('index.html', h => {
  const [lead, ...rest] = articles;
  h = fillSlot(h, 'home-feature', lead ? W.featureCard(lead) : '');
  return fillSlot(h, 'home-posts', rest.slice(0, 6).map(W.postCard).join(''));
});

/* ---------------- 5. finish every top-level page ---------------- */
for (const f of fs.readdirSync(OUT)) {
  if (!f.endsWith('.html')) continue;
  const name = f.replace(/\.html$/, '');
  edit(f, h => finishPage(h, clean(name)));
}
// generator pages live in generators/ (served at /generators/<name>); finish them too.
// The old top-level copies are only forwarding stubs for sites served without this build;
// here _redirects sends those addresses on with a 301, so the stubs are dropped.
for (const g of GENERATORS) {
  const f = path.join('generators', g + '.html');
  if (!fs.existsSync(path.join(OUT, f))) throw new Error(`generator page ${f} is missing`);
  edit(f, h => finishPage(h, clean(g)));
  fs.rmSync(path.join(OUT, g + '.html'), { force: true });
}
// JS files carry links too (nav model, cards, admin redirects)
for (const f of ['nav.js', 'site.js', 'render.js']) edit(path.join('assets/js', f), rewriteLinks);

/* ---------------- cache busting ----------------
   _headers caches /assets/* for a year, so every CSS/JS file a page links
   gets ?v=<content hash>. Change a file and its URL changes with it.   */
const hashOf = p => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10);
const assetHash = new Map();
const htmlFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(OUT);
for (const f of htmlFiles) {
  const h = fs.readFileSync(f, 'utf8').replace(/(\/assets\/(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w.-]*)?(?=["'])/g, (_, a) => {
    if (!assetHash.has(a)) {
      const p = path.join(OUT, a);
      assetHash.set(a, fs.existsSync(p) ? hashOf(p) : null);
    }
    return assetHash.get(a) ? `${a}?v=${assetHash.get(a)}` : a;
  });
  fs.writeFileSync(f, h);
}
log(`cache-busted ${assetHash.size} asset URL(s) across ${htmlFiles.length} pages`);

/* ---------------- sitemap + robots ---------------- */
const day = d => (iso(d) || '').slice(0, 10);
const staticPages = ['index', 'news', 'troubleshoot', 'generators', ...GENERATORS, 'tools', 'gear', 'about'];
const fileOf = p => (GENERATORS.includes(p) ? `generators/${p}.html` : `${p}.html`);
/* A URL only goes in the sitemap if the page at that URL names itself as canonical.
   Anything that doesn't is left out and logged, so the sitemap never sends mixed signals. */
const canonicalOf = file => {
  const m = fs.readFileSync(path.join(OUT, file), 'utf8').match(/<link rel="canonical" href="([^"]+)"/);
  return m ? m[1] : null;
};
const selfCanonical = (loc, file) => {
  const c = canonicalOf(file);
  if (c === loc) return true;
  log(`sitemap: left out ${loc} (its canonical is ${c || 'missing'})`);
  return false;
};
const urls = [
  ...staticPages.filter(p => selfCanonical(BASE + clean(p), fileOf(p)))
    .map(p => `  <url><loc>${BASE}${clean(p)}</loc><priority>${p === 'index' ? '1.0' : ['generators', 'gridfinity', 'chain'].includes(p) ? '0.9' : '0.8'}</priority></url>`),
  ...articles.filter(a => selfCanonical(guideUrl(a), path.join('guides', a.slug, 'index.html')))
    .map(a => `  <url><loc>${guideUrl(a)}</loc>${day(a.updated_at || a.published_at) ? `<lastmod>${day(a.updated_at || a.published_at)}</lastmod>` : ''}<priority>0.7</priority></url>`),
];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nDisallow: /article\n\nSitemap: ${BASE}/sitemap.xml\n`);

log(`done in ${Date.now() - t0} ms → dist/ (${articles.length} guides, ${urls.length} sitemap URLs)`);
