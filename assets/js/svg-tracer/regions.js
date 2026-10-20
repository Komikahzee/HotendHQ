/* ============================================================
   HOTEND HQ — SVG tracer: region tools
   segment(): split an image into regions that follow its real edges
     (Felzenszwalb–Huttenlocher graph segmentation in Lab).
   flatten(): "Remove shading". Merge neighbouring regions while the
     border between them is soft, so a shaded area becomes one area
     with one colour, and real outlines stay.
   fit(): the best flat colour, linear or radial gradient for a region
     (used by the Detailed mode).
   ============================================================ */
import * as P from './prep.js?v=4f4f30580f';

/* ---------------- segmentation ---------------- */
export function segment(rgba, W, H, opt = {}) {
  const n = W * H;
  const k = opt.k ?? 400, minSize = opt.minSize ?? 30;
  const lab = blurLab(P.labOf(rgba, n), W, H, opt.sigma ?? 0.8);
  // edges: right, down, down-right, down-left; weights bucketed for a linear-time sort
  const BUCK = 2048, MAXD = 100;
  const ea = new Int32Array(n * 4), eb = new Int32Array(n * 4), ew = new Float32Array(n * 4);
  let m = 0;
  const d = (i, j) => { const a = i * 3, b = j * 3, x = lab[a] - lab[b], y = lab[a + 1] - lab[b + 1], z = lab[a + 2] - lab[b + 2]; return Math.sqrt(x * x + y * y + z * z); };
  const add = (i, j) => { if (rgba[j * 4 + 3] < 128) return; ea[m] = i; eb[m] = j; ew[m] = d(i, j); m++; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (rgba[i * 4 + 3] < 128) continue;
    if (x < W - 1) add(i, i + 1);
    if (y < H - 1) { add(i, i + W); if (x < W - 1) add(i, i + W + 1); if (x > 0) add(i, i + W - 1); }
  }
  const cnt = new Int32Array(BUCK + 1);
  const bk = (w) => Math.min(BUCK - 1, (w / MAXD * BUCK) | 0);
  for (let e = 0; e < m; e++) cnt[bk(ew[e]) + 1]++;
  for (let b = 0; b < BUCK; b++) cnt[b + 1] += cnt[b];
  const order = new Int32Array(m);
  for (let e = 0; e < m; e++) order[cnt[bk(ew[e])]++] = e;
  const par = new Int32Array(n), sz = new Int32Array(n).fill(1), inner = new Float32Array(n);
  for (let i = 0; i < n; i++) par[i] = i;
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let q = 0; q < m; q++) {
    const e = order[q];
    let a = find(ea[e]), b = find(eb[e]); if (a === b) continue;
    const w = ew[e];
    if (w <= Math.min(inner[a] + k / sz[a], inner[b] + k / sz[b])) {
      if (sz[a] < sz[b]) { const t = a; a = b; b = t; }
      par[b] = a; sz[a] += sz[b]; inner[a] = w;
    }
  }
  // fold tiny regions into a neighbour (weakest edge first)
  for (let q = 0; q < m; q++) {
    const e = order[q]; const a = find(ea[e]), b = find(eb[e]);
    if (a !== b && (sz[a] < minSize || sz[b] < minSize)) { if (sz[a] < sz[b]) { par[a] = b; sz[b] += sz[a]; } else { par[b] = a; sz[a] += sz[b]; } }
  }
  const rid = new Int32Array(n); const map = new Map(); let next = 0;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < 128) { rid[i] = -1; continue; }
    const r = find(i); let v = map.get(r); if (v === undefined) { v = next++; map.set(r, v); } rid[i] = v;
  }
  return { rid, regions: next };
}

/** Separable Gaussian blur of a Lab buffer (kills JPEG blocks before segmenting). */
export function blurLab(lab, W, H, sigma) {
  if (!sigma) return lab;
  const r = Math.ceil(sigma * 3), ker = []; let ks = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); ker.push(v); ks += v; }
  for (let i = 0; i < ker.length; i++) ker[i] /= ks;
  const tmp = new Float32Array(lab.length), out = new Float32Array(lab.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let a = 0; for (let k = -r; k <= r; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); a += lab[(y * W + xx) * 3 + c] * ker[k + r]; } tmp[(y * W + x) * 3 + c] = a; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    let a = 0; for (let k = -r; k <= r; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); a += tmp[(yy * W + x) * 3 + c] * ker[k + r]; } out[(y * W + x) * 3 + c] = a; }
  return out;
}

