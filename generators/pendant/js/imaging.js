// Source image handling: loading, background removal (classic + AI), vector tracing and height-source mixing.
import { sculptRelief } from './sculpt.js';

const MAX_SRC = 1400;

export function canvasFromImage(img, max = MAX_SRC) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w0 * s)); cv.height = Math.max(1, Math.round(h0 * s));
  const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

export function loadImageFromBlob(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { res(canvasFromImage(img)); URL.revokeObjectURL(url); };
    img.onerror = () => { rej(new Error('Could not read that image.')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
export function loadImageFromURL(url) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(canvasFromImage(img)); img.onerror = () => rej(new Error('Could not read image')); img.src = url; });
}

// True when the image already carries a meaningful transparent background.
export function hasTransparency(cv) {
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
  let t = 0; for (let i = 3; i < d.length; i += 16) if (d[i] < 128) t++;
  return t / (d.length / 16) > 0.02;
}

// True when an opaque image sits on a plain, single-colour background (a logo or drawing on white, say):
// most of its border is one colour. Photos, and images that already have transparency, return false.
export function hasSolidBackground(cv) {
  if (hasTransparency(cv)) return false;
  const w = cv.width, h = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const rw = Math.max(1, Math.round(Math.min(w, h) * 0.01)), px = [];
  const take = (x, y) => { const o = (y * w + x) * 4; px.push([d[o], d[o + 1], d[o + 2]]); };
  const stepX = Math.max(1, Math.floor(w / 400)), stepY = Math.max(1, Math.floor(h / 400));
  for (let x = 0; x < w; x += stepX) for (let k = 0; k < rw; k++) { take(x, k); take(x, h - 1 - k); }
  for (let y = 0; y < h; y += stepY) for (let k = 0; k < rw; k++) { take(k, y); take(w - 1 - k, y); }
  const med = [0, 1, 2].map((c) => px.map((q) => q[c]).sort((a, b) => a - b)[px.length >> 1]);
  const close = px.filter((q) => Math.abs(q[0] - med[0]) + Math.abs(q[1] - med[1]) + Math.abs(q[2] - med[2]) < 36).length;
  return close / px.length > 0.9;
}

