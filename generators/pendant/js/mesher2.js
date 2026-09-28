// Label mesher + planar simplification.
//
// buildMeshLabeled: marching triangles over the outline SDF and a per-vertex label field. Each label is a
// crisp height layer (image terrace, lettering, peg…) riding on the continuous surface Zc. Boundaries sit on
// smooth iso-lines, and neighbouring labels are joined by true vertical walls. At points where several walls
// meet, every wall column carries all intermediate vertices, so the result is a single watertight 2-manifold.
//
// simplifyPlanar: merges every coplanar patch (flat tops, terraces, the back, straight walls) into the minimum
// triangulation of its boundary. Boundary vertices are preserved, so neighbouring patches stay manifold.
import { ShapeUtils, Vector2 } from 'three';

// { lo, hi }: build only the slice of the solid between two heights (one colour of a multi-colour print).
// Every piece of the top/bottom surface is clipped exactly to the slice with straight cut lines, walls are
// split at every point where a surface crosses lo/hi, and vertices are shared by (point, height), so each
// slice is itself a watertight solid whose faces meet the neighbouring slice exactly.
export function buildMeshLabeled(F, { lo = -Infinity, hi = Infinity } = {}) {
  const { nx, ny, c, x0, y0, S, Zc, Zb, labels, labelTop, splitT } = F;
  const n = nx * ny, nH = (nx - 1) * ny, nV = nx * (ny - 1), nD = (nx - 1) * (ny - 1), nE = nH + nV + nD;
  const banded = lo > -Infinity || hi < Infinity;
  if (hi - lo < 1e-6) return finalizeMesh(new Float32Array(0), new Float32Array(0), []); // empty slice

  let cap = Math.max(4096, Math.ceil(n * 2.2)), pos = new Float32Array(cap * 3), thk = new Float32Array(cap), nv = 0;
  const addV = (x, y, z, t) => {
    if (nv >= cap) { cap *= 2; const p2 = new Float32Array(cap * 3); p2.set(pos); pos = p2; const t2 = new Float32Array(cap); t2.set(thk); thk = t2; }
    pos[nv * 3] = x; pos[nv * 3 + 1] = y; pos[nv * 3 + 2] = z; thk[nv] = t; return nv++;
  };

  // Points: grid corners [0, n), edge points n + e, extra points (centres, slice cuts) n + nE + i.
  const eX = new Float64Array(nE), eY = new Float64Array(nE), eZc = new Float64Array(nE), eZb = new Float64Array(nE), eOk = new Uint8Array(nE);
  const eA = new Int32Array(nE), eB = new Int32Array(nE), eT = new Float64Array(nE); // edge point = lerp(eA, eB, eT)
  const xX = [], xY = [], xZc = [], xZb = [], xPar = [], xKey = new Map();          // extra point = Σ weight · parent
  const px = (p) => (p < n ? x0 + (p % nx) * c : p < n + nE ? eX[p - n] : xX[p - n - nE]);
  const py = (p) => (p < n ? y0 + ((p / nx) | 0) * c : p < n + nE ? eY[p - n] : xY[p - n - nE]);
  const pzc = (p) => (p < n ? Zc[p] : p < n + nE ? eZc[p - n] : xZc[p - n - nE]);
  const pzb = (p) => (p < n ? Zb[p] : p < n + nE ? eZb[p - n] : xZb[p - n - nE]);
  const newPoint = (x, y, zc, zb, par) => { xX.push(x); xY.push(y); xZc.push(zc); xZb.push(zb); xPar.push(par); return n + nE + xX.length - 1; };
  // A point on segment a–b at parameter t (from the lower id), identified by key so every face sharing it agrees.
  // Different cut lines can meet the same spot (e.g. two labels' tops reaching a slice boundary together):
  // coincident points are merged so one location is always one point.
  const xPos = new Map();
  const cutPoint = (key, a, b, t) => {
    let id = xKey.get(key);
    if (id !== undefined) return id;
    if (t <= 1e-12) id = a; else if (t >= 1 - 1e-12) id = b;
    else {
      const x = px(a) + (px(b) - px(a)) * t, y = py(a) + (py(b) - py(a)) * t, pk = `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
      id = xPos.get(pk);
      if (id === undefined) { id = newPoint(x, y, pzc(a) + (pzc(b) - pzc(a)) * t, pzb(a) + (pzb(b) - pzb(a)) * t, [[a, 1 - t], [b, t]]); xPos.set(pk, id); }
    }
    xKey.set(key, id);
    return id;
  };

  // Unclipped top of label l. Evaluated exactly at grid vertices only; every derived point (edge split, centre,
  // slice cut) takes the interpolation of its parents. Tops are thus linear inside each piece — also for curved
  // label surfaces (rims, collars) — so a cut placed where a top meets a slice plane lies on that plane exactly.
  const tMemo = new Map();
  const T = (l, p) => {
    if (p < n) return Math.max(labelTop(l, Zc[p], px(p), py(p)), Zb[p] + 0.2);
    const key = p * 4096 + l; let z = tMemo.get(key);
    if (z === undefined) {
      z = 0;
      if (p < n + nE) { const e = p - n; z = T(l, eA[e]) * (1 - eT[e]) + T(l, eB[e]) * eT[e]; }
      else for (const [q, w] of xPar[p - n - nE]) z += T(l, q) * w;
      tMemo.set(key, z);
    }
    return z;
  };
  // clamp to the slice; heights within the tolerance of a boundary snap onto it exactly
  const cl = (z) => (z < lo + 2e-5 ? lo : z > hi - 2e-5 ? hi : z);
  const zTop = (l, p) => cl(T(l, p)), zBot = (p) => cl(pzb(p));

  // Vertices are identified by (point, height): zero-height walls and equal-height labels share vertices.
  const vmap = new Map(), levels = new Map();
  const vtx = (p, z) => {
    const key = p * 1e8 + Math.round(z * 1e6); // heights < 100 mm, identity at 1 nm — finer than every tolerance
    let v = vmap.get(key);
    if (v === undefined) {
      v = addV(px(p), py(p), z, z - pzb(p)); vmap.set(key, v);
      let L = levels.get(p); if (!L) levels.set(p, (L = [])); L.push(z);
    }
    return v;
  };

  const edgeId = (ka, kb) => {
    const lo2 = Math.min(ka, kb), d = Math.abs(ka - kb), i = lo2 % nx, j = (lo2 / nx) | 0;
    return d === 1 ? j * (nx - 1) + i : d === nx ? nH + j * nx + i : nH + nV + j * (nx - 1) + i;
  };
  // Split point on a grid edge — computed once, from the lower-index end, so both triangles agree exactly.
  const edgePoint = (ka, kb) => {
    const e = edgeId(ka, kb);
    if (!eOk[e]) {
      const a = Math.min(ka, kb), b = Math.max(ka, kb), inA = S[a] < 0, inB = S[b] < 0;
      const t = inA !== inB ? Math.min(0.98, Math.max(0.02, S[a] / (S[a] - S[b]))) : splitT(a, b, labels[a], labels[b]);
      const xa = x0 + (a % nx) * c, ya = y0 + ((a / nx) | 0) * c, xb = x0 + (b % nx) * c, yb = y0 + ((b / nx) | 0) * c;
      eX[e] = xa + (xb - xa) * t; eY[e] = ya + (yb - ya) * t;
      eZc[e] = Zc[a] + (Zc[b] - Zc[a]) * t; eZb[e] = Zb[a] + (Zb[b] - Zb[a]) * t; eOk[e] = 1;
      eA[e] = a; eB[e] = b; eT[e] = t;
    }
    return n + e;
  };
  const centre = (p1, p2, p3) => newPoint((px(p1) + px(p2) + px(p3)) / 3, (py(p1) + py(p2) + py(p3)) / 3, (pzc(p1) + pzc(p2) + pzc(p3)) / 3, (pzb(p1) + pzb(p2) + pzb(p3)) / 3, [[p1, 1 / 3], [p2, 1 / 3], [p3, 1 / 3]]);

  // ── slice clipping helpers (only used when banded) ──
  const EPS = 2e-5; // mm — above float32 rounding of stored heights, far below any printable feature
  const crossing = (key, a, b, fa, fb) => { // point where f = 0 on a–b; key/parameter from the lower id
    const [u, w, fu, fw] = a < b ? [a, b, fa, fb] : [b, a, fb, fa];
    return cutPoint(`${key}|${u}|${w}`, u, w, fu / (fu - fw));
  };
  const cut = (poly, f, key, keep) => { // keep the part where keep·f ≥ 0
    const fv = poly.map(f), out = [];
    if (!fv.some((v) => v * keep > EPS)) return null; // nothing strictly on the kept side: zero-thickness, drop it
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length, a = fv[i] * keep, b = fv[j] * keep;
      if (a >= -EPS) out.push(poly[i]);
      if ((a > EPS && b < -EPS) || (a < -EPS && b > EPS)) out.push(crossing(key, poly[i], poly[j], fv[i], fv[j]));
    }
    return out.length >= 3 ? out : null;
  };
  const split = (poly, f, key) => {
    const fv = poly.map(f);
    if (fv.every((v) => v >= -EPS) || fv.every((v) => v <= EPS)) return [poly]; // not straddling (incl. lying on the line)
    return [cut(poly, f, key, -1), cut(poly, f, key, 1)].filter(Boolean);
  };
  // Every place along a boundary segment where either side's surface meets lo/hi becomes a shared vertex.
  // Also where the two sides' surfaces cross each other along the boundary, so every wall piece has one
  // consistently higher side.
  const breakpoints = (p, q, la, lb) => {
    const a = Math.min(p, q), b = Math.max(p, q), list = [];
    const add = (key, fa, fb) => { if ((fa > EPS && fb < -EPS) || (fa < -EPS && fb > EPS)) list.push([fa / (fa - fb), cutPoint(`${key}|${a}|${b}`, a, b, fa / (fa - fb))]); };
    if (la >= 0 && lb >= 0) { const [l1, l2] = la < lb ? [la, lb] : [lb, la]; add(`X${l1}_${l2}`, T(l1, a) - T(l2, a), T(l1, b) - T(l2, b)); }
    if (!banded) { list.sort((u, v) => u[0] - v[0]); const pts = list.map((e) => e[1]); return p === a ? pts : pts.reverse(); }
    for (const l of [la, lb]) if (l >= 0) { if (lo > -Infinity) add(`T${l}lo`, T(l, a) - lo, T(l, b) - lo); if (hi < Infinity) add(`T${l}hi`, T(l, a) - hi, T(l, b) - hi); }
    if (lo > -Infinity) add('Blo', pzb(a) - lo, pzb(b) - lo);
    if (hi < Infinity) add('Bhi', pzb(a) - hi, pzb(b) - hi);
    list.sort((u, v) => u[0] - v[0]);
    const pts = []; for (const [t, id] of list) if (!pts.includes(id)) pts.push(id);
    return p === a ? pts : pts.reverse(); // ordered from p to q
  };
  const insertOn = (poly, p, q, bps) => {
    if (!bps.length) return poly;
    for (let i = 0; i < poly.length; i++) if (poly[i] === p && poly[(i + 1) % poly.length] === q) { poly.splice(i + 1, 0, ...bps); return poly; }
    return poly;
  };

  // Ear clipping in the xy plane (pieces are CCW); keeps collinear points so neighbours stay T-junction free.
  const earXY = (poly0) => {
    const cr = (a, b, d) => (px(b) - px(a)) * (py(d) - py(a)) - (py(b) - py(a)) * (px(d) - px(a));
    const poly = poly0.filter((p, i) => p !== poly0[(i + 1) % poly0.length]); // drop repeated consecutive points
    if (poly.length < 3) return [];
    if (poly.length === 3) return cr(poly[0], poly[1], poly[2]) > 1e-14 ? [poly] : [];
    const idx = poly.slice(), out = [];
    for (let guard = 0; idx.length > 3 && guard < 400; guard++) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[(i - 1 + idx.length) % idx.length], b = idx[i], d = idx[(i + 1) % idx.length];
        if (cr(a, b, d) <= 1e-14) continue;
        let inside = false;
        for (const q of idx) { if (q === a || q === b || q === d) continue; if (cr(a, b, q) >= -1e-14 && cr(b, d, q) >= -1e-14 && cr(d, a, q) >= -1e-14) { inside = true; break; } }
        if (inside) continue;
        out.push([a, b, d]); idx.splice(i, 1); clipped = true; break;
      }
      if (!clipped) break;
    }
    if (idx.length === 3 && cr(idx[0], idx[1], idx[2]) > 1e-14) out.push(idx.slice());
    else if (idx.length > 3) {
      // near-degenerate leftovers from slice cuts: the remaining piece is convex, so a centre fan is always valid
      const cx = idx.reduce((s, p) => s + px(p), 0) / idx.length, cy = idx.reduce((s, p) => s + py(p), 0) / idx.length;
      const O = newPoint(cx, cy, idx.reduce((s, p) => s + pzc(p), 0) / idx.length, idx.reduce((s, p) => s + pzb(p), 0) / idx.length, idx.map((p) => [p, 1 / idx.length]));
      for (let i = 0; i < idx.length; i++) { const a = idx[i], b = idx[(i + 1) % idx.length]; if (cr(O, a, b) > 1e-14) out.push([O, a, b]); }
    }
    return out;
  };

  const tri = [], walls = [];
  const emitPiece = (poly, l) => {
    if (l < 0) return;
    let polys = [poly];
    if (banded) {
      if (lo > -Infinity) polys = polys.map((pl) => cut(pl, (p) => T(l, p) - lo, `T${l}lo`, 1)).filter(Boolean);
      if (hi < Infinity) polys = polys.map((pl) => cut(pl, (p) => pzb(p) - hi, 'Bhi', -1)).filter(Boolean);
      if (hi < Infinity) polys = polys.flatMap((pl) => split(pl, (p) => T(l, p) - hi, `T${l}hi`));
      if (lo > -Infinity) polys = polys.flatMap((pl) => split(pl, (p) => pzb(p) - lo, 'Blo'));
    }
    for (const pl of polys) for (const [a, b, d] of earXY(pl)) {
      tri.push(vtx(a, zTop(l, a)), vtx(b, zTop(l, b)), vtx(d, zTop(l, d)));
      tri.push(vtx(a, zBot(a)), vtx(d, zBot(d)), vtx(b, zBot(b)));
    }
  };

  const V = [0, 0, 0], Lb = [0, 0, 0];
  const processTri = (a, b, d) => {
    const ia = S[a] < 0, ib = S[b] < 0, id = S[d] < 0;
    if (!ia && !ib && !id) return;
    const la = ia ? labels[a] : -1, lb = ib ? labels[b] : -1, ld = id ? labels[d] : -1;
    if (la === lb && lb === ld) { emitPiece([a, b, d], la); return; }
    V[0] = a; V[1] = b; V[2] = d; Lb[0] = la; Lb[1] = lb; Lb[2] = ld;
    const segs = [];
    let pieces;
    if (la === lb || lb === ld || la === ld) { // two labels: one lone vertex
      const lone = la !== lb && la !== ld ? 0 : lb !== la && lb !== ld ? 1 : 2;
      const X = V[lone], Y = V[(lone + 1) % 3], Zv = V[(lone + 2) % 3], lx = Lb[lone], ly = Lb[(lone + 1) % 3];
      const P = edgePoint(X, Y), Q = edgePoint(Zv, X);
      pieces = [[[X, P, Q], lx], [[P, Y, Zv, Q], ly]];
      segs.push([P, Q, lx, ly]);
    } else { // three labels meet: split at the edge points and a centre point
      const Pab = edgePoint(a, b), Pbd = edgePoint(b, d), Pda = edgePoint(d, a), O = centre(Pab, Pbd, Pda);
      pieces = [[[a, Pab, O, Pda], la], [[b, Pbd, O, Pab], lb], [[d, Pda, O, Pbd], ld]];
      segs.push([Pab, O, la, lb], [O, Pda, la, ld], [Pbd, O, lb, ld]);
    }
    for (const [p, q, l1, l2] of segs) {
      const bps = breakpoints(p, q, l1, l2);
      for (const [poly] of pieces) { insertOn(poly, p, q, bps); insertOn(poly, q, p, bps.slice().reverse()); }
      // record both orientations; the wall is emitted from the higher side only
      if (l1 >= 0) walls.push([p, q, l1, l2, bps]);
      if (l2 >= 0) walls.push([q, p, l2, l1, bps.slice().reverse()]);
    }
    for (const [poly, l] of pieces) emitPiece(poly, l);
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k0 = j * nx + i;
    processTri(k0, k0 + 1, k0 + nx + 1);
    processTri(k0, k0 + nx + 1, k0 + nx);
  }

  // Walls, emitted from the higher side. Each column spans from the lower side's surface (or the floor) up to
  // the higher side's surface, clipped to the slice, and carries every vertex already present at that point.
  const column = (x, L, R) => {
    const zLo = R < 0 ? zBot(x) : Math.max(zTop(R, x), zBot(x)), zHi = Math.max(zTop(L, x), zLo);
    if (zHi - zLo < 1e-7) return [[zLo, vtx(x, zLo)]];
    const col = [[zLo, vtx(x, zLo)]];
    for (const z of levels.get(x) || []) if (z > zLo + 1e-7 && z < zHi - 1e-7) col.push([z, vtx(x, z)]);
    col.push([zHi, vtx(x, zHi)]);
    return col.sort((u, v) => u[0] - v[0]);
  };
  for (const [p, q, L, R, bps] of walls) {
    const pts = [p, ...bps, q];
    for (let s = 0; s < pts.length - 1; s++) {
      // emitted by the higher side only (equal heights at both ends: no wall)
      if (R >= 0 && T(R, pts[s]) >= T(L, pts[s]) - 1e-9 && T(R, pts[s + 1]) >= T(L, pts[s + 1]) - 1e-9) continue;
      const Lc = column(pts[s], L, R), Rc = column(pts[s + 1], L, R);
      if (Lc.length < 2 && Rc.length < 2) continue;
      let i = 0, k = 0;
      while (i < Lc.length - 1 || k < Rc.length - 1) {
        if (k < Rc.length - 1 && (i >= Lc.length - 1 || Rc[k + 1][0] - Rc[0][0] <= Lc[i + 1][0] - Lc[0][0])) { tri.push(Lc[i][1], Rc[k][1], Rc[k + 1][1]); k++; }
        else { tri.push(Lc[i][1], Rc[k][1], Lc[i + 1][1]); i++; }
      }
    }
  }
  // drop degenerate triangles that zero-height slices can produce (two identical vertices)
  const clean = [];
  for (let t = 0; t < tri.length; t += 3) if (tri[t] !== tri[t + 1] && tri[t + 1] !== tri[t + 2] && tri[t] !== tri[t + 2]) clean.push(tri[t], tri[t + 1], tri[t + 2]);
  const M = finalizeMesh(pos.slice(0, nv * 3), thk.slice(0, nv), clean);
  return banded ? splitPinches(M) : M;
}

// Where a slice pinches to zero thickness along an edge with material on both sides, four faces share that
// edge. Give each side its own copy of the pinch vertices, so both sides are clean 2-manifold sheets that
// merely touch (exactly how the slicer treats them).
export function splitPinches(M) {
  const I = M.exportIndex, nf = I.length / 3, cnt = new Map(), ek = (a, b) => (a < b ? a * 67108864 + b : b * 67108864 + a);
  for (let f = 0; f < nf; f++) for (let e = 0; e < 3; e++) { const k = ek(I[f * 3 + e], I[f * 3 + (e + 1) % 3]); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const pinchV = new Set();
  for (const [k, c] of cnt) if (c > 2) { pinchV.add(Math.floor(k / 67108864)); pinchV.add(k % 67108864); }
  if (!pinchV.size) return M;
  // which side of the (horizontal) pinch edge v–o a face's third corner lies on, in plan view
  const P0 = M.positions;
  const side = (f, v, o) => {
    const c = [I[f * 3], I[f * 3 + 1], I[f * 3 + 2]].find((x) => x !== v && x !== o);
    const ex = P0[o * 3] - P0[v * 3], ey = P0[o * 3 + 1] - P0[v * 3 + 1], cx = P0[c * 3] - P0[v * 3], cy = P0[c * 3 + 1] - P0[v * 3 + 1];
    return Math.sign(ex * cy - ey * cx);
  };
  const vf = new Map(); for (const v of pinchV) vf.set(v, []);
  for (let f = 0; f < nf; f++) for (let e = 0; e < 3; e++) { const v = I[f * 3 + e]; if (vf.has(v)) vf.get(v).push(f); }
  const J = new Uint32Array(I), extra = [];
  let next = M.nCanon;
  for (const [v, faces] of vf) {
    // connect faces around v through manifold edges only; each connected fan beyond the first gets a new vertex
    const comp = new Map(); let nc = 0;
    for (const f0 of faces) {
      if (comp.has(f0)) continue;
      const st = [f0]; comp.set(f0, nc);
      while (st.length) {
        const f = st.pop();
        for (let e = 0; e < 3; e++) {
          const a = I[f * 3 + e], b = I[f * 3 + (e + 1) % 3];
          if (a !== v && b !== v) continue;
          const o = a === v ? b : a, pinch = cnt.get(ek(a, b)) > 2, sf = pinch ? side(f, v, o) : 0;
          for (const g of faces) {
            if (comp.has(g) || g === f || !(I[g * 3] === o || I[g * 3 + 1] === o || I[g * 3 + 2] === o)) continue;
            if (pinch && side(g, v, o) !== sf) continue; // across a pinch only faces on the same side form one sheet
            comp.set(g, nc); st.push(g);
          }
        }
      }
      nc++;
    }
    for (let c = 1; c < nc; c++) {
      const nvId = next++; extra.push(v);
      for (const [f, cc] of comp) if (cc === c) for (let e = 0; e < 3; e++) if (J[f * 3 + e] === v) J[f * 3 + e] = nvId;
    }
  }
  if (!extra.length) return M;
  const P = new Float32Array(next * 3), T = new Float32Array(next);
  P.set(M.positions.subarray(0, M.nCanon * 3)); T.set(M.thick.subarray(0, M.nCanon));
  extra.forEach((v, i) => { const d = M.nCanon + i; P[d * 3] = M.positions[v * 3]; P[d * 3 + 1] = M.positions[v * 3 + 1]; P[d * 3 + 2] = M.positions[v * 3 + 2]; T[d] = M.thick[v]; });
  return finalizeMesh(P, T, J);
}

export function finalizeMesh(positions, thick, triList) {
  const idx = triList instanceof Uint32Array ? triList : new Uint32Array(triList);
  const n = positions.length / 3, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const used = new Uint8Array(n); for (let t = 0; t < idx.length; t++) used[idx[t]] = 1;
  for (let i = 0; i < n; i++) if (used[i]) for (let a = 0; a < 3; a++) { const v = positions[i * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3, P = positions;
    vol += (P[a] * (P[b + 1] * P[d + 2] - P[b + 2] * P[d + 1]) - P[a + 1] * (P[b] * P[d + 2] - P[b + 2] * P[d]) + P[a + 2] * (P[b] * P[d + 1] - P[b + 1] * P[d])) / 6;
  }
  return { positions, thick, nCanon: n, exportIndex: idx, renderIndex: idx, triCount: idx.length / 3, volume: vol, bbox: { min: mn, max: mx } };
}

// Removes vertices no triangle uses and renumbers.
export function compactMesh(M) {
  const n = M.nCanon, map = new Int32Array(n).fill(-1), I = M.exportIndex;
  let m = 0; for (let t = 0; t < I.length; t++) if (map[I[t]] < 0) map[I[t]] = m++;
  if (m === n) return M;
  const P = new Float32Array(m * 3), T = new Float32Array(m);
  for (let i = 0; i < n; i++) { const d = map[i]; if (d < 0) continue; P[d * 3] = M.positions[i * 3]; P[d * 3 + 1] = M.positions[i * 3 + 1]; P[d * 3 + 2] = M.positions[i * 3 + 2]; T[d] = M.thick[i]; }
  const J = new Uint32Array(I.length); for (let t = 0; t < I.length; t++) J[t] = map[I[t]];
  return { ...M, positions: P, thick: T, nCanon: m, exportIndex: J, renderIndex: J };
}

// ── Planar simplification (vertex removal) ────────────────
// Removes vertices that carry no shape information and re-triangulates the hole they leave:
//  • flat vertices — every incident triangle lies in one plane (tops, terraces, the back);
//  • crease vertices — incident triangles lie in exactly two planes and the vertex sits on the straight crease
//    between them (straight walls, straight top/bottom edges).
// Each step is validated (area kept, orientation kept, no duplicate edges), so the mesh stays a watertight
// 2-manifold while unnecessary vertices and triangles disappear. Independent-set passes keep fans small.
export function simplifyPlanar(M, { angTol = 2e-6, distTol = 3e-4 } = {}) {
  const P = M.positions, nv = M.nCanon;
  const F = Array.from(M.exportIndex), alive = [], Nx = [], Ny = [], Nz = [], Dd = [], Ar = [];
  const vf = Array.from({ length: nv }, () => []);
  const initFace = (f) => {
    const a = F[f * 3] * 3, b = F[f * 3 + 1] * 3, d = F[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, l = Math.hypot(cx, cy, cz) || 1e-30;
    Nx[f] = cx / l; Ny[f] = cy / l; Nz[f] = cz / l; Ar[f] = l / 2; Dd[f] = Nx[f] * P[a] + Ny[f] * P[a + 1] + Nz[f] * P[a + 2];
    alive[f] = 1; vf[F[f * 3]].push(f); vf[F[f * 3 + 1]].push(f); vf[F[f * 3 + 2]].push(f);
  };
  for (let f = 0; f < F.length / 3; f++) initFace(f);
  const addFace = (a, b, d) => { const f = F.length / 3; F.push(a, b, d); initFace(f); };
  const samePlane = (f, g) => Nx[f] * Nx[g] + Ny[f] * Ny[g] + Nz[f] * Nz[g] > 1 - angTol && Math.abs(Dd[f] - Dd[g]) < distTol;
  const hasEdge = (x, y, fl) => { for (const f of vf[x]) if (alive[f] && !fl.includes(f) && (F[f * 3] === y || F[f * 3 + 1] === y || F[f * 3 + 2] === y)) return true; return false; };

  // Ear clipping in the plane's 2D projection. Keeps every vertex (collinear ones included); null if stuck.
  const earClip = (poly, nrm) => {
    const ax = Math.abs(nrm[0]), ay = Math.abs(nrm[1]), az = Math.abs(nrm[2]);
    const [iu, iv, sgn] = az >= ax && az >= ay ? [0, 1, Math.sign(nrm[2])] : ax >= ay ? [1, 2, Math.sign(nrm[0])] : [2, 0, Math.sign(nrm[1])];
    const X = poly.map((v) => P[v * 3 + iu]), Y = poly.map((v) => P[v * 3 + iv]);
    const idx = poly.map((_, i) => i), out = [];
    const cross = (a, b, d) => ((X[b] - X[a]) * (Y[d] - Y[a]) - (Y[b] - Y[a]) * (X[d] - X[a])) * sgn;
    let guard = 0;
    while (idx.length > 3 && guard++ < 4 * poly.length * poly.length) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[(i - 1 + idx.length) % idx.length], b = idx[i], d = idx[(i + 1) % idx.length];
        const cr = cross(a, b, d);
        if (cr <= 1e-12) continue; // reflex or collinear: not an ear
        let inside = false;
        for (const q of idx) {
          if (q === a || q === b || q === d) continue;
          const w1 = cross(a, b, q), w2 = cross(b, d, q), w3 = cross(d, a, q);
          if (w1 >= -1e-12 && w2 >= -1e-12 && w3 >= -1e-12) { inside = true; break; } // on the ear's border counts too
        }
        if (inside) continue;
        out.push([poly[a], poly[b], poly[d]]); idx.splice(i, 1); clipped = true; break;
      }
      if (!clipped) return null;
    }
    if (idx.length === 3) { if (cross(idx[0], idx[1], idx[2]) <= 1e-12) return null; out.push(idx.map((i) => poly[i])); }
    return out;
  };
  const validArea = (tris, area) => {
    let got = 0;
    for (const [a0, b0, d0] of tris) {
      const a = a0 * 3, b = b0 * 3, d = d0 * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
      got += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    return Math.abs(got - area) <= 1e-7 * Math.max(1, area) + 1e-10;
  };

  const MAX_RING = 40, state = new Uint8Array(nv); // 0 candidate, 1 removed / permanently kept
  let cand = []; for (let v = 0; v < nv; v++) cand.push(v);
  const lock = new Int32Array(nv).fill(-1);
  for (let pass = 0; pass < 16 && cand.length; pass++) {
    const retry = [];
    for (const v of cand) {
      if (state[v]) continue;
      if (lock[v] === pass) { retry.push(v); continue; }
      const fl = vf[v] = vf[v].filter((f) => alive[f]);
      if (fl.length < 3) { state[v] = 1; continue; }
      // incident faces must lie in one plane, or two planes meeting in a straight crease
      const pA = fl[0]; let pB = -1, three = false;
      for (const f of fl) { if (samePlane(pA, f)) continue; if (pB < 0) pB = f; else if (!samePlane(pB, f)) { three = true; break; } }
      if (three) { state[v] = 1; continue; } // curved / multi-plane: never removable
      if (fl.length > MAX_RING) { retry.push(v); continue; }
      // ordered one-ring
      const ring = [], rf = [];
      let cur = -1, bad = false;
      const nextOf = (a) => { for (const f of fl) { const i0 = F[f * 3] === v ? 0 : F[f * 3 + 1] === v ? 1 : 2; if (F[f * 3 + (i0 + 1) % 3] === a) return [F[f * 3 + (i0 + 2) % 3], f]; } return null; };
      { const f = fl[0], i0 = F[f * 3] === v ? 0 : F[f * 3 + 1] === v ? 1 : 2; cur = F[f * 3 + (i0 + 1) % 3]; }
      for (let s = 0; s < fl.length; s++) { const nx = nextOf(cur); if (!nx) { bad = true; break; } ring.push(cur); rf.push(nx[1]); cur = nx[0]; }
      if (bad || cur !== ring[0] || new Set(ring).size !== ring.length) { state[v] = 1; continue; }
      let newTris;
      if (pB < 0) {
        newTris = earClip(ring, [Nx[pA], Ny[pA], Nz[pA]]);
        if (!newTris || !validArea(newTris, fl.reduce((s, f) => s + Ar[f], 0))) { retry.push(v); continue; }
      } else {
        const cuts = [];
        for (let i = 0; i < ring.length; i++) if (samePlane(rf[(i - 1 + ring.length) % ring.length], pA) !== samePlane(rf[i], pA)) cuts.push(i);
        if (cuts.length !== 2) { state[v] = 1; continue; }
        const c1 = ring[cuts[0]], c2 = ring[cuts[1]];
        const ex = P[c1 * 3] - P[v * 3], ey = P[c1 * 3 + 1] - P[v * 3 + 1], ez = P[c1 * 3 + 2] - P[v * 3 + 2];
        const gx = P[c2 * 3] - P[v * 3], gy = P[c2 * 3 + 1] - P[v * 3 + 1], gz = P[c2 * 3 + 2] - P[v * 3 + 2];
        const cr = Math.hypot(ey * gz - ez * gy, ez * gx - ex * gz, ex * gy - ey * gx), le = Math.hypot(ex, ey, ez), lg = Math.hypot(gx, gy, gz);
        if (cr > 1e-7 * le * lg || ex * gx + ey * gy + ez * gz >= 0) { state[v] = 1; continue; } // corner, not a straight crease
        newTris = [];
        for (const [s, e] of [[cuts[0], cuts[1]], [cuts[1], cuts[0]]]) {
          const chain = []; for (let i = s; ; i = (i + 1) % ring.length) { chain.push(ring[i]); if (i === e) break; }
          const f0 = rf[s], area = fl.filter((f) => samePlane(f0, f)).reduce((acc, f) => acc + Ar[f], 0);
          const T = chain.length >= 3 ? earClip(chain, [Nx[f0], Ny[f0], Nz[f0]]) : null;
          if (!T || !validArea(T, area)) { newTris = null; break; }
          newTris.push(...T);
        }
        if (!newTris) { retry.push(v); continue; }
      }
      // new diagonals must not duplicate an edge that already exists elsewhere
      let clash = false;
      for (const t of newTris) {
        for (let e = 0; e < 3 && !clash; e++) {
          const a = t[e], b = t[(e + 1) % 3], ia = ring.indexOf(a), ib = ring.indexOf(b);
          const isRing = Math.abs(ia - ib) === 1 || Math.abs(ia - ib) === ring.length - 1;
          if (!isRing && hasEdge(a, b, fl)) clash = true;
        }
        if (clash) break;
      }
      if (clash) { retry.push(v); continue; }
      for (const f of fl) alive[f] = 0;
      vf[v] = []; state[v] = 1;
      for (const t of newTris) addFace(t[0], t[1], t[2]);
      for (const r of ring) lock[r] = pass;
    }
    if (retry.length === cand.length) break;
    cand = retry;
  }
  const J = [];
  for (let f = 0; f < F.length / 3; f++) if (alive[f]) J.push(F[f * 3], F[f * 3 + 1], F[f * 3 + 2]);
  return compactMesh(finalizeMesh(P, M.thick, new Uint32Array(J)));
}
// ── Error-bounded decimation (curved relief) ───────────────
// Quadric-error half-edge collapse (Garland–Heckbert): a vertex merges into a neighbour only if the
// area-weighted RMS distance of the merged cluster from its original planes stays within `tol` (mm).
// Vertices never move (collapses target existing vertices), creases keep zero error along their line, and every
// collapse passes a link-condition (manifold) test and a no-flip test — watertightness is preserved.
export function decimateQEM(M, tol = 0.01) {
  const P = M.positions, nv = M.nCanon, F = Int32Array.from(M.exportIndex), nf = F.length / 3;
  const alive = new Uint8Array(nf).fill(1), vf = Array.from({ length: nv }, () => []);
  const Q = new Float64Array(nv * 10), W = new Float64Array(nv);
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], d = F[f * 3 + 2];
    vf[a].push(f); vf[b].push(f); vf[d].push(f);
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[d * 3] - P[a * 3], vy = P[d * 3 + 1] - P[a * 3 + 1], vz = P[d * 3 + 2] - P[a * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz);
    if (l < 1e-14) continue;
    const area = l / 2; nx /= l; ny /= l; nz /= l;
    const dd = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]), q = [nx * nx, nx * ny, nx * nz, nx * dd, ny * ny, ny * nz, ny * dd, nz * nz, nz * dd, dd * dd];
    for (const v of [a, b, d]) { for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i] * area; W[v] += area; }
  }
  const err = (u, v) => { // weighted mean squared distance of both clusters' planes, evaluated at v
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], w = W[u] + W[v]; if (w <= 0) return Infinity;
    const q = (i) => Q[u * 10 + i] + Q[v * 10 + i];
    return (q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9)) / w;
  };
  const nbrs = (v) => { const s = new Set(); for (const f of vf[v]) if (alive[f]) for (let e = 0; e < 3; e++) if (F[f * 3 + e] !== v) s.add(F[f * 3 + e]); return s; };
  const limit = tol * tol, best = new Int32Array(nv).fill(-1), bestC = new Float64Array(nv).fill(Infinity), ver = new Int32Array(nv);
  // binary min-heap of [cost, vertex, version]
  const hc = [], hv = [], hs = [];
  const push = (c, v, s) => { let i = hc.length; hc.push(c); hv.push(v); hs.push(s); while (i > 0) { const p = (i - 1) >> 1; if (hc[p] <= hc[i]) break; [hc[p], hc[i]] = [hc[i], hc[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; [hs[p], hs[i]] = [hs[i], hs[p]]; i = p; } };
  const pop = () => {
    const c = hc[0], v = hv[0], s = hs[0], lc = hc.pop(), lv = hv.pop(), ls = hs.pop();
    if (hc.length) { hc[0] = lc; hv[0] = lv; hs[0] = ls; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hc.length && hc[l] < hc[m]) m = l; if (r < hc.length && hc[r] < hc[m]) m = r; if (m === i) break; [hc[m], hc[i]] = [hc[i], hc[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; [hs[m], hs[i]] = [hs[i], hs[m]]; i = m; } }
    return [c, v, s];
  };
  const evaluate = (u) => {
    let bc = Infinity, bv = -1;
    for (const v of nbrs(u)) { const c = err(u, v); if (c < bc) { bc = c; bv = v; } }
    best[u] = bv; bestC[u] = bc; ver[u]++;
    if (bv >= 0 && bc <= limit) push(bc, u, ver[u]);
  };
  const normal = (a, b, d) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[d * 3] - P[a * 3], vy = P[d * 3 + 1] - P[a * 3 + 1], vz = P[d * 3 + 2] - P[a * 3 + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  const removed = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) evaluate(v);
  while (hc.length) {
    const [c, u, s] = pop();
    if (removed[u] || s !== ver[u] || c > limit) continue;
    const v = best[u];
    if (v < 0 || removed[v]) { evaluate(u); continue; }
    // link condition: u and v may only share the two vertices opposite their common edge
    const Nu = nbrs(u), Nv = nbrs(v); let common = 0; for (const x of Nu) if (Nv.has(x)) common++;
    const shared = vf[u].filter((f) => alive[f] && (F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v));
    if (shared.length !== 2 || common !== 2) continue;
    // no flips, no slivers
    let ok = true;
    for (const f of vf[u]) {
      if (!alive[f] || shared.includes(f)) continue;
      const t = [F[f * 3], F[f * 3 + 1], F[f * 3 + 2]], n0 = normal(t[0], t[1], t[2]), t2 = t.map((x) => (x === u ? v : x)), n1 = normal(t2[0], t2[1], t2[2]);
      const l0 = Math.hypot(...n0), l1 = Math.hypot(...n1);
      if (l1 < 1e-10 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < 0.5) { ok = false; break; }
      // the removed vertex must stay within tolerance of the surface that replaces it
      const a = t2[0], dist = Math.abs(n1[0] * (P[u * 3] - P[a * 3]) + n1[1] * (P[u * 3 + 1] - P[a * 3 + 1]) + n1[2] * (P[u * 3 + 2] - P[a * 3 + 2])) / l1;
      if (dist > tol) { ok = false; break; }
    }
    if (!ok) continue;
    for (const f of shared) alive[f] = 0;
    for (const f of vf[u]) if (alive[f]) { for (let e = 0; e < 3; e++) if (F[f * 3 + e] === u) F[f * 3 + e] = v; vf[v].push(f); }
    for (let i = 0; i < 10; i++) Q[v * 10 + i] += Q[u * 10 + i];
    W[v] += W[u]; removed[u] = 1; vf[u] = [];
    vf[v] = vf[v].filter((f) => alive[f]);
    evaluate(v); for (const x of nbrs(v)) evaluate(x);
  }
  const J = []; for (let f = 0; f < nf; f++) if (alive[f]) J.push(F[f * 3], F[f * 3 + 1], F[f * 3 + 2]);
  return compactMesh(finalizeMesh(P, M.thick, new Uint32Array(J)));
}