/* ============================================================
   HOTEND HQ — SVG tracer: image clean-up before tracing
   Pure functions on RGBA pixel arrays, so they run the same in the
   worker and in Node tests.

   The idea: tracing quality is decided before any curve is fitted.
   1. Light edge-preserving denoise (kills JPEG blocking and grain).
   2. Pick the palette with weighted k-means in CIELAB, sampling only
      flat pixels so anti-aliased edges never become colours of their own.
   3. Upscale with bicubic so edges land between pixels, then label every
      pixel. Edge pixels are resolved as a blend of the confident colours
      next to them, which removes the coloured fringe other tracers leave.
   4. Merge specks smaller than the detail size into their neighbours.
   The result is a clean indexed image that the curve fitter turns into
   smooth, gap-free shapes.
   ============================================================ */

export const TRANSPARENT = 255;

/* ---------------- colour ---------------- */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fi = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const gam = (c) => { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = fi(fx) * 0.95047, y = fi(fy), z = fi(fz) * 1.08883;
  return [gam(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
          gam(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z),
          gam(0.0556434 * x - 0.2040259 * y + 1.0572252 * z)];
}
export const hex = ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
export const fromHex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/** Lab for every pixel of an RGBA image (cached per distinct colour). */
export function labOf(rgba, n) {
  const out = new Float32Array(n * 3);
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    let v = cache.get(key);
    if (!v) { v = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]); if (cache.size < 400000) cache.set(key, v); }
    out[i * 3] = v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2];
  }
  return out;
}

/** Scale the colour (a, b) axes. JPEG keeps colour at half resolution, so on noisy images colour differences
    are trusted less than lightness differences; edges are then placed by lightness, as the eye does. */
export function weightChroma(lab, k) {
  if (k === 1) return lab;
  for (let i = 0; i < lab.length; i += 3) { lab[i + 1] *= k; lab[i + 2] *= k; }
  return lab;
}

/* ---------------- resampling ---------------- */
/** Flatten partly transparent pixels: colour is kept (un-premultiplied), alpha is kept. */
function cubic(x) { x = Math.abs(x); return x < 1 ? (1.5 * x - 2.5) * x * x + 1 : x < 2 ? ((-0.5 * x + 2.5) * x - 4) * x + 2 : 0; }

/** Resize RGBA. Bicubic (Catmull-Rom) when enlarging, area average when shrinking. Premultiplied, so
    transparent pixels never bleed their hidden colour into the edge. */
export function resize(src, w, h, W, H) {
  if (W === w && H === h) return new Uint8ClampedArray(src);
  const pre = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = src[i * 4 + 3] / 255;
    pre[i * 4] = src[i * 4] * a; pre[i * 4 + 1] = src[i * 4 + 1] * a; pre[i * 4 + 2] = src[i * 4 + 2] * a; pre[i * 4 + 3] = src[i * 4 + 3];
  }
  const pass = (data, sw, sh, dw, horizontal) => {
    // resample along one axis; returns Float32Array of size (dw x sh) or (sw x dw)
    const len = horizontal ? sw : sh, other = horizontal ? sh : sw;
    const out = new Float32Array((horizontal ? dw * sh : sw * dw) * 4);
    const s = len / dw;
    const taps = [];
    for (let d = 0; d < dw; d++) {
      const list = [];
      if (s > 1) { // area
        const a = d * s, b = a + s;
        for (let k = Math.floor(a); k < Math.ceil(b); k++) { const wgt = Math.min(b, k + 1) - Math.max(a, k); if (wgt > 0) list.push([Math.min(len - 1, k), wgt / s]); }
      } else {
        const c = (d + 0.5) * s - 0.5, k0 = Math.floor(c);
        let sum = 0;
        for (let k = k0 - 1; k <= k0 + 2; k++) { const wgt = cubic(c - k); if (wgt) { list.push([Math.max(0, Math.min(len - 1, k)), wgt]); sum += wgt; } }
        for (const t of list) t[1] /= sum;
      }
      taps.push(list);
    }
    for (let o = 0; o < other; o++) {
      for (let d = 0; d < dw; d++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (const [k, wgt] of taps[d]) {
          const si = (horizontal ? o * sw + k : k * sw + o) * 4;
          r += data[si] * wgt; g += data[si + 1] * wgt; b += data[si + 2] * wgt; a += data[si + 3] * wgt;
        }
        const di = (horizontal ? o * dw + d : d * sw + o) * 4;
        out[di] = r; out[di + 1] = g; out[di + 2] = b; out[di + 3] = a;
      }
    }
    return out;
  };
  const hp = pass(pre, w, h, W, true);
  const vp = pass(hp, W, h, H, false);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const a = vp[i * 4 + 3];
    const k = a > 0.5 ? 255 / a : 0;
    out[i * 4] = vp[i * 4] * k; out[i * 4 + 1] = vp[i * 4 + 1] * k; out[i * 4 + 2] = vp[i * 4 + 2] * k; out[i * 4 + 3] = a;
  }
  return out;
}