// ── Colour helpers ─────────────────────────────────────────
function toLab(data, n) {
  const L = new Float32Array(n * 3);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = lin(i);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0; i < n; i++) {
    const r = LUT[data[i * 4]], g = LUT[data[i * 4 + 1]], b = LUT[data[i * 4 + 2]];
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    L[i * 3] = 116 * y - 16; L[i * 3 + 1] = 500 * (x - y); L[i * 3 + 2] = 200 * (y - z);
  }
  return L;
}
// k-means on a set of Lab samples; returns cluster centres with their share of samples.
function kmeans(lab, idx, k, iters = 10) {
  if (!idx.length) return [];
  const C = [];
  C.push([lab[idx[0] * 3], lab[idx[0] * 3 + 1], lab[idx[0] * 3 + 2]]);
  while (C.length < k) { // farthest-point seeding
    let best = -1, bd = -1;
    for (const i of idx) { let d = Infinity; for (const c of C) d = Math.min(d, (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2); if (d > bd) { bd = d; best = i; } }
    if (bd < 4) break;
    C.push([lab[best * 3], lab[best * 3 + 1], lab[best * 3 + 2]]);
  }
  let cnt = new Array(C.length).fill(0);
  for (let it = 0; it < iters; it++) {
    const S = C.map(() => [0, 0, 0]); cnt = new Array(C.length).fill(0);
    for (const i of idx) {
      let bj = 0, bd = Infinity;
      C.forEach((c, j) => { const d = (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2; if (d < bd) { bd = d; bj = j; } });
      S[bj][0] += lab[i * 3]; S[bj][1] += lab[i * 3 + 1]; S[bj][2] += lab[i * 3 + 2]; cnt[bj]++;
    }
    C.forEach((c, j) => { if (cnt[j]) { c[0] = S[j][0] / cnt[j]; c[1] = S[j][1] / cnt[j]; c[2] = S[j][2] / cnt[j]; } });
  }
  return C.map((c, j) => ({ c, share: cnt[j] / idx.length }));
}

// ── Mask clean-up ──────────────────────────────────────────
// Labels 4-connected components of (mask === want); returns {label, sizes, touchesBorder}.
function components(mask, w, h, want) {
  const n = w * h, label = new Int32Array(n).fill(-1), sizes = [], border = [], stack = [];
  for (let s = 0; s < n; s++) {
    if (label[s] >= 0 || mask[s] !== want) continue;
    const id = sizes.length; let size = 0, touch = false;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0; size++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
      if (x > 0 && label[i - 1] < 0 && mask[i - 1] === want) { label[i - 1] = id; stack.push(i - 1); }
      if (x < w - 1 && label[i + 1] < 0 && mask[i + 1] === want) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && label[i - w] < 0 && mask[i - w] === want) { label[i - w] = id; stack.push(i - w); }
      if (y < h - 1 && label[i + w] < 0 && mask[i + w] === want) { label[i + w] = id; stack.push(i + w); }
    }
    sizes.push(size); border.push(touch);
  }
  return { label, sizes, border };
}
function boxMean(a, w, h, r) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length), inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) { let acc = 0; const o = y * w; for (let t = -r; t <= r; t++) acc += a[o + Math.min(w - 1, Math.max(0, t))]; for (let x = 0; x < w; x++) { tmp[o + x] = acc * inv; acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let acc = 0; for (let t = -r; t <= r; t++) acc += tmp[Math.min(h - 1, Math.max(0, t)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc * inv; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
// Guided filter with the image as guide: snaps a mask's soft edge onto the real image edges.
function guidedRefine(mask, guide, w, h, r, eps) {
  const n = w * h, Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = guide[i] * mask[i]; II[i] = guide[i] * guide[i]; }
  const mI = boxMean(guide, w, h, r), mp = boxMean(mask, w, h, r), mIp = boxMean(Ip, w, h, r), mII = boxMean(II, w, h, r);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = mII[i] - mI[i] * mI[i]; A[i] = (mIp[i] - mI[i] * mp[i]) / (v + eps); B[i] = mp[i] - A[i] * mI[i]; }
  const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, mA[i] * guide[i] + mB[i]));
  return out;
}
// Removes specks, optionally keeps only the main subject and fills enclosed pinholes, then refines the edge.
function cleanMask(A, data, w, h, p, soft = false) {
  const n = w * h, bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = A[i] >= 0.5 ? 1 : 0;
  const minSpeck = Math.max(4, n * (p.bgSpeck ?? 0.1) / 100);
  const fg = components(bin, w, h, 1);
  const largest = fg.sizes.reduce((b, s, i) => (s > (fg.sizes[b] ?? -1) ? i : b), 0);
  for (let i = 0; i < n; i++) { const l = fg.label[i]; if (l >= 0 && (fg.sizes[l] < minSpeck || (p.bgKeepLargest && l !== largest))) bin[i] = 0; }
  if (p.bgFillHoles !== false) {
    const bg = components(bin, w, h, 0), maxHole = n * 0.02;
    for (let i = 0; i < n; i++) { const l = bg.label[i]; if (l >= 0 && !bg.border[l] && bg.sizes[l] < maxHole) bin[i] = 1; }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = bin[i];
  if (p.bgEdge === false) return out;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  const r = Math.max(1, Math.round(Math.max(w, h) / 600));
  // guide = the soft matte where one exists (AI), else the image; the refined value is used only in a
  // two-pixel band around the edge, so the 0.5 contour moves sub-pixel onto the true edge (no stair-steps)
  // an AI matte already carries a precise soft edge: it is only kept consistent with the cleaned-up mask (never
  // snapped to the photo, which would copy its texture into the outline)
  const ref = soft ? (() => { const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = bin[i] ? Math.max(A[i], 0.5) : Math.min(A[i], 0.5); return s; })() : guidedRefine(out, lum, w, h, r, 1e-3);
  const band = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if ((x > 0 && bin[i - 1] !== bin[i]) || (x < w - 1 && bin[i + 1] !== bin[i]) || (y > 0 && bin[i - w] !== bin[i]) || (y < h - 1 && bin[i + w] !== bin[i])) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) band[yy * w + xx] = 1; }
    }
  }
  for (let i = 0; i < n; i++) if (band[i]) out[i] = Math.min(1, Math.max(0, ref[i]));
  return out;
}

