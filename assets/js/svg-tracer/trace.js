/* ============================================================
   HOTEND HQ — SVG tracer: the whole pipeline
   prepare(): image -> palette + clean indexed image (prep.js)
   toSvg(): indexed image -> SVG (vectorize.js)
   Shared by the worker and the Node tests.
   ============================================================ */
import * as P from './prep.js?v=81e02ae157';
import { vectorize as trace } from './vectorize.js?v=4b7c9fe7ea';

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
 * o: { mode: 'color'|'bw', colors, merge, denoise: 'auto'|0..3, detail, quality, threshold, invert, palette (hex list override) }
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
  } else {
    if (o.palette && o.palette.length) {
      palette = o.palette.map(hx => { const rgb = P.fromHex(hx); const l = P.rgbToLab(...rgb); return { rgb, lab: [l[0], l[1] * chroma, l[2] * chroma], weight: 0 }; });
    } else {
      // palette from the (smaller) cleaned original: fast, and edges are already thin there
      const ps = Math.min(1, Math.sqrt(1.2e6 / (w * h)));
      const pw = Math.max(1, Math.round(w * ps)), ph = Math.max(1, Math.round(h * ps));
      let small = ps < 1 ? P.resize(clean, w, h, pw, ph) : clean;
      // noisy images: pick colours from a calmer copy, so small flat areas still read as flat
      if (noise > 4.5 && dn < 2) small = P.denoise(small, pw, ph, 2);
      const labSmall = P.labOf(small, pw * ph);
      palette = P.buildPalette(labSmall, small, pw, ph, { count: +o.colors || 0, merge: +o.merge || 12, chroma });
      P.weightChroma(labSmall, chroma);
      // auto mode: look again for small details the first pass missed
      if (!(+o.colors)) palette = P.refinePalette(labSmall, small, pw, ph, palette, { merge: +o.merge || 12, chroma });
    }
    lbl = P.label(labBig, big, W, H, palette, Math.max(2, Math.ceil(s) + 1));
    // a rare colour that is just a mix of two others (anti-aliasing leftovers): drop it and label again
    if (!(o.palette && o.palette.length) && palette.length > 2) {
      const cnt = new Float64Array(palette.length);
      for (let i = 0; i < lbl.length; i++) if (lbl[i] !== P.TRANSPARENT) cnt[lbl[i]]++;
      const keep = palette.filter((p, i) => !(cnt[i] / lbl.length < 0.003 && P.isBlend(p.rgb, palette.filter(q => q !== p).map(q => q.rgb), 28)));
      if (keep.length < palette.length) { palette = keep; lbl = P.label(labBig, big, W, H, palette, Math.max(2, Math.ceil(s) + 1)); }
    }
  }
  const detail = o.detail == null || o.detail === 'auto' ? (noise > 4.5 ? 3 : 1) : +o.detail;
  const minArea = Math.max(1, Math.round(detail * s * s));
  P.despeckle(lbl, W, H, minArea);
  // pixel share per colour (after clean-up), used for ordering and the palette chips
  const cnt = new Float64Array(palette.length); let tot = 0;
  for (let i = 0; i < lbl.length; i++) if (lbl[i] !== P.TRANSPARENT) { cnt[lbl[i]]++; tot++; }
  palette.forEach((p, i) => { p.weight = tot ? cnt[i] / tot : 0; p.hex = P.hex(p.rgb); });
  const bg = P.borderLabel(lbl, W, H);
  return { mode: o.mode === 'bw' ? 'bw' : 'color', lbl, W, H, s, w, h, palette, bg: bg === P.TRANSPARENT ? -1 : bg, denoise: dn, noise, threshold, ms: Date.now() - t0 };
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

