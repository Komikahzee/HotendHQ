/* ============================================================
   HOTEND HQ — SVG tracer: indexed image -> smooth vector shapes
   Written for this site. How it works:

   1. Split the image into regions (connected pixels of one colour).
   2. Walk the boundaries between regions as a graph of "chains": a chain
      runs from one junction (where 3+ regions meet) to the next. Every
      chain is fitted ONCE and shared by the two regions on either side,
      so neighbouring shapes meet exactly: no gaps, no slivers.
   3. Each chain: smooth out the pixel staircase, find real corners
      (and sharpen them back to a point), then fit cubic Béziers
      (Schneider's least-squares fitting) to a set tolerance.
   4. Regions are written either as separate pieces (no overlaps, for
      cutters and multi-colour prints) or stacked (holes filled and drawn
      biggest-first, which hides hairline seams on screen).
   ============================================================ */

/**
 * lbl: Uint8Array W*H palette indices (255 = transparent)
 * opts: { smooth 0..10, corners 0..10, tolerance (px of the work image), stacked, scale (output px per work px),
 *         skip: Set of labels not drawn }
 * returns { regions: [{ label, area, d }], order: [...] }
 */
export function vectorize(lbl, W, H, opts = {}) {
  const smooth = opts.smooth ?? 5, cornerLevel = opts.corners ?? 5;
  const s = opts.workScale || 1;               // work px per original px (bigger = more upscaled)
  const out = opts.scale || 1;
  const skip = opts.skip || new Set([255]);

  /* ---------- 1. components (4-connected) ---------- */
  const n = W * H;
  const comp = new Int32Array(n).fill(-1);
  const compLabel = [], compFirst = [], compArea = [];
  const stack = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    if (comp[p] >= 0) continue;
    const id = compLabel.length, l = lbl[p];
    let sp = 0, area = 0; stack[sp++] = p; comp[p] = id;
    while (sp) {
      const i = stack[--sp]; area++;
      const x = i % W;
      if (x > 0 && comp[i - 1] < 0 && lbl[i - 1] === l) { comp[i - 1] = id; stack[sp++] = i - 1; }
      if (x < W - 1 && comp[i + 1] < 0 && lbl[i + 1] === l) { comp[i + 1] = id; stack[sp++] = i + 1; }
      if (i >= W && comp[i - W] < 0 && lbl[i - W] === l) { comp[i - W] = id; stack[sp++] = i - W; }
      if (i < n - W && comp[i + W] < 0 && lbl[i + W] === l) { comp[i + W] = id; stack[sp++] = i + W; }
    }
    compLabel.push(l); compFirst.push(p); compArea.push(area);
  }
  const C = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : comp[y * W + x];

  /* ---------- 2. boundary graph ---------- */
  // H edge (x,y): from corner (x,y) to (x+1,y), between pixel (x,y-1) above and (x,y) below.
  // V edge (x,y): from corner (x,y) to (x,y+1), between pixel (x-1,y) left and (x,y) right.
  const W1 = W + 1;
  const hOn = (x, y) => x >= 0 && x < W && y >= 0 && y <= H && C(x, y - 1) !== C(x, y);
  const vOn = (x, y) => y >= 0 && y < H && x >= 0 && x <= W && C(x - 1, y) !== C(x, y);
  const hSeen = new Uint8Array(W * (H + 1)), vSeen = new Uint8Array(W1 * H);
  const hChain = new Int32Array(W * (H + 1)).fill(-1);
  const isJunction = (x, y) => {
    const a = C(x - 1, y - 1), b = C(x, y - 1), c = C(x - 1, y), d = C(x, y);
    if (a === d && b === c && a !== b) return true;            // checkerboard
    let k = 1; if (b !== a) k++; if (c !== a && c !== b) k++; if (d !== a && d !== b && d !== c) k++;
    return k >= 3;
  };
  // the 4 possible moves out of a corner: [dx, dy]
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const edgeOn = (x, y, dir) => dir === 0 ? hOn(x, y) : dir === 1 ? vOn(x, y) : dir === 2 ? hOn(x - 1, y) : vOn(x, y - 1);
  const seen = (x, y, dir) => dir === 0 ? hSeen[y * W + x] : dir === 1 ? vSeen[y * W1 + x] : dir === 2 ? hSeen[y * W + x - 1] : vSeen[(y - 1) * W1 + x];
  const mark = (x, y, dir, ch) => {
    if (dir === 0) { hSeen[y * W + x] = 1; hChain[y * W + x] = ch; }
    else if (dir === 2) { hSeen[y * W + x - 1] = 1; hChain[y * W + x - 1] = ch; }
    else if (dir === 1) vSeen[y * W1 + x] = 1; else vSeen[(y - 1) * W1 + x] = 1;
  };
  // region on the left of a move (y points down: facing east, left is the pixel above)
  const leftOf = (x, y, dir) => dir === 0 ? C(x, y - 1) : dir === 1 ? C(x, y) : dir === 2 ? C(x - 1, y) : C(x - 1, y - 1);
  const rightOf = (x, y, dir) => dir === 0 ? C(x, y) : dir === 1 ? C(x - 1, y) : dir === 2 ? C(x - 1, y - 1) : C(x, y - 1);

  const chains = [];   // { pts: [x0,y0,x1,y1,...], left, right, dirs: [first, last], loop }
  const walk = (sx, sy, dir) => {
    const id = chains.length;
    const pts = [sx, sy];
    const left = leftOf(sx, sy, dir), right = rightOf(sx, sy, dir);
    let x = sx, y = sy, d = dir, first = dir;
    for (;;) {
      mark(x, y, d, id);
      x += DIRS[d][0]; y += DIRS[d][1];
      pts.push(x, y);
      if ((x === sx && y === sy) || isJunction(x, y)) break;
      // degree-2 corner: continue on the one other edge
      let nd = -1;
      for (const t of [(d + 1) & 3, d, (d + 3) & 3]) if (edgeOn(x, y, t) && !seen(x, y, t)) { nd = t; break; }
      if (nd < 0) break;
      d = nd;
    }
    chains.push({ pts, left, right, first, last: d, loop: x === sx && y === sy && !isJunction(sx, sy) });
    return id;
  };
  // chains that start at junctions
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    if (!isJunction(x, y)) continue;
    for (let dir = 0; dir < 4; dir++) if (edgeOn(x, y, dir) && !seen(x, y, dir)) walk(x, y, dir);
  }
  // closed loops with no junction (an island in one other region)
  for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) if (!hSeen[y * W + x] && hOn(x, y)) walk(x, y, 0);
  for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) if (!vSeen[y * W1 + x] && vOn(x, y)) walk(x, y, 1);

  /* ---------- 3. fit every chain once ---------- */
  const cornerDeg = 100 - cornerLevel * 6;       // corners 0 -> 100° (only sharp turns), 10 -> 40°
  const sigma = (0.6 + smooth * 0.22) * Math.max(1, s * 0.6);
  const tol = Math.max(0.35, (0.25 + smooth * 0.06) * Math.max(1, s * 0.7));
  const eps = opts.eps ?? ((0.25 + smooth * 0.05) * s + 0.4);
  const rMax = Math.round(10 * Math.max(1, s));
  const fitted = chains.map(ch => fitChain(ch, { sigma, cornerDeg, tol, s, eps, rMax }));

  /* ---------- 4. regions -> cycles -> paths ---------- */
  const byComp = new Map();     // comp -> [{ chain, rev }]
  const add = (c, ref) => { if (c < 0) return; let a = byComp.get(c); if (!a) byComp.set(c, a = []); a.push(ref); };
  chains.forEach((ch, i) => { add(ch.left, { i, rev: false }); add(ch.right, { i, rev: true }); });
  const startOf = (r) => { const p = chains[r.i].pts; return r.rev ? (p[p.length - 2] + ',' + p[p.length - 1]) : (p[0] + ',' + p[1]); };
  const endOf = (r) => { const p = chains[r.i].pts; return r.rev ? (p[0] + ',' + p[1]) : (p[p.length - 2] + ',' + p[p.length - 1]); };
  const dirIn = (r) => r.rev ? (chains[r.i].first + 2) & 3 : chains[r.i].last;     // direction arriving at the end
  const dirOut = (r) => r.rev ? (chains[r.i].last + 2) & 3 : chains[r.i].first;    // direction leaving the start

  const regions = [];
  for (const [c, refs] of byComp) {
    const l = compLabel[c];
    if (skip.has(l)) continue;
    const at = new Map();
    for (const r of refs) { const k = startOf(r); let a = at.get(k); if (!a) at.set(k, a = []); a.push(r); }
    const used = new Set();
    const cycles = [];
    for (const r0 of refs) {
      if (used.has(r0)) continue;
      const cyc = [r0]; used.add(r0);
      const start = startOf(r0);
      let cur = r0;
      for (let guard = 0; guard < refs.length; guard++) {
        const e = endOf(cur);
        if (e === start) break;
        const cand = (at.get(e) || []).filter(r => !used.has(r));
        if (!cand.length) break;
        // pinch point: keep hugging this region = take the sharpest left turn
        const din = dirIn(cur);
        cand.sort((a, b) => turnRank(din, dirOut(a)) - turnRank(din, dirOut(b)));
        cur = cand[0]; used.add(cur); cyc.push(cur);
      }
      cycles.push(cyc);
    }
    // the outer cycle holds the top edge of the region's first pixel
    const fp = compFirst[c], fx = fp % W, fy = (fp / W) | 0;
    const topChain = hChain[fy * W + fx];
    let outer = cycles.findIndex(cy => cy.some(r => r.i === topChain));
    if (outer < 0) outer = 0;
    regions.push({ comp: c, label: l, cycles, outer, area: Math.abs(polyArea(cycles[outer], chains)) });
  }

  // stacked: fill holes, except holes that let something transparent show through
  let transparentPts = null;
  if (opts.stacked) {
    transparentPts = [];
    for (let c = 0; c < compLabel.length; c++) if (skip.has(compLabel[c])) {
      const p = compFirst[c]; transparentPts.push([(p % W) + 0.5, ((p / W) | 0) + 0.5]);
    }
  }
  const pathOf = (cyc) => cycleD(cyc, fitted, out);
  for (const r of regions) {
    let parts;
    if (opts.stacked) {
      // a region that touches itself at a corner can come out as several outer loops (a figure 8):
      // keep every loop that runs the same way round as the outer one, drop the holes
      const sgn = Math.sign(polyArea(r.cycles[r.outer], chains));
      parts = r.cycles.filter((cy, i) => i === r.outer || Math.sign(polyArea(cy, chains)) === sgn);
      if (transparentPts.length) r.cycles.forEach((cy, i) => {
        if (i === r.outer || parts.includes(cy)) return;
        const poly = rawPoly(cy, chains);
        if (transparentPts.some(([px, py]) => pointIn(poly, px, py))) parts.push(cy);
      });
    } else parts = r.cycles;
    r.d = parts.map(pathOf).join('');
  }
  if (opts.stacked) regions.sort((a, b) => b.area - a.area);
  return { regions, chains: chains.length };
}

