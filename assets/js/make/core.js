/* ============================================================
   HOTEND HQ — shared geometry kit for the model generators
   Thin, readable helpers over Manifold (watertight booleans).
   Units are millimetres, Z is up, every part sits on Z = 0.
   Used inside the generator worker only.
   ============================================================ */
export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* Every Manifold / CrossSection made during a build is remembered and freed afterwards
   (WASM memory is not garbage collected). */
function track(wasm) {
  if (wasm.__live) return wasm.__live;
  const { Manifold: M, CrossSection: CS } = wasm;
  const live = wasm.__live = new Set();
  const reg = (r) => { if (!r) return; if (Array.isArray(r)) r.forEach(reg); else if (r instanceof M || r instanceof CS) live.add(r); };
  wasm.__reg = reg;
  const skip = new Set(['constructor', 'delete', 'length', 'name', 'prototype']);
  for (const C of [M, CS]) {
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const f = C.prototype[k];
      if (skip.has(k) || k.startsWith('_') || typeof f !== 'function') continue;
      C.prototype[k] = function (...a) { const r = f.apply(this, a); reg(r); return r; };
    }
    for (const k of Object.getOwnPropertyNames(C)) {
      const f = C[k];
      if (skip.has(k) || typeof f !== 'function') continue;
      C[k] = function (...a) { const r = f.apply(this, a); reg(r); return r; };
    }
  }
  return live;
}