/* ---------------- remove shading ---------------- */
// strength presets: soft = mean edge strength a border may have and still be merged; spread = how far
// the colours inside one area may wander (stops photos from melting into a few huge blobs);
// wL = weight of lightness against colour; maxDiff = largest jump between the two areas' averages
const LEVELS = {
  1: { soft: 10, spread: 5, wL: 1, maxDiff: 30 },        // light: photos and detailed art keep their tones
  2: { soft: 10, spread: 7, wL: 0.8, maxDiff: 38 },
  3: { soft: 8, spread: Infinity, wL: 0.6, maxDiff: 45 }, // strong: every shaded area becomes one colour
};

/**
 * Remove shading: returns an indexed image (lbl) and its palette, ready for the normal clean-up and tracing.
 * o: { level 1..3, unify (ΔE: closer colours become one), count (exact number of colours), palette (hex list), chroma, s }
 */
export function flatten(big, W, H, o = {}) {
  const n = W * H, s = Math.max(1, o.s || 1), L = LEVELS[o.level] || LEVELS[3];
  const { rid, regions: R } = segment(big, W, H, { k: 8 * s, minSize: Math.round(3 * s * s), sigma: 0.8 });
  const lab = P.labOf(big, n), bl = blurLab(lab, W, H, 1);
  // edge strength per pixel (central differences on the blurred image)
  const G = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = x > 0 ? i - 1 : i, r = x < W - 1 ? i + 1 : i, u = y > 0 ? i - W : i, d = y < H - 1 ? i + W : i;
    let gx = 0, gy = 0;
    for (let c = 0; c < 3; c++) { const a = bl[r * 3 + c] - bl[l * 3 + c], b = bl[d * 3 + c] - bl[u * 3 + c]; gx += a * a; gy += b * b; }
    G[i] = Math.sqrt(gx + gy) / 2;
  }
  const wL = L.wL, cnt = new Float64Array(R), sL = new Float64Array(R), sa = new Float64Array(R), sb = new Float64Array(R), q2 = new Float64Array(R);
  for (let i = 0; i < n; i++) {
    const r = rid[i]; if (r < 0) continue;
    const a = lab[i * 3], b = lab[i * 3 + 1], c = lab[i * 3 + 2];
    cnt[r]++; sL[r] += a; sa[r] += b; sb[r] += c; q2[r] += wL * wL * a * a + b * b + c * c;
  }
  // region adjacency with the summed edge strength along each shared border
  const adj = Array.from({ length: R }, () => new Map());
  const addE = (a, b, g) => { let e = adj[a].get(b); if (!e) { e = { s: 0, c: 0 }; adj[a].set(b, e); adj[b].set(a, e); } e.s += g; e.c++; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = rid[i]; if (a < 0) continue;
    if (x < W - 1) { const b = rid[i + 1]; if (b >= 0 && b !== a) addE(a, b, Math.max(G[i], G[i + 1])); }
    if (y < H - 1) { const b = rid[i + W]; if (b >= 0 && b !== a) addE(a, b, Math.max(G[i], G[i + W])); }
  }
  const minArea = 30 * s * s, alive = new Uint8Array(R).fill(1), ver = new Int32Array(R), par = new Int32Array(R);
  for (let i = 0; i < R; i++) par[i] = i;
  const cost = (a, b, e) => {
    if (Math.min(cnt[a], cnt[b]) < minArea) return e.s / e.c * 0.01;     // specks always go, into the softest neighbour
    const na = cnt[a], nb = cnt[b];
    const dl = (sL[a] / na - sL[b] / nb) * wL, da = sa[a] / na - sa[b] / nb, db = sb[a] / na - sb[b] / nb;
    if (Math.sqrt(dl * dl + da * da + db * db) > L.maxDiff) return Infinity;
    if (L.spread < Infinity) {
      const N = na + nb, mL = (sL[a] + sL[b]) / N * wL, ma = (sa[a] + sa[b]) / N, mb = (sb[a] + sb[b]) / N;
      if (Math.sqrt(Math.max(0, (q2[a] + q2[b]) / N - mL * mL - ma * ma - mb * mb)) > L.spread) return Infinity;
    }
    return e.s / e.c;
  };
  const heap = new Heap();
  const offer = (a, b, e) => { const c = cost(a, b, e); if (c < L.soft) heap.push(c, a, b, ver[a], ver[b]); };
  for (let a = 0; a < R; a++) for (const [b, e] of adj[a]) if (a < b) offer(a, b, e);
  while (heap.size) {
    const [, a, b, va, vb] = heap.pop();
    if (!alive[a] || !alive[b] || va !== ver[a] || vb !== ver[b]) continue;
    let big = a, sml = b; if (cnt[b] > cnt[a]) { big = b; sml = a; }
    alive[sml] = 0; par[sml] = big;
    cnt[big] += cnt[sml]; sL[big] += sL[sml]; sa[big] += sa[sml]; sb[big] += sb[sml]; q2[big] += q2[sml];
    adj[big].delete(sml);
    for (const [m, e] of adj[sml]) {
      if (m === big) continue;
      adj[m].delete(sml);
      const f = adj[big].get(m);
      if (f) { f.s += e.s; f.c += e.c; } else { adj[big].set(m, e); adj[m].set(big, e); }
    }
    adj[sml] = new Map(); ver[big]++;
    for (const [m, e] of adj[big]) offer(big, m, e);
  }
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const map = new Int32Array(R).fill(-1); let next = 0; const area = new Int32Array(n);
  for (let i = 0; i < n; i++) { const r = rid[i]; if (r < 0) { area[i] = -1; continue; } const f = find(r); if (map[f] < 0) map[f] = next++; area[i] = map[f]; }
  // one colour per area: the average of its inside (edge pixels are anti-aliasing blends), else of all of it
  const inn = new Float64Array(next * 4), all = new Float64Array(next * 4);
  for (let i = 0; i < n; i++) {
    const r = area[i]; if (r < 0) continue;
    const t = G[i] < 6 ? inn : all;
    t[r * 4] += lab[i * 3]; t[r * 4 + 1] += lab[i * 3 + 1]; t[r * 4 + 2] += lab[i * 3 + 2]; t[r * 4 + 3]++;
  }
  const cols = [], wt = [];
  for (let r = 0; r < next; r++) {
    const t = inn[r * 4 + 3] >= 4 ? inn : all, k = t[r * 4 + 3] || 1;
    cols.push([t[r * 4] / k, t[r * 4 + 1] / k, t[r * 4 + 2] / k]); wt.push(inn[r * 4 + 3] + all[r * 4 + 3]);
  }
  const chroma = o.chroma ?? 1;
  const toEntry = (c, weight) => { const rgb = P.labToRgb(c[0], c[1], c[2]).map(v => Math.max(0, Math.min(255, Math.round(v)))); return { rgb, lab: [c[0], c[1] * chroma, c[2] * chroma], weight }; };
  let palette, pick;
  if (o.palette && o.palette.length) {
    // the person edited the colours: every area takes the nearest of theirs
    palette = o.palette.map(hx => { const rgb = P.fromHex(hx); return { rgb, lab: P.rgbToLab(...rgb), weight: 0 }; });
    pick = cols.map(c => nearest(palette.map(p => p.lab), c));
    palette = palette.map(p => ({ ...p, lab: [p.lab[0], p.lab[1] * chroma, p.lab[2] * chroma] }));
  } else {
    // areas whose colours are this close become exactly the same colour (biggest areas lead)
    const reps = groupColours(cols, wt, o.unify ?? 6, o.count || 0);
    palette = reps.colours.map((c, i) => toEntry(c, reps.weight[i]));
    pick = reps.of;
  }
  const lbl = new Uint8Array(n);
  for (let i = 0; i < n; i++) lbl[i] = area[i] < 0 ? P.TRANSPARENT : pick[area[i]];
  return { lbl, palette, areas: next };
}

