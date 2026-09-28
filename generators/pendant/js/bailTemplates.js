// Connector-bail designs, authored as height maps: alpha = outline, grey = relief.
// Drawn on a 1024² canvas centred at the origin (y down), body spanning roughly y ∈ [−450, 450].
// Heights combine like real metalwork: 'lighten' adds raised features (max), 'darken' cuts grooves (min).
import { grey, facet, dome, polar } from './samples.js';

export const BAIL_TEMPLATES = [
  ['classic', 'Teardrop'], ['leaf', 'Leaf'], ['heart', 'Heart'], ['crown', 'Crown'], ['shield', 'Shield'], ['star', 'Star'],
  ['gem', 'Emerald'], ['flame', 'Flame'], ['moon', 'Moon'], ['pill', 'Cartouche'], ['fleur', 'Fleur-de-lis'], ['wing', 'Winged heart'],
  ['custom', 'Your image'],
];

const TAU = Math.PI * 2;

// ── Geometry ───────────────────────────────────────────────
const cubic = (a, b, c, d, n = 28) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
  }
  return out;
};
const ellipsePts = (cx, cy, rx, ry, n = 120) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(i / n * TAU), cy + ry * Math.sin(i / n * TAU)]);
const toPath = (pts, closed = true) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); if (closed) p.closePath(); return p; };
const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; s += x0 * y1 - x1 * y0; } return s / 2; };
// Inset a dense closed polyline by d (inward), using averaged vertex normals.
function offset(pts, d) {
  const n = pts.length, s = Math.sign(area(pts));
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return [p[0] - s * ty / l * d, p[1] + s * tx / l * d];
  });
}
// Evenly spaced points along a polyline.
function resample(pts, spacing, closed = true) {
  const segs = closed ? pts.length : pts.length - 1, out = [];
  let carry = 0;
  for (let i = 0; i < segs; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], L = Math.hypot(x1 - x0, y1 - y0);
    let t = carry;
    while (t < L) { out.push([x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L]); t += spacing; }
    carry = t - L;
  }
  return out;
}