/* ---------- helpers ---------- */
function turnRank(din, dout) {
  if (dout === ((din + 3) & 3)) return 0;   // left (y down: east -> north)
  if (dout === din) return 1;               // straight
  if (dout === ((din + 1) & 3)) return 2;   // right
  return 3;                                 // back
}

function rawPoly(cyc, chains) {
  const pts = [];
  for (const r of cyc) {
    const p = chains[r.i].pts, m = p.length / 2;
    if (r.rev) for (let k = m - 1; k > 0; k--) pts.push(p[k * 2], p[k * 2 + 1]);
    else for (let k = 0; k < m - 1; k++) pts.push(p[k * 2], p[k * 2 + 1]);
  }
  return pts;
}
function polyArea(cyc, chains) {
  const p = rawPoly(cyc, chains); let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] - p[i]) * (p[j + 1] + p[i + 1]);
  return a / 2;
}
function pointIn(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const fmt = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r); };
function cycleD(cyc, fitted, k) {
  // relative commands on a 0.1 px grid: much smaller files, no visible difference
  let d = '', px = 0, py = 0;
  const q = (v) => Math.round(v * 10) / 10;
  const num = (v) => { let t = String(Math.round(v * 10) / 10); if (t === '-0') t = '0'; return t.replace(/^(-?)0\./, '$1.'); };
  const join = (a) => { let o = ''; for (const t of a) o += (o && t[0] !== '-' && !(t[0] === '.' && /\.\d*$/.test(o.slice(-6)) && o.slice(o.lastIndexOf(' ') + 1).includes('.'))) ? ' ' + t : t; return o; };
  const rel = (p) => { const x = q(p[0] * k), y = q(p[1] * k); const r = [num(x - px), num(y - py)]; px = x; py = y; return r; };
  cyc.forEach((r, n) => {
    const segs = fitted[r.i];
    const list = r.rev ? segs.slice().reverse().map(s => s.length === 2 ? [s[1], s[0]] : [s[3], s[2], s[1], s[0]]) : segs;
    if (n === 0) { px = q(list[0][0][0] * k); py = q(list[0][0][1] * k); d += 'M' + join([num(px), num(py)]); }
    for (const s of list) {
      if (s.length === 2) d += 'l' + join(rel(s[1]));
      else {
        const x0 = px, y0 = py;
        const c = [s[1], s[2], s[3]].map(p => [q(p[0] * k), q(p[1] * k)]);
        px = c[2][0]; py = c[2][1];
        d += 'c' + join(c.flatMap(p => [num(p[0] - x0), num(p[1] - y0)]));
      }
    }
  });
  return d + 'z';
}

