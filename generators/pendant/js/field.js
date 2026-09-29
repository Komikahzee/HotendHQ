import { traceOutline } from './imaging.js';
import { PATTERN_STYLES } from './params.js';

// Field builder: rasterises shape, image, text and bail into signed-distance and height grids (all in mm).
// Grid vertex (i, j) sits at world (x0 + i*c, y0 + j*c), y pointing up; the pendant is centred on the origin.

const INF = 1e20;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

// ── Canvas helpers ─────────────────────────────────────────
let _cv = null, _ctx = null;
function canvasFor(nx, ny) {
  if (!_cv) { _cv = document.createElement('canvas'); _ctx = _cv.getContext('2d', { willReadFrequently: true }); }
  if (_cv.width !== nx || _cv.height !== ny) { _cv.width = nx; _cv.height = ny; }
  _ctx.setTransform(1, 0, 0, 1, 0, 0);
  _ctx.globalCompositeOperation = 'source-over';
  _ctx.clearRect(0, 0, nx, ny);
  return _ctx;
}
// World (y-up) → canvas pixels, pixel centres on grid vertices.
function xformUp(ctx, L) { const s = 1 / L.c; ctx.setTransform(s, 0, 0, -s, -L.x0 * s + 0.5, L.yTop * s + 0.5); }
// Same mapping but y-down (world y' = -y), so text and images draw upright.
function xformDown(ctx, L) { const s = 1 / L.c; ctx.setTransform(s, 0, 0, s, -L.x0 * s + 0.5, L.yTop * s + 0.5); }

function readChannel(ctx, L, ch) {
  const { nx, ny } = L;
  const d = ctx.getImageData(0, 0, nx, ny).data;
  const out = new Float32Array(nx * ny);
  for (let py = 0; py < ny; py++) {
    const ro = py * nx * 4, go = (ny - 1 - py) * nx;
    for (let i = 0; i < nx; i++) out[go + i] = d[ro + i * 4 + ch] / 255;
  }
  return out;
}
// Supersampled coverage: draw(ctx, Ls) renders with the transforms of Ls (a finer copy of the layout), and
// each grid vertex gets the mean alpha of its ss×ss block — far more precise than one AA sample per cell.
function coverageSS(L, draw) {
  const { nx, ny, c } = L, ss = clamp(Math.floor(Math.sqrt(14e6 / (nx * ny))), 1, 4);
  if (ss === 1) { const ctx = canvasFor(nx, ny); draw(ctx, L); return readChannel(ctx, L, 3); }
  const W = nx * ss, H = ny * ss, cs = c / ss;
  const Ls = { ...L, nx: W, ny: H, c: cs, x0: L.x0 - 0.5 * c + 0.5 * cs, yTop: L.yTop + 0.5 * c - 0.5 * cs };
  const ctx = canvasFor(W, H); draw(ctx, Ls);
  const d = ctx.getImageData(0, 0, W, H).data, out = new Float32Array(nx * ny), inv = 1 / (ss * ss * 255);
  for (let py = 0; py < H; py++) {
    const gj = ny - 1 - ((py / ss) | 0), ro = py * W * 4;
    for (let px = 0; px < W; px++) out[gj * nx + ((px / ss) | 0)] += d[ro + px * 4 + 3];
  }
  for (let k = 0; k < out.length; k++) out[k] *= inv;
  return out;
}
function readRGBA(ctx, L) {
  const { nx, ny } = L;
  const d = ctx.getImageData(0, 0, nx, ny).data;
  const lum = new Float32Array(nx * ny), alpha = new Float32Array(nx * ny);
  for (let py = 0; py < ny; py++) {
    const ro = py * nx * 4, go = (ny - 1 - py) * nx;
    for (let i = 0; i < nx; i++) {
      const o = ro + i * 4;
      lum[go + i] = d[o] / 255; // source canvases are pre-converted to grey height in R
      alpha[go + i] = d[o + 3] / 255;
    }
  }
  return { lum, alpha };
}

// ── Euclidean distance transform (Felzenszwalb) ────────────
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
}
function edt2d(g, nx, ny) {
  const m = Math.max(nx, ny);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = g[j * nx + i];
    edt1d(f, ny, d, v, z);
    for (let j = 0; j < ny; j++) g[j * nx + i] = d[j];
  }
  for (let j = 0; j < ny; j++) {
    const o = j * nx;
    for (let i = 0; i < nx; i++) f[i] = g[o + i];
    edt1d(f, nx, d, v, z);
    for (let i = 0; i < nx; i++) g[o + i] = d[i];
  }
}
// ── Anti-aliased Euclidean distance transform ─────────────
// After Gustavson & Strand (2011): each boundary pixel's coverage and gradient give the sub-pixel position of
// the edge inside it, and distances are propagated to that edge rather than to pixel centres. Outlines, rims,
// holes and letter walls land within ~1/50 of a cell of the true curve, so walls come out smooth instead of
// carrying a faint pixel ripple.
function edgeDf(gx, gy, a) {
  if (gx === 0 || gy === 0) return 0.5 - a;
  const l = Math.sqrt(gx * gx + gy * gy);
  let x = Math.abs(gx / l), y = Math.abs(gy / l);
  if (x < y) { const t = x; x = y; y = t; }
  const a1 = 0.5 * y / x;
  if (a < a1) return 0.5 * (x + y) - Math.sqrt(2 * x * y * a);
  if (a < 1 - a1) return (0.5 - a) * x;
  return -0.5 * (x + y) + Math.sqrt(2 * x * y * (1 - a));
}
// Distance (cells) from outside pixels to the object edge; ≤ 0 inside. Sub-pixel exact within `band` cells of
// the edge; farther out the (much cheaper) pixel-centre distance is used, where nothing depends on precision.
function aaEdt(img, nx, ny, band = Infinity) {
  let far = null, farD = null;
  if (band < Math.max(nx, ny)) {
    const g = new Float64Array(nx * ny);
    for (let k = 0; k < g.length; k++) g[k] = img[k] > 0 ? 0 : INF;
    edt2d(g, nx, ny);
    far = new Uint8Array(g.length); farD = g;
    const b2 = (band + 1.5) ** 2;
    for (let k = 0; k < g.length; k++) if (g[k] > b2) far[k] = 1;
  }
  const n = nx * ny, gx = new Float32Array(n), gy = new Float32Array(n), R2 = Math.SQRT2;
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i, a = img[k];
    if (a <= 0 || a >= 1) continue;
    gx[k] = -img[k - nx - 1] - R2 * img[k - 1] - img[k + nx - 1] + img[k - nx + 1] + R2 * img[k + 1] + img[k + nx + 1];
    gy[k] = -img[k - nx - 1] - R2 * img[k - nx] - img[k - nx + 1] + img[k + nx - 1] + R2 * img[k + nx] + img[k + nx + 1];
  }
  const dist = new Float32Array(n), ox = new Int32Array(n), oy = new Int32Array(n);
  for (let k = 0; k < n; k++) { const a = img[k]; dist[k] = a <= 0 ? (far && far[k] ? -1 : 1e6) : a < 1 ? edgeDf(gx[k], gy[k], a) : 0; } // −1: frozen far pixel, skipped below
  // try neighbour q's closest edge pixel for pixel k (at i, j); returns 1 if it improved
  const test = (k, i, j, q) => {
    const cx = (q % nx) - ox[q], cy = ((q / nx) | 0) - oy[q];
    const c = cy * nx + cx; let a = img[c];
    if (a <= 0 || c < 0 || c >= n) return 0;
    if (a > 1) a = 1;
    const dx = i - cx, dy = j - cy, di = Math.sqrt(dx * dx + dy * dy);
    const nd = di + (di === 0 ? edgeDf(gx[c], gy[c], a) : edgeDf(dx, dy, a));
    if (nd < dist[k] - 1e-5) { dist[k] = nd; ox[k] = dx; oy[k] = dy; return 1; }
    return 0;
  };
  let changed = 1;
  for (let pass = 0; pass < 12 && changed; pass++) {
    changed = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i; if (dist[k] <= 0) continue;
        if (i > 0) changed |= test(k, i, j, k - 1);
        if (j > 0) { changed |= test(k, i, j, k - nx); if (i > 0) changed |= test(k, i, j, k - nx - 1); if (i < nx - 1) changed |= test(k, i, j, k - nx + 1); }
      }
      for (let i = nx - 2; i >= 0; i--) { const k = j * nx + i; if (dist[k] > 0) changed |= test(k, i, j, k + 1); }
    }
    for (let j = ny - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i; if (dist[k] <= 0) continue;
        if (i < nx - 1) changed |= test(k, i, j, k + 1);
        if (j < ny - 1) { changed |= test(k, i, j, k + nx); if (i > 0) changed |= test(k, i, j, k + nx - 1); if (i < nx - 1) changed |= test(k, i, j, k + nx + 1); }
      }
      for (let i = 1; i < nx; i++) { const k = j * nx + i; if (dist[k] > 0) changed |= test(k, i, j, k - 1); }
    }
  }
  if (far) for (let k = 0; k < n; k++) if (far[k]) dist[k] = Math.sqrt(farD[k]) - 0.5;
  return dist;
}
// Blurred or supersampled coverage → crisp one-cell anti-aliased coverage of its 0.5 iso-line, which is what
// the AA distance transform expects.
function crispCoverage(a, nx, ny) {
  const out = new Float32Array(a.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, v = a[k];
    if (v <= 0.002 || v >= 0.998 || i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { out[k] = v >= 0.5 ? 1 : 0; continue; }
    const g = Math.hypot(a[k + 1] - a[k - 1], a[k + nx] - a[k - nx]) / 2;
    out[k] = clamp(0.5 + (v - 0.5) / Math.max(g, 0.05), 0, 1);
  }
  return out;
}
// Signed distance (mm, negative inside) from anti-aliased coverage (blurred: coverage whose edge ramp is
// wider than a cell, e.g. a smoothed silhouette).
// bandMm: how far from the edge the distance must be sub-pixel exact (e.g. the rim width).
function sdfFromCoverage(a0, L, blurred = false, bandMm = Infinity) {
  const { nx, ny, c } = L, n = a0.length, a = blurred ? crispCoverage(a0, nx, ny) : a0, inv = new Float32Array(n);
  for (let k = 0; k < n; k++) inv[k] = 1 - a[k];
  const band = bandMm / c, dOut = aaEdt(a, nx, ny, band), dIn = aaEdt(inv, nx, ny, band), S = new Float32Array(n);
  for (let k = 0; k < n; k++) S[k] = (Math.max(0, dOut[k]) - Math.max(0, dIn[k])) * c;
  return S;
}

// ── Blur helpers (3× box ≈ gaussian) ───────────────────────
function boxPass(src, dst, nx, ny, r, horiz) {
  const len = horiz ? nx : ny, lines = horiz ? ny : nx, inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = horiz ? l * nx : l, step = horiz ? 1 : nx;
    let acc = 0;
    for (let t = -r; t <= r; t++) acc += src[base + clamp(t, 0, len - 1) * step];
    for (let t = 0; t < len; t++) {
      dst[base + t * step] = acc * inv;
      acc += src[base + Math.min(t + r + 1, len - 1) * step] - src[base + Math.max(t - r, 0) * step];
    }
  }
}
export function blur(a, nx, ny, sigmaCells) {
  if (sigmaCells < 0.35) return a.slice();
  const r = Math.max(1, Math.round(sigmaCells * 0.95));
  let A = a.slice(), B = new Float32Array(a.length);
  for (let it = 0; it < 3; it++) { boxPass(A, B, nx, ny, r, true); boxPass(B, A, nx, ny, r, false); }
  return A;
}

