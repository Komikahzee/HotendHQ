// Part assembly: turns fields into printable meshes and adds features a heightfield can't express
// (horizontal chain tunnels, pegs). Extra features are separate closed shells that overlap the body,
// which every slicer unions when slicing.
import { ShapeUtils, Vector2 } from 'three';
import { buildField } from './field.js';
import { buildMeshLabeled, simplifyPlanar, decimateQEM } from './mesher2.js';
import { buildSource } from './imaging.js';
import { DEFAULTS } from './params.js';
import { templateCanvas } from './bailTemplates.js';

function finalize(pos, tri, thickVal) {
  const positions = new Float32Array(pos), n = positions.length / 3, idx = new Uint32Array(tri);
  let vol = 0; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const v = positions[i * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3, P = positions;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }
  return { positions, thick: new Float32Array(n).fill(thickVal), nCanon: n, exportIndex: idx, renderIndex: idx, triCount: idx.length / 3, volume: vol, bbox: { min: mn, max: mx } };
}

// Extrudes a 2D profile (in the Y–Z plane, CCW outer + optional CW hole) along X. Watertight by construction.
function extrudeX(outer, hole, x0, x1, yOff) {
  const pos = [], tri = [], rings = [outer, hole].filter(Boolean);
  const base = [];
  let nv = 0;
  for (const ring of rings) {
    base.push(nv);
    for (const x of [x0, x1]) for (const [y, z] of ring) { pos.push(x, yOff + y, z); nv++; }
  }
  rings.forEach((ring, ri) => {
    const m = ring.length, b0 = base[ri], b1 = base[ri] + m;
    for (let i = 0; i < m; i++) {
      const a = i, b = (i + 1) % m;
      tri.push(b0 + a, b0 + b, b1 + b, b0 + a, b1 + b, b1 + a); // outward: right-hand side of travel
    }
  });
  const flat = [...outer, ...(hole || [])];
  const faces = ShapeUtils.triangulateShape(outer.map(([y, z]) => new Vector2(y, z)), hole ? [hole.map(([y, z]) => new Vector2(y, z))] : []);
  const map = (k) => (k < outer.length ? base[0] + k : base[1] + (k - outer.length));
  for (const f of faces) {
    let [a, b, c] = f;
    const cross = (flat[b][0] - flat[a][0]) * (flat[c][1] - flat[a][1]) - (flat[b][1] - flat[a][1]) * (flat[c][0] - flat[a][0]);
    if (cross < 0) [b, c] = [c, b];
    const ringLen = (k) => (k < outer.length ? outer.length : hole.length);
    tri.push(map(a) + ringLen(a), map(b) + ringLen(b), map(c) + ringLen(c)); // +X cap (at x1), CCW
    tri.push(map(a), map(c), map(b));                                           // −X cap (at x0), reversed
  }
  return { pos, tri };
}

// Tube bail: flat-bottomed "D" profile (prints without support) with a teardrop chain channel whose
// 45° roof bridges cleanly. Axis along X, centred at (t.x, t.yc).
export function tubeMesh(t) {
  const { r, Ro, len } = t, N = 48, outer = [], hole = [];
  outer.push([-Ro, 0], [Ro, 0]);
  for (let i = 0; i <= N; i++) { const a = i / N * Math.PI; outer.push([Ro * Math.cos(a), Ro + Ro * Math.sin(a)]); } // vertical sides, round roof
  const zc = Ro, cap = 2 * Ro - 0.6, tip = zc + r * Math.SQRT2;
  // CW hole: start at the 45° right shoulder, go down around the bottom to the left shoulder, then the roof
  for (let i = 0; i <= N; i++) { const a = Math.PI / 4 - i / N * (Math.PI * 1.5); hole.push([r * Math.cos(a), zc + r * Math.sin(a)]); }
  if (tip <= cap) hole.push([0, tip]);
  else { const d = tip - cap; hole.push([-d, cap], [d, cap]); }
  const { pos, tri } = extrudeX(outer, hole, t.x - len / 2, t.x + len / 2, t.yc);
  return finalize(pos, tri, 2 * (Ro - r));
}

// Vertical cylinder (peg), z0..z1.
export function cylinderMesh(cx, cy, r, z0, z1, N = 48) {
  const pos = [], tri = [];
  for (const z of [z0, z1]) for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pos.push(cx + r * Math.cos(a), cy + r * Math.sin(a), z); }
  pos.push(cx, cy, z0, cx, cy, z1);
  const cb = 2 * N, ct = 2 * N + 1;
  for (let i = 0; i < N; i++) {
    const a = i, b = (i + 1) % N;
    tri.push(a, b, N + b, a, N + b, N + a);
    tri.push(cb, b, a); tri.push(ct, N + a, N + b);
  }
  return finalize(pos, tri, z1 - z0);
}

// Concatenates meshes, keeping all export (canonical) vertices first as the exporters expect.
export function mergeMeshes(list) {
  list = list.filter(Boolean);
  if (list.length === 1) return list[0];
  let nc = 0, ne = 0;
  for (const M of list) { nc += M.nCanon; ne += M.positions.length / 3 - M.nCanon; }
  const positions = new Float32Array((nc + ne) * 3), thick = new Float32Array(nc + ne);
  const exp = [], ren = [];
  let co = 0, eo = nc, vol = 0;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const M of list) {
    const nv = M.positions.length / 3, cOff = co, eOff = eo;
    const remap = (i) => (i < M.nCanon ? cOff + i : eOff + i - M.nCanon);
    for (let i = 0; i < nv; i++) { const d = remap(i); positions.set(M.positions.subarray(i * 3, i * 3 + 3), d * 3); thick[d] = M.thick[i]; }
    exp.push(Array.from(M.exportIndex, remap)); ren.push(Array.from(M.renderIndex, remap));
    co += M.nCanon; eo += nv - M.nCanon; vol += M.volume;
    for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], M.bbox.min[a]); mx[a] = Math.max(mx[a], M.bbox.max[a]); }
  }
  const exportIndex = new Uint32Array(exp.flat()), renderIndex = new Uint32Array(ren.flat());
  return { positions, thick, nCanon: nc, exportIndex, renderIndex, triCount: exportIndex.length / 3, volume: vol, bbox: { min: mn, max: mx }, shells: list.length };
}