/* ---------- chain fitting ---------- */
/** Smooth a pixel chain into Bézier segments. Returns [[p0,p1] | [p0,c1,c2,p3], ...] in work-image px. */
function fitChain(ch, { sigma, cornerDeg, tol, s, eps, rMax }) {
  const raw = ch.pts, nv = raw.length / 2;
  // midpoints of the unit crack edges sit on the true edge far better than the pixel corners do
  let pts = [];
  if (ch.loop) {
    for (let i = 0; i < nv - 1; i++) pts.push([(raw[i * 2] + raw[i * 2 + 2]) / 2, (raw[i * 2 + 1] + raw[i * 2 + 3]) / 2]);
  } else {
    pts.push([raw[0], raw[1]]);
    for (let i = 0; i < nv - 1; i++) pts.push([(raw[i * 2] + raw[i * 2 + 2]) / 2, (raw[i * 2 + 1] + raw[i * 2 + 3]) / 2]);
    pts.push([raw[raw.length - 2], raw[raw.length - 1]]);
  }
  const m = pts.length;
  if (!ch.loop && m <= 3) return [[pts[0], pts[m - 1]]];
  if (ch.loop && m < 4) return [[pts[0], pts[1]], [pts[1], pts[m - 1]], [pts[m - 1], pts[0]]];

  // corners: big turn measured across a window, so the 1-px staircase of a diagonal never counts
  const kWin = Math.max(3, Math.round(1.1 * s));
  const cosLim = Math.cos(cornerDeg * Math.PI / 180);
  const at = (i) => ch.loop ? pts[((i % m) + m) % m] : pts[Math.max(0, Math.min(m - 1, i))];
  const turn = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    if (!ch.loop && (i < 2 || i > m - 3)) { turn[i] = 1; continue; }
    const k = ch.loop ? kWin : Math.min(kWin, i, m - 1 - i);
    const a = at(i - k), b = at(i), c = at(i + k);
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    turn[i] = lu && lv ? (ux * vx + uy * vy) / (lu * lv) : 1;   // cosine of the turn
  }
  let corners = [];
  for (let i = 0; i < m; i++) {
    if (turn[i] > cosLim) continue;
    let isMin = true;
    for (let j = -kWin; j <= kWin && isMin; j++) {
      if (!j) continue;
      const q = ch.loop ? ((i + j) % m + m) % m : i + j;
      if (q < 0 || q >= m) continue;
      if (turn[q] < turn[i] || (turn[q] === turn[i] && j < 0)) isMin = false;
    }
    if (isMin) corners.push(i);
  }
  // sharpen each corner: intersect the straight-ish runs either side
  const cornerPt = new Map();
  corners.forEach((i, ci) => {
    const k = kWin;
    // don't reach past the neighbouring corners
    const prev = corners.length > 1 ? corners[(ci - 1 + corners.length) % corners.length] : null;
    const next = corners.length > 1 ? corners[(ci + 1) % corners.length] : null;
    const gap = (a, b) => ch.loop ? ((b - a) % m + m) % m : b - a;
    const back = Math.max(k, Math.min(3 * k, prev == null ? (ch.loop ? 3 * k : i) : Math.floor(gap(prev, i) / 2)));
    const fwd = Math.max(k, Math.min(3 * k, next == null ? (ch.loop ? 3 * k : m - 1 - i) : Math.floor(gap(i, next) / 2)));
    const a0 = at(i - back), a1 = at(i - Math.min(k, back)), b0 = at(i + Math.min(k, fwd)), b1 = at(i + fwd);
    if (back <= k || fwd <= k) { cornerPt.set(i, at(i)); return; }
    const p = intersect(a0, a1, b0, b1);
    const c = at(i);
    if (p && Math.hypot(p[0] - c[0], p[1] - c[1]) < 1.5 * k) cornerPt.set(i, p); else cornerPt.set(i, c);
  });

  // split into runs between corners (and the chain ends), smooth each with pinned ends, fit Béziers
  const segsOut = [];
  const fitRun = (run, t1, t2) => {
    const sm = smoothRun(adaptiveRun(run, eps, rMax, false), 1, false);
    const T1 = t1 || tangent(sm, 0, 1), T2 = t2 || tangent(sm, sm.length - 1, -1);
    fitCubic(sm, 0, sm.length - 1, T1, T2, tol * tol, segsOut);
  };
  if (ch.loop && !corners.length) {
    // smooth closed curve: circular smoothing, matching tangents at the seam
    const sm = smoothRun(adaptiveRun(pts, eps, rMax, true), 1, true);
    sm.push(sm[0]);
    const t = norm([sm[1][0] - sm[sm.length - 2][0], sm[1][1] - sm[sm.length - 2][1]]);
    fitCubic(sm, 0, sm.length - 1, t, [-t[0], -t[1]], tol * tol, segsOut);
    return segsOut;
  }
  const cuts = ch.loop ? corners : [0, ...corners.filter(i => i > 1 && i < m - 2), m - 1];
  const P = (i) => cornerPt.get(i) || pts[i];
  const nr = ch.loop ? cuts.length : cuts.length - 1;
  for (let r = 0; r < nr; r++) {
    const a = cuts[r], b = ch.loop ? cuts[(r + 1) % cuts.length] : cuts[r + 1];
    const run = [P(a)];
    for (let i = a + 1; ; i++) { const q = ch.loop ? i % m : i; if (q === b) break; run.push(pts[q]); if (run.length > m + 2) break; }
    run.push(P(b));
    if (run.length <= 2) { segsOut.push([run[0], run[run.length - 1]]); continue; }
    fitRun(run);
  }
  return segsOut;
}

