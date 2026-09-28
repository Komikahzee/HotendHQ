import { zipSync, strToU8 } from '/assets/vendor/fflate/fflate.js';

// Offset that centres a mesh (or a set of parts sharing one frame) on XY with its bottom at Z=0.
export function frameOf(meshes) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const M of meshes) { x0 = Math.min(x0, M.bbox.min[0]); y0 = Math.min(y0, M.bbox.min[1]); z0 = Math.min(z0, M.bbox.min[2]); x1 = Math.max(x1, M.bbox.max[0]); y1 = Math.max(y1, M.bbox.max[1]); }
  return [(x0 + x1) / 2, (y0 + y1) / 2, z0];
}
// Canonical (manifold) vertices moved into the shared frame.
function canonical(M, off = frameOf([M])) {
  const n = M.nCanon, P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { P[i * 3] = M.positions[i * 3] - off[0]; P[i * 3 + 1] = M.positions[i * 3 + 1] - off[1]; P[i * 3 + 2] = M.positions[i * 3 + 2] - off[2]; }
  return P;
}

export function toSTL(M, name = 'pendant', off) {
  const P = canonical(M, off), I = M.exportIndex, nt = I.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = `HotendHq ${name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
    for (const v of [a, b, c]) { dv.setFloat32(o, P[v], true); dv.setFloat32(o + 4, P[v + 1], true); dv.setFloat32(o + 8, P[v + 2], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

export function toOBJ(M, name = 'pendant') {
  const P = canonical(M, frameOf([M])), I = M.exportIndex, parts = [`# HotendHq ${name}\no ${name}\n`];
  let s = '';
  for (let i = 0; i < M.nCanon; i++) { s += `v ${P[i * 3].toFixed(4)} ${P[i * 3 + 1].toFixed(4)} ${P[i * 3 + 2].toFixed(4)}\n`; if (s.length > 1e6) { parts.push(s); s = ''; } }
  for (let t = 0; t < I.length; t += 3) { s += `f ${I[t] + 1} ${I[t + 1] + 1} ${I[t + 2] + 1}\n`; if (s.length > 1e6) { parts.push(s); s = ''; } }
  parts.push(s);
  return new Blob(parts, { type: 'text/plain' });
}

// Streams one <mesh> element into the chunk list (strings are flushed every ~1 MB).
function meshXML(M, off, out) {
  const P = canonical(M, off), I = M.exportIndex;
  let s = '<mesh><vertices>\n';
  for (let i = 0; i < M.nCanon; i++) {
    s += `<vertex x="${P[i * 3].toFixed(4)}" y="${P[i * 3 + 1].toFixed(4)}" z="${P[i * 3 + 2].toFixed(4)}"/>\n`;
    if (s.length > 1e6) { out.push(s); s = ''; }
  }
  s += '</vertices><triangles>\n';
  for (let t = 0; t < I.length; t += 3) {
    s += `<triangle v1="${I[t]}" v2="${I[t + 1]}" v3="${I[t + 2]}"/>\n`;
    if (s.length > 1e6) { out.push(s); s = ''; }
  }
  out.push(s + '</triangles></mesh>');
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
const modelHead = (name, desc) => '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
  + `<metadata name="Title">${esc(name)}</metadata>\n<metadata name="Application">HotendHq Pendant Studio</metadata>\n`
  + (desc ? `<metadata name="Description">${esc(desc)}</metadata>\n` : '');

export function to3MF(M, name = 'pendant', meta = {}) {
  const chunks = [modelHead(name, meta.description) + '<resources>\n<object id="1" type="model" name="' + esc(name) + '">'];
  meshXML(M, frameOf([M]), chunks);
  chunks.push('</object>\n</resources>\n<build><item objectid="1"/></build>\n</model>\n');
  return new Blob([zipSync({ '[Content_Types].xml': strToU8(CONTENT_TYPES), '_rels/.rels': strToU8(RELS), '3D/3dmodel.model': strToU8(chunks.join('')) }, { level: 6 })], { type: 'model/3mf' });
}

// Scene 3MF: several printed objects (e.g. pendant + connector bail) laid out side by side on one plate.
// Each object is an assembly of coloured parts sharing its own frame. Core-spec colours via <basematerials>,
// plus Bambu Studio / OrcaSlicer part→filament slots in Metadata/model_settings.config.
export function to3MFScene(objects, name = 'pendant', meta = {}) {
  const all = objects.flatMap((o) => o.parts), GAP = 8;
  const chunks = [modelHead(name, meta.description) + '<resources>\n<basematerials id="1">\n'
    + all.map((p) => `<base name="${esc(p.name)}" displaycolor="${p.color.toUpperCase()}FF"/>`).join('\n') + '\n</basematerials>\n'];
  let id = 2, pindex = 0, cursor = 0;
  const placed = [];
  for (const o of objects) {
    const off = frameOf(o.parts.map((p) => p.mesh));
    const x0 = Math.min(...o.parts.map((p) => p.mesh.bbox.min[0])), x1 = Math.max(...o.parts.map((p) => p.mesh.bbox.max[0]));
    const w = x1 - x0, ids = [];
    for (const p of o.parts) {
      chunks.push(`<object id="${id}" type="model" name="${esc(p.name)}" pid="1" pindex="${pindex++}">`);
      meshXML(p.mesh, off, chunks);
      chunks.push('</object>\n'); ids.push(id++);
    }
    const asm = id++;
    chunks.push(`<object id="${asm}" type="model" name="${esc(o.name)}"><components>\n${ids.map((i) => `<component objectid="${i}"/>`).join('\n')}\n</components></object>\n`);
    placed.push({ o, asm, ids, dx: cursor + w / 2 });
    cursor += w + GAP;
  }
  const shift = (cursor - GAP) / 2; // centre the arrangement on the plate origin
  chunks.push('</resources>\n<build>\n' + placed.map((pl) => `<item objectid="${pl.asm}" transform="1 0 0 0 1 0 0 0 1 ${(pl.dx - shift).toFixed(3)} 0 0"/>`).join('\n') + '\n</build>\n</model>\n');
  const settings = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + placed.map((pl) =>
    `  <object id="${pl.asm}">\n    <metadata key="name" value="${esc(pl.o.name)}"/>\n    <metadata key="extruder" value="${pl.o.parts[0].slot}"/>\n`
    + pl.o.parts.map((p, i) => `    <part id="${pl.ids[i]}" subtype="normal_part">\n      <metadata key="name" value="${esc(p.name)}"/>\n      <metadata key="extruder" value="${p.slot}"/>\n    </part>\n`).join('')
    + '  </object>\n').join('') + '</config>\n';
  const files = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES), '_rels/.rels': strToU8(RELS),
    '3D/3dmodel.model': strToU8(chunks.join('')), 'Metadata/model_settings.config': strToU8(settings),
  };
  return new Blob([zipSync(files, { level: 6 })], { type: 'model/3mf' });
}
// Multi-colour 3MF of a single object made of coloured parts.
export const to3MFMulti = (parts, name = 'pendant', meta = {}) => to3MFScene([{ name, parts }], name, meta);