function boxMean(a, nx, ny, r) {
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  boxPass(a, t, nx, ny, r, true); boxPass(t, o, nx, ny, r, false);
  return o;
}
// Self-guided filter (He et al.): removes grain and pixel noise but keeps edges razor sharp. O(n).
export function guidedFilter(p, nx, ny, r, eps) {
  const n = p.length, pp = new Float32Array(n);
  for (let k = 0; k < n; k++) pp[k] = p[k] * p[k];
  const m = boxMean(p, nx, ny, r), m2 = boxMean(pp, nx, ny, r);
  const A = new Float32Array(n), Bv = new Float32Array(n);
  for (let k = 0; k < n; k++) { const v = m2[k] - m[k] * m[k]; A[k] = v / (v + eps); Bv[k] = m[k] - A[k] * m[k]; }
  const mA = boxMean(A, nx, ny, r), mB = boxMean(Bv, nx, ny, r), q = new Float32Array(n);
  for (let k = 0; k < n; k++) q[k] = mA[k] * p[k] + mB[k];
  return q;
}

// Mirror / kaleidoscope symmetry about the pendant centre.
function symmetrize(V, L, mode, N) {
  const { nx, ny, c, x0, y0 } = L, out = new Float32Array(V.length), wedge = Math.PI * 2 / N;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let x = x0 + i * c, y = y0 + j * c;
    if (mode === 'mirrorX' || mode === 'quad') x = -Math.abs(x);
    if (mode === 'mirrorY' || mode === 'quad') y = Math.abs(y);
    if (mode === 'radial') {
      const r = Math.hypot(x, y);
      let t = Math.atan2(x, y); // 0 = straight up, so the top is always a mirror axis
      t = ((t % wedge) + wedge) % wedge;
      if (t > wedge / 2) t = wedge - t;
      x = r * Math.sin(t); y = r * Math.cos(t);
    }
    out[j * nx + i] = sampleGrid(V, L, x, y);
  }
  return out;
}

function sampleGrid(G, L, x, y) {
  const fx = clamp((x - L.x0) / L.c, 0, L.nx - 1.001), fy = clamp((y - L.y0) / L.c, 0, L.ny - 1.001);
  const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = j * L.nx + i;
  return (G[k] * (1 - u) + G[k + 1] * u) * (1 - v) + (G[k + L.nx] * (1 - u) + G[k + L.nx + 1] * u) * v;
}

// ── Shapes ─────────────────────────────────────────────────
function normPts(pts, a, b) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sx = 2 * a / (x1 - x0), sy = 2 * b / (y1 - y0);
  return pts.map(([x, y]) => [(x - cx) * sx, (y - cy) * sy]);
}
function polyPath(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function roundedPoly(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const ux = p0[0] - p1[0], uy = p0[1] - p1[1], vx = p2[0] - p1[0], vy = p2[1] - p1[1];
    const l1 = Math.hypot(ux, uy), l2 = Math.hypot(vx, vy);
    const ang = Math.acos(clamp((ux * vx + uy * vy) / (l1 * l2), -1, 1));
    const t = Math.tan(ang / 2);
    let ri = r;
    if (ri / t > 0.5 * Math.min(l1, l2)) ri = 0.5 * Math.min(l1, l2) * t;
    if (ri < 1e-4) ctx.lineTo(p1[0], p1[1]); else ctx.arcTo(p1[0], p1[1], p2[0], p2[1], ri);
  }
  ctx.closePath();
}

export function shapeHalf(p) { const a = p.size / 2; return [a, p.shape === 'silhouette' ? a : a * p.aspect]; }

// Fills the outline in world coords (y up). Works at any scale, so it also draws the HUD icons.
export function fillShape(ctx, p, a, b) {
  ctx.save();
  ctx.rotate(-(p.shapeRotate || 0) * DEG);
  const m = Math.min(a, b);
  const sampled = (N, fn) => { const pts = []; for (let i = 0; i < N; i++) pts.push(fn(i / N * Math.PI * 2)); return normPts(pts, a, b); };
  switch (p.shape) {
    case 'roundrect':
      roundedPoly(ctx, [[-a, -b], [a, -b], [a, b], [-a, b]], p.corner * m); ctx.fill(); break;
    case 'polygon': {
      const pts = sampled(p.sides, (t) => [Math.cos(t + Math.PI / 2), Math.sin(t + Math.PI / 2)]);
      roundedPoly(ctx, pts, p.corner * m * 0.6); ctx.fill(); break;
    }
    case 'star': {
      const n = p.starPoints, pts = [];
      for (let i = 0; i < n * 2; i++) { const t = Math.PI / 2 + i * Math.PI / n, r = i % 2 ? p.starInner : 1; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
      const np = normPts(pts, a, b);
      roundedPoly(ctx, np, p.corner * m * 0.25); ctx.fill();
      if (p.starBalls) { // ball-tipped points, like a sheriff / police star
        const br = m * p.starBallSize;
        ctx.lineCap = 'round'; ctx.lineWidth = br * 1.1; ctx.strokeStyle = ctx.fillStyle;
        for (let i = 0; i < np.length; i += 2) {
          const [x, y] = np[i], l = Math.hypot(x, y) || 1, bx = x - x / l * br * 0.35, by = y - y / l * br * 0.35;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x * 0.6, y * 0.6); ctx.stroke(); // solid neck: the ball can never detach
        }
      }
      break;
    }
    case 'heart':
      polyPath(ctx, sampled(360, (t) => [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)])); ctx.fill(); break;
    case 'shield': {
      ctx.save(); ctx.scale(a, b);
      const r = clamp(p.corner, 0, 1) * 0.35;
      ctx.beginPath();
      ctx.moveTo(-1 + r, 1); ctx.lineTo(1 - r, 1); ctx.quadraticCurveTo(1, 1, 1, 1 - r);
      ctx.lineTo(1, 0.2); ctx.bezierCurveTo(1, -0.45, 0.45, -0.8, 0, -1);
      ctx.bezierCurveTo(-0.45, -0.8, -1, -0.45, -1, 0.2);
      ctx.lineTo(-1, 1 - r); ctx.quadraticCurveTo(-1, 1, -1 + r, 1); ctx.closePath();
      ctx.restore(); ctx.fill(); break;
    }
    case 'scallop': {
      const n = p.petals, dpt = p.petalDepth;
      polyPath(ctx, sampled(1440, (t) => { const r = 1 - dpt + dpt * Math.sqrt(Math.abs(Math.cos(n * t / 2))); return [r * Math.sin(t), r * Math.cos(t)]; }));
      ctx.fill(); break;
    }
    case 'gear': {
      const n = p.teeth, dpt = p.toothDepth;
      polyPath(ctx, sampled(n * 40, (t) => {
        const f = ((t * n / (Math.PI * 2)) % 1 + 1) % 1;
        const up = f < 0.12 ? f / 0.12 : f < 0.45 ? 1 : f < 0.57 ? 1 - (f - 0.45) / 0.12 : 0;
        const r = 1 - dpt + dpt * up; return [r * Math.sin(t), r * Math.cos(t)];
      }));
      ctx.fill(); break;
    }
    case 'drop':
      polyPath(ctx, sampled(360, (t) => [Math.sin(t) * Math.sin(t / 2) ** 1.25, Math.cos(t)])); ctx.fill(); break;
    case 'crescent':
      ctx.beginPath(); ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.ellipse(a * 0.42, b * 0.14, a * 0.82, b * 0.82, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'bone': {
      const rr = b * 0.5, cx = a - rr, cy = b - rr;
      ctx.beginPath(); ctx.rect(-cx, -b * 0.56, 2 * cx, b * 1.12); ctx.fill();
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * cx, sy * cy, rr, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    default:
      ctx.beginPath(); ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ── Image placement ────────────────────────────────────────
export function imageTransform(p, L, iw, ih) {
  const W = 2 * L.a, H = 2 * L.b;
  const s0 = (p.shape === 'silhouette' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih)) * p.imgZoom;
  return { s0 };
}
// Draws the source image (or, when given, a traced Path2D in image pixel space) with the user's placement.
function placeImage(ctx, src, p, L, path = null) {
  const iw = src.width, ih = src.height, { s0 } = imageTransform(p, L, iw, ih);
  xformDown(ctx, L);
  ctx.translate(p.imgX, -p.imgY);
  ctx.rotate(p.imgRotate * DEG);
  ctx.scale(s0 * (p.imgFlip ? -1 : 1), s0);
  ctx.translate(-iw / 2, -ih / 2);
  if (path) { ctx.fillStyle = '#fff'; ctx.fill(path, 'evenodd'); return; }
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0);
}

// Full-precision image sampling: the float height and mask of the source are prefiltered to the grid's
// footprint (no aliasing when shrinking) and sampled with a Catmull-Rom kernel (no facets when enlarging).
// Nothing passes through 8-bit, so smooth gradients stay smooth.
const _pre = new WeakMap();
function prefiltered(src, sigma) {
  let m = _pre.get(src); if (!m) _pre.set(src, (m = new Map()));
  const key = Math.round(sigma * 4) / 4;
  if (!m.has(key)) {
    if (m.size > 3) m.clear();
    const w = src.width, h = src.height;
    m.set(key, { H: key >= 0.35 ? blur(src._H, w, h, key) : src._H, A: key >= 0.35 ? blur(src._A, w, h, key) : src._A });
  }
  return m.get(key);
}
function sampleSource(src, p, L) {
  const { nx, ny, c, x0, y0 } = L, n = nx * ny, iw = src.width, ih = src.height;
  const { s0 } = imageTransform(p, L, iw, ih), fx = p.imgFlip ? -1 : 1;
  const { H, A } = prefiltered(src, 0.42 * c / s0); // image pixels per grid cell → matching low-pass
  const th = p.imgRotate * DEG, cs = Math.cos(th), sn = Math.sin(th);
  const lum = new Float32Array(n), alpha = new Float32Array(n);
  const cr = (t) => { const t2 = t * t, t3 = t2 * t; return [(-t3 + 2 * t2 - t) / 2, (3 * t3 - 5 * t2 + 2) / 2, (-3 * t3 + 4 * t2 + t) / 2, (t3 - t2) / 2]; };
  for (let j = 0; j < ny; j++) {
    const Yd = -(y0 + j * c) + p.imgY; // world y-down relative to the image centre
    for (let i = 0; i < nx; i++) {
      const X = x0 + i * c - p.imgX, qx = X * cs + Yd * sn, qy = -X * sn + Yd * cs;
      const u = qx / (s0 * fx) + iw / 2 - 0.5, v = qy / s0 + ih / 2 - 0.5;
      if (u < -2 || v < -2 || u > iw + 1 || v > ih + 1) continue; // outside: transparent
      const iu = Math.floor(u), iv = Math.floor(v), wu = cr(u - iu), wv = cr(v - iv);
      let hs = 0, as = 0, hw = 0;
      for (let b = 0; b < 4; b++) {
        const yy = iv - 1 + b, yc = yy < 0 ? 0 : yy >= ih ? ih - 1 : yy, inY = yy >= 0 && yy < ih;
        for (let a2 = 0; a2 < 4; a2++) {
          const xx = iu - 1 + a2, xc = xx < 0 ? 0 : xx >= iw ? iw - 1 : xx, wgt = wu[a2] * wv[b], k = yc * iw + xc;
          hs += H[k] * wgt; hw += wgt;
          if (inY && xx >= 0 && xx < iw) as += A[k] * wgt;
        }
      }
      const k = j * nx + i;
      lum[k] = clamp(hs / hw, 0, 1); alpha[k] = clamp(as, 0, 1);
    }
  }
  return { lum, alpha };
}

// ── Text ───────────────────────────────────────────────────
const FS = 100; // draw glyphs at 100px then scale down for good hinting
function fontStr(p, family, bold) { return `${bold ? 700 : 400} ${FS}px "${family}"`; }
function textPaint(ctx, ch, x, y, k, stroke) {
  if (stroke > 0) { ctx.lineWidth = (stroke * 2) / k; ctx.strokeText(ch, x, y); }
  ctx.fillText(ch, x, y);
}
function prepText(ctx) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }

// Draws an arc of text centred at top (dir=1) or bottom (dir=-1), in y-down coords. Returns its angular span.
function drawArcText(ctx, text, r, dir, p) {
  const k = p.textSize / FS, sp = p.textSpacing * p.textSize;
  ctx.font = fontStr(p, p.font, p.textBold);
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width * k);
  const total = widths.reduce((s, w) => s + w, 0) + sp * (chars.length - 1);
  const span = total / r;
  let acc = 0;
  chars.forEach((ch, i) => {
    const mid = (acc + widths[i] / 2) / r;
    const ang = dir > 0 ? -Math.PI / 2 - span / 2 + mid : Math.PI / 2 + span / 2 - mid;
    ctx.save();
    ctx.translate(r * Math.cos(ang), r * Math.sin(ang));
    ctx.rotate(dir > 0 ? ang + Math.PI / 2 : ang - Math.PI / 2);
    ctx.scale(k, k);
    textPaint(ctx, ch, 0, 0, k, p.textStroke);
    ctx.restore();
    acc += widths[i] + sp;
  });
  return span;
}
function drawLines(ctx, text, size, family, bold, y, stroke, spacingEm = 0) {
  const k = size / FS, lines = text.split('\n'), lh = size * 1.18;
  ctx.font = fontStr(null, family, bold);
  try { ctx.letterSpacing = `${spacingEm * FS}px`; } catch { /* older browsers */ }
  lines.forEach((ln, i) => {
    ctx.save();
    ctx.translate(0, y + (i - (lines.length - 1) / 2) * lh);
    ctx.scale(k, k);
    textPaint(ctx, ln, 0, 0, k, stroke);
    ctx.restore();
  });
  try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
}

// ── Image processing on the grid ───────────────────────────
function processImage(lum, alpha, Sshape, p, L, sculpted = false) {
  const { nx, ny, c } = L, n = nx * ny;
  const bgL = p.bgLevel;
  let v = new Float32Array(n);
  // auto levels over foreground pixels inside the shape
  let lo = 0, hi = 1;
  if (p.autoLevels) {
    const hist = new Uint32Array(256); let cnt = 0;
    for (let k = 0; k < n; k++) if (alpha[k] > 0.5 && Sshape[k] < 0) { hist[(lum[k] * 255) | 0]++; cnt++; }
    if (cnt > 50) {
      let acc = 0; const t0 = cnt * 0.01, t1 = cnt * 0.99; lo = -1; hi = -1;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (lo < 0 && acc >= t0) lo = i / 255; if (hi < 0 && acc >= t1) { hi = i / 255; break; } }
      if (hi - lo < 0.05) { lo = 0; hi = 1; }
    }
  }
  const inv = (p.mode === 'lithophane') !== !!p.invert;
  const g = 1 / p.gamma, con = 1 + p.contrast;
  for (let k = 0; k < n; k++) {
    let l = clamp((lum[k] - lo) / (hi - lo), 0, 1);
    if (inv) l = 1 - l;
    l = clamp((l - 0.5) * con + 0.5 + p.brightness, 0, 1);
    l = Math.pow(l, g);
    const a = alpha[k];
    v[k] = a * l + (1 - a) * bgL;
  }
  const cell = (mm) => mm / c;
  if (p.denoise > 0) {
    // a sculpted AI relief is already noise-free; its fine modelling is low in amplitude by design, so only
    // ripples far below it are ironed out
    const r = Math.max(1, Math.round(cell(p.denoise))), e = p.denoiseEdge * (sculpted ? 0.25 : 1);
    v = guidedFilter(v, nx, ny, r, e * e);
    if (r >= 3) v = guidedFilter(v, nx, ny, Math.max(1, r >> 1), e * e); // second, finer pass
  }
  if (p.smoothing > 0) v = blur(v, nx, ny, cell(p.smoothing));
  if (p.sharpen > 0) { const b = blur(v, nx, ny, Math.max(1, cell(0.5))); for (let k = 0; k < n; k++) v[k] += p.sharpen * (v[k] - b[k]); }
  if (p.clarity > 0) { const b = blur(v, nx, ny, cell(3)); for (let k = 0; k < n; k++) v[k] += p.clarity * (v[k] - b[k]); }
  if (p.edgeBoost > 0) {
    const b = blur(v, nx, ny, Math.max(0.6, cell(0.25))), e = new Float32Array(n), sc = cell(0.6);
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      e[k] = Math.hypot(b[k + 1] - b[k - 1], b[k + nx] - b[k - nx]) * 0.5 * sc;
    }
    for (let k = 0; k < n; k++) v[k] += p.edgeBoost * Math.min(1, e[k]);
  }
  if (p.mode === 'coin' || p.mode === 'cameo') {
    const det = p.styleDetail ?? 0.5, R = Math.max(c, p.styleRound ?? 2.5);
    // subject = foreground inside the outline; its distance field drives the rolled / puffed edges
    const cov = new Float32Array(n); for (let k = 0; k < n; k++) cov[k] = Sshape[k] < 0 ? alpha[k] : 0;
    const Ssub = sdfFromCoverage(blur(cov, nx, ny, Math.max(0.6, cell(0.15))), L, true, R + 1);
    // local mean over the subject only (normalised blur), so the subject's own outline never reads as detail
    const vc = new Float32Array(n); for (let k = 0; k < n; k++) vc[k] = v[k] * cov[k];
    const bv = blur(vc, nx, ny, cell(1.5)), bc = blur(cov, nx, ny, cell(1.5)), low = new Float32Array(n);
    for (let k = 0; k < n; k++) low[k] = bc[k] > 1e-3 ? bv[k] / bc[k] : v[k];
    let base = null, puff = null;
    if (p.mode === 'coin') base = guidedFilter(v, nx, ny, Math.max(2, Math.round(cell(2.5))), 0.02); // large forms only
    else { const m = new Uint8Array(n); for (let k = 0; k < n; k++) m[k] = Ssub[k] < 0 ? 1 : 0; puff = inflate(m, nx, ny, c); }
    for (let k = 0; k < n; k++) {
      const t = Math.min(1, Math.max(0, -Ssub[k]) / R);
      if (p.mode === 'coin') {
        // bas-relief: big forms compressed, fine detail restored on top, edges rolled — like a struck medal
        const roll = Math.sqrt(1 - (1 - t) * (1 - t)), b = clamp(base[k], 0, 1), d = v[k] - b;
        v[k] = roll * (0.12 + 0.62 * Math.pow(b, 0.85) + (0.5 + 1.5 * det) * d);
      } else {
        // cushion height saturates smoothly (R ≈ the blob radius that reaches most of the height), detail on top
        const cush = 1 - Math.exp(-2.2 * puff[k] / (R * R / 4));
        v[k] = cush * (1 - 0.35 * det) + det * 1.4 * (v[k] - low[k]) * Math.min(1, t * 3);
      }
    }
  }
  for (let k = 0; k < n; k++) v[k] = clamp(v[k], 0, 1);
  const raw = v.slice(); // smooth, pre-quantisation values: stepped boundaries are placed on these iso-lines
  if (p.mode === 'stencil') for (let k = 0; k < n; k++) v[k] = v[k] >= p.stencilThreshold ? 1 : 0;
  else if (p.posterize >= 2) { const N = p.posterize - 1; for (let k = 0; k < n; k++) v[k] = Math.round(v[k] * N) / N; }
  v.raw = raw;
  return v;
}

