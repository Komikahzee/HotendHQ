/* ============================================================
   HOTEND HQ — SVG tracer: the whole pipeline
   prepare(): image -> palette + clean indexed image (prep.js)
   toSvg(): indexed image -> SVG (vectorize.js)
   Shared by the worker and the Node tests.
   ============================================================ */
import * as P from './prep.js?v=469c7cc377';
import { vectorize as trace } from './vectorize.js?v=0d28b5d966';
import { segment, flatten, fit, fitExact } from './regions.js?v=c896e2b9bf';

/** Working size: small images are enlarged (edges land between pixels, so curves come out smooth),
    huge ones are capped so the browser stays quick. */
export function workSize(w, h, quality = 'high') {
  const target = { fast: 1200, high: 2000, max: 2800 }[quality] || 2000;
  const capPx = { fast: 2.0e6, high: 4.5e6, max: 8e6 }[quality] || 4.5e6;
  let s = Math.min(4, target / Math.max(w, h));
  if (s < 1) s = 1;
  if (w * h * s * s > capPx) s = Math.sqrt(capPx / (w * h));
  return { W: Math.max(1, Math.round(w * s)), H: Math.max(1, Math.round(h * s)), s };
}

/**
 * Stage 1: everything up to the indexed image. Slow-ish, so the worker caches it.
 * o: { mode: 'color'|'bw', colors, merge, denoise: 'auto'|0..3, detail, quality, threshold, invert, palette (hex list override),
 *      flat: 0 (keep shading) | 'auto' | 1..3 (remove shading: light..strong) }
 */
export function prepare(rgba, w, h, o) {
  const t0 = Date.now();
  const noise = P.noiseLevel(rgba, w, h);
  const dn = o.denoise === 'auto' || o.denoise == null ? (noise > 9 ? 1 : 0) : +o.denoise;
  const clean = P.denoise(rgba, w, h, dn);
  const { W, H, s } = o.scale ? { W: Math.round(w * o.scale), H: Math.round(h * o.scale), s: o.scale } : workSize(w, h, o.quality);
  const big = P.resize(clean, w, h, W, H);
  // noisy (JPEG) images: trust lightness edges more than colour edges
  const chroma = o.mode === 'bw' ? 1 : noise > 4.5 ? 0.5 : 1;
  const labBig = P.weightChroma(P.labOf(big, W * H), chroma);
  let palette, lbl, threshold = null;
  if (o.mode === 'bw') {
    const labSmall = P.labOf(clean, w * h);
    threshold = o.threshold != null && o.threshold !== 'auto' ? +o.threshold : P.otsu(labSmall, clean, w * h);
    lbl = P.labelBW(labBig, big, W * H, threshold, !!o.invert);
    palette = [{ rgb: [255, 255, 255], weight: 0 }, { rgb: [0, 0, 0], weight: 0 }];
  } else if (o.flat) {
    // remove shading: areas follow the real outlines, and each area gets exactly one colour
    const level = o.flat === 'auto' ? (noise > 15 ? 1 : 3) : +o.flat;   // photos keep their main tones
    ({ lbl, palette } = flatten(big, W, H, { level, s, chroma, unify: +o.merge || 12, count: +o.colors || 0, palette: o.palette }));
  } else {
    if (o.palette && o.palette.length) {
      palette = o.palette.map(hx => { const rgb = P.fromHex(hx); const l = P.rgbToLab(...rgb); return { rgb, lab: [l[0], l[1] * chroma, l[2] * chroma], weight: 0 }; });
    } else palette = autoPalette(clean, w, h, noise, dn, o, chroma);
    lbl = P.label(labBig, big, W, H, palette, Math.max(2, Math.ceil(s) + 1));
    // a rare colour that is just a mix of two others (anti-aliasing leftovers): drop it and label again
    if (!(o.palette && o.palette.length) && palette.length > 2) {
      const cnt = new Float64Array(palette.length);
      for (let i = 0; i < lbl.length; i++) if (lbl[i] !== P.TRANSPARENT) cnt[lbl[i]]++;
      const keep = palette.filter((p, i) => !(cnt[i] / lbl.length < 0.003 && P.isBlend(p.rgb, palette.filter(q => q !== p).map(q => q.rgb), 28)));
      if (keep.length < palette.length) { palette = keep; lbl = P.label(labBig, big, W, H, palette, Math.max(2, Math.ceil(s) + 1)); }
    }
  }
  if (o.mode !== 'bw' && !(o.palette && o.palette.length) && !(+o.colors)) {
    palette = pruneColours(lbl, W, H, palette, labBig, s, chroma);
    if (o.flat) relaxBorders(lbl, labBig, palette, W, H, s);
    if (o.flat) palette = rescueDetails(lbl, labBig, palette, autoPalette(clean, w, h, noise, dn, o, chroma), W, s);
    // "Fewer" colour detail: every step down takes colours away, closest pairs first
    if (+o.fewer > 0) palette = fewerColours(lbl, palette, Math.max(2, Math.round(palette.length * FEWER[Math.min(5, +o.fewer)])));
  }
  const detail = o.detail == null || o.detail === 'auto' ? (noise > 4.5 ? 8 : 2) : +o.detail;
  const minArea = Math.max(1, Math.round(detail * s * s));
  P.despeckle(lbl, W, H, minArea);
  // pixel share per colour (after clean-up), used for ordering and the palette chips
  const cnt = new Float64Array(palette.length); let tot = 0;
  for (let i = 0; i < lbl.length; i++) if (lbl[i] !== P.TRANSPARENT) { cnt[lbl[i]]++; tot++; }
  palette.forEach((p, i) => { p.weight = tot ? cnt[i] / tot : 0; p.hex = P.hex(p.rgb); });
  const bg = P.borderLabel(lbl, W, H);
  return { mode: o.mode === 'bw' ? 'bw' : 'color', lbl, W, H, s, w, h, palette, bg: bg === P.TRANSPARENT ? -1 : bg, denoise: dn, noise, threshold, ms: Date.now() - t0 };
}

