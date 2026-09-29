// In-browser AI, fully self-hosted: onnxruntime-web (WebAssembly) and the models ship with the app in /ai,
// so AI depth and AI cut-out work on any static host and inside sandboxed pages that may only load their
// own files. Nothing is sent anywhere; the images never leave the browser.
//
//   Depth Anything V2 Small (Apache-2.0) — relative depth, run with flip test-time augmentation. Its weights are
//   stored as float16 and widened to float32 when the session starts, so it computes in full precision: the older
//   int8-quantised export pitted every surface with a fine noise that printed as a sandpaper texture.
//   IS-Net general-use (DIS, Apache-2.0) — subject segmentation for any subject: people, pets, objects. Its
//   weights are stored as per-channel int8 and dequantised on load, so it too computes in float32.
//   onnxruntime-web 1.20.1 (MIT), run on the graphics card (WebGPU) where the browser offers one.
//   face-api (MIT) — finds faces and their 68 landmarks, for the portrait detail in sculpt.js (~1.9 MB).
//
// Depth and matte return float maps at the source image's resolution. Neither is snapped to the photo's edges
// (that copied texture and colour edges into the shape). sculpt.js turns depth into the final relief.

const BASE = new URL('../ai/', import.meta.url).href;
// ONNX model files, split into chunks under 15 MB. They carry a .wasm extension only so that strict static
// hosts serve them (the bytes are read with fetch, never instantiated as WebAssembly).
const MODELS = {
  depth: { parts: ['depth2.0.onnx.wasm', 'depth2.1.onnx.wasm', 'depth2.2.onnx.wasm', 'depth2.3.onnx.wasm'], size: 49765779, label: 'depth model' },
  matte: { parts: ['isnet.0.onnx.wasm', 'isnet.1.onnx.wasm', 'isnet.2.onnx.wasm', 'isnet.3.onnx.wasm'], size: 46714894, label: 'cut-out model' },
};

// Where the AI runs. On a computer with a usable graphics card (WebGPU) the networks run there, many times
// faster than on the processor, which is what makes the fine tiled depth pass below affordable. Everywhere
// else, or if the graphics driver refuses a model, they run on the processor (WebAssembly) as before.
// ?ai=gpu / ?ai=cpu in the page address forces one or the other (for testing).
const FORCE = (() => { try { return new URLSearchParams(location.search).get('ai'); } catch { return null; } })();
let _rt = null;
function runtime() {
  return (_rt ||= (async () => {
    let gpu = false;
    if (FORCE !== 'cpu' && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        const soft = a && (a.info?.isFallbackAdapter ?? a.isFallbackAdapter); // a software stand-in is slower than wasm
        gpu = !!a && (FORCE === 'gpu' || !soft);
      } catch { gpu = false; }
    }
    // the WebGPU build also carries the processor back end, so one runtime covers both cases
    const m = await import(BASE + (gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'));
    const o = m.InferenceSession ? m : m.default;
    o.env.wasm.wasmPaths = BASE;
    o.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    o.env.wasm.proxy = false;
    return { o, gpu };
  })().catch((e) => { _rt = null; throw e; }));
}
const ort = () => runtime().then((r) => r.o);
// Model bytes are kept in the browser's Cache Storage, so a second visit (or a reload) starts the AI at once
// instead of downloading ~100 MB again. File names change whenever a model changes, so stale entries are
// never served; caches from older versions are deleted.
const CACHE = 'hotendhq-pendant-ai-v2';
let _cache;
function modelCache() {
  return (_cache ||= (async () => {
    if (typeof caches === 'undefined') return null;
    try {
      for (const k of await caches.keys()) if (k.startsWith('hotendhq-pendant-ai-') && k !== CACHE) caches.delete(k);
      return await caches.open(CACHE);
    } catch { return null; } // private windows and some embedded browsers refuse Cache Storage
  })());
}

async function fetchModel(key, onStatus) {
  const m = MODELS[key], chunks = [], cache = await modelCache();
  let got = 0, last = -1;
  for (const part of m.parts) {
    const url = BASE + part;
    let res = cache ? await cache.match(url).catch(() => null) : null;
    if (!res) {
      res = await fetch(url);
      if (!res.ok) throw new Error(`could not load the ${m.label} (${res.status})`);
      if (cache) cache.put(url, res.clone()).catch(() => {}); // stored as it streams in
    }
    const rd = res.body.getReader();
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      chunks.push(value); got += value.length;
      const pct = Math.min(99, Math.floor(got / m.size * 100));
      if (pct !== last) { last = pct; onStatus?.(`Loading ${m.label}… ${pct}%`); }
    }
  }
  const bytes = new Uint8Array(got);
  let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  return bytes;
}