// ── Relief primitives ──────────────────────────────────────
const asPath = (x, closed) => (x instanceof Path2D ? x : toPath(x, closed));
// Chamfer that lowers heights towards an outline (darken = only ever cuts down).
function bevel(g, path, w, hOut, steps = 22) {
  g.globalCompositeOperation = 'darken';
  for (let i = 0; i <= steps; i++) { const f = 1 - i / steps; g.lineWidth = Math.max(0.5, 2 * w * f); g.strokeStyle = grey(hOut + (1 - hOut) * f); g.stroke(path); }
  g.globalCompositeOperation = 'source-over';
}
// Raised rounded wire (half-round profile) along a path.
function ridge(g, x, width, h, closed = false, hb = 0.2) {
  const path = asPath(x, closed);
  g.globalCompositeOperation = 'lighten';
  for (let i = 0; i <= 12; i++) { const f = 1 - i / 12; g.lineWidth = Math.max(0.5, width * f); g.strokeStyle = grey(hb + (h - hb) * Math.sqrt(1 - f * f)); g.stroke(path); }
  g.globalCompositeOperation = 'source-over';
}
// Engraved V-groove along a path.
function groove(g, x, width, hBottom, closed = false) {
  const path = asPath(x, closed);
  g.globalCompositeOperation = 'darken';
  for (let i = 0; i <= 10; i++) { const f = 1 - i / 10; g.lineWidth = Math.max(0.5, width * f); g.strokeStyle = grey(hBottom + (1 - hBottom) * f); g.stroke(path); }
  g.globalCompositeOperation = 'source-over';
}
// Milgrain: a row of tiny domed beads.
function beads(g, pts, spacing, r, h0, h1, closed = true, skip = null) {
  g.globalCompositeOperation = 'lighten';
  for (const [x, y] of resample(pts, spacing, closed)) if (!skip || !skip(x, y)) dome(g, x, y, r, r, 0, h0, h1);
  g.globalCompositeOperation = 'source-over';
}
// Round brilliant: octagonal table, star facets and kite facets — every face exactly planar.
function brilliant(g, x, y, r, h0 = 0.55, h1 = 1, bezelH = null) {
  g.save(); g.translate(x, y);
  if (bezelH !== null) ridge(g, ellipsePts(0, 0, r + 12, r + 12), 26, bezelH, true);
  g.fillStyle = grey(h0); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  const rt = r * 0.52, hs = h0 + (h1 - h0) * 0.55, P = (rad, a) => [rad * Math.cos(a), rad * Math.sin(a)];
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, a1 = a + TAU / 8, m = a + TAU / 16, mp = a - TAU / 16;
    facet(g, [P(rt, a), P(rt, a1), P(r, m)], [h1, h1, hs]);            // star facet
    facet(g, [P(rt, a), P(r, mp), P(r, a)], [h1, hs, h0]);            // kite, left half
    facet(g, [P(rt, a), P(r, a), P(r, m)], [h1, h0, hs]);             // kite, right half
  }
  g.fillStyle = grey(h1); g.beginPath(); for (let i = 0; i < 8; i++) { const [px, py] = P(rt, i * TAU / 8); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); g.fill();
  g.restore();
}
// Cabochon in a bezel cup, optionally with four claw prongs.
function cabochon(g, x, y, rx, ry, h0, h1, prongs = false) {
  ridge(g, ellipsePts(x, y, rx + 14, ry + 14), 30, Math.min(1, h0 + 0.22), true);
  dome(g, x, y, rx, ry, 0, h0, h1);
  if (prongs) { g.globalCompositeOperation = 'lighten'; for (const a of [0.785, 2.356, 3.927, 5.498]) dome(g, x + (rx + 12) * Math.cos(a), y + (ry + 12) * Math.sin(a), 20, 20, 0, h0 + 0.2, Math.min(1, h1 + 0.02)); g.globalCompositeOperation = 'source-over'; }
}
// Spiral curl (filigree scroll end).
const spiral = (cx, cy, r0, grow, turns, dir = 1, a0 = 0) => Array.from({ length: 80 }, (_, i) => { const t = i / 79 * turns * TAU; const r = r0 + grow * t; return [cx + dir * r * Math.cos(a0 + t), cy + r * Math.sin(a0 + t)]; });
// Faceted 4-point sparkle star.
function sparkle(g, x, y, r, h0, h1) { g.save(); g.translate(x, y); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; facet(g, [[0, 0], polar(r, a), polar(r * 0.3, a + Math.PI / 4)], [h1, h0, h0]); facet(g, [[0, 0], polar(r, a), polar(r * 0.3, a - Math.PI / 4)], [h1, h0, h0]); } g.restore(); }