/** The colours of the image, picked from the (smaller) cleaned original: fast, and edges are already thin there. */
function autoPalette(clean, w, h, noise, dn, o, chroma) {
  const ps = Math.min(1, Math.sqrt(1.2e6 / (w * h)));
  const pw = Math.max(1, Math.round(w * ps)), ph = Math.max(1, Math.round(h * ps));
  let small = ps < 1 ? P.resize(clean, w, h, pw, ph) : clean;
  // noisy images: pick colours from a calmer copy, so small flat areas still read as flat
  if (noise > 4.5 && dn < 2) small = P.denoise(small, pw, ph, 2);
  const labSmall = P.labOf(small, pw * ph);
  let palette = P.buildPalette(labSmall, small, pw, ph, { count: +o.colors || 0, merge: +o.merge || 12, chroma });
  P.weightChroma(labSmall, chroma);
  // auto mode: look again for small details the first pass missed
  if (!(+o.colors)) palette = P.refinePalette(labSmall, small, pw, ph, palette, { merge: +o.merge || 12, chroma });
  return palette;
}

const FEWER = [1, 0.8, 0.65, 0.5, 0.38, 0.28];

/** True when colour c (rgb) looks like a mix of two of `others` (rgb) in Lab: JPEG edges shift a blend's
    channels apart, so the RGB test alone misses some. */
function labBlend(c, others, tol = 18) {
  const C = P.rgbToLab(...c), O = others.map(o => P.rgbToLab(...o));
  for (let i = 0; i < O.length; i++) for (let j = i + 1; j < O.length; j++) {
    const a = O[i], b = O[j], vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], vv = vx * vx + vy * vy + vz * vz;
    if (vv < 1) continue;
    const ux = C[0] - a[0], uy = C[1] - a[1], uz = C[2] - a[2], t = (ux * vx + uy * vy + uz * vz) / vv;
    if (t > 0.1 && t < 0.9 && (ux - t * vx) ** 2 + (uy - t * vy) ** 2 + (uz - t * vz) ** 2 < tol * tol) return true;
  }
  return false;
}

/** Merge the two closest colours until `target` are left (a small colour goes sooner than a big one at the
    same distance). The bigger of the two keeps its colour, so what is left are still the image's own colours,
    just fewer of them. Changes lbl in place. */
