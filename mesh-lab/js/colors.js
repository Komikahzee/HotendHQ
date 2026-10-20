// Multi-colour prints from the AI's texture: the print-ready mesh carries a colour per vertex (sampled from
// the texture by the print-prep worker); here those are reduced to a few filament colours (k-means in Lab),
// one colour per triangle, with small islands merged away so the slicer gets clean regions to print.

function toLab(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = f(r), G = f(g), B = f(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = h(x), fy = h(y), fz = h(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Edge-adjacent faces (3 per face, -1 on an open edge).
export function faceNeighbours(I, nV) {
  const nF = I.length / 3, keys = new Float64Array(nF * 3), ord = new Uint32Array(nF * 3), nb = new Int32Array(nF * 3).fill(-1);
  for (let f = 0; f < nF; f++) for (let c = 0; c < 3; c++) {
    const a = I[f * 3 + c], b = I[f * 3 + (c + 1) % 3];
    keys[f * 3 + c] = a < b ? a * nV + b : b * nV + a; ord[f * 3 + c] = f * 3 + c;
  }
  ord.sort((p, q) => keys[p] - keys[q]);
  for (let k = 0; k + 1 < ord.length; k++) {
    const p = ord[k], q = ord[k + 1];
    if (keys[p] === keys[q]) { nb[p] = (q / 3) | 0; nb[q] = (p / 3) | 0; }
  }
  return nb;
}

// Returns { labels (per face), palette ([r,g,b] per label, the base last if any) }.
export function quantize(vcol, I, isBase, K, nb) {
  const nF = I.length / 3, labels = new Uint8Array(nF);
  const lab = new Float32Array(nF * 3), base = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = I[f * 3], b = I[f * 3 + 1], c = I[f * 3 + 2];
    if (isBase && isBase[a] && isBase[b] && isBase[c]) { base[f] = 1; continue; }
    const L = toLab((vcol[a * 3] + vcol[b * 3] + vcol[c * 3]) / 3, (vcol[a * 3 + 1] + vcol[b * 3 + 1] + vcol[c * 3 + 1]) / 3, (vcol[a * 3 + 2] + vcol[b * 3 + 2] + vcol[c * 3 + 2]) / 3);
    lab[f * 3] = L[0]; lab[f * 3 + 1] = L[1]; lab[f * 3 + 2] = L[2];
  }
  // soften texture noise (plaid, grain) before clustering: average each face with its edge neighbours
  const tl = new Float32Array(lab.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let f = 0; f < nF; f++) {
      let x = lab[f * 3], y = lab[f * 3 + 1], z = lab[f * 3 + 2], n = 1;
      if (!base[f]) for (let c = 0; c < 3; c++) { const g = nb[f * 3 + c]; if (g >= 0 && !base[g]) { x += lab[g * 3]; y += lab[g * 3 + 1]; z += lab[g * 3 + 2]; n++; } }
      tl[f * 3] = x / n; tl[f * 3 + 1] = y / n; tl[f * 3 + 2] = z / n;
    }
    lab.set(tl);
  }
  // k-means++ on a sample, then a few Lloyd rounds
  const sample = [];
  for (let f = 0, step = Math.max(1, Math.floor(nF / 60000)); f < nF; f += step) if (!base[f]) sample.push(f);
  if (!sample.length) return { labels, palette: [[128, 128, 128]] };
  const C = [];
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const d2 = (f, c) => { const x = lab[f * 3] - c[0], y = lab[f * 3 + 1] - c[1], z = lab[f * 3 + 2] - c[2]; return x * x + y * y + z * z; };
  C.push([...lab.subarray(sample[0] * 3, sample[0] * 3 + 3)]);
  const D = new Float64Array(sample.length).fill(Infinity);
  while (C.length < K) {
    let tot = 0;
    for (let i = 0; i < sample.length; i++) { D[i] = Math.min(D[i], d2(sample[i], C[C.length - 1])); tot += D[i]; }
    let r = rnd() * tot, i = 0; while (i < sample.length - 1 && (r -= D[i]) > 0) i++;
    C.push([...lab.subarray(sample[i] * 3, sample[i] * 3 + 3)]);
  }
  for (let it = 0; it < 12; it++) {
    const S = C.map(() => [0, 0, 0, 0]);
    for (const f of sample) { let bi = 0, bd = Infinity; for (let k = 0; k < K; k++) { const d = d2(f, C[k]); if (d < bd) { bd = d; bi = k; } } const s = S[bi]; s[0] += lab[f * 3]; s[1] += lab[f * 3 + 1]; s[2] += lab[f * 3 + 2]; s[3]++; }
    for (let k = 0; k < K; k++) if (S[k][3]) C[k] = [S[k][0] / S[k][3], S[k][1] / S[k][3], S[k][2] / S[k][3]];
  }
  // order light to dark so slot 1 is the lightest
  C.sort((p, q) => q[0] - p[0]);
  for (let f = 0; f < nF; f++) {
    if (base[f]) { labels[f] = K; continue; }
    let bi = 0, bd = Infinity; for (let k = 0; k < K; k++) { const d = d2(f, C[k]); if (d < bd) { bd = d; bi = k; } } labels[f] = bi;
  }
  // clean regions: majority vote of edge neighbours, a few passes (removes speckle islands)
  const tmp = new Uint8Array(nF), cnt = new Uint32Array(K + 1);
  for (let pass = 0; pass < 4; pass++) {
    for (let f = 0; f < nF; f++) {
      tmp[f] = labels[f]; if (base[f]) continue;
      cnt.fill(0); cnt[labels[f]]++;
      for (let c = 0; c < 3; c++) { const g = nb[f * 3 + c]; if (g >= 0 && !base[g]) cnt[labels[g]]++; }
      for (let k = 0; k < K; k++) if (cnt[k] >= 2 && k !== labels[f] && cnt[k] > cnt[labels[f]]) tmp[f] = k;
    }
    labels.set(tmp);
  }
  // merge small islands (under minFaces) into the neighbouring region they touch most
  const minFaces = Math.max(40, Math.round(nF * 0.0004));
  const comp = new Int32Array(nF).fill(-1), Q = new Int32Array(nF);
  for (let s0 = 0; s0 < nF; s0++) {
    if (comp[s0] >= 0 || base[s0]) continue;
    const L = labels[s0]; let qh = 0, qt = 0; Q[qt++] = s0; comp[s0] = s0;
    while (qh < qt) { const f = Q[qh++]; for (let c = 0; c < 3; c++) { const g = nb[f * 3 + c]; if (g >= 0 && comp[g] < 0 && !base[g] && labels[g] === L) { comp[g] = s0; Q[qt++] = g; } } }
    if (qt >= minFaces) continue;
    cnt.fill(0);
    for (let i = 0; i < qt; i++) { const f = Q[i]; for (let c = 0; c < 3; c++) { const g = nb[f * 3 + c]; if (g >= 0 && !base[g] && labels[g] !== L) cnt[labels[g]]++; } }
    let bi = L, bc = 0; for (let k = 0; k < K; k++) if (cnt[k] > bc) { bc = cnt[k]; bi = k; }
    for (let i = 0; i < qt; i++) labels[Q[i]] = bi;
  }
  // palette: the mean sRGB colour of each region
  const P = Array.from({ length: K }, () => [0, 0, 0, 0]);
  for (let f = 0; f < nF; f++) {
    if (base[f]) continue;
    const p = P[labels[f]];
    for (let c = 0; c < 3; c++) { const v = I[f * 3 + c] * 3; p[0] += vcol[v]; p[1] += vcol[v + 1]; p[2] += vcol[v + 2]; p[3]++; }
  }
  const palette = P.map((p) => (p[3] ? [p[0] / p[3], p[1] / p[3], p[2] / p[3]].map(Math.round) : [128, 128, 128]));
  if (base.some((x) => x)) palette.push([34, 34, 38]);
  return { labels, palette };
}

export const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