// ── Outlines ───────────────────────────────────────────────
const dropPts = () => Array.from({ length: 360 }, (_, i) => { const t = i / 360 * TAU; return [300 * Math.sin(t) * Math.abs(Math.sin(t / 2)) ** 1.1, 440 * Math.cos(t)]; });
const heartPts = () => Array.from({ length: 360 }, (_, i) => { const t = i / 360 * TAU; return [19 * 16 * Math.sin(t) ** 3, -19 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - 60]; });
const leafW = (t) => 285 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.8 * (1.12 - 0.35 * t);
function leafPts() {
  const N = 240, R = [], serr = (t) => (t < 0.08 || t > 0.94 ? 1 : 0.95 + 0.08 * ((t * 9 + 0.3) % 1) ** 1.6);
  for (let i = 0; i <= N; i++) { const t = i / N; R.push([leafW(t) * serr(t), -440 + 880 * t]); }
  return [...R, ...R.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
}
const shieldPts = () => [[-300, -430], ...Array.from({ length: 30 }, (_, i) => [-300 + 600 * i / 30, -430]), [300, -430], [300, 60],
  ...cubic([300, 60], [300, 300], [150, 400], [0, 450]), ...cubic([0, 450], [-150, 400], [-300, 300], [-300, 60])];
const starPts = () => Array.from({ length: 10 }, (_, i) => polar(i % 2 ? 195 : 460, i * Math.PI / 5));
const flamePts = () => [...cubic([0, -450], [150, -250], [330, -80], [300, 150]), ...cubic([300, 150], [280, 350], [140, 440], [0, 440]),
  ...cubic([0, 440], [-140, 440], [-280, 350], [-300, 150]), ...cubic([-300, 150], [-330, -80], [-150, -250], [0, -450])];
const pillPts = () => [...Array.from({ length: 60 }, (_, i) => [230 * Math.cos(Math.PI + i / 60 * Math.PI), -210 + 230 * Math.sin(Math.PI + i / 60 * Math.PI)]),
  ...Array.from({ length: 60 }, (_, i) => [230 * Math.cos(i / 60 * Math.PI), 210 + 230 * Math.sin(i / 60 * Math.PI)])];
function moonPts() {
  const R = 440, c2 = [150, -110], r = 360, d = Math.hypot(...c2);
  const a = (R * R - r * r + d * d) / (2 * d), h = Math.sqrt(R * R - a * a), ux = c2[0] / d, uy = c2[1] / d;
  const P1 = [a * ux - h * uy, a * uy + h * ux], P2 = [a * ux + h * uy, a * uy - h * ux];
  let t1 = Math.atan2(P1[1], P1[0]), t2 = Math.atan2(P2[1], P2[0]); if (t2 < t1) t2 += TAU;
  let s1 = Math.atan2(P1[1] - c2[1], P1[0] - c2[0]); const s2 = Math.atan2(P2[1] - c2[1], P2[0] - c2[0]); if (s1 > s2) s1 -= TAU;
  const out = [];
  for (let i = 0; i <= 150; i++) { const t = t1 + (t2 - t1) * i / 150; out.push([R * Math.cos(t), R * Math.sin(t)]); }
  for (let i = 1; i < 120; i++) { const s = s2 + (s1 - s2) * i / 120; out.push([c2[0] + r * Math.cos(s), c2[1] + r * Math.sin(s)]); }
  return out;
}
const OCT = { A: 250, B: 370, C: 95 };
const octPts = (k = 1) => { const { A, B, C } = OCT; return [[-A + C, -B], [A - C, -B], [A, -B + C], [A, B - C], [A - C, B], [-A + C, B], [-A, B - C], [-A, -B + C]].map(([x, y]) => [x * k, y * k]); };
const CROWN_TIPS = [[-300, -230], [-150, -290], [0, -360], [150, -290], [300, -230]];
function crownPts() {
  const pts = [[-300, 400], [-300, -230]];
  for (let i = 0; i < 4; i++) { const [a, b] = [CROWN_TIPS[i], CROWN_TIPS[i + 1]]; pts.push(...cubic(a, [a[0] + 40, 60], [b[0] - 40, 60], b, 24).slice(1)); }
  pts.push([300, -230], [300, 400]);
  return pts;
}
// Feather: an almond vane from base B to tip T (world Path2D + local-frame painter).
function featherFrame(B, T) { const len = Math.hypot(T[0] - B[0], T[1] - B[1]); return { len, ang: Math.atan2(T[1] - B[1], T[0] - B[0]) - Math.PI / 2 }; }
function featherLocal(len, wid) { const p = new Path2D(); p.moveTo(0, 0); p.quadraticCurveTo(wid, len * 0.42, 0, len); p.quadraticCurveTo(-wid, len * 0.42, 0, 0); p.closePath(); return p; }
function featherPath(B, T, wid) { const { len, ang } = featherFrame(B, T); const p = new Path2D(); p.addPath(featherLocal(len, wid), new DOMMatrix().translate(B[0], B[1]).rotate(ang * 180 / Math.PI)); return p; }
function paintFeather(g, B, T, wid, h0, h1) {
  const { len, ang } = featherFrame(B, T), local = featherLocal(len, wid);
  g.save(); g.translate(B[0], B[1]); g.rotate(ang); g.clip(local);
  const gr = g.createLinearGradient(-wid * 0.55, 0, wid * 0.55, 0);
  gr.addColorStop(0, grey(h0)); gr.addColorStop(0.5, grey(h1)); gr.addColorStop(1, grey(h0));
  g.fillStyle = gr; g.fillRect(-wid, -10, wid * 2, len + 20);
  g.globalCompositeOperation = 'darken'; g.strokeStyle = grey(h1 - 0.1); g.lineWidth = 5;
  for (let y = len * 0.12; y < len * 0.95; y += 24) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, y); g.lineTo(s * wid, y + 34); g.stroke(); }
  g.strokeStyle = grey(h0 - 0.08); g.lineWidth = 12; g.stroke(local);                   // crisp edge where feathers overlap
  g.globalCompositeOperation = 'lighten'; g.strokeStyle = grey(Math.min(1, h1 + 0.06)); g.lineWidth = 11;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, len * 0.96); g.stroke();                  // rachis (quill)
  g.restore(); g.globalCompositeOperation = 'source-over';
}
// Winged heart: two swept wings on arched arm bones, three feather rows each, heart in front.
const armPts = (s) => cubic([s * 120, -70], [s * 190, -250], [s * 280, -320], [s * 335, -290], 40).concat([[s * 335, -290]]);
const armAt = (s, u) => { const A = armPts(s); return A[Math.min(A.length - 1, Math.round(u * (A.length - 1)))]; };
function wingRow(s, n, lenA, lenB, angA, angB, wid, u0 = 0.05, u1 = 1) {
  return Array.from({ length: n }, (_, k) => {
    const u = u0 + (u1 - u0) * k / (n - 1), B = armAt(s, u), a = (angA + (angB - angA) * u) * Math.PI / 180, L = lenA + (lenB - lenA) * u;
    return [B, [B[0] + s * L * Math.sin(a), B[1] + L * Math.cos(a)], wid];
  });
}
const WING = {
  prim: [...wingRow(1, 7, 210, 330, 6, 30, 66), ...wingRow(-1, 7, 210, 330, 6, 30, 66)],
  sec: [...wingRow(1, 7, 150, 230, 2, 22, 58, 0.08, 0.9), ...wingRow(-1, 7, 150, 230, 2, 22, 58, 0.08, 0.9)],
  cov: [...wingRow(1, 8, 95, 120, 10, 30, 52, 0.05, 0.95), ...wingRow(-1, 8, 95, 120, 10, 30, 52, 0.05, 0.95)],
};
const armRibbon = (s) => { const A = armPts(s); return [...A.map(([x, y]) => [x, y - 26]), ...A.slice().reverse().map(([x, y]) => [x, y + 26])]; };
const wingHeartPts = () => heartPts().map(([x, y]) => [x * 0.5, y * 0.5 + 130]);// Fleur-de-lis parts (right-hand parts are mirrored).
const FLEUR = {
  petal: () => [...cubic([0, -450], [55, -360], [120, -200], [75, 40]), [75, 40], ...cubic([-75, 40], [-120, -200], [-55, -360], [0, -450])],
  side: (s) => [...cubic([70, 70], [140, -40], [250, -170], [360, -110]), ...cubic([360, -110], [430, -70], [400, 40], [330, 40]),
    ...cubic([330, 40], [280, 40], [270, -10], [300, -40]), ...cubic([300, -40], [240, -60], [170, 20], [150, 80])].map(([x, y]) => [s * x, y]),
  tail: () => [...cubic([-55, 140], [-60, 260], [-20, 360], [0, 440]), ...cubic([0, 440], [20, 360], [60, 260], [55, 140])],
  sideTail: (s) => [...cubic([60, 140], [150, 160], [230, 230], [230, 330]), ...cubic([230, 330], [200, 270], [130, 230], [40, 230])].map(([x, y]) => [s * x, y]),
};

