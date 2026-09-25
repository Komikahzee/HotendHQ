/* Hotend HQ — chain build worker (Manifold WASM + link engine off the main thread) */
import Module from '../vendor/manifold/manifold.js?v=26779a4e84';
import { buildChain, buildTestStrip, STYLES } from './chain-build.js?v=cef34e2a53';

const ready = Module().then(w => { w.setup(); return w; });
let fontP = null;
const loadFont = () => (fontP ??= fetch(new URL('../fonts/inter-800-outlines.json', import.meta.url)).then(r => r.json()));

self.onmessage = async (e) => {
  const { id, kind, params, polys } = e.data;
  try {
    const wasm = await ready;
    const st = STYLES[params.style] || {};
    const font = (st.letters || kind === 'strip') ? await loadFont() : null;
    const t0 = performance.now();
    const res = kind === 'strip' ? buildTestStrip(wasm, font, params) : buildChain(wasm, font, params, polys);
    const transfer = [];
    const bodies = res.bodies.map(b => {
      const pos = new Float32Array(b.pos), idx = new Uint32Array(b.idx);
      transfer.push(pos.buffer, idx.buffer);
      return { key: b.key, pos, idx, volume: b.volume };
    });
    self.postMessage({
      id, ok: true, ms: Math.round(performance.now() - t0),
      bodies, parts: res.parts, stats: res.stats, warn: res.warn, kitSteps: res.kitSteps || null, gaps: res.gaps || null,
    }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};