// ── Smart auto background ──────────────────────────────────
// 1. The background's colours are learned from the dominant colours of the image border (a subject that
//    touches the frame — shoulders, a table edge — is a minority of the border and is not mistaken for it).
// 2. Background grows inwards as a geodesic flood: every step costs the colour change it crosses, minus a
//    noise floor. Smooth gradients and JPEG noise are free; a real edge — sharp or blurry — adds up and stops it.
function autoMask(data, w, h, p) {
  const s = Math.min(1, 640 / Math.max(w, h)), W = Math.max(8, Math.round(w * s)), H = Math.max(8, Math.round(h * s)), n = W * H;
  // area-average downsample (+ alpha)
  const small = new Float32Array(n * 4), cnt = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const yy = Math.min(H - 1, (y * s) | 0);
    for (let x = 0; x < w; x++) {
      const k = yy * W + Math.min(W - 1, (x * s) | 0), o = (y * w + x) * 4;
      small[k * 4] += data[o]; small[k * 4 + 1] += data[o + 1]; small[k * 4 + 2] += data[o + 2]; small[k * 4 + 3] += data[o + 3]; cnt[k]++;
    }
  }
  const rgba = new Uint8ClampedArray(n * 4);
  for (let k = 0; k < n; k++) for (let ch = 0; ch < 4; ch++) rgba[k * 4 + ch] = small[k * 4 + ch] / Math.max(1, cnt[k]);
  let lab = toLab(rgba, n);
  { // light 3×3 blur in Lab: removes JPEG block noise before measuring colour steps
    const b = new Float32Array(n * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 3; ch++) {
      let acc = 0, m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const wt = (dx ? 1 : 2) * (dy ? 1 : 2); acc += lab[(yy * W + xx) * 3 + ch] * wt; m += wt; }
      b[(y * W + x) * 3 + ch] = acc / m;
    }
    lab = b;
  }
  const rw = Math.max(2, Math.round(Math.min(W, H) * 0.012)), ring = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < rw || y < rw || x >= W - rw || y >= H - rw) ring.push(y * W + x);
  const opaqueRing = ring.filter((i) => rgba[i * 4 + 3] >= 20);
  const pal = kmeans(lab, opaqueRing, 6).filter((c) => c.share >= 0.14).map((c) => c.c);
  const T = p.bgTolerance * 100, T2 = T * T, floor = 1.6;
  const palD = (i) => { let d = Infinity; for (const c of pal) d = Math.min(d, (lab[i * 3] - c[0]) ** 2 + (lab[i * 3 + 1] - c[1]) ** 2 + (lab[i * 3 + 2] - c[2]) ** 2); return d; };
  // Dijkstra (binary heap) from the seeds
  const G = new Float64Array(n).fill(Infinity), hk = [], hv = []; // float64: costs must compare exactly
  const push = (c, v) => { let i = hk.length; hk.push(c); hv.push(v); while (i > 0) { const q = (i - 1) >> 1; if (hk[q] <= hk[i]) break; [hk[q], hk[i]] = [hk[i], hk[q]]; [hv[q], hv[i]] = [hv[i], hv[q]]; i = q; } };
  const pop = () => { const c = hk[0], v = hv[0], lc = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lc; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return [c, v]; };
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 20) { G[i] = 0; push(0, i); } // transparent pixels are background
  for (const i of ring) if (G[i] > 0 && palD(i) < T2) { G[i] = 0; push(0, i); }
  // A plain one-colour background (a logo on white): areas of that exact colour enclosed by the design — inside
  // a ring, between letters — are background as well, not something to raise. Photos never qualify.
  const tight = (0.45 * T) ** 2;
  if (pal.length === 1 && opaqueRing.filter((i) => palD(i) < tight).length > 0.9 * opaqueRing.length) {
    for (let i = 0; i < n; i++) if (G[i] > 0 && palD(i) < tight) { G[i] = 0; push(0, i); }
  }
  // Step cost = the colour change crossed (minus a noise floor) + a toll for every pixel whose colour is unlike
  // the background palette. The toll stops paths that sneak across an edge in tiny steps along a smeared
  // (JPEG chroma) transition; background gradients sampled by the border stay free.
  const pd = new Float32Array(n); for (let i = 0; i < n; i++) pd[i] = Math.max(0, Math.sqrt(palD(i)) - 0.6 * T);
  const step = (i, j) => Math.max(0, Math.sqrt((lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2) - floor) + 0.35 * pd[j];
  const limit = T * 1.6;
  while (hk.length) {
    const [c, i] = pop();
    if (c > G[i] || c > limit) continue;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx, nc = c + step(i, j) * (dx && dy ? 1.2 : 1);
      if (nc < G[j]) { G[j] = nc; push(nc, j); }
    }
  }
  // soft background probability at work resolution → full resolution
  const A0 = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = (G[i] - T * 0.75) / (T * 0.5); A0[i] = Math.min(1, Math.max(0, t)); }
  const A = new Float32Array(w * h), kx = W / w, ky = H / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(H - 1, Math.max(0, (y + 0.5) * ky - 0.5)), j = Math.min(H - 2, fy | 0), v = fy - j;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(W - 1, Math.max(0, (x + 0.5) * kx - 0.5)), i = Math.min(W - 2, fx | 0), u = fx - i, k = j * W + i;
      A[y * w + x] = ((A0[k] * (1 - u) + A0[k + 1] * u) * (1 - v) + (A0[k + W] * (1 - u) + A0[k + W + 1] * u) * v) * data[(y * w + x) * 4 + 3] / 255;
    }
  }
  return A;
}