const _sessions = {}, _onGpu = {};
function session(key, onStatus) {
  return (_sessions[key] ||= (async () => {
    const { o, gpu } = await runtime();
    const bytes = await fetchModel(key, onStatus);
    onStatus?.('Starting AI engine…');
    if (gpu) {
      try {
        const s = await o.InferenceSession.create(bytes, { executionProviders: ['webgpu', 'wasm'], graphOptimizationLevel: 'all' });
        _onGpu[key] = true;
        return s;
      } catch (e) { console.warn(`${MODELS[key].label}: graphics card refused it, using the processor`, e); }
    }
    _onGpu[key] = false;
    return o.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { delete _sessions[key]; throw e; }));
}

// ── Pixel helpers ──────────────────────────────────────────
// RGBA pixels of img (or of the rectangle r = [x, y, w, h] of it) drawn at w × h, optionally mirrored.
function resized(img, w, h, flip = false, r = null) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  if (r) g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, w, h); else g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}
function scaledCanvas(img, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  return cv;
}
// Separable box blur, three passes ≈ Gaussian (sigma ≈ r); edges repeat.
function blur3(a, w, h, r) {
  const box = (src) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), inv = 1 / (2 * r + 1), cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
    for (let y = 0; y < h; y++) { const o = y * w; let acc = 0; for (let t = -r; t <= r; t++) acc += src[o + cl(t, w)]; for (let x = 0; x < w; x++) { tmp[o + x] = acc * inv; acc += src[o + cl(x + r + 1, w)] - src[o + cl(x - r, w)]; } }
    for (let x = 0; x < w; x++) { let acc = 0; for (let t = -r; t <= r; t++) acc += tmp[cl(t, h) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc * inv; acc += tmp[cl(y + r + 1, h) * w + x] - tmp[cl(y - r, h) * w + x]; } }
    return out;
  };
  return box(box(box(a)));
}
function toCHW(data, w, h, mean, std) {
  const n = w * h, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) out[ch * n + i] = (data[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  return out;
}
// Bilinear resample of a float map (pixel-centre aligned).
function upsample(src, sw, sh, w, h) {
  const out = new Float32Array(w * h), kx = sw / w, ky = sh / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * ky - 0.5)), j = Math.min(sh - 2, fy | 0), v = fy - j;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * kx - 0.5)), i = Math.min(sw - 2, fx | 0), u = fx - i, k = j * sw + i;
      out[y * w + x] = (src[k] * (1 - u) + src[k + 1] * u) * (1 - v) + (src[k + sw] * (1 - u) + src[k + sw + 1] * u) * v;
    }
  }
  return out;
}
const tick = () => new Promise((r) => setTimeout(r, 0)); // let the status badge paint between heavy steps