export function kit(wasm) {
  const live = track(wasm);
  const { Manifold: M, CrossSection: CS } = wasm;
  const free = () => { for (const o of live) { try { o.delete(); } catch { /* already gone */ } } live.clear(); };

  /* ---------------- 2D ---------------- */
  const poly = (pts) => { const c = new CS([pts], 'NonZero'); live.add(c); return c; };
  const polys = (list) => { const c = new CS(list, 'NonZero'); live.add(c); return c; };
  const circle = (r, seg = 0) => CS.circle(r, seg || segFor(r));
  const rect = (w, h) => CS.square([w, h], true);
  const segFor = (r) => clamp(Math.round(r * 6), 24, 160);
  function rrectPts(w, h, r, seg = 10, cx = 0, cy = 0) {
    r = clamp(r, 0, Math.min(w, h) / 2 - 1e-3);
    if (r < 0.01) return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
    const hx = w / 2 - r, hy = h / 2 - r, pts = [];
    for (const [x, y, a0] of [[hx, -hy, -90], [hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180]])
      for (let i = 0; i <= seg; i++) { const a = (a0 + 90 * i / seg) * D2R; pts.push([cx + x + r * Math.cos(a), cy + y + r * Math.sin(a)]); }
    return pts;
  }
  const rrect = (w, h, r, seg) => poly(rrectPts(w, h, r, seg));
  const regular = (n, r, rot = 0) => poly(Array.from({ length: n }, (_, i) => { const a = rot * D2R + TAU * i / n; return [r * Math.cos(a), r * Math.sin(a)]; }));
  const star = (n, ro, ri, rot = 90) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = rot * D2R + Math.PI * i / n; const r = i % 2 ? ri : ro; return [r * Math.cos(a), r * Math.sin(a)]; }));
  function heart(size) {          // fits a size × size box, point down
    const pts = [];
    for (let i = 0; i < 120; i++) {
      const t = TAU * i / 120;
      pts.push([16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]);
    }
    return fit(poly(pts), size, size);
  }
  function shield(w, h) {
    const pts = [[-w / 2, h / 2], [w / 2, h / 2]];
    for (let i = 0; i <= 24; i++) { const t = i / 24; const x = w / 2 * (1 - t); const y = h / 2 - h * 0.45 - h * 0.55 * Math.sin(t * Math.PI / 2); pts.push([x, y]); }
    for (let i = 23; i >= 0; i--) { const t = i / 24; const x = -w / 2 * (1 - t); const y = h / 2 - h * 0.45 - h * 0.55 * Math.sin(t * Math.PI / 2); pts.push([x, y]); }
    return poly(pts);
  }
  function arch(w, h) {           // flat bottom, round top
    const r = w / 2, pts = [[-r, -h / 2], [r, -h / 2]];
    const cy = h / 2 - r;
    for (let i = 0; i <= 32; i++) { const a = Math.PI * i / 32; pts.push([r * Math.cos(a), cy + r * Math.sin(a)]); }
    return poly(pts);
  }
  const ellipse = (w, h, seg = 96) => poly(Array.from({ length: seg }, (_, i) => { const a = TAU * i / seg; return [w / 2 * Math.cos(a), h / 2 * Math.sin(a)]; }));
  /** scale a cross-section to fit inside w × h, centred */
  function fit(cs, w, h) {
    const b = cs.bounds(), bw = b.max[0] - b.min[0], bh = b.max[1] - b.min[1];
    const s = Math.min(w / bw, h / bh);
    return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]).scale([s, s]);
  }
  const center2 = (cs) => { const b = cs.bounds(); return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]); };
  const size2 = (cs) => { const b = cs.bounds(); return [b.max[0] - b.min[0], b.max[1] - b.min[1]]; };

  /* ---------------- text ----------------
     font: outline JSON (units per em, cap height, glyph contours).
     size = cap height in mm. Multiple lines split on \n.            */
  function text(font, str, o = {}) {
    const size = o.size ?? 10, s = size / font.cap, track = (o.spacing ?? 0) * font.upm;   // spacing in em
    const lineH = (o.lineHeight ?? 1.25) * font.cap * 1.35;
    const lines = String(str ?? '').split('\n');
    const all = [];
    let maxW = 0;
    const widths = lines.map(line => {
      let x = 0;
      for (const ch of line) { const g = font.g[ch] || font.g['?']; if (g) x += g.a + track; }
      return Math.max(0, x - (line.length ? track : 0));
    });
    maxW = Math.max(0, ...widths);
    lines.forEach((line, li) => {
      let x = o.align === 'right' ? maxW - widths[li] : o.align === 'left' ? 0 : (maxW - widths[li]) / 2;
      const y = -li * lineH;
      for (const ch of line) {
        const g = font.g[ch] || font.g['?'];
        if (!g) continue;
        for (const c of g.c) {
          const p = [];
          for (let i = 0; i < c.length; i += 2) p.push([(c[i] + x) * s, (c[i + 1] + y) * s]);
          all.push(p);
        }
        x += g.a + track;
      }
    });
    if (!all.length) return null;
    let cs = polys(all);
    if (o.mirror) cs = cs.mirror([1, 0]);
    return cs;
  }
  /** text centred on the origin, optionally squeezed to a max width */
  function textFit(font, str, o = {}) {
    let cs = text(font, str, o);
    if (!cs || cs.isEmpty()) return null;
    let [w, h] = size2(cs);
    if (o.maxW && w > o.maxW) { const k = o.maxW / w; cs = cs.scale([k, o.squashY === false ? k : 1]); [w, h] = size2(cs); }
    if (o.maxH && h > o.maxH) { const k = o.maxH / h; cs = cs.scale([k, k]); }
    return center2(cs);
  }

  /* ---------------- 3D ---------------- */
  const box = (w, d, h, center = false) => M.cube([w, d, h], false).translate(center ? [-w / 2, -d / 2, -h / 2] : [-w / 2, -d / 2, 0]);
  const cyl = (r, h, seg = 0, r2) => M.cylinder(h, r, r2 ?? r, seg || segFor(Math.max(r, r2 ?? r)));
  const sphere = (r, seg = 0) => M.sphere(r, seg || segFor(r));
  const extrude = (cs, h, o = {}) => cs.extrude(h, o.div ?? 0, o.twist ?? 0, o.scaleTop ?? [1, 1], false);
  const revolve = (cs, seg = 96, deg = 360) => cs.revolve(seg, deg);
  const union = (list) => { const l = list.filter(Boolean); return l.length ? (l.length === 1 ? l[0] : M.union(l)) : null; };
  const hull = (list) => M.hull(list);
  const empty = () => M.cube([0, 0, 0]);
  /** a rounded slab: rounded-rectangle outline, straight sides */
  const slab = (w, d, h, r = 0) => extrude(rrect(w, d, r), h);
  /** a 2D shape grown into a slab with a chamfered top edge */
  function chamferSlab(cs, h, ch) {
    if (ch <= 0) return extrude(cs, h);
    const top = cs.offset(-ch, 'Round');
    if (top.isEmpty()) return extrude(cs, h);
    return M.hull([extrude(cs, Math.max(h - ch, 0.01)), extrude(top, h)]);
  }

  /** a slab whose top and bottom edges are rounded (or chamfered) in a few steps, keeping concave outlines intact */
  function softSlab(cs, h, r, o = {}) {
    r = Math.max(0, Math.min(r, h / 2 - 0.01));
    if (r < 0.05) return extrude(cs, h);
    const steps = o.steps ?? Math.max(2, Math.min(6, Math.round(r / 0.25))), round = o.chamfer ? false : true;
    const parts = [], dz = r / steps;
    const inset = (t) => round ? r * (1 - Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)))) : r * (1 - t);   // t: 0 at the edge → 1 at full width
    for (let i = 0; i < steps; i++) {
      const off = inset((i + 0.5) / steps);
      const c = off > 1e-3 ? cs.offset(-off, 'Round') : cs;
      if (c.isEmpty()) continue;
      if (o.bottom !== false) parts.push(extrude(c, dz + 0.001).translate([0, 0, i * dz]));
      if (o.top !== false) parts.push(extrude(c, dz + 0.001).translate([0, 0, h - (i + 1) * dz]));
    }
    const lo = o.bottom === false ? 0 : r, hi = o.top === false ? h : h - r;
    parts.push(extrude(cs, hi - lo).translate([0, 0, lo]));
    return M.union(parts);
  }

  /* ---------------- threads ----------------
     60° V thread built as a twisted extrusion of a cam-shaped cross-section,
     which gives a true single-start helix. Right-handed. External threads
     come out at `major`; for a nut, subtract thread({ ..., major: major + 2·clearance }). */
  function thread({ major, pitch, length, depth, seg = 120, lead = true }) {
    depth = depth ?? 0.6134 * pitch;
    const R = major / 2, r0 = R - depth, crest = 0.125, root = 0.25;   // flat fractions of the pitch
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const f = i / seg;                       // position along one pitch as we go round once
      const u = f < 0.5 ? f : 1 - f;           // 0..0.5..0
      const flank = (0.5 - crest / 2 - root / 2);
      let t = (u - root / 2) / flank; t = clamp(t, 0, 1);
      const r = r0 + depth * t;
      const a = TAU * f;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const div = Math.max(8, Math.ceil(length / pitch * 24));
    let m = extrude(poly(pts), length, { div, twist: 360 * length / pitch });
    if (lead) {                                // chamfer both ends so the thread starts cleanly
      const c = Math.min(depth * 1.2, length / 4);
      const cone = union([cyl(r0, c, 0, R + 0.01), cyl(R + 0.01, Math.max(length - 2 * c, 0.01)).translate([0, 0, c]), cyl(R + 0.01, c, 0, r0).translate([0, 0, length - c])]);
      m = m.intersect(cone);
    }
    return m;
  }
  /** the hole for a threaded part: thread of the mating size plus clearance */
  const threadHole = (o) => thread({ ...o, major: o.major + 2 * (o.clearance ?? 0.2), lead: false }).translate([0, 0, -0.01]);

  /* ---------------- placement ---------------- */
  const bb = (m) => { const b = m.boundingBox(); return { min: b.min, max: b.max, w: b.max[0] - b.min[0], d: b.max[1] - b.min[1], h: b.max[2] - b.min[2] }; };
  /** put a part on the bed (min Z = 0), centred in X/Y if asked */
  function onBed(m, centre = true) {
    const b = m.boundingBox();
    return m.translate([centre ? -(b.min[0] + b.max[0]) / 2 : 0, centre ? -(b.min[1] + b.max[1]) / 2 : 0, -b.min[2]]);
  }
  /** lay several parts out in rows (they keep their own Z) */
  function layout(parts, gap = 6, maxW = 250) {
    let x = 0, y = 0, rowH = 0;
    return parts.map(p => {
      const b = bb(p);
      if (x > 0 && x + b.w > maxW) { x = 0; y += rowH + gap; rowH = 0; }
      const out = p.translate([x - b.min[0], y - b.min[1], 0]);
      x += b.w + gap; rowH = Math.max(rowH, b.d);
      return out;
    });
  }

  /** Manifold → plain arrays for the main thread */
  function toMesh(m) {
    const g = m.getMesh(), np = g.numProp, vp = g.vertProperties;
    const nv = vp.length / np, pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { pos[i * 3] = vp[i * np]; pos[i * 3 + 1] = vp[i * np + 1]; pos[i * 3 + 2] = vp[i * np + 2]; }
    return { pos, idx: new Uint32Array(g.triVerts) };
  }

  return {
    M, CS, poly, polys, circle, rect, rrect, rrectPts, regular, star, heart, shield, arch, ellipse, fit, center2, size2,
    text, textFit, box, cyl, sphere, extrude, revolve, union, hull, empty, slab, chamferSlab, softSlab, thread, threadHole,
    bb, onBed, layout, toMesh, free,
  };
}