/* ---------------- denoise ---------------- */
/** Edge-preserving bilateral filter (radius 2). strength 0..3; 0 returns the input. */
export function denoise(rgba, w, h, strength) {
  if (!strength) return rgba;
  let src = rgba;
  const sr = [0, 14, 22, 32][strength] || 32, inv = -1 / (2 * sr * sr);
  const sw = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) sw.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * 1.6 * 1.6))]);
  const passes = strength >= 3 ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r0 = src[i], g0 = src[i + 1], b0 = src[i + 2];
      let R = 0, G = 0, B = 0, W = 0;
      for (const [dx, dy, ws] of sw) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = (yy * w + xx) * 4;
        const dr = src[j] - r0, dg = src[j + 1] - g0, db = src[j + 2] - b0;
        const wt = ws * Math.exp((dr * dr + dg * dg + db * db) * inv);
        R += src[j] * wt; G += src[j + 1] * wt; B += src[j + 2] * wt; W += wt;
      }
      out[i] = R / W; out[i + 1] = G / W; out[i + 2] = B / W; out[i + 3] = src[i + 3];
    }
    src = out;
  }
  return src;
}

/** Rough noise estimate: the typical second difference over the image. Clean flat art scores ~0 because most
    pixels sit in flat areas and edges are a minority; JPEG artefacts and grain lift the whole distribution. */
export function noiseLevel(rgba, w, h) {
  const vals = [];
  const step = Math.max(1, Math.floor(Math.sqrt(w * h / 60000)));
  for (let y = 1; y < h - 1; y += step) for (let x = 1; x < w - 1; x += step) {
    const i = (y * w + x) * 4;
    if (rgba[i + 3] < 128) continue;
    let d = 0;
    for (let c = 0; c < 3; c++) d += Math.abs(2 * rgba[i + c] - rgba[i - 4 + c] - rgba[i + 4 + c]) + Math.abs(2 * rgba[i + c] - rgba[i - w * 4 + c] - rgba[i + w * 4 + c]);
    vals.push(d);
  }
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.7)];
}

/* ---------------- palette ---------------- */
const d2 = (L, a, b, c) => (L - c[0]) ** 2 + (a - c[1]) ** 2 + (b - c[2]) ** 2;

/** Colour histogram of flat pixels (bins of 2 Lab units). Edge pixels count a little, so a colour that only
    exists as a thin line still gets in. */
export function histogram(lab, alpha, w, h) {
  const bins = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt(w * h / 600000)));
  let total = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = y * w + x;
    if (alpha[i * 4 + 3] < 128) continue;
    const L = lab[i * 3], A = lab[i * 3 + 1], B = lab[i * 3 + 2];
    // flat = no real colour change within 2 px (keeps JPEG fringes and anti-aliasing out of the palette)
    let flat = true;
    for (let r = 1; r <= 2 && flat; r++) for (const j of [x >= r ? i - r : -1, x < w - r ? i + r : -1, y >= r ? i - r * w : -1, y < h - r ? i + r * w : -1]) {
      if (j < 0) continue;
      if (d2(L, A, B, [lab[j * 3], lab[j * 3 + 1], lab[j * 3 + 2]]) > 36) { flat = false; break; }
    }
    const wt = flat ? 1 : 0.08;
    const key = ((L / 4) | 0) * 16384 + (((A + 128) / 4) | 0) * 128 + (((B + 128) / 4) | 0);
    let e = bins.get(key);
    if (!e) bins.set(key, e = [0, 0, 0, 0]);
    e[0] += L * wt; e[1] += A * wt; e[2] += B * wt; e[3] += wt; total += wt;
  }
  const arr = [];
  for (const e of bins.values()) arr.push([e[0] / e[3], e[1] / e[3], e[2] / e[3], e[3]]);
  return { arr, total };
}