// ── Depth ──────────────────────────────────────────────────
// Returns { w, h, data, fine } with data in 0..1 (near = 1) at the image's resolution.
//
// The network sees at most ~518 px on the short side, so on its own it can't resolve eyelashes, fur or
// fabric folds in a 1400 px photo. The fine pass runs it again on overlapping 518 px tiles of the photo at
// twice that scale. Each tile only knows depth up to an unknown scale and offset, so it is fitted to the
// whole-picture estimate by least squares, tiles are cross-faded, and finally only their fine detail is kept:
// the broad shape (anything wider than about an eighth of a tile) still comes from the whole-picture pass,
// which has seen the full context. quality: 'auto' (fine pass when the model runs on the graphics card),
// 'fine' (always), 'standard' (never).
export async function estimateDepth(img, onStatus, { quality = 'auto' } = {}) {
  const s = await session('depth', onStatus);
  const o = await ort();
  const gpu = !!_onGpu.depth, mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const infer = async (w, h, flip, src = img, rect = null) => {
    const t = new o.Tensor('float32', toCHW(resized(src, w, h, flip, rect), w, h, mean, std), [1, 3, h, w]);
    const out = await s.run({ [s.inputNames[0]]: t });
    const d = out[s.outputNames[0]], dims = d.dims, dw = dims[dims.length - 1], dh = dims[dims.length - 2];
    let data = Float32Array.from(d.data);
    d.dispose?.();
    if (flip) { const f = new Float32Array(dw * dh); for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) f[y * dw + x] = data[y * dw + dw - 1 - x]; data = f; }
    return (dw === w && dh === h) ? data : upsample(data, dw, dh, w, h);
  };
  // a mirrored pass, un-mirrored and averaged, cancels much of the network's noise
  const both = async (w, h, src, rect) => { const a = await infer(w, h, false, src, rect), b = await infer(w, h, true, src, rect); for (let i = 0; i < a.length; i++) a[i] = 0.5 * (a[i] + b[i]); return a; };

  onStatus?.('Estimating depth…'); await tick();
  // DPT sizing: short side 518, both sides multiples of 14 (long side capped for speed)
  const W = img.width, H = img.height, sc = Math.min(518 / Math.min(W, H), 924 / Math.max(W, H));
  const dw = Math.max(14, Math.round(W * sc / 14) * 14), dh = Math.max(14, Math.round(H * sc / 14) * 14);
  const G = await both(dw, dh, img, null);

  let out, fine = false;
  const fs = Math.min(1, 1036 / Math.min(W, H), 1848 / Math.max(W, H)), FW = Math.round(W * fs), FH = Math.round(H * fs);
  if ((quality === 'fine' || (quality === 'auto' && gpu)) && Math.min(FW, FH) >= 1.35 * Math.min(dw, dh)) {
    fine = true;
    const src = scaledCanvas(img, FW, FH), Gf = upsample(G, dw, dh, FW, FH);
    const tw = Math.min(518, Math.floor(FW / 14) * 14), th = Math.min(518, Math.floor(FH / 14) * 14);
    const starts = (N, t) => { const n = N <= t ? 1 : Math.ceil((N - t) / (t * 0.66)) + 1; return Array.from({ length: n }, (_, i) => (n === 1 ? 0 : Math.round(i * (N - t) / (n - 1)))); };
    const xs = starts(FW, tw), ys = starts(FH, th), total = xs.length * ys.length;
    const acc = new Float32Array(FW * FH), wsum = new Float32Array(FW * FH), ramp = Math.max(8, Math.round(Math.min(tw, th) * 0.17));
    const fade = (i, n, lo, hi) => { let t = 1; if (lo) t = Math.min(t, (i + 0.5) / ramp); if (hi) t = Math.min(t, (n - i - 0.5) / ramp); t = Math.min(1, t); return 0.5 - 0.5 * Math.cos(Math.PI * t); };
    let k = 0;
    for (const y0 of ys) for (const x0 of xs) {
      onStatus?.(`Adding fine detail… ${++k}/${total}`); await tick();
      const t = gpu ? await both(tw, th, src, [x0, y0, tw, th]) : await infer(tw, th, false, src, [x0, y0, tw, th]);
      // Fit a·t + b to the whole-picture depth over this tile. The scale a is matched on mid-sized forms (a band
      // pass), not on the tile's overall slope: that keeps the strength of fine detail the same from tile to
      // tile, so no tile pattern shows in busy backgrounds.
      const gp = new Float32Array(tw * th);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) gp[y * tw + x] = Gf[(y0 + y) * FW + x0 + x];
      // (scales both passes resolve; matched by energy, so the tile's extra detail doesn't bias it down)
      const band = (q) => { const f = blur3(q, tw, th, 4), c = blur3(q, tw, th, 24); for (let i = 0; i < f.length; i++) f[i] -= c[i]; return f; };
      const bt = band(t), bg = band(gp);
      let tt2 = 0, gg2 = 0, tg = 0, st = 0, sg = 0; const n = tw * th;
      for (let i = 0; i < n; i++) { tt2 += bt[i] * bt[i]; gg2 += bg[i] * bg[i]; tg += bt[i] * bg[i]; st += t[i]; sg += gp[i]; }
      const a = tt2 > 1e-12 && tg > 0 ? Math.sqrt(gg2 / tt2) : 0, b = sg / n - a * st / n;
      for (let y = 0; y < th; y++) {
        const wy = fade(y, th, y0 > 0, y0 + th < FH);
        for (let x = 0; x < tw; x++) {
          const w = Math.max(1e-4, wy * fade(x, tw, x0 > 0, x0 + tw < FW)), i = (y0 + y) * FW + x0 + x;
          acc[i] += w * (a * t[y * tw + x] + b); wsum[i] += w;
        }
      }
    }
    for (let i = 0; i < acc.length; i++) acc[i] = wsum[i] > 0 ? acc[i] / wsum[i] : Gf[i];
    const r = Math.max(2, Math.round(Math.min(tw, th) / 8)), Fl = blur3(acc, FW, FH, r), Gl = blur3(Gf, FW, FH, r);
    for (let i = 0; i < acc.length; i++) acc[i] += Gl[i] - Fl[i];
    out = FW === W && FH === H ? acc : upsample(acc, FW, FH, W, H);
  } else out = upsample(G, dw, dh, W, H);

  // robust normalisation (0.5 % / 99.5 % percentiles, from a sample)
  const step = Math.max(1, Math.floor(out.length / 250000)), smp = new Float32Array(Math.ceil(out.length / step));
  for (let i = 0, j = 0; i < out.length; i += step) smp[j++] = out[i];
  smp.sort();
  const lo = smp[Math.floor(smp.length * 0.005)], hi = smp[Math.floor(smp.length * 0.995)], kk = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] - lo) * kk));
  onStatus?.('');
  return { w: W, h: H, data: out, fine };
}