function intersect(a0, a1, b0, b1) {
  const d1x = a1[0] - a0[0], d1y = a1[1] - a0[1], d2x = b1[0] - b0[0], d2y = b1[1] - b0[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b0[0] - a0[0]) * d2y - (b0[1] - a0[1]) * d2x) / den;
  return [a0[0] + t * d1x, a0[1] + t * d1y];
}

/** Adaptive local fitting: each point is replaced by a quadratic fitted to the widest window of its neighbours
    that the quadratic still explains within eps. Long gentle edges get wide windows, so the pixel staircase of a
    shallow line straightens out completely; tight curves get narrow windows and keep their shape. */
function adaptiveRun(p, eps, rMax, loop) {
  const m = p.length, out = new Array(m), e2 = eps * eps;
  const get = (q) => p[loop ? ((q % m) + m) % m : q];
  const fitAt = (i, a, b) => {
    // least squares x(t), y(t) = c0 + c1 t + c2 t^2 over t in [-a, b]
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, x0 = 0, x1 = 0, x2 = 0, y0 = 0, y1 = 0, y2 = 0;
    for (let t = -a; t <= b; t++) {
      const q = get(i + t), t2 = t * t;
      s0++; s1 += t; s2 += t2; s3 += t2 * t; s4 += t2 * t2;
      x0 += q[0]; x1 += q[0] * t; x2 += q[0] * t2; y0 += q[1]; y1 += q[1] * t; y2 += q[1] * t2;
    }
    const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    if (Math.abs(det) < 1e-9) return null;
    const solve = (r0, r1, r2) => [
      (r0 * (s2 * s4 - s3 * s3) - s1 * (r1 * s4 - s3 * r2) + s2 * (r1 * s3 - s2 * r2)) / det,
      (s0 * (r1 * s4 - r2 * s3) - r0 * (s1 * s4 - s3 * s2) + s2 * (s1 * r2 - r1 * s2)) / det,
      (s0 * (s2 * r2 - s3 * r1) - s1 * (s1 * r2 - r1 * s2) + r0 * (s1 * s3 - s2 * s2)) / det];
    const cx = solve(x0, x1, x2), cy = solve(y0, y1, y2);
    for (let t = -a; t <= b; t++) {
      const q = get(i + t);
      const fx = cx[0] + cx[1] * t + cx[2] * t * t, fy = cy[0] + cy[1] * t + cy[2] * t * t;
      if ((fx - q[0]) ** 2 + (fy - q[1]) ** 2 > e2) return null;
    }
    return [cx[0], cy[0]];
  };
  for (let i = 0; i < m; i++) {
    if (!loop && (i === 0 || i === m - 1)) { out[i] = p[i]; continue; }
    let best = p[i];
    for (let r = 2; r <= rMax; r = Math.ceil(r * 1.5)) {
      const a = loop ? Math.min(r, (m >> 1) - 1) : Math.min(r, i), b = loop ? a : Math.min(r, m - 1 - i);
      if (a + b < 3) break;
      const f = fitAt(i, a, b);
      if (!f) break;
      best = f;
      if (!loop && (a < r && b < r)) break;
    }
    out[i] = best;
  }
  return out;
}