function kmeans(pts, centers, iters = 24) {
  const k = centers.length, asg = new Int32Array(pts.length);
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    let moved = 0;
    for (let p = 0; p < pts.length; p++) {
      const [L, a, b, wt] = pts[p];
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = d2(L, a, b, centers[c]); if (d < bd) { bd = d; best = c; } }
      if (asg[p] !== best) moved++;
      asg[p] = best;
      const s = sum[best]; s[0] += L * wt; s[1] += a * wt; s[2] += b * wt; s[3] += wt;
    }
    for (let c = 0; c < k; c++) if (sum[c][3] > 0) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
    if (!moved && it) break;
  }
  const weight = new Float64Array(k);
  for (let p = 0; p < pts.length; p++) weight[asg[p]] += pts[p][3];
  return { centers, weight };
}

/** Deterministic k-means++ style seeding: heaviest colour first, then the colour that is both common and far away. */
export function seed(pts, k) {
  const centers = [];
  let first = 0; for (let p = 1; p < pts.length; p++) if (pts[p][3] > pts[first][3]) first = p;
  centers.push(pts[first].slice(0, 3));
  const dist = pts.map(p => d2(p[0], p[1], p[2], centers[0]));
  while (centers.length < k && centers.length < pts.length) {
    let best = -1, bs = 0;
    for (let p = 0; p < pts.length; p++) { const s = Math.sqrt(pts[p][3]) * Math.min(dist[p], 2500); if (s > bs) { bs = s; best = p; } }
    if (best < 0 || dist[best] < 4) break;
    centers.push(pts[best].slice(0, 3));
    for (let p = 0; p < pts.length; p++) dist[p] = Math.min(dist[p], d2(pts[p][0], pts[p][1], pts[p][2], centers[centers.length - 1]));
  }
  return centers;
}

/** Is c (roughly) a mix of two other palette colours? Then it is an anti-aliasing artefact.
    Colours are sRGB triples: edge pixels are blended in sRGB, so the test is a straight line there. */
export function isBlend(c, others, tol = 16) {
  for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
    const a = others[i], b = others[j];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const ll = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; if (ll < 1) continue;
    const t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / ll;
    if (t < 0.12 || t > 0.88) continue;
    const r = (ac[0] - t * ab[0]) ** 2 + (ac[1] - t * ab[1]) ** 2 + (ac[2] - t * ab[2]) ** 2;
    if (r < tol * tol) return true;
  }
  return false;
}

/**
 * Choose the palette (lab: plain CIELAB of the image; chroma: weight of colour vs lightness when merging).
 *  count: fixed number of colours, or 0 for automatic.
 *  merge: automatic mode merges colours closer than this (ΔE, ~6 = keep subtle shades, ~20 = bold).
 * Returns [{ lab, rgb, weight }] sorted most-used first.
 */