// Pendant = heightfield body + any tube tunnels.
// Removes every triangle that carries no shape: flat areas collapse exactly, curved relief within 	ol mm.
export function optimizeMesh(M, tol = 0) {
  let out = simplifyPlanar(M);
  if (tol > 0) out = decimateQEM(out, tol);
  return out;
}

// simplify: optimise the mesh (refined preview & export); tol: curved-surface accuracy in mm (0 = exact).
export function buildPendant(p, src, res, { simplify = false, tol = 0 } = {}) {
  const F = buildField(p, src, res);
  const tubes = F.tubes.map(tubeMesh);
  let M = mergeMeshes([buildMeshLabeled(F), ...tubes]);
  if (simplify) M = optimizeMesh(M, tol);
  return { F, M, tubeMeshes: tubes };
}

// ── Connector bail (separate printed part) ────────────────
export function connectorParams(p) {
  const top = p.cbChannel === 'tube'
    ? { kind: 'tube', holeD: p.cbChainD, wall: p.cbWall, len: p.cbTubeLen }
    : { kind: 'tab', ang: 0, shape: p.cbLoopShape, holeD: p.cbChainD, tabD: p.cbChainD + 2 * p.cbWall + 1.2, overlap: 1.6, thick: p.cbBase + p.cbDepth * 0.6 };
  const bails = [top];
  if (p.cbJoin === 'ring') bails.push({ kind: 'hole', ang: 180, holeD: p.cbRingD, inset: p.cbRingD / 2 + 1.8, collar: true });
  if (p.cbJoin === 'loop') bails.push({ kind: 'tab', ang: 180, shape: 'round', holeD: p.cbRingD, tabD: p.cbRingD + 3.4, overlap: 1.6, thick: p.cbBase + p.cbDepth * 0.6 });
  if (p.cbJoin === 'peg') bails.push({ kind: 'peg', ang: 180, d: p.cbPegD, h: p.cbPegH, inset: p.cbPegD / 2 + 1.6 });
  const custom = p.cbTemplate === 'custom';
  return {
    ...DEFAULTS, shape: 'silhouette', size: p.cbSize, silMargin: custom ? p.cbMargin : 0.25, silSmooth: custom ? 0.8 : 0.15,
    mode: 'raised', base: p.cbBase, depth: p.cbDepth, heightSource: 'brightness',
    bgMode: custom ? p.cbBgMode : 'alpha', bgTolerance: p.cbBgTol, invert: custom && p.cbInvert, autoLevels: custom,
    contrast: 0, brightness: 0, gamma: 1, denoise: custom ? 0.35 : 0.2, denoiseEdge: 0.07, sharpen: 0, smoothing: 0,
    posterize: 0, symmetry: custom ? p.cbSymmetry : 'none', radialN: 8, imgZoom: 1, imgX: 0, imgY: 0, imgRotate: 0, imgFlip: false,
    imgInset: 0, imgFade: 0.25, bgLevel: 0,
    rimStyle: p.cbRim, rimWidth: p.cbRimW, rimHeight: p.cbDepth + 0.2, topBevel: 0.3, footChamfer: p.footChamfer,
    pillow: p.cbPillow, pillowW: Math.max(1, p.cbSize * 0.22), dome: 0,
    textTop: '', textBottom: '', textCenter: '', backText: '', pocket: false,
    bail: 'custom', tabThick: p.cbBase + p.cbDepth * 0.6, _bails: bails,
  };
}

export function connectorSource(p, customImg, customId) {
  if (p.cbTemplate === 'custom') {
    if (!customImg) return null;
    return buildSource(customImg, null, connectorParams(p), 'cb' + customId);
  }
  const cv = templateCanvas(p.cbTemplate);
  return buildSource(cv, null, { bgMode: 'alpha', heightSource: 'brightness', bgTolerance: 0.1, depthMix: 0 }, 'tpl-' + p.cbTemplate);
}

export function buildConnector(p, customImg, customId, res, { simplify = false, tol = 0 } = {}) {
  const cp = connectorParams(p), src = connectorSource(p, customImg, customId);
  if (!src) return null;
  const F = buildField(cp, src, res);
  let M = mergeMeshes([buildMeshLabeled(F), ...F.tubes.map(tubeMesh)]);
  if (simplify) M = optimizeMesh(M, tol);
  const pg = F.pegs[0], peg = pg ? { x: pg.x, y: pg.y, r: pg.r, z1: pg.top } : null;
  // attachment anchors (field coordinates) for the display assembly
  const bottomHole = F.holes.filter((h) => !h.tube).reduce((a, h) => (!a || h.y < a.y ? h : a), null);
  const topHole = F.holes.reduce((a, h) => (!a || h.y > a.y ? h : a), null);
  return {
    F, M, peg, join: p.cbJoin, face: peg ? peg.z1 - p.cbPegH : undefined,
    bottomHole: p.cbJoin === 'ring' || p.cbJoin === 'loop' ? bottomHole : null, top: topHole, tube: F.tubes[0] || null,
  };
}