function fewerColours(lbl, palette, target) {
  const T = P.TRANSPARENT, K = palette.length;
  if (K <= target) return palette;
  const cnt = new Float64Array(K);
  for (let i = 0; i < lbl.length; i++) if (lbl[i] !== T) cnt[lbl[i]]++;
  const owner = palette.map((_, k) => k), live = palette.map((_, k) => k);
  while (live.length > target) {
    let ba = 0, bb = 1, bd = Infinity;
    for (let x = 0; x < live.length; x++) for (let y = x + 1; y < live.length; y++) {
      const p = palette[live[x]].lab, q = palette[live[y]].lab;
      const d = ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) * Math.sqrt(Math.min(cnt[live[x]], cnt[live[y]]) + 1);
      if (d < bd) { bd = d; ba = x; bb = y; }
    }
    let keep = live[ba], gone = live[bb]; if (cnt[gone] > cnt[keep]) { const t = keep; keep = gone; gone = t; }
    owner[gone] = keep; cnt[keep] += cnt[gone];
    live.splice(live.indexOf(gone), 1);
  }
  const root = (k) => { while (owner[k] !== k) k = owner[k]; return k; };
  const idx = new Map(live.map((k, i) => [k, i])), map = palette.map((_, k) => idx.get(root(k)));
  for (let i = 0; i < lbl.length; i++) if (lbl[i] !== T) lbl[i] = map[lbl[i]];
  return live.map(k => palette[k]);
}

/** Remove shading picks each area's outline while merging, and where an area fades into the next (a soft
    fur edge, a glow) that outline can land anywhere in the fade, even as a straight cut. Move every border
    pixel to the neighbouring colour it is closer to, until nothing changes: borders settle halfway through
    each fade and follow its real shape. Colours stay flat; only where one ends and the next begins moves. */
function relaxBorders(lbl, lab, palette, W, H, s) {
  const T = P.TRANSPARENT, n = W * H, pl = palette.map(p => p.lab);
  const d = (i, l) => { const L = pl[l]; return (lab[i * 3] - L[0]) ** 2 + (lab[i * 3 + 1] - L[1]) ** 2 + (lab[i * 3 + 2] - L[2]) ** 2; };
  let q = new Int32Array(n), qn = 0; const inQ = new Uint8Array(n);
  const push = (i) => { if (!inQ[i]) { inQ[i] = 1; q[qn++] = i; } };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, l = lbl[i]; if (l === T) continue;
    if ((x > 0 && lbl[i - 1] !== l) || (x < W - 1 && lbl[i + 1] !== l) || (y > 0 && lbl[i - W] !== l) || (y < H - 1 && lbl[i + W] !== l)) push(i);
  }
  for (let round = 0, rounds = Math.round(6 * s); round < rounds && qn; round++) {
    const cur = q.subarray(0, qn).slice(); qn = 0;
    for (const i of cur) inQ[i] = 0;
    for (const i of cur) {
      const l = lbl[i]; if (l === T) continue;
      const x = i % W; let best = l, bd = d(i, l) * 0.8;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      for (const j of nb) { if (j < 0 || j >= n) continue; const m = lbl[j]; if (m === T || m === l) continue; const e = d(i, m); if (e < bd) { bd = e; best = m; } }
      if (best !== l) { lbl[i] = best; for (const j of nb) if (j >= 0 && j < n && lbl[j] !== T) push(j); }
    }
  }
}

/** Remove shading works on areas, and an area smaller than a letter's stroke can melt into what is around it.
    Put back what got lost: a pixel far from its area's colour goes to a colour that is much closer to it,
    taken from the flat palette, or from the image's own colours when it is one the flat palette lacks
    (a fine green line, say). Shading is never far from its area's colour, so it stays flat. */