export function buildPalette(lab, rgba, w, h, { count = 0, merge = 12, chroma = 1 } = {}) {
  const { arr, total } = histogram(lab, rgba, w, h);
  if (!arr.length) return [];
  let res;
  if (count > 0) {
    res = kmeans(arr, seed(arr, count));
  } else {
    res = kmeans(arr, seed(arr, 40), 12);
    const minW = total * 0.0001;
    const rgbOf = (c) => labToRgb(c[0], c[1], c[2]);
    const dm = (p, q) => (p[0] - q[0]) ** 2 + chroma * chroma * ((p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
    for (let guard = 0; guard < 80; guard++) {
      let { centers, weight } = res;
      // drop empty / tiny clusters and blends of two big ones
      const big = centers.filter((c, i) => weight[i] > total * 0.01);
      let drop = -1;
      for (let i = 0; i < centers.length; i++) {
        if (weight[i] < minW || (weight[i] < total * 0.012 && isBlend(rgbOf(centers[i]), big.filter(b => b !== centers[i]).map(rgbOf)))) { drop = i; break; }
      }
      if (drop < 0) {
        // merge the closest pair if it is under the threshold
        let bi = -1, bj = -1, bd = merge * merge;
        for (let i = 0; i < centers.length; i++) for (let j = i + 1; j < centers.length; j++) { const d = dm(centers[i], centers[j]); if (d < bd) { bd = d; bi = i; bj = j; } }
        if (bi < 0) break;
        const wi = weight[bi], wj = weight[bj], t = wi + wj || 1;
        centers[bi] = centers[bi].map((v, k) => (v * wi + centers[bj][k] * wj) / t);
        drop = bj;
      }
      if (centers.length <= 1) break;
      centers = centers.filter((_, i) => i !== drop);
      res = kmeans(arr, centers, 8);
    }
  }
  // lab is unscaled here; the palette carries chroma-weighted Lab for labelling
  const out = res.centers.map((c, i) => ({ lab: [c[0], c[1] * chroma, c[2] * chroma], rgb: labToRgb(c[0], c[1], c[2]), weight: res.weight[i] / total }))
    .filter(p => p.weight > 0);
  return out.sort((a, b) => b.weight - a.weight);
}

/**
 * Second look for colours the first pass missed: thin lines, small text and little dots rarely have "flat" pixels,
 * so k-means under-weights them. Here every pixel is checked against the palette, allowing it to be a blend of
 * two colours found around it (anti-aliasing). Pixels nothing explains are clustered into new colours.
 */
export function refinePalette(lab, rgba, w, h, palette, { merge = 12, chroma = 1, maxNew = 6 } = {}) {
  const k = palette.length, P = palette.map(p => p.lab);
  const n = w * h, near = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0, bd = Infinity;
    for (let c = 0; c < k; c++) { const d = d2(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2], P[c]); if (d < bd) { bd = d; best = c; } }
    near[i] = best;
  }
  const T = (Math.max(10, merge) * (chroma < 1 ? 1.6 : 1)) ** 2;
  const bins = new Map(); let miss = 0, tot = 0;
  const seen = new Uint8Array(k);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (rgba[i * 4 + 3] < 128) continue;
    tot++;
    const L = lab[i * 3], A = lab[i * 3 + 1], B = lab[i * 3 + 2];
    let best = d2(L, A, B, P[near[i]]);
    if (best <= T) continue;
    // colours present around the pixel
    const list = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const c = near[yy * w + xx]; if (!seen[c]) { seen[c] = 1; list.push(c); }
    }
    for (const c of list) seen[c] = 0;
    for (let a = 0; a < list.length && best > T; a++) for (let b = a + 1; b < list.length; b++) {
      const p = P[list[a]], q = P[list[b]];
      const ab0 = q[0] - p[0], ab1 = q[1] - p[1], ab2 = q[2] - p[2];
      const ll = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1;
      const t = Math.max(0, Math.min(1, ((L - p[0]) * ab0 + (A - p[1]) * ab1 + (B - p[2]) * ab2) / ll));
      const r = (L - p[0] - t * ab0) ** 2 + (A - p[1] - t * ab1) ** 2 + (B - p[2] - t * ab2) ** 2;
      if (r < best) best = r;
    }
    if (best <= T) continue;
    miss++;
    const key = ((L / 3) | 0) * 16384 + (((A + 128) / 3) | 0) * 128 + (((B + 128) / 3) | 0);
    let e = bins.get(key); if (!e) bins.set(key, e = [0, 0, 0, 0]);
    e[0] += L; e[1] += A; e[2] += B; e[3]++;
  }
  const minCount = Math.max(24, tot * 0.0004);
  if (miss < minCount) return palette;
  const pts = [...bins.values()].map(e => [e[0] / e[3], e[1] / e[3], e[2] / e[3], e[3]]);
  const res = kmeans(pts, seed(pts, Math.min(maxNew, pts.length)), 16);
  const rgbOf = (c) => labToRgb(c[0], c[1] / chroma, c[2] / chroma);
  const out = palette.slice();
  res.centers.forEach((c, i) => {
    if (res.weight[i] < minCount) return;
    if (out.some(p => d2(...c, p.lab) < (merge * 0.8) ** 2)) return;
    // JPEG: colour bleeds around small dark/light details; only trust a new colour that differs in lightness too
    if (chroma < 1 && out.some(p => Math.abs(p.lab[0] - c[0]) < 7)) return;
    const rgb = rgbOf(c);
    if (isBlend(rgb, out.map(p => p.rgb))) return;
    out.push({ lab: c, rgb, weight: res.weight[i] / tot });
  });
  return out;
}