/** Gaussian smoothing. Open runs keep both ends fixed and shrink the kernel near them. */
function smoothRun(p, sigma, loop) {
  const m = p.length, out = new Array(m);
  const r = Math.ceil(sigma * 2.5);
  const g = []; for (let j = -r; j <= r; j++) g.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  for (let i = 0; i < m; i++) {
    if (!loop && (i === 0 || i === m - 1)) { out[i] = p[i]; continue; }
    const rr = loop ? r : Math.min(r, i, m - 1 - i);
    let x = 0, y = 0, w = 0;
    for (let j = -rr; j <= rr; j++) {
      const q = loop ? ((i + j) % m + m) % m : i + j;
      const wt = g[j + r];
      x += p[q][0] * wt; y += p[q][1] * wt; w += wt;
    }
    out[i] = [x / w, y / w];
  }
  return out;
}

const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
function tangent(p, i, dir) {
  // direction from p[i] toward a point a few steps along the run
  const j = Math.max(0, Math.min(p.length - 1, i + dir * Math.min(3, p.length - 1)));
  return norm([p[j][0] - p[i][0], p[j][1] - p[i][1]]);
}

/* ---------- Schneider (Graphics Gems 1990): least-squares cubic fitting ---------- */
function fitCubic(d, first, last, t1, t2, err, out) {
  const nPts = last - first + 1;
  if (nPts === 2) {
    out.push([d[first], d[last]]);
    return;
  }
  let u = chordParam(d, first, last);
  let bez = genBezier(d, first, last, u, t1, t2);
  let [maxErr, split] = maxError(d, first, last, bez, u);
  if (maxErr < err) { out.push(asSeg(bez)); return; }
  if (maxErr < err * 9) {
    for (let it = 0; it < 6; it++) {
      u = reparam(d, first, last, u, bez);
      bez = genBezier(d, first, last, u, t1, t2);
      [maxErr, split] = maxError(d, first, last, bez, u);
      if (maxErr < err) { out.push(asSeg(bez)); return; }
    }
  }
  split = Math.max(first + 1, Math.min(last - 1, split));
  const tc = norm([d[split - 1][0] - d[split + 1][0], d[split - 1][1] - d[split + 1][1]]);
  fitCubic(d, first, split, t1, tc, err, out);
  fitCubic(d, split, last, [-tc[0], -tc[1]], t2, err, out);
}
/** a cubic that is really a straight line is written as one */
function asSeg(b) {
  const [p0, c1, c2, p3] = b;
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1], L = Math.hypot(dx, dy);
  if (L > 0) {
    const off = (p) => Math.abs((p[0] - p0[0]) * dy - (p[1] - p0[1]) * dx) / L;
    if (off(c1) < 0.08 && off(c2) < 0.08) return [p0, p3];
  }
  return b;
}
function chordParam(d, first, last) {
  const u = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]));
  const L = u[u.length - 1] || 1;
  return u.map(v => v / L);
}
function bezPt(b, t) {
  const mt = 1 - t, a = mt * mt * mt, c = 3 * mt * mt * t, e = 3 * mt * t * t, f = t * t * t;
  return [a * b[0][0] + c * b[1][0] + e * b[2][0] + f * b[3][0], a * b[0][1] + c * b[1][1] + e * b[2][1] + f * b[3][1]];
}
function genBezier(d, first, last, u, t1, t2) {
  const p0 = d[first], p3 = d[last];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < u.length; i++) {
    const t = u[i], mt = 1 - t;
    const b0 = mt * mt * mt, b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t, b3 = t * t * t;
    const A0 = [t1[0] * b1, t1[1] * b1], A1 = [t2[0] * b2, t2[1] * b2];
    c00 += A0[0] * A0[0] + A0[1] * A0[1];
    c01 += A0[0] * A1[0] + A0[1] * A1[1];
    c11 += A1[0] * A1[0] + A1[1] * A1[1];
    const p = d[first + i];
    const tx = p[0] - (p0[0] * (b0 + b1) + p3[0] * (b2 + b3)), ty = p[1] - (p0[1] * (b0 + b1) + p3[1] * (b2 + b3));
    x0 += A0[0] * tx + A0[1] * ty; x1 += A1[0] * tx + A1[1] * ty;
  }
  const det = c00 * c11 - c01 * c01;
  let a1 = det ? (x0 * c11 - x1 * c01) / det : 0, a2 = det ? (c00 * x1 - c01 * x0) / det : 0;
  const seg = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]), eps = 1e-6 * seg;
  if (a1 < eps || a2 < eps || a1 > seg * 2 || a2 > seg * 2) { a1 = a2 = seg / 3; }
  return [p0, [p0[0] + t1[0] * a1, p0[1] + t1[1] * a1], [p3[0] + t2[0] * a2, p3[1] + t2[1] * a2], p3];
}
function maxError(d, first, last, b, u) {
  let max = 0, split = (first + last) >> 1;
  for (let i = first + 1; i < last; i++) {
    const p = bezPt(b, u[i - first]);
    const e = (p[0] - d[i][0]) ** 2 + (p[1] - d[i][1]) ** 2;
    if (e >= max) { max = e; split = i; }
  }
  return [max, split];
}
function reparam(d, first, last, u, b) {
  const q1 = [0, 1, 2].map(i => [3 * (b[i + 1][0] - b[i][0]), 3 * (b[i + 1][1] - b[i][1])]);
  const q2 = [0, 1].map(i => [2 * (q1[i + 1][0] - q1[i][0]), 2 * (q1[i + 1][1] - q1[i][1])]);
  return u.map((t, k) => {
    const p = d[first + k];
    const Q = bezPt(b, t);
    const mt = 1 - t;
    const Q1 = [mt * mt * q1[0][0] + 2 * mt * t * q1[1][0] + t * t * q1[2][0], mt * mt * q1[0][1] + 2 * mt * t * q1[1][1] + t * t * q1[2][1]];
    const Q2 = [mt * q2[0][0] + t * q2[1][0], mt * q2[0][1] + t * q2[1][1]];
    const num = (Q[0] - p[0]) * Q1[0] + (Q[1] - p[1]) * Q1[1];
    const den = Q1[0] * Q1[0] + Q1[1] * Q1[1] + (Q[0] - p[0]) * Q2[0] + (Q[1] - p[1]) * Q2[1];
    if (!den) return t;
    const nt = t - num / den;
    return Math.max(0, Math.min(1, nt));
  });
}