function rescueDetails(lbl, lab, palette, extra, W, s) {
  const T = P.TRANSPARENT, D = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const pal = [...palette];
  const rgbs = palette.map(p => p.rgb);
  for (const e of extra) if (pal.length < 250 && pal.every(p => D(p.lab, e.lab) > 30 * 30) && !P.isBlend(e.rgb, rgbs, 28) && !labBlend(e.rgb, rgbs)) pal.push({ rgb: e.rgb, lab: e.lab, weight: 0 });
  // between[l][q]: colour q sits partway from colour l to some other colour, so on l's edges q is only the
  // anti-aliasing towards that colour (grey between white and black), never a detail of its own
  const K = pal.length, between = new Uint8Array(K * K);
  for (let l = 0; l < K; l++) for (let q = 0; q < K; q++) {
    if (q === l) continue;
    const o = pal[l].lab, Q = pal[q].lab;
    for (let m = 0; m < K && !between[l * K + q]; m++) {
      if (m === l || m === q) continue;
      const M = pal[m].lab, vx = M[0] - o[0], vy = M[1] - o[1], vz = M[2] - o[2], vv = vx * vx + vy * vy + vz * vz;
      const ux = Q[0] - o[0], uy = Q[1] - o[1], uz = Q[2] - o[2], t = (ux * vx + uy * vy + uz * vz) / vv;
      if (t > 0.15 && t < 0.85 && (ux - t * vx) ** 2 + (uy - t * vy) ** 2 + (uz - t * vz) ** 2 < 12 * 12) between[l * K + q] = 1;
    }
  }
  const used = new Uint8Array(pal.length), c = [0, 0, 0], n = lbl.length, R = Math.max(1, Math.round(s)) + 1;
  // a detail has a sharp edge within a couple of pixels; a smooth highlight or shadow does not
  const dl = (i, j) => j < 0 || j >= n ? 0 : (lab[i * 3] - lab[j * 3]) ** 2 + (lab[i * 3 + 1] - lab[j * 3 + 1]) ** 2 + (lab[i * 3 + 2] - lab[j * 3 + 2]) ** 2;
  const edgy = (i) => Math.max(dl(i, i - R), dl(i, i + R), dl(i, i - R * W), dl(i, i + R * W)) > 20 * 20;
  for (let i = 0; i < lbl.length; i++) {
    const l = lbl[i]; if (l === T) continue;
    c[0] = lab[i * 3]; c[1] = lab[i * 3 + 1]; c[2] = lab[i * 3 + 2];
    const dOwn = D(c, pal[l].lab);
    if (dOwn > 20 * 20 && edgy(i)) {
      const o = pal[l].lab, ux = c[0] - o[0], uy = c[1] - o[1], uz = c[2] - o[2];
      let best = l, bd = dOwn * 0.6, br = Infinity;
      for (let q = 0; q < pal.length; q++) {
        if (q === l || between[l * K + q]) continue;
        const Q = pal[q].lab, d = D(c, Q);
        if (d < bd) { bd = d; best = q; br = -1; continue; }   // simply much closer to another colour
        if (br < 0) continue;
        // or an anti-aliased mix of its area's colour and this one, at least 35 % this one (a thin line or letter)
        const vx = Q[0] - o[0], vy = Q[1] - o[1], vz = Q[2] - o[2], vv = vx * vx + vy * vy + vz * vz;
        const t = (ux * vx + uy * vy + uz * vz) / vv; if (t < 0.35 || t > 1.3) continue;
        const r = (ux - t * vx) ** 2 + (uy - t * vy) ** 2 + (uz - t * vz) ** 2;
        if (r < 0.12 * dOwn + 36 && r < br) { br = r; best = q; }
      }
      lbl[i] = best;
    }
    used[lbl[i]] = 1;
  }
  // only keep the added colours that were used
  const map = new Int32Array(pal.length), out = [];
  pal.forEach((p, q) => { if (q < palette.length || used[q]) { map[q] = out.length; out.push(p); } });
  if (out.length < pal.length) for (let i = 0; i < lbl.length; i++) if (lbl[i] !== T) lbl[i] = map[lbl[i]];
  return out;
}

/** Drop colours that are only edge blends or noise, not colours of the art: anti-aliased borders between two
    colours (a thin band of their mix, e.g. navy + red -> plum) and JPEG speckle. A colour goes when it is a mix
    of two others and is mostly band (little inside it is more than R px from another colour), or when it is
    rare and nearly all edge. Its pixels go to whichever neighbouring colour each one is closest to, so borders
    stay where they were. Changes lbl in place; returns the palette that is left. */