function nearest(list, c) {
  let best = 0, bd = Infinity;
  for (let j = 0; j < list.length; j++) { const p = list[j], d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } }
  return best;
}

/** Group area colours: greedy by size within `tol`, then merge the closest pair until there are at most
    `count` colours (or 250, the most an indexed image can hold). */
function groupColours(cols, wt, tol, count) {
  const order = cols.map((_, i) => i).sort((a, b) => wt[b] - wt[a]);
  let G = [];
  const of = new Int32Array(cols.length);
  for (const r of order) {
    const c = cols[r]; let best = -1, bd = tol;
    for (let q = 0; q < G.length; q++) { const p = G[q].c, d = Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]); if (d < bd) { bd = d; best = q; } }
    if (best < 0) { G.push({ c: [...c], w: wt[r], id: G.length }); of[r] = G.length - 1; }
    else of[r] = best;
  }
  const limit = Math.min(250, count || 250);
  if (G.length > limit) {
    // weighted agglomerative merge of the closest two (sizes stay small: a few hundred at most)
    const owner = G.map((_, i) => i);
    let live = G.map((g, i) => i);
    while (live.length > limit) {
      let ba = 0, bb = 1, bd = Infinity;
      for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) {
        const p = G[live[x]].c, q = G[live[y]].c, d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < bd) { bd = d; ba = x; bb = y; }
      }
      const A = G[live[ba]], B = G[live[bb]], w = A.w + B.w;
      A.c = A.c.map((v, k) => (v * A.w + B.c[k] * B.w) / w); A.w = w;
      owner[live[bb]] = live[ba];
      live.splice(bb, 1);
    }
    const root = (i) => { while (owner[i] !== i) i = owner[i]; return i; };
    const idx = new Map(live.map((g, i) => [g, i]));
    for (let r = 0; r < of.length; r++) of[r] = idx.get(root(of[r]));
    G = live.map(g => G[g]);
  }
  const total = G.reduce((s, g) => s + g.w, 0) || 1;
  return { colours: G.map(g => g.c), weight: G.map(g => g.w / total), of };
}