function bgMask(data, w, h, p, aiMask) {
  const n = w * h, A = new Float32Array(n), alpha = (i) => data[i * 4 + 3] / 255;
  if (p.bgMode === 'none') { A.fill(1); return A; }
  if (p.bgMode === 'alpha') { for (let i = 0; i < n; i++) A[i] = alpha(i); return A; }
  if (p.bgMode === 'ai' && aiMask) { for (let i = 0; i < n; i++) A[i] = aiMask[i] * alpha(i); return cleanMask(A, data, w, h, p, true); }
  if (p.bgMode === 'light' || p.bgMode === 'dark') {
    const tol = p.bgTolerance;
    for (let i = 0; i < n; i++) {
      const l = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
      const edge = p.bgMode === 'light' ? (1 - tol) - l : l - tol;
      A[i] = Math.min(1, Math.max(0, 0.5 + edge * 25)) * alpha(i);
    }
    return cleanMask(A, data, w, h, p);
  }
  return cleanMask(autoMask(data, w, h, p), data, w, h, p);
}

// ── Vector tracer ──────────────────────────────────────────
// Marching squares on the (sub-pixel refined) mask, arc-length resampling, then Taubin λ|μ smoothing with
// corners pinned: curves come out fair and vector-smooth without shrinking, sharp corners stay sharp.
function contourLoops(A, w, h) {
  const W = w + 2, H = h + 2, P = new Float32Array(W * H); // zero-padded so every loop closes
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) P[(y + 1) * W + x + 1] = A[y * w + x];
  const nH = (W - 1) * H, segEnd = new Map(), pts = new Map();
  const edgePt = (e, ka, kb) => {
    if (!pts.has(e)) {
      const va = P[ka] - 0.5, vb = P[kb] - 0.5, t = Math.min(0.999, Math.max(0.001, va / (va - vb)));
      const xa = ka % W, ya = (ka / W) | 0, xb = kb % W, yb = (kb / W) | 0;
      pts.set(e, [xa + (xb - xa) * t - 0.5, ya + (yb - ya) * t - 0.5]); // pixel centres at +0.5
    }
  };
  const K = [0, 0, 0, 0], E = [0, 0, 0, 0], IN = [0, 0, 0, 0];
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const k0 = y * W + x; K[0] = k0; K[1] = k0 + 1; K[2] = k0 + W + 1; K[3] = k0 + W;
    let cs = 0; for (let q = 0; q < 4; q++) { IN[q] = P[K[q]] >= 0.5 ? 1 : 0; cs |= IN[q] << q; }
    if (cs === 0 || cs === 15) continue;
    E[0] = y * (W - 1) + x; E[1] = nH + y * W + x + 1; E[2] = (y + 1) * (W - 1) + x; E[3] = nH + y * W + x;
    const poly = [], pieces = [];
    const saddle = (cs === 5 || cs === 10) && (P[K[0]] + P[K[1]] + P[K[2]] + P[K[3]]) / 4 < 0.5;
    if (saddle) { for (let q = 0; q < 4; q++) if (IN[q]) pieces.push([q, 4 + q, 4 + ((q + 3) & 3)]); }
    else { for (let q = 0; q < 4; q++) { if (IN[q]) poly.push(q); if (IN[q] !== IN[(q + 1) & 3]) poly.push(4 + q); } pieces.push(poly); }
    for (const pc of pieces) for (let m = 0; m < pc.length; m++) {
      const a = pc[m], b = pc[(m + 1) % pc.length];
      if (a >= 4 && b >= 4) {
        const qa = a - 4, qb = b - 4;
        edgePt(E[qa], K[qa], K[(qa + 1) & 3]); edgePt(E[qb], K[qb], K[(qb + 1) & 3]);
        segEnd.set(E[qa], E[qb]);
      }
    }
  }
  const loops = [];
  for (const start of segEnd.keys()) {
    if (!segEnd.has(start)) continue;
    const loop = []; let e = start;
    while (segEnd.has(e)) { loop.push(pts.get(e)); const nx = segEnd.get(e); segEnd.delete(e); e = nx; }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
const loopArea = (L) => { let s = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
function resampleLoop(L, sp) {
  let per = 0; for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const N = Math.max(8, Math.round(per / sp)), step = per / N, out = [];
  let i = 0, acc = 0, a = L[0], b = L[1 % L.length], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let k = 0; k < N; k++) {
    const target = k * step;
    while (acc + seg < target && i < L.length) { acc += seg; i++; a = L[i % L.length]; b = L[(i + 1) % L.length]; seg = Math.hypot(b[0] - a[0], b[1] - a[1]); }
    const t = seg > 0 ? (target - acc) / seg : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
function smoothLoop(L0, sigma, cornerDeg) {
  const sp = 0.7, L = resampleLoop(L0, sp), n = L.length;
  // corners: turning angle between chords ±m samples, local maxima above the threshold stay pinned
  const m = Math.max(2, Math.round(2.2 / sp)), turn = new Float32Array(n), pin = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = L[(i - m + n) % n], b = L[i], c = L[(i + m) % n];
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    turn[i] = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1)))) * 180 / Math.PI;
  }
  for (let i = 0; i < n; i++) {
    if (turn[i] < cornerDeg) continue;
    let best = true; for (let d = -m; d <= m && best; d++) if (d && turn[(i + d + n) % n] > turn[i]) best = false;
    if (best) pin[i] = 1;
  }
  const iters = Math.min(600, Math.round(2 * (sigma / sp) ** 2)), X = L.map((q) => q[0]), Y = L.map((q) => q[1]);
  const tx = new Float64Array(n), ty = new Float64Array(n);
  for (let it = 0; it < iters; it++) for (const f of [0.5, -0.53]) {
    for (let i = 0; i < n; i++) {
      if (pin[i]) { tx[i] = X[i]; ty[i] = Y[i]; continue; }
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      tx[i] = X[i] + f * ((X[a] + X[b]) / 2 - X[i]); ty[i] = Y[i] + f * ((Y[a] + Y[b]) / 2 - Y[i]);
    }
    for (let i = 0; i < n; i++) { X[i] = tx[i]; Y[i] = ty[i]; }
  }
  return X.map((x, i) => [x, Y[i]]);
}