// ── Subject cut-out ────────────────────────────────────────
// Returns a Float32Array alpha matte (0..1) at the image's resolution.
export async function removeBackgroundAI(img, onStatus) {
  const s = await session('matte', onStatus);
  const o = await ort();
  onStatus?.('Finding the subject…'); await tick();
  // IS-Net sees the whole picture squeezed into 1024 × 1024, values centred on 0.5
  const W = img.width, H = img.height, S = 1024;
  const t = new o.Tensor('float32', toCHW(resized(img, S, S), S, S, [0.5, 0.5, 0.5], [1, 1, 1]), [1, 3, S, S]);
  const res = await s.run({ [s.inputNames[0]]: t });
  const m = res[s.outputNames[0]], mw = m.dims[m.dims.length - 1], mh = m.dims[m.dims.length - 2];
  let lo = Infinity, hi = -Infinity; for (const v of m.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 1 / Math.max(1e-6, hi - lo), mm = new Float32Array(mw * mh);
  for (let i = 0; i < mm.length; i++) mm[i] = (m.data[i] - lo) * k;
  // The network's own soft edge is used as is: snapping it to the photo's edges (guided filter) copied wood
  // grain, fabric and hair texture into the outline, which printed as a comb of ridges along the cut.
  const out = upsample(mm, mw, mh, W, H);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, out[i]));
  onStatus?.('');
  return out;
}

// ── Faces (portrait detail) ─────────────────────────────────
// face-api (MIT, @vladmandic/face-api 1.7.15, with its bundled TensorFlow.js): the tiny face detector and the
// 68-point landmark model, ~1.9 MB in all, loaded only the first time a picture is checked for faces.
// Returns [{ box: [x, y, w, h], pts: [[x, y] × 68] }] in the image's pixels; [] when there are none.
let _faceapi = null;
function faceApi() {
  return (_faceapi ||= (async () => {
    const f = await import(BASE + 'face/face-api.esm.js');
    await f.tf.ready();
    await f.nets.tinyFaceDetector.loadFromUri(BASE + 'face');
    await f.nets.faceLandmark68Net.loadFromUri(BASE + 'face');
    return f;
  })().catch((e) => { _faceapi = null; throw e; }));
}
export async function detectFaces(img, onStatus) {
  onStatus?.('Looking for faces…');
  const f = await faceApi();
  // the detector works best around 512 px; landmarks are refined on each face crop at full resolution
  const res = await f.detectAllFaces(img, new f.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })).withFaceLandmarks();
  onStatus?.('');
  const minSide = Math.min(img.width, img.height);
  return res
    .filter((r) => r.detection.box.width >= 0.06 * minSide) // tiny faces in a crowd carry no printable detail
    .map((r) => ({ box: [r.detection.box.x, r.detection.box.y, r.detection.box.width, r.detection.box.height], score: r.detection.score, pts: r.landmarks.positions.map((p) => [p.x, p.y]) }));
}