// One STL per colour, all in the same coordinate frame so they import perfectly aligned.
// `extras` (e.g. the connector bail) are separate objects, each in its own frame.
export async function toSTLZip(parts, name = 'pendant', extras = []) {
  const off = frameOf(parts.map((p) => p.mesh)), files = {};
  await Promise.all(parts.map(async (p, i) => {
    files[`${name}-${i + 1}-${p.name.replace(/[^\w-]+/g, '_')}.stl`] = new Uint8Array(await toSTL(p.mesh, p.name, off).arrayBuffer());
  }));
  await Promise.all(extras.map(async (e) => { files[`${name}-${e.name.replace(/[^\w-]+/g, '_')}.stl`] = new Uint8Array(await toSTL(e.mesh, e.name).arrayBuffer()); }));
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

function esc(s) { return String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch])); }

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ── Saving files ───────────────────────────────────────────
// When HotendHq runs as a published claude.ai page, the page can't start downloads itself: files go through
// the host's save prompt, which accepts only a few types. There, anything that isn't a png / json / txt /
// zip is bundled into a single .zip. Everywhere else files download normally.
const HOST_OK = /\.(png|json|txt|zip)$/i;
let _host = null;
function hostDownloads() {
  if (!_host) _host = (typeof window !== 'undefined' && window.claude?.use) ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  return _host;
}
hostDownloads(); // resolve early so an export isn't delayed by it

// files: [[blob, filename], …]; bundleName: the .zip name used when files must be bundled.
// Resolves 'saved' | 'declined' | 'downloaded'; rejects with an Error whose message is shown to the user.
export async function saveFiles(files, bundleName) {
  const host = await hostDownloads();
  if (!host) { for (const [b, fn] of files) download(b, fn); return 'downloaded'; }
  let blob, filename;
  if (files.length === 1 && HOST_OK.test(files[0][1])) [blob, filename] = files[0];
  else {
    const entries = {};
    for (const [b, fn] of files) entries[fn] = [new Uint8Array(await b.arrayBuffer()), { level: /\.(3mf|zip|png)$/i.test(fn) ? 0 : 6 }];
    blob = new Blob([zipSync(entries)], { type: 'application/zip' }); filename = `${bundleName}.zip`;
  }
  try { await host.save({ filename, data: blob }); return 'saved'; }
  catch (e) {
    if (e?.code === 'declined') return 'declined';
    if (e?.code === 'rate_limited') throw new Error('Another save is already waiting for your answer.');
    throw new Error(e?.message || 'Saving is not available here.');
  }
}
