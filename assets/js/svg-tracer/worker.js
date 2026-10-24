/* ============================================================
   HOTEND HQ — SVG tracer worker
   Holds the image, caches the slow clean-up step, and turns it into
   SVG off the main thread.
   ============================================================ */
import { prepare, toSvg, traceDetailed, traceExact } from './trace.js?v=91bd468e9e';

let img = null;          // { rgba, w, h }
let prep = null, prepKey = '';
let dcache = {};         // Detailed / pixel-exact regions, reused while only the layers change

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      img = { rgba: new Uint8ClampedArray(m.rgba), w: m.w, h: m.h };
      prep = null; prepKey = ''; dcache = {};
      self.postMessage({ id: m.id, type: 'loaded' });
      return;
    }
    if (m.type === 'trace') {
      if (!img) throw new Error('No image loaded');
      const t0 = performance.now();
      if (m.prep.mode === 'detail') {
        const progress = (stage, pass) => self.postMessage({ id: m.id, type: 'progress', stage, pass });
        // levels 4 and 5: pixel-exact, refined until every region is within tol of the original
        const exact = m.prep.detail >= 4;
        const lay = { objects: m.vec.objects, layerNames: m.vec.layerNames, layerHidden: m.vec.layerHidden, cache: dcache };
        const res = exact
          ? traceExact(img.rgba, img.w, img.h, { tol: m.prep.detail >= 5 ? 1.2 : 3, preview: true, ...lay }, progress)
          : traceDetailed(img.rgba, img.w, img.h, { ...m.prep, smooth: m.vec.smooth, corners: m.vec.corners, preview: true, ...lay }, progress);
        const pv = res.preview, om = res.objMap;
        self.postMessage({ id: m.id, type: 'done', fresh: true, svg: res.svg, layers: [], palette: [], bg: -1, exact,
          preview: pv && { w: pv.w, h: pv.h, data: pv.data.buffer }, objMap: om && om.buffer, objLayers: res.objLayers, work: res.work,
          regions: res.regions, gradients: res.gradients, paths: res.paths, bytes: res.bytes, ms: Math.round(performance.now() - t0) }, [pv && pv.data.buffer, om && om.buffer].filter(Boolean));
        return;
      }
      const key = JSON.stringify(m.prep);
      let fresh = false;
      if (key !== prepKey || !prep) {
        self.postMessage({ id: m.id, type: 'progress', stage: 'colours' });
        prep = prepare(img.rgba, img.w, img.h, m.prep);
        prepKey = key; fresh = true;
      }
      self.postMessage({ id: m.id, type: 'progress', stage: 'curves' });
      const pal = prep.palette.map((p, i) => ({ ...p, hex: (m.vec.recolor || {})[i] || p.hex }));
      const res = toSvg({ ...prep, palette: pal }, { ...m.vec, mode: m.prep.mode });
      const om = res.objMap;
      self.postMessage({
        objMap: om && om.buffer, objLayers: res.objLayers,
        id: m.id, type: 'done', fresh,
        svg: res.svg, layers: res.layers.map(l => ({ i: l.i, hex: l.hex, d: l.d })),
        palette: prep.palette.map(p => ({ hex: p.hex, weight: p.weight })),
        bg: prep.bg, threshold: prep.threshold, denoise: prep.denoise, noise: prep.noise,
        work: [prep.W, prep.H], paths: res.paths, bytes: res.bytes, ms: Math.round(performance.now() - t0),
      }, om ? [om.buffer] : []);
    }
  } catch (err) {
    self.postMessage({ id: m.id, type: 'error', message: String(err && err.message || err) });
  }
};