/* ---------------- labelling ---------------- */
/**
 * Give every pixel of the (upscaled) image a palette index.
 * reach: how far (px) an edge pixel looks for the confident colours it sits between.
 */
export function label(lab, rgba, W, H, palette, reach = 3) {
  const n = W * H, k = palette.length, P = palette.map(p => p.lab), RGB = palette.map(p => p.rgb);
  const lbl = new Uint8Array(n), conf = new Uint8Array(n), dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 128) { lbl[i] = TRANSPARENT; continue; }
    const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
    let best = 0, bd = Infinity;
    for (let c = 0; c < k; c++) { const d = d2(L, a, b, P[c]); if (d < bd) { bd = d; best = c; } }
    lbl[i] = best; dist[i] = bd;
  }
  // confident = close to its colour and agrees with most of its neighbours
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = lbl[i];
    if (l === TRANSPARENT) { conf[i] = 1; continue; }
    let same = 0, tot = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      tot++; if (lbl[yy * W + xx] === l) same++;
    }
    if (dist[i] < 6 * 6 || (dist[i] < 12 * 12 && same >= tot - 1)) conf[i] = 1;
  }
  // edge pixels: explain the pixel as a blend of a confident colour next to it and a second colour
  // (preferably also next to it). The pixel takes whichever end of the blend it is nearer to.
  const out = new Uint8Array(lbl);
  const cand = new Int32Array(16);
  const isCand = new Uint8Array(k);
  const blend = (L, a, b, A, B) => {
    const ab0 = B[0] - A[0], ab1 = B[1] - A[1], ab2 = B[2] - A[2];
    const ll = ab0 * ab0 + ab1 * ab1 + ab2 * ab2 || 1;
    let t = ((L - A[0]) * ab0 + (a - A[1]) * ab1 + (b - A[2]) * ab2) / ll;
    t = Math.max(0, Math.min(1, t));
    return [(L - A[0] - t * ab0) ** 2 + (a - A[1] - t * ab1) ** 2 + (b - A[2] - t * ab2) ** 2, t];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (conf[i]) continue;
    let nc = 0;
    for (let r = 1; r <= reach && nc < 2; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx; if (!conf[j]) continue;
        const l = lbl[j]; if (l === TRANSPARENT) continue;
        if (!isCand[l] && nc < 16) { isCand[l] = 1; cand[nc++] = l; }
      }
    }
    if (!nc) continue;
    const L = lab[i * 3], a = lab[i * 3 + 1], b = lab[i * 3 + 2];
    let best = lbl[i], bs = dist[i] + 64;   // own nearest colour, with a penalty: it has no confident support here
    let pa = -1, pb = -1;
    for (let p = 0; p < nc; p++) {
      const A = P[cand[p]];
      const dd = d2(L, a, b, A);
      if (dd < bs) { bs = dd; best = cand[p]; pa = -1; }
      for (let q = 0; q < k; q++) {
        if (q === cand[p] || (isCand[q] && q < cand[p])) continue;
        const [r, t] = blend(L, a, b, A, P[q]);
        const score = r + (isCand[q] ? 0 : 16);
        if (score < bs) { bs = score; best = t < 0.5 ? cand[p] : q; pa = cand[p]; pb = q; }
      }
    }
    if (pa >= 0) {
      // which side of the edge: coverage is linear in sRGB values (that is how edges are anti-aliased),
      // so decide there; deciding in Lab would make straight edges wavy
      const A = RGB[pa], B = RGB[pb], o = i * 4;
      const ab0 = B[0] - A[0], ab1 = B[1] - A[1], ab2 = B[2] - A[2];
      const ll = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
      if (ll > 0) {
        const t = ((rgba[o] - A[0]) * ab0 + (rgba[o + 1] - A[1]) * ab1 + (rgba[o + 2] - A[2]) * ab2) / ll;
        best = t < 0.5 ? pa : pb;
      }
    }
    for (let p = 0; p < nc; p++) isCand[cand[p]] = 0;
    out[i] = best;
  }
  return out;
}