function pruneColours(lbl, W, H, palette, lab, s, chroma) {
  const R = Math.max(1, Math.round(s)), n = W * H, T = P.TRANSPARENT;
  const labOfP = (p) => { const l = P.rgbToLab(...p.rgb); return [l[0], l[1] * chroma, l[2] * chroma]; };
  for (let pass = 0; pass < 4 && palette.length > 2; pass++) {
    const K = palette.length, cnt = new Float64Array(K), core = new Float64Array(K);
    let tot = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = lbl[i]; if (l === T) continue;
      cnt[l]++; tot++;
      if (x >= R && y >= R && x < W - R && y < H - R && lbl[i - R] === l && lbl[i + R] === l && lbl[i - R * W] === l && lbl[i + R * W] === l) core[l]++;
    }
    if (!tot) return palette;
    const rgbs = palette.map(p => p.rgb);
    const labs = palette.map(labOfP);
    const drop = palette.map((p, k) => {
      if (!cnt[k]) return true;
      const inner = core[k] / cnt[k], share = cnt[k] / tot;
      const others = rgbs.filter((_, j) => j !== k);
      if (inner < (share < 0.01 ? 0.6 : 0.25) && (P.isBlend(p.rgb, others, 28) || labBlend(p.rgb, others))) return true;   // a band between two colours
      // the closest bigger colour: a thin colour of its own (a fine line, small lettering) is a detail, not noise
      let dMin = Infinity;
      labs.forEach((L, j) => { if (j !== k && cnt[j] > cnt[k]) dMin = Math.min(dMin, (L[0] - labs[k][0]) ** 2 + (L[1] - labs[k][1]) ** 2 + (L[2] - labs[k][2]) ** 2); });
      if (share < 0.02 && inner < 0.1 && dMin < 625) return true;                             // speckle
      return inner < 0.3 && dMin < 144;                                                       // a slightly-off copy of a bigger colour
    });
    // never fall below two colours: the biggest ones stay
    const order = [...cnt.keys()].sort((a, b) => cnt[b] - cnt[a]);
    drop[order[0]] = false; if (order.length > 1) drop[order[1]] = false;
    if (!drop.some((d, k) => d && cnt[k])) { if (drop.some(Boolean)) { /* only unused colours */ } else return palette; }
    const map = new Int32Array(K).fill(-1); const kept = [];
    palette.forEach((p, k) => { if (!drop[k]) { map[k] = kept.length; kept.push(p); } });
    const kl = kept.map(labOfP);
    // closest by the pixel itself plus the colour it had: a band halfway between two colours splits along the
    // real border, while thin dark lettering (whose pixels are mostly blended) stays with the dark colour
    const near = (i, cand, l) => {
      const a = lab[i * 3], b = lab[i * 3 + 1], c = lab[i * 3 + 2], o = labs[l];
      let best = -1, bd = Infinity;
      for (const q of cand) { const L = kl[q], d = (L[0] - a) ** 2 + (L[1] - b) ** 2 + (L[2] - c) ** 2 + (L[0] - o[0]) ** 2 + (L[1] - o[1]) ** 2 + (L[2] - o[2]) ** 2; if (d < bd) { bd = d; best = q; } }
      return best;
    };
    const all = kept.map((_, q) => q);
    const out = new Uint8Array(lbl);
    const reach = R + 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = lbl[i]; if (l === T) continue;
      if (map[l] >= 0) { out[i] = map[l]; continue; }
      // kept colours touching this pixel, else any kept colour
      const cand = new Set();
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const m = lbl[yy * W + xx]; if (m !== T && map[m] >= 0) cand.add(map[m]);
      }
      out[i] = near(i, cand.size ? cand : all, l);
    }
    lbl.set(out);
    palette = kept;
  }
  return palette;
}

