/* ============================================================
   HOTEND HQ — search & social tags for the hand-written pages
   Adds Open Graph, Twitter card, theme colour and JSON-LD to the
   pages that are not written by make-pages.mjs, between
   <!-- seo --> … <!-- /seo --> markers, so it can be re-run.
   Run:  node build/seo.mjs   (then node build/stamp.mjs)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://hotendhq.com';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (h) => unesc(h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const OG = '/assets/img/og-image.png';
const ORG = { '@type': 'Organization', name: 'Hotend HQ', url: BASE + '/', logo: `${BASE}/assets/img/icon-512.png` };
const crumbs = (list) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: list.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: BASE + url })) });
/** FAQ entries from <details><summary>Q</summary>A</details> blocks */
const faqOf = (html) => {
  const out = [];
  for (const m of html.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) out.push([strip(m[1]), strip(m[2])]);
  return out;
};
const faqLd = (qa) => qa.length ? { '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) } : null;

const PAGES = [
  { file: 'index.html', url: '/', type: 'website', ld: () => [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Hotend HQ', url: BASE + '/', description: 'News, troubleshooting, free 3D model generators, calculators and tested gear for 3D printing.', publisher: ORG },
    { '@context': 'https://schema.org', ...ORG }] },
  { file: 'news.html', url: '/news', ld: () => [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: '3D printing news & guides', url: BASE + '/news', isPartOf: { '@type': 'WebSite', name: 'Hotend HQ', url: BASE + '/' } },
    crumbs([['Home', '/'], ['News & guides', '/news']])] },
  { file: 'troubleshoot.html', url: '/troubleshoot', ld: () => [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: '3D print troubleshooting', url: BASE + '/troubleshoot', about: '3D printing problems and fixes' },
    crumbs([['Home', '/'], ['Troubleshooting', '/troubleshoot']])] },
  { file: 'tools.html', url: '/tools', ld: () => [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Hotend HQ 3D printing calculators', url: BASE + '/tools', applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any (runs in the browser)', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
    crumbs([['Home', '/'], ['Tools', '/tools']])] },
  { file: 'gear.html', url: '/gear', ld: () => [crumbs([['Home', '/'], ['Gear', '/gear']])] },
  { file: 'about.html', url: '/about', ld: () => [
    { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About Hotend HQ', url: BASE + '/about', mainEntity: ORG },
    crumbs([['Home', '/'], ['About', '/about']])] },
  { file: 'generators/chain.html', url: '/generators/chain', image: '/assets/img/generators/chain.webp', ld: (h) => [
    faqLd(faqOf(h)), crumbs([['Home', '/'], ['3D model generators', '/generators'], ['Chains', '/generators/chain']])] },
  { file: 'generators/gridfinity.html', url: '/generators/gridfinity', image: '/assets/img/generators/gridfinity.webp', ld: (h) => [
    faqLd(faqOf(h)), crumbs([['Home', '/'], ['3D model generators', '/generators'], ['Gridfinity', '/generators/gridfinity']])] },
  { file: '404.html', noindex: true },
];

let n = 0;
for (const pg of PAGES) {
  const f = path.join(ROOT, pg.file);
  let h = fs.readFileSync(f, 'utf8').replace(/\n?<!-- seo -->[\s\S]*?<!-- \/seo -->/, '');
  const tags = [];
  if (pg.noindex) { if (!/name="robots"/.test(h)) tags.push('<meta name="robots" content="noindex">'); }
  else {
    const title = unesc((h.match(/<title>([\s\S]*?)<\/title>/) || [, 'Hotend HQ'])[1]).replace(/\s+—\s+Hotend HQ$/, '');
    const desc = unesc((h.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1]);
    const img = BASE + (pg.image || OG);
    if (!/og:title/.test(h)) tags.push(
      `<meta property="og:type" content="${pg.type || 'website'}">`, '<meta property="og:site_name" content="Hotend HQ">',
      `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${BASE}${pg.url}">`, `<meta property="og:image" content="${img}">`,
      '<meta name="twitter:card" content="summary_large_image">');
    if (!/name="theme-color"/.test(h)) tags.push('<meta name="theme-color" content="#00091c">');
    for (const o of pg.ld(h).filter(Boolean)) tags.push(ld(o));
  }
  if (tags.length) {
    h = h.replace(/(<link rel="canonical"[^>]*>|<meta name="description"[^>]*>)/, `$1\n<!-- seo -->\n${tags.join('\n')}\n<!-- /seo -->`);
    n++;
  }
  fs.writeFileSync(f, h);
}
console.log(`[seo] tagged ${n} page(s)`);