// ── Designs ────────────────────────────────────────────────
const DESIGNS = {
  classic: {
    paths: () => [toPath(dropPts())], base: 0.42, bevel: [44, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; dome(g, 0, -140, 235, 300, 0, 0.42, 0.58); g.globalCompositeOperation = 'source-over';
      for (const s of [-1, 1]) {
        ridge(g, [...cubic([0, 330], [s * 30, 240], [s * 150, 215], [s * 128, 70]), ...spiral(s * 100, 72, 30, -3.2, 0.7, s, 0)], 20, 0.8);
        ridge(g, cubic([0, 330], [s * 20, 300], [s * 72, 330], [s * 84, 270]), 15, 0.74);
      }
      cabochon(g, 0, -175, 100, 118, 0.62, 1);
      brilliant(g, 0, 160, 44, 0.55, 0.92, 0.75);
    },
    after(g) { beads(g, offset(dropPts(), 60), 40, 13, 0.45, 0.8); },
  },
  leaf: {
    paths: () => [toPath(leafPts())], base: 0.35, bevel: [18, 0.12],
    paint(g) {
      for (let k = 0; k < 14; k++) {
        const t0 = k / 14, t1 = (k + 1) / 14, y0 = -440 + 880 * t0, y1 = -440 + 880 * t1, hm0 = 0.88 - 0.28 * t0, hm1 = 0.88 - 0.28 * t1;
        for (const s of [-1, 1]) {
          const e0 = [s * leafW(t0) * 1.1, y0], e1 = [s * leafW(t1) * 1.1, y1];
          facet(g, [[0, y0], [0, y1], e1], [hm0, hm1, 0.22]); facet(g, [[0, y0], e1, e0], [hm0, 0.22, 0.22]);
        }
      }
      for (let i = 0; i < 8; i++) {
        const y0 = -370 + i * 92, t = (y0 + 560) / 880, w = leafW(t) * 0.86;
        for (const s of [-1, 1]) {
          ridge(g, cubic([0, y0], [s * w * 0.3, y0 + 10], [s * w * 0.7, y0 + 60], [s * w, y0 + 130]), 18, 0.78 - i * 0.025);
          groove(g, cubic([s * 12, y0 + 46], [s * w * 0.3, y0 + 56], [s * w * 0.6, y0 + 96], [s * w * 0.8, y0 + 160]), 9, 0.5);
        }
      }
      ridge(g, [[0, -450], [0, 430]], 34, 1);
    },
  },
  heart: {
    paths: () => [toPath(heartPts())], base: 0.4, bevel: [40, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; dome(g, 0, -40, 330, 320, 0, 0.4, 0.8); g.globalCompositeOperation = 'source-over';
      for (const s of [-1, 1]) {
        const sp = spiral(s * 145, -170, 12, 8.5, 1.4, s, Math.PI);
        ridge(g, sp, 18, 0.92);
        ridge(g, cubic(sp[sp.length - 1], [s * 250, -20], [s * 130, 120], [0, 215]), 16, 0.86);
      }
      brilliant(g, 0, -30, 76, 0.55, 1, 0.82);
    },
    after(g) { beads(g, offset(heartPts(), 58), 40, 13, 0.45, 0.8, true, (x, y) => Math.hypot(x, y + 155) < 95); },
  },
  crown: {
    paths: () => [toPath(crownPts()), ...CROWN_TIPS.map(([x, y]) => toPath(ellipsePts(x, y - 8, 44, 44)))], base: 0.45, bevel: [22, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; dome(g, 0, 90, 310, 270, 0, 0.45, 0.62); g.globalCompositeOperation = 'source-over';
      g.save(); g.beginPath(); g.rect(-320, -380, 640, 550); g.clip();                  // quilted velvet cap
      for (let k = -900; k < 900; k += 46) { groove(g, [[k, -400], [k + 600, 200]], 7, 0.5); groove(g, [[k, -400], [k - 600, 200]], 7, 0.5); }
      g.restore();
      for (const [x, y] of CROWN_TIPS) {
        g.globalCompositeOperation = 'lighten';
        facet(g, [[x - 75, 175], [x, 175], [x, y]], [0.5, 0.86, 0.76]); facet(g, [[x, 175], [x + 75, 175], [x, y]], [0.86, 0.5, 0.76]);
        g.globalCompositeOperation = 'source-over';
        beads(g, [[x, 150], [x, y + 60]], 44, 12, 0.7, 0.95, false);
        dome(g, x, y - 8, 44, 44, 0, 0.6, 1);
      }
      g.fillStyle = grey(0.72); g.fillRect(-305, 170, 610, 232);
      beads(g, [[-290, 192], [290, 192]], 34, 13, 0.72, 0.98, false);
      beads(g, [[-290, 380], [290, 380]], 34, 13, 0.72, 0.98, false);
      cabochon(g, 0, 286, 56, 64, 0.72, 1);
      for (const s of [-1, 1]) { brilliant(g, s * 170, 286, 50, 0.7, 1, 0.86); g.globalCompositeOperation = 'lighten'; dome(g, s * 88, 286, 18, 18, 0, 0.72, 0.95); dome(g, s * 252, 286, 18, 18, 0, 0.72, 0.95); g.globalCompositeOperation = 'source-over'; }
    },
  },
  shield: {
    paths: () => [toPath(shieldPts())], base: 0.5, bevel: [46, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; g.fillStyle = grey(0.72); g.fillRect(-42, -500, 84, 1000); g.fillRect(-400, -122, 800, 84); g.globalCompositeOperation = 'source-over';
      for (const x of [-42, 42]) ridge(g, [[x, -440], [x, 460]], 14, 0.84);
      for (const y of [-122, -38]) ridge(g, [[-310, y], [310, y]], 14, 0.84);
      const diaper = (x0, y0, x1, y1) => {
        g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.globalCompositeOperation = 'lighten';
        for (let y = y0 + 35; y < y1; y += 70) for (let x = x0 + 35; x < x1; x += 70) for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2; facet(g, [[x, y], [x + 26 * Math.sin(a), y - 26 * Math.cos(a)], [x + 26 * Math.sin(a + Math.PI / 2), y - 26 * Math.cos(a + Math.PI / 2)]], [0.68, 0.5, 0.5]);
        }
        g.restore(); g.globalCompositeOperation = 'source-over';
      };
      diaper(-320, -440, -50, -130); diaper(50, -30, 320, 460);
      sparkle(g, 170, -280, 95, 0.52, 0.82);
      g.globalCompositeOperation = 'lighten';
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; dome(g, -170 + 44 * Math.cos(a), 150 + 44 * Math.sin(a), 32, 32, 0, 0.5, 0.74); }
      dome(g, -170, 150, 26, 26, 0, 0.6, 0.86); g.globalCompositeOperation = 'source-over';
      brilliant(g, 0, -80, 70, 0.6, 1, 0.86);
      groove(g, offset(shieldPts(), 84), 14, 0.36, true);
    },
    after(g) { beads(g, offset(shieldPts(), 60), 32, 10, 0.4, 0.72); },
  },
  star: {
    paths: () => [toPath(starPts())], base: 0.2, bevel: [24, 0.12],
    paint(g) {
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; facet(g, [[0, 0], polar(470, a), polar(196, a - Math.PI / 5)], [1, 0.3, 0.2]); facet(g, [[0, 0], polar(470, a), polar(196, a + Math.PI / 5)], [1, 0.3, 0.2]); }
      groove(g, offset(starPts().flatMap((p, i, arr) => resample([p, arr[(i + 1) % arr.length]], 8, false)), 48), 12, 0.42, true);
      brilliant(g, 0, 0, 96, 0.6, 1, 0.9);
    },
  },
  gem: {
    paths: () => { const { A, B, C } = OCT; return [toPath(octPts()), ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => toPath(ellipsePts(sx * (A - C / 2), sy * (B - C / 2), 46, 46)))]; },
    base: 0.3, bevel: [14, 0.2],
    paint(g) {
      const ks = [1, 0.84, 0.69, 0.55], hs = [0.3, 0.56, 0.76, 0.92];
      for (let r = 0; r < 3; r++) {
        const O = octPts(ks[r]), I = octPts(ks[r + 1]);
        for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; facet(g, [O[i], O[j], I[j]], [hs[r], hs[r], hs[r + 1]]); facet(g, [O[i], I[j], I[i]], [hs[r], hs[r + 1], hs[r + 1]]); }
      }
      g.fillStyle = grey(0.97); g.fill(toPath(octPts(0.55)));
    },
    after(g) { // claw prongs sit over the girdle bevel, gripping the stone
      const { A, B, C } = OCT;
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = sx * (A - C / 2), y = sy * (B - C / 2);
        g.globalCompositeOperation = 'lighten'; dome(g, x, y, 46, 46, 0, 0.55, 1);
        dome(g, x - sx * 34, y - sy * 34, 22, 22, 0, 0.7, 0.96); g.globalCompositeOperation = 'source-over';
      }
    },
  },
  flame: {
    paths: () => [toPath(flamePts())], base: 0.3, bevel: [26, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; dome(g, 0, 150, 320, 330, 0, 0.3, 0.6); g.globalCompositeOperation = 'source-over';
      for (const s of [-1, 1]) groove(g, cubic([s * 205, 210], [s * 262, 20], [s * 122, -120], [s * 40, -335]), 14, 0.4);
      for (const [k, dy, h0, h1] of [[0.66, 150, 0.6, 0.82], [0.38, 270, 0.82, 1]]) {
        const inner = toPath(flamePts().map(([x, y]) => [x * k, y * k + dy]));
        g.save(); g.clip(inner); dome(g, 0, 150 * k + dy, 320 * k, 340 * k, 0, h0, h1); g.restore();
        ridge(g, inner, 16, Math.min(1, h1 + 0.04), true);
      }
    },
  },
  moon: {
    paths: () => [toPath(moonPts())], base: 0.3, bevel: [24, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; dome(g, -150, 120, 420, 420, 0, 0.3, 0.95); g.globalCompositeOperation = 'source-over';
      g.globalCompositeOperation = 'darken';
      for (const [x, y, r] of [[-250, 60, 50], [-120, 250, 38], [-300, -130, 32], [-40, 355, 26], [-215, 305, 22], [-330, 170, 18]]) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, grey(0.45)); gr.addColorStop(0.75, grey(0.62)); gr.addColorStop(1, '#fff');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      for (const [x, y, r] of [[-250, 60, 53], [-120, 250, 41], [-300, -130, 35]]) ridge(g, ellipsePts(x, y, r, r, 60), 8, 0.9, true, 0.5);
      sparkle(g, -110, 90, 46, 0.62, 0.95);
    },
  },
  pill: {
    paths: () => [toPath(pillPts())], base: 0.42, bevel: [30, 0.15],
    paint(g) {
      g.globalCompositeOperation = 'lighten'; dome(g, 0, 0, 170, 380, 0, 0.42, 0.56); g.globalCompositeOperation = 'source-over';
      ridge(g, offset(pillPts(), 70), 22, 0.8, true);
      cabochon(g, 0, -60, 102, 136, 0.6, 1, true);
      brilliant(g, 0, 250, 46, 0.55, 0.92, 0.76);
      g.globalCompositeOperation = 'lighten'; dome(g, 0, -300, 28, 28, 0, 0.55, 0.9); g.globalCompositeOperation = 'source-over';
      for (const s of [-1, 1]) {
        ridge(g, [...cubic([s * 20, 175], [s * 95, 150], [s * 118, 235], [s * 72, 300]), ...spiral(s * 60, 285, 16, -2.2, 0.8, s, 0.5)], 14, 0.76);
        ridge(g, cubic([s * 22, -300], [s * 90, -330], [s * 120, -260], [s * 95, -215]), 12, 0.72);
      }
    },
    after(g) { beads(g, offset(pillPts(), 42), 34, 11, 0.4, 0.74); },
  },
  fleur: {
    paths: () => [toPath(FLEUR.petal()), toPath(FLEUR.side(1)), toPath(FLEUR.side(-1)), (() => { const p = new Path2D(); p.roundRect(-195, 60, 390, 82, 34); return p; })(),
      toPath(FLEUR.tail()), toPath(FLEUR.sideTail(1)), toPath(FLEUR.sideTail(-1))],
    base: 0.35, bevel: [18, 0.15],
    paint(g) {
      g.save(); g.clip(toPath(FLEUR.petal()));
      facet(g, [[0, -450], [0, 40], [-135, -150]], [0.72, 0.96, 0.34]); facet(g, [[0, -450], [0, 40], [135, -150]], [0.72, 0.96, 0.34]);
      g.restore();
      for (const s of [-1, 1]) {
        g.save(); g.clip(toPath(FLEUR.side(s))); dome(g, s * 250, -60, 190, 170, 0, 0.38, 0.84); g.restore();
        groove(g, cubic([s * 100, 50], [s * 185, -60], [s * 290, -150], [s * 352, -92]), 12, 0.46);
        g.save(); g.clip(toPath(FLEUR.sideTail(s))); dome(g, s * 150, 240, 110, 90, 0, 0.36, 0.7); g.restore();
      }
      g.save(); g.clip(toPath(FLEUR.tail())); dome(g, 0, 260, 70, 200, 0, 0.36, 0.78); g.restore();
      g.fillStyle = grey(0.8); g.beginPath(); g.roundRect(-195, 60, 390, 82, 34); g.fill();
      beads(g, [[-165, 101], [165, 101]], 38, 15, 0.8, 1, false);
    },
  },
  wing: {
    paths: () => [...Object.values(WING).flat().map(([B, T, w]) => featherPath(B, T, w)), toPath(armRibbon(1)), toPath(armRibbon(-1)), toPath(wingHeartPts())],
    base: 0.3,
    paint(g) {
      for (const [B, T, w] of WING.prim) paintFeather(g, B, T, w, 0.26, 0.52);
      for (const [B, T, w] of WING.sec) paintFeather(g, B, T, w, 0.4, 0.68);
      for (const [B, T, w] of WING.cov) paintFeather(g, B, T, w, 0.56, 0.82);
      for (const s of [-1, 1]) ridge(g, armPts(s), 54, 0.95, false, 0.5);
      const hp = toPath(wingHeartPts());
      g.save(); g.clip(hp); g.fillStyle = grey(0.5); g.fillRect(-200, -60, 400, 360); dome(g, 0, 150, 175, 165, 0, 0.55, 0.92); g.restore();
      bevel(g, hp, 22, 0.35);
      brilliant(g, 0, 140, 50, 0.6, 1, 0.9);
    },
  },
};
// ── Rendering ──────────────────────────────────────────────
function render(D) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; return c; };
  const cv = mk(), mask = mk();
  const mg = mask.getContext('2d'); mg.translate(512, 512); mg.fillStyle = '#fff';
  const paths = D.paths();
  for (const p of paths) mg.fill(p);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.translate(512, 512); g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = grey(D.base ?? 0.4); g.fillRect(-512, -512, 1024, 1024);
  D.paint(g);
  if (D.bevel) for (const p of paths) bevel(g, p, D.bevel[0], D.bevel[1]);
  D.after?.(g);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over';
  return cv;
}

const _cache = new Map();
export function templateCanvas(id) {
  if (!_cache.has(id)) _cache.set(id, render(DESIGNS[id] || DESIGNS.classic));
  return _cache.get(id);
}

// Small HUD icon: relief shading tinted gold, clipped to the outline.
export function drawTemplateIcon(cv, id, color = '#d6d9e0') {
  const g = cv.getContext('2d'), s = cv.width;
  g.clearRect(0, 0, s, s);
  if (id === 'custom') {
    g.strokeStyle = color; g.lineWidth = s * 0.06; g.setLineDash([s * 0.08, s * 0.06]);
    g.beginPath(); g.roundRect(s * 0.22, s * 0.12, s * 0.56, s * 0.76, s * 0.12); g.stroke(); g.setLineDash([]);
    g.fillStyle = color; g.font = `600 ${s * 0.34}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+', s / 2, s / 2 + s * 0.02);
    return;
  }
  const t = templateCanvas(id);
  g.drawImage(t, 0, 0, s, s);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, s, s);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(t, 0, 0, s, s);
  g.globalCompositeOperation = 'source-over';
}

// Full-size preview of one design (for inspection / thumbnails).
export function templatePreview(id) { return templateCanvas(id); }