// Inflation (cameo): solves ∇²h = −1 inside the mask with h = 0 on its outline, coarse-to-fine with SOR.
// h is a smooth cushion for any shape (a paraboloid for a round blob) — no plateau, no crease along the
// medial axis, and a gentle finite slope where it meets the outline. Returns h in mm².
function inflate(inside, nx, ny, c) {
  const levels = [{ m: inside, nx, ny }];
  while (levels[levels.length - 1].nx > 96 && levels[levels.length - 1].ny > 96) {
    const L0 = levels[levels.length - 1], w = L0.nx >> 1, h = L0.ny >> 1, m = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = L0.m[(2 * j) * L0.nx + 2 * i] & L0.m[(2 * j) * L0.nx + 2 * i + 1] & L0.m[(2 * j + 1) * L0.nx + 2 * i] & L0.m[(2 * j + 1) * L0.nx + 2 * i + 1];
    levels.push({ m, nx: w, ny: h });
  }
  let H = null;
  for (let li = levels.length - 1; li >= 0; li--) {
    const { m, nx: w, ny: h } = levels[li], cs = c * (1 << li), f = cs * cs, u = new Float32Array(w * h);
    if (H) { // prolong the coarser solution
      const { nx: pw, ny: ph } = levels[li + 1];
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (m[j * w + i]) u[j * w + i] = H[Math.min(ph - 1, j >> 1) * pw + Math.min(pw - 1, i >> 1)];
    }
    const iters = li === levels.length - 1 ? 4 * Math.max(w, h) : 40;
    for (let it = 0; it < iters; it++) for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i; if (!m[k]) continue;
      const g = (u[k - 1] + u[k + 1] + u[k - w] + u[k + w] + f) * 0.25;
      u[k] += 1.85 * (g - u[k]);
    }
    H = u;
  }
  for (let k = 0; k < H.length; k++) if (H[k] < 0) H[k] = 0;
  return H;
}

// Discrete height levels of a stepped relief (stencil / posterize): values and the thresholds between them.
function stepLevels(p) {
  if (PATTERN_STYLES.includes(p.mode)) return null;
  if (p.mode === 'stencil') return { vals: [0, 1], thr: [null, p.stencilThreshold] };
  if (p.posterize >= 2) { const N = p.posterize - 1; return { vals: Array.from({ length: N + 1 }, (_, k) => k / N), thr: Array.from({ length: N + 1 }, (_, k) => (k ? (k - 0.5) / N : null)) }; }
  return null;
}

// Detects a graphic image — most of its area made of a few flat tones — and returns those tones as step levels
// (thresholds halfway between neighbours, so walls fall on the middle of each anti-aliased edge). Null for photos.
function graphicLevels(v, Sshape, L, imgStart, force) {
  const { nx, ny } = L, idx = [];
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (-Sshape[k] > imgStart + 0.3) idx.push(k); }
  if (idx.length < 200) return null;
  const NB = 200, hist = new Float64Array(NB); let flat = 0;
  for (const k of idx) {
    const g = Math.max(Math.abs(v[k + 1] - v[k - 1]), Math.abs(v[k + nx] - v[k - nx])) / 2;
    if (g < 0.012) { hist[Math.min(NB - 1, (v[k] * NB) | 0)]++; flat++; }
  }
  if (!flat) return null;
  const hs = new Float64Array(NB);
  for (let i = 0; i < NB; i++) { let s = 0, w = 0; for (let d = -3; d <= 3; d++) { const q = i + d; if (q < 0 || q >= NB) continue; const wt = 4 - Math.abs(d); s += hist[q] * wt; w += wt; } hs[i] = s / w; }
  const peaks = [];
  for (let i = 0; i < NB; i++) {
    let top = hs[i] > 0;
    for (let d = -4; d <= 4 && top; d++) { const q = i + d; if (!d || q < 0 || q >= NB) continue; if (hs[q] > hs[i] || (hs[q] === hs[i] && q < i)) top = false; }
    if (!top) continue;
    let mass = 0, sum = 0;
    for (let d = -5; d <= 5; d++) { const q = i + d; if (q < 0 || q >= NB) continue; mass += hist[q]; sum += hist[q] * (q + 0.5) / NB; }
    if (mass >= 0.015 * flat) peaks.push({ v: sum / mass, mass });
  }
  peaks.sort((x, y) => x.v - y.v);
  const lv = [];
  for (const pk of peaks) { const last = lv[lv.length - 1]; if (last && pk.v - last.v < 0.06) { if (pk.mass > last.mass) Object.assign(last, pk); } else lv.push({ ...pk }); }
  if (lv.length < 2 || lv.length > 10) return null;
  let near = 0;
  for (const k of idx) { let dm = 1; for (const l of lv) dm = Math.min(dm, Math.abs(v[k] - l.v)); if (dm < 0.05) near++; }
  if (!force && (flat / idx.length < 0.6 || near / idx.length < 0.85)) return null;
  const vals = lv.map((l) => clamp(l.v, 0, 1));
  return { vals, thr: vals.map((x, i) => (i ? (vals[i - 1] + x) / 2 : null)), auto: true };
}

// Photos: where the relief rises faster than the grid can draw as a clean face (steeper than ~63°), it is eased
// into a ramp about three cells wide. Gentle relief and fine texture are untouched.
function slopeLimit(v, nx, ny, depth, c) {
  const b = blur(v, nx, ny, 1.1), out = Float32Array.from(v), k1 = depth / c;
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i, g = Math.max(Math.abs(v[k + 1] - v[k - 1]), Math.abs(v[k + nx] - v[k - nx])) / 2;
    const w = smooth(2, 4, g * k1);
    if (w > 0) out[k] = v[k] + (b[k] - v[k]) * w;
  }
  return out;
}

// ── Pattern styles ─────────────────────────────────────────
// Each returns a signed distance field (mm, < 0 inside the raised pattern) computed analytically from the
// image brightness v: dots are true circles and lines have exact smooth edges at any resolution. Nothing is
// thinner than the printable minimum, and no gap narrower than it survives either.
function patternSdf(p, L, v, Sshape, imgStart) {
  const { nx, ny, c, x0, y0 } = L, n = nx * ny, out = new Float32Array(n);
  const minW = p.minDot ?? 0.4, minGap = minW * 0.8, cell = (mm) => mm / c;
  const sample = (x, y) => clamp(sampleGrid(v, L, x, y), 0, 1);
  if (p.mode === 'halftone') {
    const P = p.patternPitch, th = p.dotAngle * DEG, cs = Math.cos(th), sn = Math.sin(th), rad = new Map();
    const radius = (a, b) => {
      const key = a * 65536 + b; let r = rad.get(key);
      if (r === undefined) {
        const u = a * P, w = b * P, val = sample(u * cs - w * sn, u * sn + w * cs);
        r = 0.5 * P * Math.sqrt(val) * 1.13; // dot area follows brightness
        if (2 * r < minW) r = 0;                        // too small to print: no dot
        else if (P - 2 * r < minGap) r = Math.max(r, 0.5 * P + 0.02); // gap too thin to print: merge neighbours
        rad.set(key, r);
      }
      return r;
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * c, y = y0 + j * c, u = x * cs + y * sn, w = -x * sn + y * cs, ia = Math.round(u / P), ib = Math.round(w / P);
      let d = P;
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) { const r = radius(ia + da, ib + db); if (r > 0) d = Math.min(d, Math.hypot(u - (ia + da) * P, w - (ib + db) * P) - r); }
      out[j * nx + i] = d;
    }
  } else if (p.mode === 'lines') {
    const P = p.patternPitch, th = p.lineAngle * DEG, cs = Math.cos(th), sn = Math.sin(th), maxW = P - minGap;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * c, y = y0 + j * c, s = x * cs + y * sn, t = -x * sn + y * cs, m = Math.round(t / P);
      let d = P;
      for (let dm = -1; dm <= 1; dm++) {
        const tc = (m + dm) * P, val = sample(s * cs - tc * sn, s * sn + tc * cs);
        const wdt = val < 0.02 ? 0 : Math.min(maxW, Math.max(minW * smooth(0.02, 0.12, val), val * P * 0.95)); // width follows brightness
        if (wdt > 0) d = Math.min(d, Math.abs(t - tc) - wdt / 2);
      }
      out[j * nx + i] = d;
    }
  } else if (p.mode === 'contour') {
    const vs = blur(v, nx, ny, Math.max(0.6, cell(p.lineW * 0.5))), N = p.contourN, hw = p.lineW / 2;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { out[k] = 1; continue; }
      const g = Math.hypot(vs[k + 1] - vs[k - 1], vs[k + nx] - vs[k - nx]) / (2 * c); // per mm
      const lvl = clamp(Math.round(vs[k] * N), 1, N - 1) / N;
      out[k] = Math.min(4, Math.abs(vs[k] - lvl) / Math.max(g, 1e-4)) - hw; // first-order distance to the iso-line
    }
  } else if (p.mode === 'lineart') {
    // Two detectors, each normalised to its own strong response and range-compressed so that softer edges
    // still register: a difference of Gaussians (dark strokes, like pen lines) and the edge strength (outlines
    // between regions of different brightness, drawn centred on the edge).
    const s1 = Math.max(0.6, cell(p.lineW * 0.4)), g1 = blur(v, nx, ny, s1), g2 = blur(v, nx, ny, s1 * 1.7);
    const D = new Float32Array(n), Gm = new Float32Array(n);
    for (let k = 0; k < n; k++) D[k] = Math.max(0, g2[k] - g1[k]);
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; Gm[k] = Math.sqrt((g1[k + 1] - g1[k - 1]) ** 2 + (g1[k + nx] - g1[k - nx]) ** 2) * 0.5; }
    const pct = (A2) => { const s = []; for (let k = 0; k < n; k += 5) if (A2[k] > 1e-5) s.push(A2[k]); s.sort((a, b) => a - b); return Math.max(1e-5, s[Math.floor(s.length * 0.98)] || 0); };
    const sD = pct(D), sG = pct(Gm), thr = 0.6 - 0.45 * (p.lineSens ?? 0.5);
    let f = new Float32Array(n);
    for (let k = 0; k < n; k++) f[k] = Math.sqrt(Math.min(1.5, Math.max(D[k] / sD, 0.8 * Gm[k] / sG))) - thr;
    f = blur(f, nx, ny, 0.8);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { out[k] = 1; continue; }
      const g = Math.hypot(f[k + 1] - f[k - 1], f[k + nx] - f[k - nx]) / (2 * c);
      out[k] = clamp(-f[k] / Math.max(g, 1e-3), -4, 4);
    }
  }
  // only inside the image area (never on the rim or the gap next to it)
  for (let k = 0; k < n; k++) out[k] = Math.max(out[k], imgStart + 0.25 + Sshape[k]);
  return out;
}

// Connected components of a boolean grid (4-neighbour). Returns labels and sizes.
function gridComponents(nx, ny, inside) {
  const n = nx * ny, lab = new Int32Array(n).fill(-1), sizes = [], st = [];
  for (let s = 0; s < n; s++) {
    if (lab[s] >= 0 || !inside(s)) continue;
    const id = sizes.length; let sz = 0; lab[s] = id; st.push(s);
    while (st.length) {
      const k = st.pop(), i = k % nx, j = (k / nx) | 0; sz++;
      if (i > 0 && lab[k - 1] < 0 && inside(k - 1)) { lab[k - 1] = id; st.push(k - 1); }
      if (i < nx - 1 && lab[k + 1] < 0 && inside(k + 1)) { lab[k + 1] = id; st.push(k + 1); }
      if (j > 0 && lab[k - nx] < 0 && inside(k - nx)) { lab[k - nx] = id; st.push(k - nx); }
      if (j < ny - 1 && lab[k + nx] < 0 && inside(k + nx)) { lab[k + nx] = id; st.push(k + nx); }
    }
    sizes.push(sz);
  }
  return { lab, sizes };
}