// Traces a source's subject mask into smooth Path2Ds (image pixel coordinates). Cached on the source.
export function traceOutline(src, p) {
  const key = [p.traceSmooth, p.traceDetail, p.traceMinArea].join('|');
  if (src._trace && src._trace.key === key) return src._trace;
  const w = src.width, h = src.height;
  let A = src._A;
  if (!A) { const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data; A = new Float32Array(w * h); for (let i = 0; i < w * h; i++) A[i] = d[i * 4 + 3] / 255; }
  const minArea = (p.traceMinArea ?? 0.15) / 100 * w * h;
  const sigma = 0.6 + (p.traceSmooth ?? 0.5) * Math.max(w, h) / 160;               // px
  const cornerDeg = 95 - 60 * (p.traceDetail ?? 0.6);                              // high detail keeps more corners
  const loops = contourLoops(A, w, h).filter((L) => Math.abs(loopArea(L)) >= minArea).map((L) => smoothLoop(L, sigma, cornerDeg));
  const path = new Path2D(), outerPath = new Path2D();
  // outer contours share the orientation of the largest loop; holes run the other way
  const big = loops.reduce((b, L) => (Math.abs(loopArea(L)) > Math.abs(loopArea(b || L)) ? L : b), null), sgn = big ? Math.sign(loopArea(big)) : 1;
  for (const L of loops) {
    const outer = Math.sign(loopArea(L)) === sgn;
    for (const pth of outer ? [path, outerPath] : [path]) { pth.moveTo(L[0][0], L[0][1]); for (let i = 1; i < L.length; i++) pth.lineTo(L[i][0], L[i][1]); pth.closePath(); }
  }
  let cover = 0; for (const L of loops) cover += loopArea(L);
  let opaque = 0; for (let i = 0; i < w * h; i++) opaque += A[i] > 0.5 ? 1 : 0;
  src._trace = { key, path, outerPath, loops: loops.length, points: loops.reduce((s, L) => s + L.length, 0), coverage: Math.abs(cover) / (w * h), maskCoverage: opaque / (w * h) };
  return src._trace;
}