/** Threshold for black-and-white (Otsu on lightness). */
export function otsu(lab, rgba, n) {
  const hist = new Float64Array(101); let tot = 0;
  for (let i = 0; i < n; i++) { if (rgba[i * 4 + 3] < 128) continue; hist[Math.max(0, Math.min(100, Math.round(lab[i * 3])))]++; tot++; }
  let sum = 0; for (let t = 0; t <= 100; t++) sum += t * hist[t];
  let sB = 0, wB = 0, best = 50, bv = -1;
  for (let t = 0; t <= 100; t++) {
    wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > bv) { bv = v; best = t; }
  }
  return best + 0.5;
}

/** Black-and-white labels: 1 = ink (darker than threshold), 0 = paper. */
export function labelBW(lab, rgba, n, threshold, invert = false) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 128) { out[i] = TRANSPARENT; continue; }
    const ink = lab[i * 3] < threshold;
    out[i] = (ink !== invert) ? 1 : 0;
  }
  return out;
}

/* ---------------- speck removal ---------------- */
/** Merge every connected patch smaller than minArea into the neighbouring colour it shares most border with. */
export function despeckle(lbl, W, H, minArea) {
  if (minArea < 2) return lbl;
  for (let round = 0; round < 3; round++) {
    const n = W * H, comp = new Int32Array(n).fill(-1), sizes = [], colour = [];
    const stack = new Int32Array(n);
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const id = sizes.length, l = lbl[s];
      let sp = 0, size = 0; stack[sp++] = s; comp[s] = id;
      while (sp) {
        const i = stack[--sp]; size++;
        const x = i % W;
        if (x > 0 && comp[i - 1] < 0 && lbl[i - 1] === l) { comp[i - 1] = id; stack[sp++] = i - 1; }
        if (x < W - 1 && comp[i + 1] < 0 && lbl[i + 1] === l) { comp[i + 1] = id; stack[sp++] = i + 1; }
        if (i >= W && comp[i - W] < 0 && lbl[i - W] === l) { comp[i - W] = id; stack[sp++] = i - W; }
        if (i < n - W && comp[i + W] < 0 && lbl[i + W] === l) { comp[i + W] = id; stack[sp++] = i + W; }
      }
      sizes.push(size); colour.push(l);
    }
    const small = new Map();
    const touch = (ci, other) => { let m = small.get(ci); if (!m) small.set(ci, m = new Map()); m.set(other, (m.get(other) || 0) + 1); };
    for (let i = 0; i < n; i++) {
      const c = comp[i]; const x = i % W;
      for (const j of [x < W - 1 ? i + 1 : -1, i < n - W ? i + W : -1]) {
        if (j < 0) continue; const d = comp[j]; if (d === c) continue;
        if (sizes[c] < minArea) touch(c, lbl[j]);
        if (sizes[d] < minArea) touch(d, lbl[i]);
      }
    }
    if (!small.size) break;
    const target = new Map();
    for (const [c, m] of small) { let best = -1, bc = 0; for (const [l, cnt] of m) if (cnt > bc && l !== colour[c]) { bc = cnt; best = l; } if (best >= 0) target.set(c, best); }
    let changed = 0;
    for (let i = 0; i < n; i++) { const t = target.get(comp[i]); if (t !== undefined) { lbl[i] = t; changed++; } }
    if (!changed) break;
  }
  return lbl;
}

/** Which label owns most of the image border (the background). */
export function borderLabel(lbl, W, H) {
  const cnt = new Map();
  const add = (i) => cnt.set(lbl[i], (cnt.get(lbl[i]) || 0) + 1);
  for (let x = 0; x < W; x++) { add(x); add((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { add(y * W); add(y * W + W - 1); }
  let best = 0, bc = -1; for (const [l, c] of cnt) if (c > bc) { bc = c; best = l; }
  return best;
}

/** Paint labels back to RGBA (transparent where hidden). */
export function paint(lbl, W, H, colours, hidden) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const l = lbl[i];
    if (l === TRANSPARENT || hidden.has(l)) continue;
    const c = colours[l];
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  return out;
}
