// In-browser AI, fully self-hosted: onnxruntime-web (WebAssembly) and the models ship with the app in /ai,
// so AI depth and AI cut-out work on any static host and inside sandboxed pages that may only load their
// own files. Nothing is sent anywhere; the images never leave the browser.
//
//   Depth Anything V2 Small (Apache-2.0) — relative depth, run with flip test-time augmentation. Its weights are
//   stored as float16 and widened to float32 when the session starts, so it computes in full precision: the older
//   int8-quantised export pitted every surface with a fine noise that printed as a sandpaper texture.
//   MODNet (Apache-2.0) — portrait matting.
//   onnxruntime-web 1.20.1 (MIT).
//
// Both return float maps at the source image's resolution. The matte is edge-snapped to the image with a guided
// filter; depth is not (that copied the photo's texture and colour edges into the shape). sculpt.js turns depth
// into the final relief.

const BASE = new URL('../ai/', import.meta.url).href;
// ONNX model files, split into chunks under 15 MB. They carry a .wasm extension only so that strict static
// hosts serve them (the bytes are read with fetch, never instantiated as WebAssembly).
const MODELS = {
  depth: { parts: ['depth2.0.onnx.wasm', 'depth2.1.onnx.wasm', 'depth2.2.onnx.wasm', 'depth2.3.onnx.wasm'], size: 49765779, label: 'depth model' },
  matte: { parts: ['modnet.onnx.wasm'], size: 6632188, label: 'cut-out model' },
};

let _ort = null;
function ort() {
  return (_ort ||= import(BASE + 'ort.wasm.min.mjs').then((m) => {
    const o = m.InferenceSession ? m : m.default;
    o.env.wasm.wasmPaths = BASE;
    o.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    o.env.wasm.proxy = false;
    return o;
  }).catch((e) => { _ort = null; throw e; }));
}

async function fetchModel(key, onStatus) {
  const m = MODELS[key], chunks = [];
  let got = 0, last = -1;
  for (const part of m.parts) {
    const res = await fetch(BASE + part);
    if (!res.ok) throw new Error(`could not load the ${m.label} (${res.status})`);
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

const _sessions = {};
function session(key, onStatus) {
  return (_sessions[key] ||= (async () => {
    const o = await ort();
    const bytes = await fetchModel(key, onStatus);
    onStatus?.('Starting AI engine…');
    return o.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { delete _sessions[key]; throw e; }));
}

// ── Pixel helpers ──────────────────────────────────────────
function resized(img, w, h, flip = false) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h).data;
}
function toCHW(data, w, h, mean, std) {
  const n = w * h, out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) out[ch * n + i] = (data[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  return out;
}
function luminance(img) {
  const w = img.width, h = img.height, d = img.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return L;
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
function boxMean(a, w, h, r) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length), inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) { let acc = 0; const o = y * w; for (let t = -r; t <= r; t++) acc += a[o + Math.min(w - 1, Math.max(0, t))]; for (let x = 0; x < w; x++) { tmp[o + x] = acc * inv; acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let acc = 0; for (let t = -r; t <= r; t++) acc += tmp[Math.min(h - 1, Math.max(0, t)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc * inv; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
// Guided filter (He et al.) with the photo as guide: moves the low-resolution network output's edges onto the
// real image edges while keeping it smooth everywhere else.
function guided(p, I, w, h, r, eps) {
  const n = w * h, Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = boxMean(I, w, h, r), mp = boxMean(p, w, h, r), mIp = boxMean(Ip, w, h, r), mII = boxMean(II, w, h, r);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = mII[i] - mI[i] * mI[i]; A[i] = (mIp[i] - mI[i] * mp[i]) / (v + eps); B[i] = mp[i] - A[i] * mI[i]; }
  const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = mA[i] * I[i] + mB[i];
  return q;
}
const tick = () => new Promise((r) => setTimeout(r, 0)); // let the status badge paint between heavy steps

// ── Depth ──────────────────────────────────────────────────
// Returns { w, h, data } with data in 0..1 (near = 1) at the image's resolution.
export async function estimateDepth(img, onStatus) {
  const s = await session('depth', onStatus);
  const o = await ort();
  onStatus?.('Estimating depth…'); await tick();
  // DPT sizing: short side 518, both sides multiples of 14 (long side capped for speed)
  const W = img.width, H = img.height, sc = Math.min(518 / Math.min(W, H), 924 / Math.max(W, H));
  const w = Math.max(14, Math.round(W * sc / 14) * 14), h = Math.max(14, Math.round(H * sc / 14) * 14);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const run = async (flip) => {
    const t = new o.Tensor('float32', toCHW(resized(img, w, h, flip), w, h, mean, std), [1, 3, h, w]);
    const out = await s.run({ [s.inputNames[0]]: t });
    const d = out[s.outputNames[0]], dims = d.dims; // [1, h, w]
    return { data: d.data, dw: dims[dims.length - 1], dh: dims[dims.length - 2] };
  };
  const a = await run(false);
  onStatus?.('Refining depth…'); await tick();
  const b = await run(true); // mirrored pass, un-mirrored and averaged: cancels much of the network's noise
  const { dw, dh } = a, avg = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) avg[y * dw + x] = 0.5 * (a.data[y * dw + x] + b.data[y * dw + (dw - 1 - x)]);
  // robust normalisation (0.5 % / 99.5 % percentiles)
  const sorted = Float32Array.from(avg).sort(), lo = sorted[Math.floor(sorted.length * 0.005)], hi = sorted[Math.floor(sorted.length * 0.995)];
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < avg.length; i++) avg[i] = Math.min(1, Math.max(0, (avg[i] - lo) * k));
  const out = upsample(avg, dw, dh, W, H);
  onStatus?.('');
  return { w: W, h: H, data: out };
}

// ── Portrait matting ───────────────────────────────────────
// Returns a Float32Array alpha matte (0..1) at the image's resolution.
export async function removeBackgroundAI(img, onStatus) {
  const s = await session('matte', onStatus);
  const o = await ort();
  onStatus?.('Finding the subject…'); await tick();
  // MODNet sizing: short side 512 (long side capped at 1024), both sides multiples of 32
  const W = img.width, H = img.height, sc = Math.min(512 / Math.min(W, H), 1024 / Math.max(W, H));
  const w = Math.max(32, Math.round(W * sc / 32) * 32), h = Math.max(32, Math.round(H * sc / 32) * 32);
  const t = new o.Tensor('float32', toCHW(resized(img, w, h), w, h, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]), [1, 3, h, w]);
  const res = await s.run({ [s.inputNames[0]]: t });
  const m = res[s.outputNames[0]], mw = m.dims[m.dims.length - 1], mh = m.dims[m.dims.length - 2];
  const up = upsample(m.data, mw, mh, W, H);
  const r = Math.max(1, Math.round(Math.max(W, H) / mw));
  const out = guided(up, luminance(img), W, H, r, 1e-4);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, out[i]));
  onStatus?.('');
  return out;
}