// ── Height source ──────────────────────────────────────────
// Self-guided filter on the float image: flattens 8-bit banding and JPEG block noise (differences of a few
// grey levels) while real detail and edges pass untouched. Without it, smooth gradients print as terraces.
function deband(L, w, h) {
  const r = Math.max(2, Math.round(Math.max(w, h) / 300)), eps = (3 / 255) ** 2;
  let q = L;
  for (const rr of [r, Math.max(1, r >> 1)]) {
    const n = w * h, pp = new Float32Array(n); for (let i = 0; i < n; i++) pp[i] = q[i] * q[i];
    const m = boxMean(q, w, h, rr), m2 = boxMean(pp, w, h, rr), a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { const v = m2[i] - m[i] * m[i]; a[i] = v / (v + eps); b[i] = m[i] - a[i] * m[i]; }
    const ma = boxMean(a, w, h, rr), mb = boxMean(b, w, h, rr), o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = ma[i] * q[i] + mb[i];
    q = o;
  }
  return q;
}

const _cache = new Map(); // small LRU: pendant image, connector template, custom connector image…
// Returns a canvas (RGB = grey height preview, A = cleaned subject mask) carrying the full-precision data:
//   _H  Float32 height source 0..1,  _A  Float32 subject mask 0..1,  _orig the colour image.
// depth: { w, h, data } float map from the AI, or null.
export function buildSource(orig, depth, p, imgId, aiMask = null) {
  if (!orig) return null;
  const src = p.heightSource;
  const useDepth = (src === 'depth' || src === 'hybrid') && depth;
  const key = [imgId, p.bgMode, p.bgTolerance, p.bgKeepLargest, p.bgFillHoles, p.bgSpeck, p.bgEdge, p.bgMode === 'ai' && aiMask ? 'ai' : '', useDepth ? src : 'b', src === 'hybrid' ? p.depthMix : 0, useDepth ? [p.sculpt !== false, p.sculptFlatten, p.sculptDetail].join(',') : ''].join('|');
  if (_cache.has(key)) { const cv = _cache.get(key); _cache.delete(key); _cache.set(key, cv); return cv; }
  const w = orig.width, h = orig.height, n = w * h;
  const data = orig.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const A = bgMask(data, w, h, p, aiMask);
  let lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  lum = deband(lum, w, h);
  let Hf = lum;
  if (useDepth) {
    const D = depth.w === w && depth.h === h ? depth.data : null;
    if (D && p.sculpt !== false) {
      // sculpted bas-relief: depth gives the forms, compressed like a sculptor would; Hybrid borrows more
      // of the photo's own shading for fine detail (hair, fabric, engraving)
      let cut = null; for (let i = 0; i < n; i++) if (A[i] < 0.5) { cut = A; break; }
      const detail = src === 'depth' ? (p.sculptDetail ?? 0.15) : 0.8 * (1 - (p.depthMix ?? 0.65));
      Hf = sculptRelief(D, lum, cut, w, h, { flatten: p.sculptFlatten ?? 0.55, detail });
    } else if (D) {
      const mix = src === 'depth' ? 1 : p.depthMix;
      Hf = new Float32Array(n);
      for (let i = 0; i < n; i++) Hf[i] = lum[i] * (1 - mix) + D[i] * mix;
    }
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d', { willReadFrequently: true }), od = og.createImageData(w, h), o = od.data;
  for (let i = 0; i < n; i++) { const v = Math.round(Hf[i] * 255); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = Math.round(A[i] * 255); }
  og.putImageData(od, 0, 0);
  out._H = Hf; out._A = A; out._orig = orig; out._depth = !!(useDepth && depth);
  _cache.set(key, out);
  if (_cache.size > 6) _cache.delete(_cache.keys().next().value);
  return out;
}

export { estimateDepth, removeBackgroundAI } from './ai.js';