/** Stage 2: indexed image -> SVG (vectorize.js). o: { smooth, corners, cutout, removeBg, hidden } */
export function toSvg(prep, o) {
  const t0 = Date.now();
  const { lbl, W, H, w, h, palette } = prep;
  const skip = new Set([P.TRANSPARENT, ...(o.hidden || [])]);
  // background: in black & white it is the paper; in colour, the colour that owns the image border
  if (o.removeBg) skip.add(prep.mode === 'bw' ? 0 : prep.bg);
  const res = trace(lbl, W, H, { smooth: o.smooth ?? 5, corners: o.corners ?? 5, eps: o.eps, workScale: prep.s, scale: w / W, stacked: !o.cutout, skip });
  const body = [];
  for (const r of res.regions) {
    const last = body[body.length - 1];
    if (last && last.l === r.label) last.d.push(r.d); else body.push({ l: r.label, d: [r.d] });
  }
  const rule = o.cutout ? ' fill-rule="evenodd"' : '';
  const svgBody = body.map(g => `<path fill="${palette[g.l].hex}"${rule} d="${g.d.join('')}"/>`).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${svgBody}\n</svg>\n`;
  const layers = palette.map((p, i) => ({ i, hex: p.hex, d: res.regions.filter(r => r.label === i).map(r => r.d) })).filter(l => l.d.length);
  return { svg, layers, paths: res.regions.length, bytes: svg.length, ms: Date.now() - t0 };
}


/* ============================================================
   Detailed mode: for photos, renders and shaded artwork.
   The image is split into many small regions that follow its edges, and each region gets its own
   colour or a fitted gradient. Every shape is also stroked in its own paint on a layer underneath,
   which fills the hairline seams browsers leave between touching shapes.
   o: { detail 1..3, quality, smooth, corners, gradients }
   ============================================================ */
const DETAIL = { 1: { k: 40, min: 8 }, 2: { k: 16, min: 5 }, 3: { k: 8, min: 3 } };
export function traceDetailed(rgba, w, h, o = {}, progress = () => {}) {
  const t0 = Date.now();
  const { W, H, s } = workSize(w, h, o.quality || 'high');
  const big = P.resize(rgba, w, h, W, H);
  const D = DETAIL[o.detail] || DETAIL[2];
  progress('regions');
  const { rid, regions } = segment(big, W, H, { sigma: 0.8, k: D.k * Math.max(1, s), minSize: Math.round(D.min * s * s) });
  const sum = new Float64Array(regions * 4);
  for (let i = 0; i < W * H; i++) { const r = rid[i]; if (r < 0) continue; sum[r * 4] += big[i * 4]; sum[r * 4 + 1] += big[i * 4 + 1]; sum[r * 4 + 2] += big[i * 4 + 2]; sum[r * 4 + 3]++; }
  const hexOf = (r) => '#' + [0, 1, 2].map(c => Math.round(sum[r * 4 + c] / sum[r * 4 + 3]).toString(16).padStart(2, '0')).join('');
  let fills;
  if (o.gradients !== false) {
    progress('shading');
    // pixels per region (a sample of up to ~4000 for big regions keeps the fit quick)
    const px = Array.from({ length: regions }, () => []);
    for (let i = 0; i < W * H; i++) { const r = rid[i]; if (r < 0) continue; const c = sum[r * 4 + 3]; if (c < 4000 || i % Math.floor(c / 4000) === 0) px[r].push(i); }
    fills = px.map((ix, r) => fit(ix, big, W, hexOf(r), sum[r * 4 + 3], { minArea: 60 * s * s, flatErr: 2 }));
  } else fills = Array.from({ length: regions }, (_, r) => ({ hex: hexOf(r) }));
  progress('curves');
  const k = w / W;
  const res = trace(rid, W, H, { smooth: o.smooth ?? 5, corners: o.corners ?? 5, workScale: s, scale: k, stacked: false, skip: new Set([-1]) });
  const defs = [], f = (v) => +(v * k).toFixed(1);
  const paint = fills.map((F) => {
    if (!F.type) return F.hex;
    const id = 'g' + defs.length.toString(36);
    if (F.type === 'linear') defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(F.x1)}" y1="${f(F.y1)}" x2="${f(F.x2)}" y2="${f(F.y2)}">${F.stops.map(q => `<stop offset="${q.t}" stop-color="${q.hex}"/>`).join('')}</linearGradient>`);
    else { const R = Math.max(F.r, 1e-3); defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(F.cx)}" cy="${f(F.cy)}" r="${f(R)}">${F.stops.map(q => `<stop offset="${(F.r0 / R + q.t * (F.r - F.r0) / R).toFixed(3)}" stop-color="${q.hex}"/>`).join('')}</radialGradient>`); }
    return `url(#${id})`;
  });
  // shapes never overlap (holes are cut), so the stroke layer underneath only ever shows through seams
  const ids = [], under = [], over = [];
  res.regions.forEach((r, i) => {
    const id = 'p' + i.toString(36), pt = paint[r.label];
    ids.push(`<path id="${id}" d="${r.d}"/>`); under.push(`<use xlink:href="#${id}" stroke="${pt}"/>`); over.push(`<use xlink:href="#${id}" fill="${pt}"/>`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<defs>${defs.join('')}\n${ids.join('\n')}</defs>\n<g fill="none" stroke-width="1.2" stroke-linejoin="round">${under.join('')}</g>\n<g fill-rule="evenodd">${over.join('')}</g>\n</svg>\n`;
  return { svg, paths: res.regions.length, regions, gradients: defs.length, bytes: svg.length, ms: Date.now() - t0,
    ...(o.preview ? { preview: paintFills(rid, W, H, fills, w, h) } : {}) };
}

/* ============================================================
   Pixel-exact mode: the SVG is drawn on the image's own pixel grid, so at 100 % it can match the original
   pixel for pixel. Regions follow the image's edges; every region gets the flat colour or gradient that
   reproduces its pixels best (solved the way the browser paints it), and any region still further off than
   `tol` is split again along its own finer edges, round after round, until it matches.
   o: { tol (RMS error per channel allowed in a region, 0..255), rounds, onProgress }
   ============================================================ */
const ROUNDS = [{ k: 8, minSize: 3, sigma: 0.8 }, { k: 3, minSize: 2, sigma: 0.5 }, { k: 1.2, minSize: 1, sigma: 0 }, { k: 0.4, minSize: 1, sigma: 0 }, { k: 0.01, minSize: 1, sigma: 0 }];
export function traceExact(rgba, w, h, o = {}, progress = () => {}) {
  const t0 = Date.now();
  const W = w, H = h, n = W * H, tol = o.tol ?? 4;
  // fully transparent pixels stay empty; colours are taken as painted over nothing (alpha is not traced)
  progress('regions');
  let { rid, regions: R } = segment(rgba, W, H, ROUNDS[0]);
  let fills = null, errs = null;
  const rounds = Math.min(ROUNDS.length, o.rounds ?? ROUNDS.length);
  for (let round = 0; ; round++) {
    progress('shading', round);
    // pixels of each region, contiguous (counting sort)
    const cnt = new Int32Array(R + 1);
    for (let i = 0; i < n; i++) if (rid[i] >= 0) cnt[rid[i] + 1]++;
    for (let r = 0; r < R; r++) cnt[r + 1] += cnt[r];
    const pix = new Int32Array(cnt[R]), pos = cnt.slice(0, R);
    for (let i = 0; i < n; i++) if (rid[i] >= 0) pix[pos[rid[i]]++] = i;
    fills = new Array(R); errs = new Float32Array(R);
    for (let r = 0; r < R; r++) {
      let ix = pix.subarray(cnt[r], cnt[r + 1]);
      // big regions: fit on an even sample (the error is then a close estimate)
      if (ix.length > 6000) { const st = ix.length / 6000, sm = new Int32Array(6000); for (let k = 0; k < 6000; k++) sm[k] = ix[Math.floor(k * st)]; ix = sm; }
      const f = fitExact(ix, rgba, W, { tol });
      fills[r] = f.fill; errs[r] = f.e;
    }
    if (round + 1 >= rounds) break;
    // regions still off by more than tol are split again, along their own finer edges
    const bad = new Uint8Array(R); let nb = 0;
    for (let r = 0; r < R; r++) if (errs[r] > tol && cnt[r + 1] - cnt[r] > 1) { bad[r] = 1; nb++; }
    if (!nb) break;
    progress('regions', round + 1);
    const masked = new Uint8ClampedArray(rgba);
    for (let i = 0; i < n; i++) if (rid[i] < 0 || !bad[rid[i]]) masked[i * 4 + 3] = 0;
    const sub = segment(masked, W, H, ROUNDS[round + 1]);
    // new id = the old region for good pixels, (old region, sub region) for re-split ones
    // a sub region nearly always lies inside one old region: remember that pair per sub region, Map only for the rest
    const map = new Map(); let next = 0; const keep = new Int32Array(R).fill(-1); const nr = new Int32Array(n);
    const subOld = new Int32Array(sub.regions).fill(-1), subNew = new Int32Array(sub.regions);
    for (let i = 0; i < n; i++) {
      const r = rid[i]; if (r < 0) { nr[i] = -1; continue; }
      if (!bad[r]) { if (keep[r] < 0) keep[r] = next++; nr[i] = keep[r]; continue; }
      const q = sub.rid[i];
      if (subOld[q] === r) { nr[i] = subNew[q]; continue; }
      if (subOld[q] < 0) { subOld[q] = r; nr[i] = subNew[q] = next++; continue; }
      const key = r * 4294967296 + q; let v = map.get(key);
      if (v === undefined) { v = next++; map.set(key, v); }
      nr[i] = v;
    }
    rid = nr; R = next;
  }
  progress('curves');
  const res = trace(rid, W, H, { exact: true, smooth: 0, corners: 10, workScale: 1, scale: 1, stacked: false, skip: new Set([-1]) });
  // flat colours: one path per colour; gradients: one path each
  const defs = [], byHex = new Map(), body = [];
  const num = (v) => String(+v.toFixed(1));
  for (const r of res.regions) {
    const F = fills[r.label];
    if (!F.type) { let a = byHex.get(F.hex); if (!a) byHex.set(F.hex, a = []); a.push(r.d); continue; }
    const id = 'g' + defs.length.toString(36);
    const st = F.stops.map(q => `<stop offset="${q.t}" stop-color="${q.hex}"/>`).join('');
    if (F.type === 'linear') defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(F.x1)}" y1="${num(F.y1)}" x2="${num(F.x2)}" y2="${num(F.y2)}">${st}</linearGradient>`);
    else {
      const Rr = Math.max(F.r, 1e-3);
      defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(F.cx)}" cy="${num(F.cy)}" r="${num(Rr)}">${F.stops.map(q => `<stop offset="${((F.r0 + q.t * (F.r - F.r0)) / Rr).toFixed(4)}" stop-color="${q.hex}"/>`).join('')}</radialGradient>`);
    }
    body.push([`url(#${id})`, r.d]);
  }
  for (const [hx, ds] of byHex) body.unshift([hx, ds.join('')]);
  // crispEdges: the shapes tile the pixel grid exactly, so no edge needs smoothing and no hairline seams appear
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" fill-rule="evenodd">\n${defs.length ? '<defs>' + defs.join('') + '</defs>\n' : ''}${body.map(([pt, d]) => `<path fill="${pt}" d="${d}"/>`).join('\n')}\n</svg>\n`;
  return { svg, paths: res.regions.length, regions: R, gradients: defs.length, colours: byHex.size, bytes: svg.length, ms: Date.now() - t0,
    ...(o.preview ? { preview: paintFills(rid, W, H, fills, w, h) } : {}), ...(o.debug ? { rid, fills, errs } : {}) };
}