// ── Bail geometry ──────────────────────────────────────────
function bailAngles(p) {
  const a0 = p.bailAngle;
  if (p.bailPlace === 'pair') return [a0 - p.bailSpread, a0 + p.bailSpread];
  if (p.bailPlace === 'sides') return [a0 - 90, a0 + 90];
  return [a0];
}
// Hanger features for a field. Pendants derive them from their bail settings; the connector bail passes
// its own list in p._bails. kind: 'tab' (loop grown from the edge), 'hole' (punched), 'tube' (chain tunnel).
export function bailSpecs(p) {
  if (p._bails) return p._bails;
  if (p.bail === 'none') return [];
  if (p.bail === 'tube') return [{ kind: 'tube', holeD: p.tubeHoleD, wall: p.tubeWall, len: p.tubeLen }];
  return bailAngles(p).map((ang) => (p.bail === 'tab'
    ? { kind: 'tab', ang, shape: p.tabShape, holeD: p.holeD, tabD: p.tabD, overlap: p.tabOverlap, thick: p.tabThick }
    : p.bail === 'cord'
      ? { kind: 'hole', ang, shape: 'slot', len: p.cordW, holeD: p.holeD, inset: p.holeInset, collar: p.collar }
      : { kind: 'hole', ang, shape: p.holeShape, holeD: p.holeD, inset: p.holeInset, collar: p.collar }));
}

// Exact 2D distance functions (after Inigo Quilez), in a local frame: v along the outward direction, w across it.
const sdRoundBox = (w, v, bw, bv, r) => {
  const qx = Math.abs(w) - bw + r, qy = Math.abs(v) - bv + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (w, v, v0, v1, r) => Math.hypot(w, v - clamp(v, v0, v1)) - r;
function sdUnevenCapsule(w, v, r1, r2, h) {
  const px = Math.abs(w), b = (r1 - r2) / h, a = Math.sqrt(1 - b * b), k = -px * b + v * a;
  if (k < 0) return Math.hypot(px, v) - r1;
  if (k > a * h) return Math.hypot(px, v - h) - r2;
  return px * a + v * b - r1;
}
function sdStar5(w, v, r, rf) { // five-point star, a point towards +v
  const k1x = 0.809016994375, k1y = -0.587785252292, k2x = -k1x, k2y = k1y;
  let px = Math.abs(w), py = v;
  let d = Math.max(k1x * px + k1y * py, 0); px -= 2 * d * k1x; py -= 2 * d * k1y;
  d = Math.max(k2x * px + k2y * py, 0); px -= 2 * d * k2x; py -= 2 * d * k2y;
  px = Math.abs(px); py -= r;
  const bax = rf * -k1y - 0, bay = rf * k1x - 1, h = clamp((px * bax + py * bay) / (bax * bax + bay * bay), 0, r);
  return Math.hypot(px - bax * h, py - bay * h) * Math.sign(py * bax - px * bay);
}
function sdHexagon(w, v, r) {
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269;
  let px = Math.abs(w), py = Math.abs(v);
  const d = Math.min(kx * px + ky * py, 0); px -= 2 * d * kx; py -= 2 * d * ky;
  px -= clamp(px, -kz * r, kz * r); py -= r;
  return Math.hypot(px, py) * Math.sign(py);
}
function sdHeart(w, v) { // tip at origin, lobes towards +v, height ≈ 1.1
  const px = Math.abs(w);
  if (v + px > 1) return Math.hypot(px - 0.25, v - 0.75) - Math.SQRT2 / 4;
  const m = 0.5 * Math.max(px + v, 0);
  return Math.sqrt(Math.min(px * px + (v - 1) ** 2, (px - m) ** 2 + (v - m) ** 2)) * Math.sign(px - v);
}

// Builds the outline SDFs of a loop tab and its hole. o = attach point on the edge, d = outward unit vector.
function makeTab(spec, ox, oy, dx, dy) {
  const tr = spec.tabD / 2, hr = spec.holeD / 2;
  const local = (x, y) => { const X = x - ox, Y = y - oy; return [X * dy - Y * dx, X * dx + Y * dy]; };
  const at = (v) => ({ x: ox + dx * v, y: oy + dy * v });
  let outer, hole, hc, hrr = Math.min(hr, tr - 0.8);
  switch (spec.shape) {
    case 'oval': {
      const ext = Math.max(hr * 1.3, 1.6);
      outer = (w, v) => sdSegment(w, v, tr, tr + ext, tr);
      hole = (w, v) => sdSegment(w, v, tr, tr + ext, hrr);
      hc = at(tr + ext); break;
    }
    case 'drop':
      outer = (w, v) => sdUnevenCapsule(w, v - tr, tr, tr * 0.3, tr * 1.35);
      hole = (w, v) => Math.hypot(w, v - tr) - hrr; hc = at(tr); break;
    case 'heart': {
      const s = spec.tabD * 1.2; hrr = Math.min(hr, 0.21 * s);
      outer = (w, v) => sdHeart(w / s, v / s) * s;
      hole = (w, v) => Math.hypot(w, v - 0.66 * s) - hrr; hc = at(0.66 * s); break;
    }
    case 'bar': {
      const H = Math.max(spec.tabD * 0.75, spec.holeD + 2.6), W = Math.max(spec.tabD * 1.7, H * 2); hrr = Math.min(hr, H / 2 - 1.2);
      outer = (w, v) => sdRoundBox(w, v - H / 2, W / 2, H / 2, H * 0.45);
      hole = (w, v) => sdRoundBox(w, v - H / 2, W / 2 - 1.5, hrr, hrr); hc = at(H / 2); break;
    }
    case 'double': { // two stacked loops: charm below, chain above
      const v2 = tr * 2.55;
      outer = (w, v) => Math.min(Math.hypot(w, v - tr) - tr, Math.hypot(w, v - v2) - tr * 0.95);
      hole = (w, v) => Math.min(Math.hypot(w, v - tr) - hrr, Math.hypot(w, v - v2) - hrr * 0.95); hc = at(v2); break;
    }
    case 'hook': { // open clip: a slot at 40° lets the loop slide onto a chain without opening a ring
      const g = Math.max(0.9, hrr * 0.55), sa = Math.sin(0.7), ca = Math.cos(0.7);
      outer = (w, v) => Math.hypot(w, v - tr) - tr;
      hole = (w, v) => { const Y = v - tr, s = w * sa + Y * ca, t = -w * ca + Y * sa; return Math.min(Math.hypot(w, Y) - hrr, sdSegment(t, s, 0, tr * 2, g / 2)); };
      hc = at(tr); break;
    }
    case 'flower': {
      const pr = tr * 0.36, rr = tr * 0.66; hrr = Math.min(hr, tr * 0.72 - 0.8);
      outer = (w, v) => { let d = Math.hypot(w, v - tr) - tr * 0.72; for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3; d = Math.min(d, Math.hypot(w - rr * Math.sin(an), v - tr - rr * Math.cos(an)) - pr); } return d; };
      hole = (w, v) => Math.hypot(w, v - tr) - hrr; hc = at(tr); break;
    }
    case 'star': {
      const c0 = tr * 1.05; hrr = Math.min(hr, tr * 0.42);
      outer = (w, v) => sdStar5(w, v - c0, tr * 1.3, 0.55) - 0.3;
      hole = (w, v) => Math.hypot(w, v - c0) - hrr; hc = at(c0); break;
    }
    case 'hex':
      outer = (w, v) => sdHexagon(w, v - tr, tr * 0.95) - 0.3;
      hole = (w, v) => Math.hypot(w, v - tr) - hrr; hc = at(tr); break;
    default:
      outer = (w, v) => Math.hypot(w, v - tr) - tr;
      hole = (w, v) => Math.hypot(w, v - tr) - hrr; hc = at(tr);
  }
  return {
    tab: { sdf: (x, y) => { const [w, v] = local(x, y); return outer(w, v); } },
    hole: { x: hc.x, y: hc.y, r: hrr, sdf: (x, y) => { const [w, v] = local(x, y); return hole(w, v); } },
  };
}

export function edgePoint(F, ang) { return edgeRadius(F.Sshape, F.L, ang); }

// Highest point of the outline between x0 and x1 (so a tube clears heart lobes and similar bumps).
function topEdgeBetween(Sshape, L, xa, xb) {
  let best = -Infinity;
  for (let x = xa; x <= xb + 1e-6; x += Math.max(L.c, (xb - xa) / 24)) {
    for (let y = L.yTop; y > L.y0; y -= L.c * 0.5) if (sampleGrid(Sshape, L, x, y) <= 0) { best = Math.max(best, y); break; }
  }
  return best;
}
// Tube bail geometry shared by the field (neck) and the mesher (tunnel): centred on x, axis along X.
export function tubeGeometry(spec, yEdge) {
  const r = spec.holeD / 2, Ro = r + spec.wall;
  return { x: 0, yc: yEdge + r + 0.3, r, Ro, len: spec.len };
}
// Outermost edge distance of the shape along direction (angle from +y, clockwise).
function edgeRadius(Sshape, L, ang) {
  const dx = Math.sin(ang * DEG), dy = Math.cos(ang * DEG);
  const maxR = Math.hypot(L.nx, L.ny) * L.c / 2;
  for (let r = maxR; r > 0; r -= L.c * 0.5) if (sampleGrid(Sshape, L, dx * r, dy * r) <= 0) return { r, dx, dy };
  return { r: 0, dx, dy };
}

// ── Layout ─────────────────────────────────────────────────
export function layoutFor(p, res) {
  const [a, b] = shapeHalf(p);
  let ext = 1.5;
  for (const s of bailSpecs(p)) {
    if (s.kind === 'tab') ext = Math.max(ext, s.tabD * (s.shape === 'double' ? 2.6 : s.shape === 'bar' || s.shape === 'heart' || s.shape === 'star' ? 1.9 : 1.5) + 2);
    if (s.kind === 'tube') ext = Math.max(ext, s.holeD + 2 * s.wall + 2, s.len / 2 - Math.min(a, b) + 2);
  }
  if (p.shape === 'silhouette') ext += p.silMargin + 1;
  if (p.backing) ext += p.backOffset;
  let c = res;
  const hw = a + ext, hh = b + ext, maxN = 2600;
  if (2 * Math.max(hw, hh) / c > maxN) c = 2 * Math.max(hw, hh) / maxN;
  const nx = Math.ceil(2 * hw / c) + 3, ny = Math.ceil(2 * hh / c) + 3;
  const x0 = -(nx - 1) * c / 2, y0 = -(ny - 1) * c / 2;
  return { c, nx, ny, x0, y0, yTop: y0 + (ny - 1) * c, a, b };
}