class Heap {
  constructor() { this.c = []; this.a = []; this.b = []; this.va = []; this.vb = []; }
  get size() { return this.c.length; }
  sw(i, j) { for (const k of ['c', 'a', 'b', 'va', 'vb']) { const t = this[k][i]; this[k][i] = this[k][j]; this[k][j] = t; } }
  push(c, a, b, va, vb) {
    let k = this.c.length; this.c.push(c); this.a.push(a); this.b.push(b); this.va.push(va); this.vb.push(vb);
    while (k > 0) { const p = (k - 1) >> 1; if (this.c[p] <= this.c[k]) break; this.sw(p, k); k = p; }
  }
  pop() {
    const last = this.c.length - 1; this.sw(0, last);
    const r = [this.c.pop(), this.a.pop(), this.b.pop(), this.va.pop(), this.vb.pop()];
    let k = 0; const n = this.c.length;
    for (;;) { const l = 2 * k + 1, rr = l + 1; let m = k; if (l < n && this.c[l] < this.c[m]) m = l; if (rr < n && this.c[rr] < this.c[m]) m = rr; if (m === k) break; this.sw(k, m); k = m; }
    return r;
  }
}

/* ---------------- gradients (Detailed mode) ---------------- */
/** Best fill for one region: flat colour, linear or radial gradient (3 stops, kept inside the region's own colours).
    ix: pixel indices of the region (may be a sample), big: RGBA, count: the region's full pixel count. */
