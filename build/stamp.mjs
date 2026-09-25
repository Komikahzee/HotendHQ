/* ============================================================
   HOTEND HQ — stamp asset versions into the source files
   _headers tells browsers to keep /assets/* for a year, so every
   CSS/JS reference carries ?v=<content hash>. build.mjs does this
   for dist/, and this script does the same to the source files, so
   the site is also correct when it is served straight from the repo.
   Run it after changing any CSS or JS:   node build/stamp.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'assets/js');
const hash = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10);

// 1. JS files that import each other: stamp until nothing changes (a file's hash includes its imports' hashes)
const jsFiles = fs.readdirSync(JS).filter(f => f.endsWith('.js'));
const IMPORT = /(['"])\.\/([\w.-]+\.js)(?:\?v=[\w.-]*)?\1/g;
for (let pass = 0; pass < 8; pass++) {
  let changed = 0;
  for (const f of jsFiles) {
    const p = path.join(JS, f), src = fs.readFileSync(p, 'utf8');
    const out = src.replace(IMPORT, (m, q, dep) => fs.existsSync(path.join(JS, dep)) ? `${q}./${dep}?v=${hash(path.join(JS, dep))}${q}` : m);
    if (out !== src) { fs.writeFileSync(p, out); changed++; }
  }
  if (!changed) break;
}

// 2. every page: /assets/css|js/<file>?v=<hash>
const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['.git', 'dist', 'node_modules', '.wrangler', 'hotendhq updates', 'assets', 'build', 'supabase', 'worker'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push(p);
  }
})(ROOT);
let refs = 0;
for (const p of pages) {
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(/(\/assets\/(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w.-]*)?(?=["'])/g, (m, a) => {
    const f = path.join(ROOT, a);
    if (!fs.existsSync(f)) return m;
    refs++;
    return `${a}?v=${hash(f)}`;
  });
  if (out !== src) fs.writeFileSync(p, out);
}
console.log(`[stamp] ${refs} asset reference(s) across ${pages.length} page(s)`);
