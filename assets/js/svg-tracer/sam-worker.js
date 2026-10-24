/* ============================================================
   HOTEND HQ — SVG tracer: object finder (runs in its own worker)
   MobileSAM (Apache-2.0, a distilled Segment Anything) finds the object under a tap:
   the image is encoded once, then every tap is a quick pass of the small mask decoder.
   onnxruntime-web (MIT) is shared with the pendant studio. The model files live in
   /assets/ai/svg-tracer: weights stored as float16 and widened to float32 inside the graph,
   the encoder split in two so every file stays small. Nothing leaves the browser.
   ============================================================ */
const ORT = '/generators/pendant/ai/';
const BASE = '/assets/ai/svg-tracer/';
const MODELS = {
  enc: { parts: ['mobilesam1-enc.0.onnx.wasm', 'mobilesam1-enc.1.onnx.wasm'], size: 16582090 },
  dec: { parts: ['mobilesam1-dec.onnx.wasm'], size: 8383499 },
};
const SIDE = 1024;                 // the encoder sees the image with its long side at 1024 px
const CACHE = 'hotendhq-svg-tracer-ai-v1';

let _rt = null;
function runtime() {
  return (_rt ||= (async () => {
    let gpu = false;
    if (self.navigator?.gpu) {
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        gpu = !!a && !(a.info?.isFallbackAdapter ?? a.isFallbackAdapter);
      } catch { gpu = false; }
    }
    const m = await import(ORT + (gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'));
    const o = m.InferenceSession ? m : m.default;
    o.env.wasm.wasmPaths = ORT;
    o.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    o.env.wasm.proxy = false;
    return { o, gpu };
  })().catch((e) => { _rt = null; throw e; }));
}

async function fetchModel(key, progress) {
  const m = MODELS[key], chunks = [];
  let cache = null;
  try {
    if (self.caches) {
      for (const k of await caches.keys()) if (k.startsWith('hotendhq-svg-tracer-ai-') && k !== CACHE) caches.delete(k);
      cache = await caches.open(CACHE);
    }
  } catch { cache = null; }
  let got = 0;
  for (const part of m.parts) {
    const url = BASE + part;
    let res = cache ? await cache.match(url).catch(() => null) : null;
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error(`could not load the object finder (${res.status})`);
      if (cache) cache.put(url, res.clone()).catch(() => {});
    }
    const rd = res.body.getReader();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      chunks.push(value); got += value.length;
      progress(got);
    }
  }
  const bytes = new Uint8Array(got);
  let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  return bytes;
}

let _sessions = null;
function sessions(post) {
  return (_sessions ||= (async () => {
    const { o, gpu } = await runtime();
    const total = MODELS.enc.size + MODELS.dec.size;
    let encGot = 0, last = -1;
    const tick = (n) => { const p = Math.min(99, Math.floor(n / total * 100)); if (p !== last) { last = p; post({ type: 'progress', text: `Loading the object finder… ${p}%` }); } };
    const encBytes = await fetchModel('enc', (n) => { encGot = n; tick(n); });
    const decBytes = await fetchModel('dec', (n) => tick(encGot + n));
    post({ type: 'progress', text: 'Starting the object finder…' });
    let enc = null;
    if (gpu) {
      try { enc = await o.InferenceSession.create(encBytes, { executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'all' }); }
      catch (e) { console.warn('object finder: graphics card refused it, using the processor', e); }
    }
    enc ||= await o.InferenceSession.create(encBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    // the decoder is small and runs once per tap: the processor is quicker than a round trip to the graphics card
    const dec = await o.InferenceSession.create(decBytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { o, enc, dec };
  })().catch((e) => { _sessions = null; throw e; }));
}

let emb = null, sized = null;      // image embedding of the current image, and its size at SIDE
self.onmessage = async (e) => {
  const m = e.data, post = (x, t) => self.postMessage({ id: m.id, ...x }, t || []);
  try {
    if (m.type === 'embed') {
      emb = null;
      const { o, enc } = await sessions(post);
      post({ type: 'progress', text: 'Finding the objects in your image…' });
      // m.rgba: the image drawn with its long side at SIDE (m.w × m.h), padded with black to SIDE × SIDE
      const src = new Uint8ClampedArray(m.rgba), x = new Float32Array(SIDE * SIDE * 3);
      for (let y = 0; y < m.h; y++) for (let k = 0; k < m.w; k++) {
        const i = (y * m.w + k) * 4, j = (y * SIDE + k) * 3;
        x[j] = src[i]; x[j + 1] = src[i + 1]; x[j + 2] = src[i + 2];
      }
      const r = await enc.run({ image: new o.Tensor('float32', x, [SIDE, SIDE, 3]) });
      emb = r.embeddings; sized = [m.w, m.h];
      post({ type: 'ready' });
      return;
    }
    if (m.type === 'pick') {
      if (!emb) throw new Error('No image');
      const { o, dec } = await sessions(post);
      // one positive point, plus the padding point the decoder expects when there is no box
      const feeds = {
        image_embeddings: emb,
        point_coords: new o.Tensor('float32', new Float32Array([m.x, m.y, 0, 0]), [1, 2, 2]),
        point_labels: new o.Tensor('float32', new Float32Array([1, -1]), [1, 2]),
        mask_input: new o.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new o.Tensor('float32', new Float32Array([0]), [1]),
        orig_im_size: new o.Tensor('float32', new Float32Array([sized[1], sized[0]]), [2]),
      };
      const r = await dec.run(feeds);
      const [, k, h, w] = r.masks.dims, lg = r.masks.data, n = w * h;
      // 4 masks, from the decoder's own guess (0) through part (1), object (2) and whole (3);
      // stored as 0..255 probability so the tracer can sample them smoothly
      const masks = new Uint8Array(k * n);
      for (let i = 0; i < k * n; i++) masks[i] = 255 / (1 + Math.exp(-lg[i]));
      const area = [];
      for (let c = 0; c < k; c++) { let a = 0; for (let i = c * n; i < (c + 1) * n; i++) if (masks[i] > 127) a++; area.push(a / n); }
      post({ type: 'mask', w, h, k, masks: masks.buffer, iou: Array.from(r.iou_predictions.data), area }, [masks.buffer]);
    }
  } catch (err) {
    post({ type: 'error', message: String(err && err.message || err) });
  }
};