export function fit(ix, big, W, flatHex, count, opt = {}) {
  const N = ix.length;
  if (N < 40 || count < (opt.minArea ?? 600)) return { hex: flatHex };
  const X = new Float64Array(N), Y = new Float64Array(N), Cc = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
  let mx = 0, my = 0;
  for (let k = 0; k < N; k++) { const i = ix[k]; X[k] = i % W; Y[k] = (i / W) | 0; mx += X[k]; my += Y[k]; for (let c = 0; c < 3; c++) Cc[c][k] = big[i * 4 + c]; }
  mx /= N; my /= N;
  const mean = Cc.map(a => a.reduce((s, v) => s + v, 0) / N);
  const err = (f) => { let e = 0; for (let k = 0; k < N; k++) for (let c = 0; c < 3; c++) { const v = Cc[c][k] - f(k, c); e += v * v; } return Math.sqrt(e / (N * 3)); };
  const eFlat = err((k, c) => mean[c]);
  if (eFlat < (opt.flatErr ?? 2)) return { hex: flatHex };
  // main direction of change: from a linear plane per channel
  let sxx = 0, sxy = 0, syy = 0; const sxc = [0, 0, 0], syc = [0, 0, 0];
  for (let k = 0; k < N; k++) { const dx = X[k] - mx, dy = Y[k] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; for (let c = 0; c < 3; c++) { sxc[c] += dx * (Cc[c][k] - mean[c]); syc[c] += dy * (Cc[c][k] - mean[c]); } }
  const det = sxx * syy - sxy * sxy || 1;
  const g = [0, 1, 2].map(c => [(syy * sxc[c] - sxy * syc[c]) / det, (sxx * syc[c] - sxy * sxc[c]) / det]);
  let a11 = 0, a12 = 0, a22 = 0; for (const [gx, gy] of g) { a11 += gx * gx; a12 += gx * gy; a22 += gy * gy; }
  const th = 0.5 * Math.atan2(2 * a12, a11 - a22), ux = Math.cos(th), uy = Math.sin(th);
  const fitAlong = (tv) => {          // quadratic in t per channel
    let tmin = Infinity, tmax = -Infinity; for (let k = 0; k < N; k++) { if (tv[k] < tmin) tmin = tv[k]; if (tv[k] > tmax) tmax = tv[k]; }
    const span = tmax - tmin || 1;
    const S = new Float64Array(5), B = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
    for (let k = 0; k < N; k++) { const t = (tv[k] - tmin) / span; let p = 1; for (let e = 0; e < 5; e++) { S[e] += p; p *= t; } for (let c = 0; c < 3; c++) { const v = Cc[c][k]; B[c][0] += v; B[c][1] += v * t; B[c][2] += v * t * t; } }
    const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const co = B.map(b => solve3(M, b));
    const f = (k, c) => { const t = (tv[k] - tmin) / span; const q = co[c]; return q[0] + q[1] * t + q[2] * t * t; };
    return { tmin, tmax, co, e: err(f) };
  };
  const tl = new Float64Array(N); for (let k = 0; k < N; k++) tl[k] = (X[k] - mx) * ux + (Y[k] - my) * uy;
  const lin = fitAlong(tl);
  // radial: search the centre on a grid, then refine around the best
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let k = 0; k < N; k++) { minx = Math.min(minx, X[k]); maxx = Math.max(maxx, X[k]); miny = Math.min(miny, Y[k]); maxy = Math.max(maxy, Y[k]); }
  if (Math.min(maxx - minx, maxy - miny) < (opt.thin ?? 6)) return { hex: flatHex };
  let rad = null;
  const tr = new Float64Array(N);
  const tryC = (cx, cy) => { for (let k = 0; k < N; k++) tr[k] = Math.hypot(X[k] - cx, Y[k] - cy); const f = fitAlong(tr); if (!rad || f.e < rad.e) rad = { ...f, cx, cy }; };
  const GR = 6;
  for (let a = 0; a <= GR; a++) for (let b = 0; b <= GR; b++) tryC(minx + (maxx - minx) * a / GR, miny + (maxy - miny) * b / GR);
  const st = Math.max(maxx - minx, maxy - miny) / GR / 2;
  const c0 = rad; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) tryC(c0.cx + a * st / 2, c0.cy + b * st / 2);
  const best = rad.e < lin.e * 0.85 ? 'radial' : 'linear';
  if (Math.min(rad.e, lin.e) > eFlat * 0.7) return { hex: flatHex };
  const pick = best === 'radial' ? rad : lin;
  const at = (t) => pick.co.map(q => q[0] + q[1] * t + q[2] * t * t);
  const a0 = at(0), a1 = at(1), am = at(0.5);
  if (Math.max(...[0, 1, 2].map(c => Math.max(Math.abs(a0[c] - a1[c]), Math.abs(am[c] - (a0[c] + a1[c]) / 2) * 2))) < 10) return { hex: flatHex };
  // never let a stop leave the colours the region really has (thin or odd shapes can extrapolate wildly)
  const lo = [0, 1, 2].map(c => { let m = 255; for (let k = 0; k < N; k++) if (Cc[c][k] < m) m = Cc[c][k]; return m; });
  const hi = [0, 1, 2].map(c => { let m = 0; for (let k = 0; k < N; k++) if (Cc[c][k] > m) m = Cc[c][k]; return m; });
  const stops = [0, 0.5, 1].map(t => ({ t, hex: rgbHex(at(t).map((v, c) => Math.min(hi[c], Math.max(lo[c], v)))) }));
  if (best === 'linear') return { type: 'linear', x1: mx + ux * lin.tmin, y1: my + uy * lin.tmin, x2: mx + ux * lin.tmax, y2: my + uy * lin.tmax, stops, hex: flatHex };
  return { type: 'radial', cx: rad.cx, cy: rad.cy, r0: rad.tmin, r: rad.tmax, stops, hex: flatHex };
}
function solve3(M, b) {
  const a = M.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    const v = a[i][i] || 1e-9;
    for (let r = 0; r < 3; r++) if (r !== i) { const f = a[r][i] / v; for (let c = i; c < 4; c++) a[r][c] -= f * a[i][c]; }
  }
  return [a[0][3] / (a[0][0] || 1e-9), a[1][3] / (a[1][1] || 1e-9), a[2][3] / (a[2][2] || 1e-9)];
}
const rgbHex = (c) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

