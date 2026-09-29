// Bas-relief sculpting: turns an AI depth map into a relief a sculptor would cut.
//
// A raw depth map is a poor relief: the step from the subject to the background eats most of the height, so a
// face comes out as a flat plateau with a cliff around it, and the network's faint patch noise shows up as
// pitting. Instead the relief is built in the gradient domain (after Weyrich et al., "Digital bas-relief from
// 3D scenes", 2007, and Fattal et al.'s gradient compression, 2002):
//   1. depth gradients are measured; occlusion cliffs are capped to a gentle step,
//   2. a noise floor is subtracted, so the network's faint tile pattern never reaches the surface,
//   3. large gradients are compressed much more than small ones: big forms flatten into a few mm while
//      the modelling of cheeks, folds and fur keeps its full strength,
//   4. optionally a little fine detail is borrowed from the photo's own shading (hair, fabric, engraving),
//   5. the relief whose gradients best match all this is solved exactly (Neumann Poisson, via DCT).
// Pure functions over Float32Arrays, no DOM, so they run anywhere (and in Node for testing).

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ── Box / guided filters ──────────────────────────────────
function boxMean(a, w, h, r) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length), inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) { let acc = 0; const o = y * w; for (let t = -r; t <= r; t++) acc += a[o + clamp(t, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[o + x] = acc * inv; acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let acc = 0; for (let t = -r; t <= r; t++) acc += tmp[clamp(t, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc * inv; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
// Self-guided filter: flattens low-amplitude noise, keeps real edges.
function selfGuided(p, w, h, r, eps) {
  const n = p.length, pp = new Float32Array(n);
  for (let i = 0; i < n; i++) pp[i] = p[i] * p[i];
  const m = boxMean(p, w, h, r), m2 = boxMean(pp, w, h, r), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = m2[i] - m[i] * m[i]; A[i] = v / (v + eps); B[i] = m[i] - A[i] * m[i]; }
  const mA = boxMean(A, w, h, r), mB = boxMean(B, w, h, r), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = mA[i] * p[i] + mB[i];
  return q;
}
// Gaussian blur (three box passes); the border repeats the edge pixels.
export function gauss(a, w, h, sigma) {
  if (sigma < 0.3) return Float32Array.from(a);
  const r = Math.max(1, Math.round(sigma * 0.95));
  let q = a; for (let i = 0; i < 3; i++) q = boxMean(q, w, h, r);
  return q;
}

// ── Resampling ────────────────────────────────────────────
// Bilinear, pixel-centre aligned. Area-averages first when shrinking by more than 1.5×, so nothing aliases.
export function resample(src, sw, sh, w, h) {
  if (sw === w && sh === h) return Float32Array.from(src);
  let s = src;
  const k = Math.min(sw / w, sh / h);
  if (k > 1.5) s = gauss(src, sw, sh, 0.42 * k);
  const out = new Float32Array(w * h), kx = sw / w, ky = sh / h;
  for (let y = 0; y < h; y++) {
    const fy = clamp((y + 0.5) * ky - 0.5, 0, sh - 1), j = Math.min(sh - 2, fy | 0), v = sh > 1 ? fy - j : 0, j1 = sh > 1 ? j + 1 : j;
    for (let x = 0; x < w; x++) {
      const fx = clamp((x + 0.5) * kx - 0.5, 0, sw - 1), i = Math.min(sw - 2, fx | 0), u = sw > 1 ? fx - i : 0, i1 = sw > 1 ? i + 1 : i;
      out[y * w + x] = (s[j * sw + i] * (1 - u) + s[j * sw + i1] * u) * (1 - v) + (s[j1 * sw + i] * (1 - u) + s[j1 * sw + i1] * u) * v;
    }
  }
  return out;
}

// ── Fast DCT (power-of-two lengths, Makhoul's FFT method) ──
const _tw = new Map();
function fftTables(N) {
  let t = _tw.get(N);
  if (!t) {
    const cos = new Float64Array(N / 2), sin = new Float64Array(N / 2), rev = new Uint32Array(N), bits = Math.log2(N);
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
    for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    const qc = new Float64Array(N), qs = new Float64Array(N);
    for (let k = 0; k < N; k++) { qc[k] = Math.cos(Math.PI * k / (2 * N)); qs[k] = Math.sin(Math.PI * k / (2 * N)); }
    _tw.set(N, (t = { cos, sin, rev, qc, qs }));
  }
  return t;
}
function fft(re, im, N, inv) {
  const { cos, sin, rev } = fftTables(N);
  for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
      const c = cos[k * step], sn = inv ? -sin[k * step] : sin[k * step];
      const a = s + k, b = a + half, tr = re[b] * c + im[b] * sn, ti = im[b] * c - re[b] * sn;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
// Unnormalised DCT-II: X[k] = Σ x[n] cos(π k (2n+1) / 2N)
function dct(x, N, re, im) {
  const { qc, qs } = fftTables(N);
  for (let k = 0; k < N / 2; k++) { re[k] = x[2 * k]; re[N - 1 - k] = x[2 * k + 1]; }
  im.fill(0); fft(re, im, N, false);
  for (let k = 0; k < N; k++) x[k] = re[k] * qc[k] + im[k] * qs[k];
}
// Inverse of dct() above (DCT-III scaled by 2/N, with the k = 0 term halved).
function idct(X, N, re, im) {
  const { qc, qs } = fftTables(N);
  re[0] = X[0] / N; im[0] = 0;
  for (let k = 1; k < N; k++) { const a = X[k], b = X[N - k]; re[k] = (a * qc[k] + b * qs[k]) / N; im[k] = (a * qs[k] - b * qc[k]) / N; }
  fft(re, im, N, true);
  for (let k = 0; k < N / 2; k++) { X[2 * k] = re[k]; X[2 * k + 1] = re[N - 1 - k]; }
}
function dct2d(a, W, H, inverse) {
  const tr = inverse ? idct : dct;
  let re = new Float64Array(W), im = new Float64Array(W), line = new Float64Array(W);
  for (let y = 0; y < H; y++) { const o = y * W; for (let x = 0; x < W; x++) line[x] = a[o + x]; tr(line, W, re, im); for (let x = 0; x < W; x++) a[o + x] = line[x]; }
  re = new Float64Array(H); im = new Float64Array(H); line = new Float64Array(H);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) line[y] = a[y * W + x]; tr(line, H, re, im); for (let y = 0; y < H; y++) a[y * W + x] = line[y]; }
}
export const _test = { dct, idct, fftTables };

// Least-squares surface from a gradient field on a W×H grid (both powers of two) with free (Neumann) edges.
// gx[i] ≈ (u[i+1] − u[i]) / dx, gy[i] ≈ (u[i+W] − u[i]) / dy; pixels may be non-square. Solved exactly with two
// fast DCTs, since cosines are the eigenvectors of the Neumann Laplacian.
export function poisson(gx, gy, W, H, dx = 1, dy = 1) {
  const b = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let d = 0;
    if (x < W - 1) d += gx[i] / dx; if (x > 0) d -= gx[i - 1] / dx;
    if (y < H - 1) d += gy[i] / dy; if (y > 0) d -= gy[i - W] / dy;
    b[i] = d;
  }
  dct2d(b, W, H, false);
  const cx = new Float64Array(W), cy = new Float64Array(H);
  for (let k = 0; k < W; k++) cx[k] = (2 * Math.cos(Math.PI * k / W) - 2) / (dx * dx);
  for (let k = 0; k < H; k++) cy[k] = (2 * Math.cos(Math.PI * k / H) - 2) / (dy * dy);
  for (let l = 0; l < H; l++) for (let k = 0; k < W; k++) { const den = cx[k] + cy[l]; b[l * W + k] = den ? b[l * W + k] / den : 0; }
  dct2d(b, W, H, true);
  return Float32Array.from(b);
}
function maxFilter(a, w, h, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = -Infinity; for (let d = -r; d <= r; d++) { const xx = clamp(x + d, 0, w - 1); m = Math.max(m, a[y * w + xx]); } t[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = -Infinity; for (let d = -r; d <= r; d++) { const yy = clamp(y + d, 0, h - 1); m = Math.max(m, t[yy * w + x]); } o[y * w + x] = m; }
  return o;
}
const pow2 = (v) => 1 << Math.max(3, Math.round(Math.log2(v)));

function percentile(a, sel, q) {
  const v = []; const step = Math.max(1, Math.floor(a.length / 200000));
  for (let i = 0; i < a.length; i += step) if (!sel || sel[i]) v.push(a[i]);
  if (!v.length) return 0;
  v.sort((x, y) => x - y);
  return v[clamp(Math.floor(q * (v.length - 1)), 0, v.length - 1)];
}

// ── Portrait features ─────────────────────────────────────
// faces: [{ pts: 68 × [x, y] }] in picture pixels (the iBUG 68-point layout). Returns, on the ww × hh grid,
// boost (0..1, where facial features are) and accent (relief offsets for eyes, lids, lips and nostrils).
// A0 is the accent depth as a fraction of the relief: a few %, and never less than about one print layer.
function faceFeatures(faces, ww, hh, dx, dy, S, A0) {
  const n = ww * hh, boost = new Float32Array(n), accent = new Float32Array(n);
  const P = (q) => [q[0] / S, q[1] / S]; // picture units (fractions of the long side), like the grid's dx, dy
  const mean = (a) => [a.reduce((s, q) => s + q[0], 0) / a.length, a.reduce((s, q) => s + q[1], 0) / a.length];
  // visit the grid cells within reach of a point set: f(i, u, v) with u, v the cell centre in picture units
  const around = (pts, pad, f) => {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [u, v] of pts) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const x0 = clamp(Math.floor((u0 - pad) / dx), 0, ww - 1), x1 = clamp(Math.ceil((u1 + pad) / dx), 0, ww - 1);
    const y0 = clamp(Math.floor((v0 - pad) / dy), 0, hh - 1), y1 = clamp(Math.ceil((v1 + pad) / dy), 0, hh - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(y * ww + x, (x + 0.5) * dx, (y + 0.5) * dy);
  };
  const segDist = (u, v, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey; const t = L2 > 0 ? clamp(((u - a[0]) * ex + (v - a[1]) * ey) / L2, 0, 1) : 0; return [Math.hypot(u - a[0] - t * ex, v - a[1] - t * ey), t]; };
  for (const face of faces) {
    const q = face.pts.map(P);
    if (q.length < 68) continue;
    const eyes = [q.slice(36, 42), q.slice(42, 48)], ce = eyes.map(mean), iod = Math.hypot(ce[1][0] - ce[0][0], ce[1][1] - ce[0][1]);
    if (!(iod > 0)) continue;
    const bump = (pts, r, amt) => around(pts, r * 2, (i, u, v) => {
      let d = Infinity; for (let k = 0; k < pts.length; k++) d = Math.min(d, segDist(u, v, pts[k], pts[(k + 1) % pts.length])[0]);
      boost[i] = Math.max(boost[i], amt * Math.exp(-0.5 * (d / r) ** 2));
    });
    // where detail is boosted: round the eyes and brows, the nose tip and the mouth
    for (const e of eyes) bump(e, 0.18 * iod, 1);
    bump(q.slice(17, 22), 0.12 * iod, 0.8); bump(q.slice(22, 27), 0.12 * iod, 0.8);
    bump(q.slice(30, 36), 0.12 * iod, 0.7); bump(q.slice(48, 60), 0.15 * iod, 1);
    // eyeballs: an elliptical mound over each eye opening
    for (const e of eyes) {
      const c = mean(e), ax = [e[3][0] - e[0][0], e[3][1] - e[0][1]], aw = Math.hypot(ax[0], ax[1]) / 2;
      if (!(aw > 0)) continue;
      const ux = ax[0] / (2 * aw), uy = ax[1] / (2 * aw);
      const bh = Math.max(0.3 * aw, (Math.hypot(e[1][0] - e[5][0], e[1][1] - e[5][1]) + Math.hypot(e[2][0] - e[4][0], e[2][1] - e[4][1])) / 4) * 1.25;
      around([c], aw * 1.3, (i, u, v) => {
        const s1 = ((u - c[0]) * ux + (v - c[1]) * uy) / (aw * 1.15), s2 = (-(u - c[0]) * uy + (v - c[1]) * ux) / bh, r2 = s1 * s1 + s2 * s2;
        if (r2 < 1) accent[i] += A0 * (1 - r2) * (1 - r2);
      });
    }
    // upper lids: the engraver's incised line along the top of each eye opening
    for (const e of [q.slice(36, 40), q.slice(42, 46)]) {
      const lw = 0.03 * iod;
      around(e, lw * 3, (i, u, v) => {
        let best = Infinity, tt = 0;
        for (let k = 0; k < 3; k++) { const [d, t] = segDist(u, v, e[k], e[k + 1]); if (d < best) { best = d; tt = (k + t) / 3; } }
        accent[i] -= 0.8 * A0 * Math.sin(Math.PI * tt) ** 0.5 * Math.exp(-0.5 * (best / lw) ** 2);
      });
    }
    // the line where the lips meet: a groove along the inner mouth's midline, fading out at the corners
    const mid = [q[60], mean([q[61], q[67]]), mean([q[62], q[66]]), mean([q[63], q[65]]), q[64]], gw = 0.045 * iod;
    around(mid, gw * 3, (i, u, v) => {
      let best = Infinity, tt = 0;
      for (let k = 0; k < 4; k++) { const [d, t] = segDist(u, v, mid[k], mid[k + 1]); if (d < best) { best = d; tt = (k + t) / 4; } }
      accent[i] -= 0.8 * A0 * Math.sin(Math.PI * tt) ** 0.5 * Math.exp(-0.5 * (best / gw) ** 2);
    });
    // nostrils: small dimples just inside each wing of the nose
    for (const c of [mean([q[31], q[32]]), mean([q[34], q[35]])]) {
      const r = 0.05 * iod;
      around([c], r * 3, (i, u, v) => { accent[i] -= 0.5 * A0 * Math.exp(-0.5 * (Math.hypot(u - c[0], v - c[1]) / r) ** 2); });
    }
  }
  return { boost, accent };
}

// depth: Float32 0..1 (near = 1), lum: Float32 0..1 luminance, mask: Float32 0..1 subject (or null), all w×h.
// opts.flatten 0..1: how strongly big forms are flattened (0 = raw depth, 1 = strongest bas-relief).
// opts.detail 0..1: fine detail borrowed from the photo's shading.
// Returns Float32 0..1 at w×h: the sculpted relief, background (mask < 0.5) at 0.
export function sculptRelief(depth, lum, mask, w, h, { flatten = 0.55, detail = 0.2, edgeStep = 0.4, edgeWidth = 0.03, maxWork = 1024, faces = null, portrait = 0.6, minStep = 0, calm = 0, subject = null } = {}) {
  // working resolution: at most maxWork on the long side (the depth network's own resolution is ~518)
  // power-of-two grid (for the DCT solve) close to the picture's own pixel count; pixels may be non-square
  const s0 = Math.min(1, maxWork / Math.max(w, h)), ww = Math.min(pow2(w * s0), 2048), hh = Math.min(pow2(h * s0), 2048), n = ww * hh;
  const S = Math.max(w, h), dx = w / ww / S, dy = h / hh / S; // pixel size in picture widths
  let D = resample(depth, w, h, ww, hh);
  const L = lum ? resample(lum, w, h, ww, hh) : null, M = mask ? resample(mask, w, h, ww, hh) : null;
  const sel = new Uint8Array(n); let nSel = 0;
  for (let i = 0; i < n; i++) if (!M || M[i] >= 0.5) { sel[i] = 1; nSel++; }
  if (nSel < 16) sel.fill(1);
  // normalise over the subject, then iron out the network's faint patch pattern (edges survive)
  { const lo = percentile(D, sel, 0.01), hi = percentile(D, sel, 0.99), k = 1 / Math.max(1e-6, hi - lo); for (let i = 0; i < n; i++) D[i] = (D[i] - lo) * k; }
  D = selfGuided(D, ww, hh, Math.max(1, Math.round(Math.max(ww, hh) / 400)), 0.003 ** 2);
  // Calm background (photos without a cut-out): a medallist lets the field behind a figure recede into a quiet
  // surface so the subject reads at a glance. The subject comes from the AI cut-out model's matte (subject),
  // widened a few pixels so the step up to the subject is kept; modelling everywhere else is turned down.
  let bgW = null;
  if (!M && subject && calm > 0) {
    const Sm = maxFilter(resample(subject, w, h, ww, hh), ww, hh, Math.max(2, Math.round(Math.max(ww, hh) / 200))), Sg = gauss(Sm, ww, hh, 2);
    bgW = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = clamp((Sg[i] - 0.25) / 0.5, 0, 1); bgW[i] = 1 - calm * 0.85 * (1 - t * t * (3 - 2 * t)); }
  }
  const gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
    const i = y * ww + x;
    if (x < ww - 1) gx[i] = (D[i + 1] - D[i]) / dx;
    if (y < hh - 1) gy[i] = (D[i + ww] - D[i]) / dy;
  }
  // Gradient statistics set every threshold below. They are taken over the subject's interior only (not the
  // band along a cut-out's edge, where depth jumps to the background) and trimmed of the top 5 %, so a thin
  // subject whose area is mostly outline is judged by its surface, not by its silhouette.
  const inner = new Uint8Array(n);
  { let k = 0; for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++, k++) {
    if (!sel[k]) continue; let ok = 1;
    for (let d = -2; d <= 2 && ok; d++) { const xx = x + d, yy = y + d; if ((xx >= 0 && xx < ww && !sel[y * ww + xx]) || (yy >= 0 && yy < hh && !sel[yy * ww + x])) ok = 0; }
    inner[k] = ok; } }
  let nIn = 0; for (let i = 0; i < n; i++) nIn += inner[i];
  const statSel = nIn >= 64 ? inner : sel, mg0 = new Float32Array(n);
  for (let i = 0; i < n; i++) mg0[i] = Math.hypot(gx[i], gy[i]);
  const p95 = percentile(mg0, statSel, 0.95);
  let sum = 0, cnt = 0;
  for (let i = 0; i < n; i++) if (statSel[i] && mg0[i] <= p95) { sum += mg0[i]; cnt++; }
  const mean = Math.max(1e-6, sum / Math.max(1, cnt));
  const occ = 2.2 * mean, floor = 0.12 * mean, a = 0.08 * mean, bb = clamp(1 - flatten, 0.05, 1); // flatten 0.55 → exponent 0.45
  // The attenuation is judged on a slightly blurred gradient magnitude, so it varies smoothly across an edge.
  // Per-pixel factors on a jagged occlusion edge make a field no surface can match, and the solve then smears
  // the mismatch into a comb of streaks along the edge.
  const ms = gauss(mg0, ww, hh, 1.2);
  for (let i = 0; i < n; i++) {
    let m = ms[i];
    if (m < 1e-9 || mg0[i] < 1e-9) { gx[i] = gy[i] = 0; continue; }
    let k = m > occ ? occ / m : 1; m = Math.min(m, occ);        // occlusion cliffs → a gentle step
    const m2 = Math.max(0, m - floor); k *= m2 / m; m = m2;     // noise floor
    if (m > a) k *= Math.pow(m / a, bb - 1);                     // compress big forms more than small ones
    if (bgW) k *= bgW[i];
    gx[i] *= k; gy[i] *= k;
  }
  // Faces: where eyes, brows, nose and mouth are, fine photo detail is borrowed far more strongly, so lids,
  // irises and the line of the lips read crisply instead of melting into the soft depth of the face.
  const FF = faces && faces.length && portrait > 0 ? faceFeatures(faces, ww, hh, dx, dy, S, Math.max(0.04, minStep)) : null;
  if ((detail > 0 || FF) && L) {
    // photo detail: band-passed luminance, soft-limited so specular glints and dark pupils can't dig holes
    const sig = 2.5 * Math.max(ww, hh) / 512, lb = gauss(L, ww, hh, sig), hp = new Float32Array(n);
    for (let i = 0; i < n; i++) hp[i] = 0.08 * Math.tanh((L[i] - lb[i]) / 0.08);
    const hs = gauss(hp, ww, hh, 0.5), lx = new Float32Array(n), ly = new Float32Array(n);
    for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) { const i = y * ww + x; if (x < ww - 1) lx[i] = (hs[i + 1] - hs[i]) / dx; if (y < hh - 1) ly[i] = (hs[i + ww] - hs[i]) / dy; }
    const mg = new Float32Array(n), ml = new Float32Array(n);
    for (let i = 0; i < n; i++) { mg[i] = Math.hypot(gx[i], gy[i]); ml[i] = Math.hypot(lx[i], ly[i]); }
    const ref = percentile(mg, sel, 0.9) / Math.max(1e-9, percentile(ml, sel, 0.9)), k = detail * ref;
    // Not along occlusion edges or a cut-out's outline: there the photo's shading changes because one object
    // ends and another begins (a saucer's rim against the table), and copying it would etch the neighbour's
    // texture into the edge.
    const Ein = M ? gauss(Float32Array.from(sel), ww, hh, Math.max(1.5, 0.006 / Math.min(dx, dy))) : null;
    for (let i = 0; i < n; i++) {
      let wgt = clamp(1 - (ms[i] / occ - 0.35) / 0.5, 0, 1);
      if (Ein) wgt *= clamp((Ein[i] - 0.5) * 2, 0, 1);
      const kd = FF ? ref * Math.max(detail, detail + (0.7 - detail) * portrait * FF.boost[i]) : k;
      if (bgW) wgt *= bgW[i];
      gx[i] += kd * wgt * lx[i]; gy[i] += kd * wgt * ly[i];
    }
  }
  // The background keeps its (compressed) gradients: the solve stays consistent across the whole picture, so
  // no halo forms round the subject, and the cut-out later replaces the background anyway.
  let R = poisson(gx, gy, ww, hh, dx, dy);
  // The nearest 0.5 % (a cat's nose, a fingertip) is rolled off smoothly instead of cut flat, so it keeps its
  // shape instead of printing as a plateau.
  { const lo = percentile(R, sel, 0.01), hi = percentile(R, sel, 0.995), k = 1 / Math.max(1e-6, hi - lo);
    for (let i = 0; i < n; i++) { let v = (R[i] - lo) * k; if (v > 0.9) v = 0.9 + 0.1 * Math.tanh((v - 0.9) / 0.1); R[i] = clamp(v, 0, 1); } }
  // Faces, as a medallist would cut them: a gentle mound for each eyeball, a crisp line between the lips and
  // small nostril dimples. Sizes follow the distance between the eyes; depths are a few % of the relief.
  if (FF) for (let i = 0; i < n; i++) R[i] = clamp(R[i] + portrait * FF.accent[i], 0, 1);
  // Cut-out subjects: near the outline the relief is eased down to a modest step (edgeStep of its height), the
  // way a medallist rolls a figure into the field. Without it a raised arm or shoulder ends in a cliff as tall
  // as the whole relief. The ramp comes from the blurred mask, so it is smooth even where the outline is ragged
  // (a distance transform of a pixel staircase would print as a comb of ridges); the picture's frame is not an
  // outline, so a subject cropped by it keeps its full height there.
  if (M && edgeStep < 1) {
    const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = sel[i];
    const rw = edgeWidth / Math.min(dx, dy), E = gauss(f, ww, hh, rw / 2); // the blur repeats border pixels
    for (let i = 0; i < n; i++) {
      if (!sel[i]) continue;
      const t = clamp((E[i] - 0.5) * 2, 0, 1), e = 1 - (1 - t) * (1 - t);
      R[i] *= edgeStep + (1 - edgeStep) * e;
    }
  }
  if (ww !== w || hh !== h) R = resample(R, ww, hh, w, h);
  return R;
}