// Colour-band change heights (mm), snapped to real layer boundaries.
// Colour k starts just above terrace k-1, so posterized levels each get their own colour.
// With a background layer, colour 2 starts right at the top of the plate (a clean two-tone backing) and any
// further colours spread over the relief as usual.
export function bandHeights(p) {
  const N = p.bandCount, out = [{ z: 0, layer: 1 }];
  const lo = p.base + p.depth * p.bandLow, hi = p.base + p.depth * p.bandHigh;
  const plate = p.backing && p.backThick < lo;
  for (let k = 1; k < N; k++) {
    const zs = plate ? (k === 1 ? p.backThick : N > 2 ? lo + (hi - lo) * (k - 2) / (N - 2) : lo) : lo + (hi - lo) * (k - 1) / (N - 1);
    // the plate's swap rounds up, so no sliver of the plate's top ever prints in the next colour
    const layer = Math.max(2, (plate && k === 1 ? Math.ceil((zs - p.firstLayer) / p.layerH - 1e-6) : Math.round((zs - p.firstLayer) / p.layerH)) + 2);
    out.push({ z: p.firstLayer + (layer - 2) * p.layerH, layer });
  }
  return out;
}

// ── Main field build ───────────────────────────────────────
export function buildField(p, src, res) {
  const tm = {}, t0 = performance.now(), mark = (k) => { tm[k] = Math.round(performance.now() - t0); };
  const L = layoutFor(p, res);
  const { nx, ny, c, x0, y0, a, b } = L, n = nx * ny;
  // distances must be sub-pixel exact out to the deepest feature that is shaped by them (rim, fade, cushion…)
  const bandMm = Math.max(3.5, (p.rimStyle !== 'none' ? p.rimWidth : 0) + p.imgInset + p.imgFade + 1, p.pillow > 0 ? p.pillowW + 1 : 0,
    p.shape === 'silhouette' && p.silStyle === 'outline' ? p.silLineW + 1 : 0, (p.collarW || 0) + (p.holeD || 0) + 1, p.topBevel + 1, p.footChamfer + 1,
    p.backing ? p.backOffset + 1.5 : 0);
  let ctx;

  // 1) shape outline
  let Sshape, trace = null, Sfilled = null;
  if (p.shape === 'silhouette' && src) {
    // the subject is traced to smooth vector loops first, then rasterised: clean edges, no pixel steps or specks
    trace = traceOutline(src, p);
    // "Outline only" traces the outer contour unless inner contours are asked for (they'd float loose otherwise)
    const outerOnly = p.silStyle === 'outline' && !p.silInner;
    let cov = coverageSS(L, (g, Ls) => placeImage(g, src, p, Ls, outerOnly ? trace.outerPath : trace.path));
    const soft = p.silSmooth / c >= 0.35;
    if (soft) cov = blur(cov, nx, ny, p.silSmooth / c);
    Sshape = sdfFromCoverage(cov, L, soft, bandMm);
    for (let k = 0; k < n; k++) Sshape[k] -= p.silMargin;
    if (outerOnly) {
      // gaps enclosed only after the margin merged separate parts (e.g. between paw pads) are filled, so the
      // outline follows the outside of the whole subject instead of spawning loose inner rings
      const cov = new Float32Array(n);
      for (let k = 0; k < n; k++) cov[k] = clamp(0.5 - Sshape[k] / c, 0, 1);
      const out = gridComponents(nx, ny, (k) => cov[k] < 0.5);
      const border = new Set();
      for (let i = 0; i < nx; i++) { border.add(out.lab[i]); border.add(out.lab[(ny - 1) * nx + i]); }
      for (let j = 0; j < ny; j++) { border.add(out.lab[j * nx]); border.add(out.lab[j * nx + nx - 1]); }
      for (let k = 0; k < n; k++) if (out.lab[k] >= 0 && !border.has(out.lab[k])) cov[k] = 1;
      Sshape = sdfFromCoverage(cov, L, false, bandMm);
    }
    if (p.silStyle === 'outline') { // hollow: keep only a band of the given width along every contour
      Sfilled = Sshape.slice(); // the background layer fills in behind a hollow outline
      const w = Math.max(c * 2, p.silLineW);
      for (let k = 0; k < n; k++) Sshape[k] = Math.max(Sshape[k], -(Sshape[k] + w));
    }
  } else {
    Sshape = sdfFromCoverage(coverageSS(L, (g, Ls) => { xformUp(g, Ls); g.fillStyle = '#fff'; fillShape(g, p.shape === 'silhouette' ? { ...p, shape: 'circle' } : p, a, b); }), L, false, bandMm);
  }

  // 1b) background layer: a flat plate behind the design, following its outline at an exact offset (a true
  // offset curve of the distance field — corners round evenly, thin parts never pinch). It becomes the body's
  // outer edge: bails and holes attach to it; the design sits on top with its own crisp outline wall.
  const backOn = !!p.backing;
  let Sbody = Sshape;
  if (backOn) { Sbody = new Float32Array(n); for (let k = 0; k < n; k++) Sbody[k] = Math.min(Sshape[k], Sfilled ? Sfilled[k] : Infinity) - p.backOffset; }

  mark('shape');
  // 2) hangers: tabs & tube necks (smooth union), holes (subtract), tube tunnels (meshed separately)
  const tabs = [], holes = [], tubes = [], pegs = [];
  let tabZ = p.tabThick;
  for (const spec of bailSpecs(p)) {
    if (spec.kind === 'tube') {
      const yEdge = topEdgeBetween(Sbody, L, -spec.len / 2, spec.len / 2);
      const t = tubeGeometry(spec, yEdge);
      tubes.push(t);
      // neck: fills under the tube along its whole length and ends exactly at the tube's outer face,
      // so body and tube touch face-to-face instead of overlapping (no hidden internal geometry)
      const face = t.yc - t.Ro, bot = yEdge - 3, cy = (face + bot) / 2, hh = (face - bot) / 2;
      tabs.push({ sdf: (x, y) => sdRoundBox(x, y - cy, t.len / 2, hh, 0.6) });
      holes.push({ x: 0, y: t.yc, r: t.r, tube: true, sdf: (x, y) => sdRoundBox(x, y - (face + 60), t.len / 2, 60, 0) });
      continue;
    }
    if (spec.kind === 'peg') { // snap peg: part of the surface itself, not a separate shell
      const e = edgeRadius(Sbody, L, spec.ang), dist = e.r - spec.inset;
      pegs.push({ x: e.dx * dist, y: e.dy * dist, r: spec.d / 2, h: spec.h });
      continue;
    }
    const e = edgeRadius(Sbody, L, spec.ang);
    if (spec.kind === 'tab') {
      const back = Math.min(spec.overlap, spec.tabD * 0.8);
      const T = makeTab(spec, e.dx * (e.r - back), e.dy * (e.r - back), e.dx, e.dy);
      tabs.push(T.tab); holes.push(T.hole);
      if (spec.thick) tabZ = spec.thick;
    } else {
      const dist = e.r - spec.inset, hx = e.dx * dist, hy = e.dy * dist, r = spec.holeD / 2;
      // local frame at the hole: w runs along the edge, v points outwards
      const loc = (x, y) => { const X = x - hx, Y = y - hy; return [X * e.dy - Y * e.dx, X * e.dx + Y * e.dy]; };
      let hsdf;
      switch (spec.shape) {
        case 'slot': { const L = Math.max(0, (spec.len ?? spec.holeD * 2.2) / 2 - r); hsdf = (x, y) => { const [w, v] = loc(x, y); return sdSegment(v, w, -L, L, r); }; break; }
        case 'drop': hsdf = (x, y) => { const [w, v] = loc(x, y); return sdUnevenCapsule(w, v + r * 0.35, r, r * 0.3, r * 1.4); }; break;
        case 'heart': { const s = spec.holeD * 1.2; hsdf = (x, y) => { const [w, v] = loc(x, y); return sdHeart(w / s, (v + 0.55 * s) / s) * s; }; break; }
        case 'star': hsdf = (x, y) => { const [w, v] = loc(x, y); return sdStar5(w, v, r * 1.25, 0.5); }; break;
        default: hsdf = (x, y) => Math.hypot(x - hx, y - hy) - r;
      }
      holes.push({ x: hx, y: hy, r, collar: spec.collar, sdf: hsdf });
    }
  }
  const Sout = new Float32Array(n), Stab = new Float32Array(n);
  const kSm = 1.6;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * c, y = y0 + j * c;
    let s = Sbody[k], st = 1e9;
    for (const t of tabs) st = Math.min(st, t.sdf(x, y));
    if (tabs.length) { const h = clamp(0.5 + 0.5 * (st - s) / kSm, 0, 1); s = st * (1 - h) + s * h - kSm * h * (1 - h); }
    for (const hl of holes) if (hl.sdf) s = Math.max(s, -hl.sdf(x, y));
    if (Math.abs(s) < 1e-7) s = 1e-7;
    Sout[k] = s; Stab[k] = st;
  }

  // 2b) drop stray islands (specks, torn-off bits) — never the main body; count the separate pieces left
  let islands = 0;
  {
    const comp = gridComponents(nx, ny, (k) => Sout[k] < 0);
    if (comp.sizes.length) {
      let big = 0; comp.sizes.forEach((s, i) => { if (s > comp.sizes[big]) big = i; });
      const minCells = (p.minIsland ?? 1) / (c * c);
      for (let k = 0; k < n; k++) { const l = comp.lab[k]; if (l >= 0 && l !== big && comp.sizes[l] < minCells) Sout[k] = Math.max(c * 0.5, -Sout[k]); }
      islands = comp.sizes.filter((s, i) => i === big || s >= minCells).length;
    }
  }

  mark('bail');
  // 3) image → normalised height value
  let V;
  if (src && p.imageOn !== false) {
    let lum, alpha;
    if (src._H) ({ lum, alpha } = sampleSource(src, p, L));
    else { ctx = canvasFor(nx, ny); placeImage(ctx, src, p, L); ({ lum, alpha } = readRGBA(ctx, L)); }
    V = processImage(lum, alpha, Sshape, p, L, !!src._depth);
    if (p.symmetry && p.symmetry !== 'none') { const raw = symmetrize(V.raw, L, p.symmetry, p.radialN); V = symmetrize(V, L, p.symmetry, p.radialN); V.raw = raw; }
  } else V = new Float32Array(n).fill(p.bgLevel);
  let steps = V.raw ? stepLevels(p) : null; // stepped relief → crisp terraces with true vertical walls
  let imgKind = null;

  mark('image');
  // 4) front text
  let Tf = null, TfS = null; const arcs = [];
  const rimOn = p.rimStyle !== 'none', rimW = rimOn ? p.rimWidth : 0;
  // Arc radius follows the real edge above/below the centre, so ovals and tags get snug lettering.
  const arcR = (ang) => (p.textRadius > 0 ? p.textRadius // fixed circle, e.g. the seal band of a badge
    : Math.max(p.textSize, edgeRadius(Sshape, L, ang).r - rimW - p.textInset - p.textSize * 0.55));
  const textR = arcR(0);
  let textClip = 0;
  if (p.textTop || p.textBottom || p.textCenter) {
    Tf = coverageSS(L, (g, Ls) => {
      xformDown(g, Ls); prepText(g);
      if (p.textTop) { const r = arcR(0); arcs.push({ dir: 1, r, span: drawArcText(g, p.textTop, r, 1, p) }); }
      if (p.textBottom) { const r = arcR(180); arcs.push({ dir: -1, r, span: drawArcText(g, p.textBottom, r, -1, p) }); }
      if (p.textCenter) drawLines(g, p.textCenter, p.centerSize, p.font, p.textBold, -p.centerY, p.textStroke, p.textSpacing);
    });
    let tot = 0, out = 0;
    for (let k = 0; k < n; k++) { tot += Tf[k]; if (Sshape[k] > -0.3) out += Tf[k]; }
    textClip = tot > 0 ? out / tot : 0;
    TfS = sdfFromCoverage(Tf, L, false, Math.max(0, p.textBevel) + 0.6);
    // Optional coin-style bevel; with no bevel the lettering gets true vertical walls (crisp layer below).
    if (p.textBevel > 0) for (let k = 0; k < n; k++) Tf[k] = clamp(-TfS[k] / p.textBevel + 0.5 * c / p.textBevel, 0, 1);
  }
  const textCrisp = !!Tf && !(p.textBevel > 0);
  // 5) back text (mirrored)
  let Tb = null;
  if (p.backText) {
    Tb = coverageSS(L, (g, Ls) => { xformDown(g, Ls); prepText(g); g.scale(-1, 1); drawLines(g, p.backText, p.backSize, p.backFont, true, 0, 0.1); });
  }

  mark('text');
  // 6) continuous surface (relief, rim, dome, pillow …); crisp layers are added by the label system below
  const B = p.base, D = p.depth;
  const rimTop = B + p.rimHeight;
  const collarTop = Math.max(rimTop, B + D);
  const imgStart = rimW + p.imgInset, fade = Math.max(p.imgFade, c);
  // Graphics (logos, lettering, clip art) are flat areas of colour: each becomes a flat face, joined by exact
  // vertical walls on the anti-aliased edges. Photos stay a smooth relief whose cliffs are eased to what the grid
  // can draw cleanly — in neither case can an edge turn into a zig-zag.
  let vStep = V.raw || V;
  const kindPref = p.imgKind ?? 'auto';
  // an AI-depth relief is always sculpted: its smooth plateaus must never be mistaken for a logo's flat colours
  if (!steps && V.raw && (p.mode === 'raised' || p.mode === 'engraved') && kindPref !== 'photo' && (kindPref === 'graphic' || !src?._depth)) {
    const g = graphicLevels(V.raw, Sshape, L, imgStart, kindPref === 'graphic');
    if (g) { steps = g; vStep = blur(V.raw, nx, ny, 0.7); imgKind = { kind: 'graphic', levels: g.vals.length }; }
  }
  if (V.raw && !steps && !PATTERN_STYLES.includes(p.mode)) {
    const raw = V.raw; V = slopeLimit(V, nx, ny, p.depth, c); V.raw = raw;
    imgKind = { kind: 'photo' };
  }
  const pattern = PATTERN_STYLES.includes(p.mode) && !!V.raw;
  const Zc = new Float32Array(n), Zb = new Float32Array(n), vEff = steps ? new Float32Array(n) : null, vPat = pattern ? new Float32Array(n) : null;
  const ra = a - rimW / 2, rb = b - rimW / 2;
  const perim = Math.PI * (3 * (ra + rb) - Math.sqrt((3 * ra + rb) * (ra + 3 * rb)));
  const beadN = Math.max(6, Math.floor(perim / (rimW * 1.02)));
  const ropeN = Math.max(6, Math.round(perim / (rimW * 1.25)));
  const millN = Math.max(12, Math.round(perim / 0.9));
  const clearHalf = p.textSize * 0.7 + p.textStroke;
  const edgeH = Math.max(B * 0.6, Math.max(rimOn ? rimTop : B + D, B + D) - p.topBevel);
  const efc = p.footChamfer;
  const textSigned = p.textStyle === 'engraved' ? -p.textHeight : p.textHeight;
  const minWall = 0.3;
  const engraved = p.mode === 'engraved';
  const domeAt = (x, y) => (p.dome > 0 ? p.dome * (1 - Math.min(1, (x / a) ** 2 + (y / b) ** 2)) : 0);
  const pillowAt = (d) => { if (!(p.pillow > 0)) return 0; const u = 1 - Math.min(1, d / Math.max(0.1, p.pillowW)); return p.pillow * (1 - u * u); }; // puffy, cushion-cut edge
  const capAt = (z, x, y) => (p.topBevel > 0 ? Math.min(z, edgeH - sampleGrid(Sout, L, x, y)) : z);

  // Profile steps inside a rim are eased over ±1 grid cell: a hard step between two grid points would be drawn
  // as a zig-zag; a ramp two cells wide is drawn as a clean, straight face.
  const rw = rimW > 0 ? c / rimW : 0, st = (u, e) => smooth(e - rw, e + rw, u);
  const rimProfile = (u, th, d) => {
    switch (p.rimStyle) {
      case 'flat': return 1;
      case 'rounded': return 0.3 + 0.7 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
      case 'bevel': return Math.min(1, u / 0.28, (1 - u) / 0.28 + 0.35);
      case 'beaded': {
        const f = ((th / (Math.PI * 2)) * beadN % 1 + 1) % 1;
        const tang = (f - 0.5) * perim / beadN, rad = d - rimW / 2, br = rimW * 0.5;
        // eased dome: round like a ball, but with a finite slope at its foot, so neighbouring beads meet the
        // base in a clean fillet instead of a vertical crease the grid would draw as spikes
        const q = Math.max(0, 1 - (tang * tang + rad * rad) / (br * br)), e = 0.18;
        return 0.12 + 0.88 * (Math.sqrt(q + e * e) - e) / (Math.sqrt(1 + e * e) - e);
      }
      case 'rope': {
        const round = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        const tw = 0.5 + 0.5 * Math.cos(Math.PI * 2 * ((th / (Math.PI * 2)) * ropeN + u * 0.9));
        return 0.25 + 0.75 * round * (0.55 + 0.45 * tw);
      }
      case 'double': return 0.3 + 0.7 * Math.min(1, (1 - st(u, 0.32)) + st(u, 0.62) * (1 - st(u, 0.86)));
      case 'stepped': return 0.62 + 0.38 * (1 - st(u, 0.5));
      case 'milled': {
        const rib = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (th / (Math.PI * 2)) * millN), w = st(u, 0.72);
        return (0.8 + 0.2 * rib) * (1 - w) + 0.55 * w;
      }
      default: return 0;
    }
  };

  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * c, y = y0 + j * c;
    const ss = Sshape[k], so = Sout[k];
    const dIn = -ss, dOut = -so;
    const th = Math.atan2(x, y); // 0 at top, clockwise
    // Zc is the inner surface everywhere (also under the rim, collars and the loop tab): those parts are crisp
    // labels with their own analytic tops (see 6c), so their walls land exactly on their outlines.
    let z;
    {
      const d = Math.max(dIn, 0);
      let v = steps ? vStep[k] : V[k];
      // stepped: the image zone ends in a one-cell anti-aliased ramp, so the terrace wall there is placed sub-cell
      v = p.bgLevel + (v - p.bgLevel) * (steps ? clamp((d - imgStart) / c + 0.5, 0, 1) : smooth(imgStart, imgStart + fade, d));
      if (Tf && p.textClear && arcs.length) {
        const r = Math.hypot(x, y), angFromTop = Math.abs(Math.atan2(x, y));
        for (const arc of arcs) {
          const band = Math.abs(r - arc.r);
          if (band >= clearHalf + 0.6) continue;
          const off = arc.dir > 0 ? angFromTop : Math.PI - angFromTop;
          const pad = clearHalf / Math.max(arc.r, 1);
          if (off < arc.span / 2 + pad) v = p.bgLevel + (v - p.bgLevel) * (steps ? clamp((band - clearHalf - 0.3) / c + 0.5, 0, 1) : smooth(clearHalf, clearHalf + 0.6, band));
        }
      }
      if (vEff) { vEff[k] = v; v = 0; } // stepped image is applied as crisp label offsets
      if (vPat) { vPat[k] = v; v = 0; } // pattern styles: flat base, the image becomes crisp dots / lines
      z = engraved ? B + D * (1 - v) : B + D * v;
      if (Tf && !textCrisp) z += textSigned * Tf[k];
      z += domeAt(x, y) + pillowAt(d);
    }
    if (p.topBevel > 0) z = Math.min(z, edgeH + dOut);
    let zb = 0;
    if (Tb && ss < 0) zb = Math.max(zb, p.backDepth * Tb[k]);
    if (p.pocket) { const r = Math.hypot(x, y) - p.pocketD / 2; zb = Math.max(zb, p.pocketDepth * clamp(0.5 - r / c, 0, 1)); }
    if (efc > 0) zb = Math.max(zb, efc - dOut);
    z = Math.max(z, minWall + 0.1);
    if (zb > z - minWall) zb = z - minWall;
    Zc[k] = z; Zb[k] = zb;
  }

  mark('surface');
  // 6b) pattern styles → one crisp layer (signed distance field, mm) standing patternH above the base
  const styleLayers = [];
  if (pattern) styleLayers.push({ sdf: patternSdf(p, L, vPat, Sshape, imgStart), off: p.patternH });

  // 7) crisp labels: each grid vertex gets a label = (image terrace level, crisp layers present), and every
  // letter gets a label of its own. The mesher places walls exactly on the zero crossings between labels.
  // Every layer is a signed distance field (mm, < 0 inside).
  const layers = [];
  for (const ly of styleLayers) layers.push(ly);
  // 6c) solid parts with their own analytic top surface — the loop tab, hole collars and the rim. Each is a
  // label whose wall sits exactly on its outline (the rim's inner edge is a true circle, not a grid staircase).
  const floorZ = minWall + 0.1;
  if (tabs.length) {
    const S2 = new Float32Array(n); for (let k = 0; k < n; k++) S2[k] = Math.max(-Sbody[k], Stab[k] - Sbody[k]);
    layers.push({ sdf: S2, prio: 3, fn: (zc, x, y) => Math.max(floorZ, capAt(tabZ, x, y)) });
  }
  if (backOn) { // background layer: everything outside the design's own outline is the flat plate
    const S2 = new Float32Array(n); for (let k = 0; k < n; k++) S2[k] = -Sshape[k];
    layers.push({ sdf: S2, prio: 2.5, fn: (zc, x, y) => Math.max(floorZ, capAt(p.backThick, x, y)) });
  }
  const collars = holes.filter((hl) => hl.collar);
  if (collars.length) {
    const S2 = new Float32Array(n);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 1e9; for (const hl of collars) s = Math.min(s, hl.sdf(x0 + i * c, y0 + j * c) - p.collarW); S2[j * nx + i] = s; }
    layers.push({ sdf: S2, prio: 2, fn: (zc, x, y) => { const d = Math.max(0, -sampleGrid(Sshape, L, x, y)); return Math.max(zc, capAt(collarTop + domeAt(x, y) + pillowAt(d), x, y)); } });
  }
  if (rimOn) {
    const S2 = new Float32Array(n); for (let k = 0; k < n; k++) S2[k] = -Sshape[k] - rimW;
    layers.push({ sdf: S2, prio: 1, fn: (zc, x, y) => {
      const d = Math.max(0, -sampleGrid(Sshape, L, x, y));
      return Math.max(zc, capAt(B + (rimTop - B) * rimProfile(Math.min(1, d / rimW), Math.atan2(x, y), d) + domeAt(x, y) + pillowAt(d), x, y));
    } });
  }
  if (pegs.length) {
    const P = new Float32Array(n).fill(1e9);
    for (const pg of pegs) {
      const k0 = Math.round((pg.y - y0) / c) * nx + Math.round((pg.x - x0) / c);
      pg.top = (Zc[k0] || B) + pg.h; // flat-topped peg standing on the face
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; P[k] = Math.min(P[k], Math.hypot(x0 + i * c - pg.x, y0 + j * c - pg.y) - pg.r); }
    }
    layers.push({ sdf: P, abs: pegs[0].top });
  }
  const labels = new Int16Array(n), info = [];
  let labelTop, splitT;
  if (!steps && !layers.length && !textCrisp) {
    info.push({ lvl: 0, bits: 0, off: 0, abs: null, plane: null });
    labelTop = (l, zc) => zc; splitT = () => 0.5;
  } else {
    const lvlOf = (v) => { let l = 0; if (steps) for (let q = 1; q < steps.vals.length; q++) if (v >= steps.thr[q]) l = q; return l; };
    const ids = new Map(), sig = new Map();
    const idFor = (lvl, bits) => {
      const key = lvl * 256 + bits;
      if (ids.has(key)) return ids.get(key);
      // a solid part with its own surface (tab > collar > rim) wins over terraces and patterns beneath it
      let fnL = -1; layers.forEach((ly, i) => { if (ly.fn && (bits & (1 << i)) && (fnL < 0 || ly.prio > layers[fnL].prio)) fnL = i; });
      let off = steps ? (engraved ? -D : D) * steps.vals[lvl] : 0, abs = null;
      if (fnL < 0) layers.forEach((ly, i) => { if (bits & (1 << i)) { if (ly.abs !== undefined) abs = ly.abs; else off += ly.off; } });
      const s = fnL >= 0 ? `f${fnL}` : abs !== null ? `a${abs.toFixed(4)}` : `o${off.toFixed(4)}`;
      let id = sig.get(s);
      if (id === undefined) { id = info.length; sig.set(s, id); info.push({ lvl: fnL >= 0 ? null : lvl, bits, off, abs, plane: null, fn: fnL >= 0 ? layers[fnL].fn : null }); } // identical heights share one label
      ids.set(key, id);
      return id;
    };
    const top0 = (l, zc, x, y) => { const L1 = info[l]; return L1.fn ? L1.fn(zc, x, y) : L1.abs !== null ? Math.max(L1.abs, zc) : zc + L1.off; };
    // terrace level per vertex; one- or two-cell slivers of an in-between level along an anti-aliased edge
    // (e.g. grey pixels on a black/white edge) join the side they belong to instead of forming a thin ledge
    let lv = null;
    if (steps) {
      lv = new Uint8Array(n); for (let k = 0; k < n; k++) lv[k] = lvlOf(vEff[k]);
      for (let pass = 0; pass < 2; pass++) {
        const nl = lv.slice();
        for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
          const k = j * nx + i; let mn = lv[k], mx = lv[k];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = lv[k + dy * nx + dx]; if (q < mn) mn = q; if (q > mx) mx = q; }
          if (lv[k] > mn && lv[k] < mx) nl[k] = vEff[k] >= (steps.vals[mn] + steps.vals[mx]) / 2 ? mx : mn;
        }
        lv = nl;
      }
    }
    for (let k = 0; k < n; k++) {
      let bits = 0; layers.forEach((ly, i) => { if (ly.sdf[k] < 0) bits |= 1 << i; });
      labels[k] = idFor(steps ? lv[k] : 0, bits);
    }
    // Lettering: each letter is one flat face — a least-squares plane through the surface beneath it, offset by
    // the text height. Letters never ripple with the relief under them, and on a dome they stay parallel to it.
    if (textCrisp) {
      const comp = gridComponents(nx, ny, (k) => TfS[k] < 0 && Sout[k] < 0);
      const acc = comp.sizes.map(() => new Float64Array(9)); // n, Σx, Σy, Σz, Σxx, Σxy, Σyy, Σxz, Σyz
      for (let k = 0; k < n; k++) {
        const l = comp.lab[k]; if (l < 0) continue;
        const x = x0 + (k % nx) * c, y = y0 + ((k / nx) | 0) * c, z = top0(labels[k], Zc[k], x, y), s = acc[l];
        s[0]++; s[1] += x; s[2] += y; s[3] += z; s[4] += x * x; s[5] += x * y; s[6] += y * y; s[7] += x * z; s[8] += y * z;
      }
      const ids2 = acc.map((s) => {
        const m = s[0], xm = s[1] / m, ym = s[2] / m, zm = s[3] / m;
        const sxx = s[4] / m - xm * xm, sxy = s[5] / m - xm * ym, syy = s[6] / m - ym * ym, sxz = s[7] / m - xm * zm, syz = s[8] / m - ym * zm;
        const det = sxx * syy - sxy * sxy;
        let a = 0, b = 0;
        if (m > 6 && det > 1e-6 * (sxx + syy) ** 2 + 1e-12) { a = (sxz * syy - syz * sxy) / det; b = (syz * sxx - sxz * sxy) / det; }
        info.push({ lvl: null, bits: 0, off: 0, abs: null, text: true, plane: [a, b, zm - a * xm - b * ym + textSigned] });
        return info.length - 1;
      });
      for (let k = 0; k < n; k++) if (comp.lab[k] >= 0) labels[k] = ids2[comp.lab[k]];
    }
    // Speck clean-up: label patches smaller than the minimum printable feature merge into their surroundings.
    const minCells = (p.minFeature ?? 0.12) / (c * c);
    for (let pass = 0; pass < 2; pass++) {
      const lab = new Int32Array(n).fill(-1), st = [];
      for (let s = 0; s < n; s++) {
        if (lab[s] >= 0 || Sout[s] >= 0) continue;
        const L0 = labels[s], cells = []; lab[s] = s; st.push(s);
        const around = new Map();
        while (st.length) {
          const k = st.pop(), i = k % nx, j = (k / nx) | 0; cells.push(k);
          for (const q of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) {
            if (q < 0 || Sout[q] >= 0) continue;
            if (labels[q] === L0) { if (lab[q] < 0) { lab[q] = s; st.push(q); } } else around.set(labels[q], (around.get(labels[q]) || 0) + 1);
          }
        }
        if (cells.length < minCells && around.size) {
          let best = -1, bc = -1; for (const [l, cnt] of around) if (cnt > bc) { bc = cnt; best = l; }
          for (const k of cells) labels[k] = best;
        }
      }
    }
    labelTop = (l, zc, x, y) => { const L1 = info[l]; return L1.plane ? L1.plane[0] * x + L1.plane[1] * y + L1.plane[2] : L1.fn ? L1.fn(zc, x, y) : L1.abs !== null ? Math.max(L1.abs, zc) : zc + L1.off; };
    const thrBetween = (a1, b1) => { const lo = Math.min(a1, b1), hi = Math.max(a1, b1); return (steps.thr[lo + 1] + steps.thr[hi]) / 2; };
    const cross = (F2, kA, kB) => { const sa = F2[kA], sb = F2[kB]; return Math.abs(sb - sa) > 1e-9 ? sa / (sa - sb) : 0.5; };
    splitT = (kA, kB, la, lb) => {
      const A = info[la], Bi = info[lb];
      if (A.text !== Bi.text) return clamp(cross(TfS, kA, kB), 0.02, 0.98); // a letter's edge is the text outline
      let sum = 0, cnt = 0;
      if (steps && A.lvl !== null && Bi.lvl !== null && A.lvl !== Bi.lvl) { const va = vEff[kA], vb = vEff[kB]; if (Math.abs(vb - va) > 1e-6) { sum += (thrBetween(A.lvl, Bi.lvl) - va) / (vb - va); cnt++; } }
      layers.forEach((ly, i) => { if (((A.bits ^ Bi.bits) >> i) & 1) { sum += cross(ly.sdf, kA, kB); cnt++; } });
      return clamp(cnt ? sum / cnt : 0.5, 0.02, 0.98);
    };
  }
  mark('labels');
  const Z = new Float32Array(n);
  for (let k = 0; k < n; k++) Z[k] = Math.max(labelTop(labels[k], Zc[k], x0 + (k % nx) * c, y0 + ((k / nx) | 0) * c), Zb[k] + 0.2);

  return {
    L, nx, ny, c, x0, y0, S: Sout, Sshape, Z, Zc, Zb, V, holes, tabs, tubes, pegs, textR, arcs, textClip,
    labels, labelTop, splitT, labelCount: info.length, islands, imgKind, timing: tm, trace: trace && { loops: trace.loops, points: trace.points, coverage: trace.coverage, maskCoverage: trace.maskCoverage },
  };
}