/* ---------------- exact fills (Pixel-exact mode) ---------------- */
/** Fill for one region, built the way a browser paints it: a flat colour, or a linear/radial gradient whose stops
    are solved by least squares on the exact piecewise-linear ramp SVG draws between stops. Returns { fill, e } with
    e = RMS error per channel (0..255) over the region's pixels. ix: pixel indices, big: RGBA. */
export function fitExact(ix, big, W, opt = {}) {
  const N = ix.length, tol = opt.tol ?? 4;
  const X = new Float64Array(N), Y = new Float64Array(N), C = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
  let mx = 0, my = 0; const mean = [0, 0, 0];
  for (let k = 0; k < N; k++) { const i = ix[k]; X[k] = i % W; Y[k] = (i / W) | 0; mx += X[k]; my += Y[k]; for (let c = 0; c < 3; c++) { C[c][k] = big[i * 4 + c]; mean[c] += C[c][k]; } }
  mx /= N; my /= N; for (let c = 0; c < 3; c++) mean[c] /= N;
  const flatRGB = mean.map(v => Math.round(v));
  let eFlat = 0; for (let k = 0; k < N; k++) for (let c = 0; c < 3; c++) { const v = C[c][k] - flatRGB[c]; eFlat += v * v; }
  eFlat = Math.sqrt(eFlat / (N * 3));
  const flat = { fill: { hex: rgbHex(flatRGB) }, e: eFlat };
  if (N < 12 || eFlat <= tol * 0.6) return flat;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (let k = 0; k < N; k++) { if (X[k] < minx) minx = X[k]; if (X[k] > maxx) maxx = X[k]; if (Y[k] < miny) miny = Y[k]; if (Y[k] > maxy) maxy = Y[k]; }
  if (maxx - minx < 2 && maxy - miny < 2) return flat;
  const u = new Float64Array(N);
  // ramp with K evenly spaced stops along u (0..1), solved by least squares with hat functions
  const ramp = (K) => {
    const A = Array.from({ length: K }, () => new Float64Array(K)), B = [new Float64Array(K), new Float64Array(K), new Float64Array(K)];
    for (let k = 0; k < N; k++) {
      const f = u[k] * (K - 1), a = Math.min(K - 2, Math.floor(f)), w = f - a, wa = 1 - w;
      A[a][a] += wa * wa; A[a][a + 1] += wa * w; A[a + 1][a] += wa * w; A[a + 1][a + 1] += w * w;
      for (let c = 0; c < 3; c++) { B[c][a] += wa * C[c][k]; B[c][a + 1] += w * C[c][k]; }
    }
    for (let j = 0; j < K; j++) A[j][j] += 1e-6;          // stops no pixel touches stay solvable
    const S = B.map(b => solveN(A, b).map(v => Math.max(0, Math.min(255, Math.round(v)))));
    let e = 0;
    for (let k = 0; k < N; k++) {
      const f = u[k] * (K - 1), a = Math.min(K - 2, Math.floor(f)), w = f - a;
      for (let c = 0; c < 3; c++) { const v = C[c][k] - (S[c][a] * (1 - w) + S[c][a + 1] * w); e += v * v; }
    }
    return { K, S, e: Math.sqrt(e / (N * 3)) };
  };
  const span = (lo, hi) => { const d = hi - lo || 1; for (let k = 0; k < N; k++) u[k] = Math.min(1, Math.max(0, (u[k] - lo) / d)); };
  // linear: along the main direction of change
  let sxx = 0, sxy = 0, syy = 0; const sxc = [0, 0, 0], syc = [0, 0, 0];
  for (let k = 0; k < N; k++) { const dx = X[k] - mx, dy = Y[k] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; for (let c = 0; c < 3; c++) { sxc[c] += dx * (C[c][k] - mean[c]); syc[c] += dy * (C[c][k] - mean[c]); } }
  const det = sxx * syy - sxy * sxy || 1;
  let a11 = 0, a12 = 0, a22 = 0;
  for (let c = 0; c < 3; c++) { const gx = (syy * sxc[c] - sxy * syc[c]) / det, gy = (sxx * syc[c] - sxy * sxc[c]) / det; a11 += gx * gx; a12 += gx * gy; a22 += gy * gy; }
  const th = 0.5 * Math.atan2(2 * a12, a11 - a22), ux = Math.cos(th), uy = Math.sin(th);
  let tmin = Infinity, tmax = -Infinity;
  for (let k = 0; k < N; k++) { const t = (X[k] + 0.5 - mx) * ux + (Y[k] + 0.5 - my) * uy; u[k] = t; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
  const linU = Float64Array.from(u); span(tmin, tmax); const linNorm = Float64Array.from(u);
  let best = flat;
  const tryLin = (K) => { u.set(linNorm); const r = ramp(K); if (r.e < best.e - 0.25) best = { e: r.e, fill: { type: 'linear', x1: mx + ux * tmin, y1: my + uy * tmin, x2: mx + ux * tmax, y2: my + uy * tmax, stops: stopsOf(r) } }; };
  tryLin(2); if (best.e > tol) tryLin(3); if (best.e > tol) tryLin(5);
  void linU;
  // radial: centre found on a coarse grid with 3 stops, then refined
  if (best.e > tol && N >= 40) {
    let rb = null;
    const tryC = (cx, cy, K) => {
      let r0 = Infinity, r1 = -Infinity;
      for (let k = 0; k < N; k++) { const d = Math.hypot(X[k] + 0.5 - cx, Y[k] + 0.5 - cy); u[k] = d; if (d < r0) r0 = d; if (d > r1) r1 = d; }
      span(r0, r1); const r = ramp(K);
      if (!rb || r.e < rb.e) rb = { ...r, cx, cy, r0, r1 };
    };
    const G = 5;
    for (let a = 0; a <= G; a++) for (let b = 0; b <= G; b++) tryC(minx + (maxx - minx + 1) * a / G, miny + (maxy - miny + 1) * b / G, 3);
    const st = Math.max(maxx - minx, maxy - miny) / G / 2, c0 = rb;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) tryC(c0.cx + a * st, c0.cy + b * st, 3);
    if (rb.e > tol) tryC(rb.cx, rb.cy, 5);
    if (rb.e < best.e - 0.25) best = { e: rb.e, fill: { type: 'radial', cx: rb.cx, cy: rb.cy, r0: rb.r0, r: rb.r1, stops: stopsOf(rb) } };
  }
  if (best.fill.type) best.fill.hex = flat.fill.hex;
  return best;
}
const stopsOf = (r) => Array.from({ length: r.K }, (_, j) => ({ t: +(j / (r.K - 1)).toFixed(3), hex: rgbHex([r.S[0][j], r.S[1][j], r.S[2][j]]) }));
function solveN(M, b) {
  const n = b.length, a = M.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r;
    [a[i], a[p]] = [a[p], a[i]];
    const v = a[i][i] || 1e-12;
    for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i] / v; if (f) for (let c = i; c <= n; c++) a[r][c] -= f * a[i][c]; }
  }
  return a.map((r, i) => r[n] / (r[i] || 1e-12));
}