/* ---------------- control schema helpers (shared by every generator module) ---------------- */
export const R = (k, label, min, max, step, def, unit = 'mm', extra = {}) => ({ k, label, type: 'range', min, max, step, def, unit, ...extra });
export const S = (k, label, options, def, extra = {}) => ({ k, label, type: 'select', options, def, ...extra });
export const B = (k, label, def, extra = {}) => ({ k, label, type: 'toggle', def, ...extra });
export const X = (k, label, def, extra = {}) => ({ k, label, type: 'text', def, ...extra });
export const C = (k, label, def, extra = {}) => ({ k, label, type: 'color', def, ...extra });
export const F = (k, label, def = 'inter', extra = {}) => ({ k, label, type: 'font', def, ...extra });
export const U = (k, label, extra = {}) => ({ k, label, type: 'upload', def: '', ...extra });

/* fonts shipped with the site (all open licences, see /assets/fonts/outlines/LICENSES.txt) */
export const FONTS = [
  ['inter', 'Inter (bold sans)'], ['bebas', 'Bebas Neue (tall caps)'], ['slab', 'Roboto Slab (serif)'], ['fredoka', 'Fredoka (rounded)'],
  ['mono', 'JetBrains Mono (monospace)'], ['blackops', 'Black Ops One (stencil-style)'], ['stencil', 'Allerta Stencil'],
  ['lobster', 'Lobster (bold script)'], ['pacifico', 'Pacifico (brush script)'], ['dancing', 'Dancing Script (calligraphy)'],
  ['greatvibes', 'Great Vibes (formal calligraphy)'],
];
/* filament-like preview colours */
export const PALETTE = { white: '#f2f4f7', black: '#23262b', grey: '#8a939e', red: '#d63b32', orange: '#f3662e', yellow: '#f5c542',
  green: '#3e9b4f', teal: '#1ea39a', blue: '#1182c9', navy: '#1c2f6b', purple: '#7a4fc9', pink: '#e86fa6', brown: '#8a5a3b',
  gold: '#d6a93a', silver: '#c9ced6', wood: '#c89a64' };
