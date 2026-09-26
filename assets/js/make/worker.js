/* ============================================================
   HOTEND HQ — model generator worker
   Runs a generator's build() with Manifold WASM off the main thread
   and sends back plain meshes, one per coloured part.
   ============================================================ */
import Module from '../../vendor/manifold/manifold.js?v=26779a4e84';
import { kit } from './core.js?v=95f6f46afd';
import { GENERATORS } from './gens/index.js?v=fce36efb1e';

const ready = Module().then(w => { w.setup(); return w; });
const fonts = new Map();
const font = (id) => {
  if (!/^[a-z0-9-]+$/.test(id || '')) id = 'inter';
  if (!fonts.has(id)) fonts.set(id, fetch(new URL(`../../fonts/outlines/${id}.json`, import.meta.url)).then(r => { if (!r.ok) throw new Error('font ' + id); return r.json(); }));
  return fonts.get(id);
};

self.onmessage = async (e) => {
  const { id, gen, params } = e.data;
  const t0 = performance.now();
  try {
    const w = await ready;
    const G = GENERATORS[gen];
    if (!G) throw new Error('Unknown generator ' + gen);
    const K = kit(w);
    const res = await G.build(K, params, { font });
    const transfer = [];
    const parts = [];
    for (const p of res.parts || []) {
      if (!p || !p.m || p.m.isEmpty()) continue;
      const mesh = K.toMesh(p.m), b = p.m.boundingBox();
      transfer.push(mesh.pos.buffer, mesh.idx.buffer);
      parts.push({ name: p.name, label: p.label || p.name, color: p.color || '#f3662e', colorKey: p.colorKey || null, pos: mesh.pos, idx: mesh.idx,
        volume: p.m.volume(), min: b.min, max: b.max,
        preview: !!p.preview, look: p.look || null, opacity: p.opacity ?? 1, asm: p.asm || null });     // preview parts are shown, never exported
    }
    K.free();
    if (!parts.some(q => !q.preview)) throw new Error(res.warn?.[0] || 'Nothing to build with these settings.');
    self.postMessage({ id, ok: true, ms: Math.round(performance.now() - t0), parts, warn: res.warn || [], info: res.info || {} }, transfer);
  } catch (err) {
    console.error(err);
    try { (await ready).__live && kit(await ready).free(); } catch {}
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
