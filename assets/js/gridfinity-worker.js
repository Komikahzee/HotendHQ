/* Hotend HQ — Gridfinity build worker.
   Runs Manifold (WASM) off the main thread so sliders stay smooth on phones. */
import Module from '../vendor/manifold/manifold.js';
import { createGridfinity } from './gridfinity-core.js?v=2';

const ready = Module().then(w => { w.setup(); return w; });
let fontP = null;
const loadFont = () => (fontP ??= fetch(new URL('../fonts/inter-800-outlines.json', import.meta.url)).then(r => r.json()));

const hasText = (p) => !!((p.labels && p.tab && p.tab !== 'none') || p.topText);

self.onmessage = async (e) => {
  const { id, jobs } = e.data;
  try {
    const wasm = await ready;
    const font = jobs.some(j => hasText(j.params)) ? await loadFont() : null;
    const G = createGridfinity(wasm, font);
    for (let n = 0; n < jobs.length; n++) {
      const job = jobs[n];
      const t0 = performance.now();
      const r = job.kind === 'clip' ? G.clip(job.params.count || 1) : G[job.kind](job.params);
      const mesh = r.solid.getMesh();
      const pos = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
      for (let i = 0, k = 0; i < mesh.vertProperties.length; i += mesh.numProp) {
        pos[k++] = mesh.vertProperties[i]; pos[k++] = mesh.vertProperties[i + 1]; pos[k++] = mesh.vertProperties[i + 2];
      }
      const idx = new Uint32Array(mesh.triVerts);
      const out = {
        id, n, total: jobs.length, name: job.name, pos, idx, warn: r.warn, info: r.info,
        volume: r.solid.volume(), ms: Math.round(performance.now() - t0),
      };
      r.solid.delete();
      self.postMessage(out, [pos.buffer, idx.buffer]);
    }
    self.postMessage({ id, done: true });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