/* ============================================================
   Preview: paint the traced regions straight into pixels, the way the SVG fills them (flat colour, or the
   linear/radial gradient sampled at each pixel centre). A phone can take longer to draw a big SVG than to
   trace it; this picture shows the result at once, and the page only draws the real SVG when you zoom in.
   rid/fills: regions at the work size W x H (fill coordinates in work px); w x h: the output size.
   ============================================================ */
export function paintFills(rid, W, H, fills, w, h) {
  const px = new Uint8ClampedArray(w * h * 4), kx = W / w, ky = H / h;
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const ramp = fills.map((F) => {
    if (!F || !F.type) return { c: rgb(F ? F.hex : '#000000') };
    const st = F.stops.map(q => ({ o: F.type === 'radial' ? (F.r0 + q.t * (F.r - F.r0)) / Math.max(F.r, 1e-3) : q.t, c: rgb(q.hex) }));
    return { F, st };
  });
  const at = (st, t, out) => {
    if (t <= st[0].o) { out[0] = st[0].c[0]; out[1] = st[0].c[1]; out[2] = st[0].c[2]; return; }
    for (let j = 1; j < st.length; j++) if (t <= st[j].o) {
      const a = st[j - 1], b = st[j], f = (t - a.o) / ((b.o - a.o) || 1);
      for (let c = 0; c < 3; c++) out[c] = a.c[c] + (b.c[c] - a.c[c]) * f;
      return;
    }
    const z = st[st.length - 1].c; out[0] = z[0]; out[1] = z[1]; out[2] = z[2];
  };
  const col = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    const wy = (y + 0.5) * ky, ry = Math.min(H - 1, wy | 0);
    for (let x = 0; x < w; x++) {
      const wx = (x + 0.5) * kx, r = rid[ry * W + Math.min(W - 1, wx | 0)], o = (y * w + x) * 4;
      if (r < 0) continue;
      const R = ramp[r];
      if (!R.F) { px[o] = R.c[0]; px[o + 1] = R.c[1]; px[o + 2] = R.c[2]; px[o + 3] = 255; continue; }
      const F = R.F;
      let t;
      if (F.type === 'linear') { const dx = F.x2 - F.x1, dy = F.y2 - F.y1; t = ((wx - F.x1) * dx + (wy - F.y1) * dy) / ((dx * dx + dy * dy) || 1); }
      else t = Math.hypot(wx - F.cx, wy - F.cy) / Math.max(F.r, 1e-3);
      at(R.st, t, col);
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
    }
  }
  return { data: px, w, h };
}
