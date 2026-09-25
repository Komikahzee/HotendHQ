/* ============================================================
   HOTEND HQ — Chain generator core
   One link engine for every FDM-printable chain style.

   A chain is a row of ITEMS laid along +X, printed in place:
     ring   — a wire swept along a closed centreline (cable, curb,
              rolo, paperclip, mariner, box, shaped…). Neighbouring
              rings alternate ±45° about the chain axis, so every
              link rests on the bed and all overhangs are ≤ 45°.
     plate  — a flat solid (letter, custom shape, bead, toggle,
              end loop, tag) with raised "lug" bars at its ends.
              Standing connector rings pass under those bars.
   Pitches are SOLVED, not guessed: for each neighbour pair the
   engine searches the offset where the links are interlocked
   (Gauss linking number) and every surface keeps the requested
   clearance, then leaves a little slack so they move freely.

   Pure geometry: runs in a Worker and in Node. Manifold (WASM)
   is only used for plates, unions and the special styles.
   Units mm. Z up. Chain runs along +X before bed layout.
   ============================================================ */

/* ---------------- small vector / matrix kit ---------------- */
const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && !(typeof v === 'number' && !isFinite(v))));

/** 3×4 affine matrix as [r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz] */
const M_ID = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function mMul(a, b) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}
const mRx = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
const mRz = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const mT = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const mApply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];

/* ---------------- 2D centrelines (closed, CCW) ---------------- */
function resample(poly, ds) {
  const n = poly.length, seg = [];
  let tot = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); tot += l; }
  const cnt = Math.max(24, Math.ceil(tot / ds)), step = tot / cnt, out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < cnt; k++) {
    const target = k * step;
    while (acc + seg[i] < target && i < n - 1) { acc += seg[i]; i++; }
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0, a = poly[i], b = poly[(i + 1) % n];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
function chaikin(poly, it = 3) {
  for (let k = 0; k < it; k++) {
    const o = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    poly = o;
  }
  return poly;
}
const area2 = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const ccw = (p) => (area2(p) < 0 ? p.slice().reverse() : p);

/** rounded rectangle centreline, length L (x) × width W (y), corner radius rc */
function rrectLine(L, W, rc) {
  rc = clamp(rc, 0.05, Math.min(L, W) / 2);
  const hx = L / 2 - rc, hy = W / 2 - rc, p = [];
  for (const [cx, cy, a0] of [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]])
    for (let i = 0; i <= 12; i++) { const a = (a0 + 90 * i / 12) * D2R; p.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); }
  return p;
}
const SHAPES = {
  heart(L, W) {           // symmetric about X, lobes up (+Y), tip down; chain threads through the side lobes
    const p = [];
    for (let i = 0; i < 160; i++) {
      const t = (i / 160) * TAU;
      const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      p.push([x, y]);
    }
    return fitBox(chaikin(p, 2), L, W);
  },
  star(L, W) {
    const p = [];
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.55 : 1; p.push([r * Math.cos(a), r * Math.sin(a)]); }
    return fitBox(chaikin(p, 4), L, W);
  },
  diamond(L, W) { return fitBox(chaikin([[1, 0], [0, 1.35], [-1, 0], [0, -1.35]], 4), L, W); },
  hexagon(L, W) {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; p.push([Math.cos(a), Math.sin(a)]); }
    return fitBox(chaikin(p, 3), L, W);
  },
  teardrop(L, W) {        // round end at −X, point at +X
    const p = [];
    for (let i = 0; i < 120; i++) { const t = (i / 120) * TAU; p.push([Math.cos(t), Math.sin(t) * Math.pow(Math.abs(Math.sin(t / 2)), 0.9)]); }
    return fitBox(chaikin(p, 2), L, W);
  },
  marquise(L, W) {        // pointed oval (two arcs), tips on the chain axis
    const p = [];
    for (let i = 0; i <= 40; i++) { const x = -1 + 2 * i / 40; p.push([x, Math.sqrt(Math.max(0, 1 - x * x)) ** 0.85]); }
    for (let i = 39; i > 0; i--) { const x = -1 + 2 * i / 40; p.push([x, -(Math.sqrt(Math.max(0, 1 - x * x)) ** 0.85)]); }
    return fitBox(chaikin(p, 3), L, W);
  },
  triangle(L, W) {        // rounded triangle, one corner forward
    const p = [];
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; p.push([Math.cos(a), Math.sin(a)]); }
    return fitBox(chaikin(p, 5), L, W);
  },
  flower(L, W) {          // four round petals, two of them on the chain axis
    const p = [];
    for (let i = 0; i < 160; i++) { const t = (i / 160) * TAU, r = 1 + 0.3 * Math.cos(4 * t); p.push([r * Math.cos(t), r * Math.sin(t)]); }
    return fitBox(chaikin(p, 1), L, W);
  },
};
function fitBox(p, L, W) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sx = L / (x1 - x0), sy = W / (y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return ccw(p.map(([x, y]) => [(x - cx) * sx, (y - cy) * sy]));
}

/* ---------------- wire profiles (u = in-plane, v = out of plane) ---------------- */
function profile(kind, r) {
  const pts = [];
  if (kind === 'square') {
    const rc = r * 0.3, h = r - rc;
    for (const [cx, cy, a0] of [[h, h, 0], [-h, h, 90], [-h, -h, 180], [h, -h, 270]])
      for (let i = 0; i <= 3; i++) { const a = (a0 + 30 * i) * D2R; pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); }
    return { pts, ext: r * 1.3 };
  }
  if (kind === 'flat') {                       // ribbon: wide in the link plane, thin across it
    const hu = r * 1.35, hv = r * 0.62, rc = hv * 0.9;
    const hx = hu - rc, hy = hv - rc;
    for (const [cx, cy, a0] of [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]])
      for (let i = 0; i <= 4; i++) { const a = (a0 + 22.5 * i) * D2R; pts.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); }
    return { pts, ext: hu, extV: hv };
  }
  if (kind === 'faceted') {                    // diamond-cut: octagon
    for (let i = 0; i < 8; i++) { const a = (22.5 + 45 * i) * D2R; pts.push([r * 1.04 * Math.cos(a), r * 1.04 * Math.sin(a)]); }
    return { pts, ext: r * 1.04 };
  }
  const n = r < 0.9 ? 12 : 16;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  return { pts, ext: r };
}

/* ---------------- meshes ---------------- */
function meshVolume(pos, idx) {
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}
function flipIfInside(mesh) {
  if (meshVolume(mesh.pos, mesh.idx) < 0) for (let t = 0; t < mesh.idx.length; t += 3) { const k = mesh.idx[t + 1]; mesh.idx[t + 1] = mesh.idx[t + 2]; mesh.idx[t + 2] = k; }
  return mesh;
}
function transformMesh(mesh, m) {
  const pos = new Float32Array(mesh.pos.length);
  for (let i = 0; i < pos.length; i += 3) { const q = mApply(m, [mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]); pos[i] = q[0]; pos[i + 1] = q[1]; pos[i + 2] = q[2]; }
  return { pos, idx: mesh.idx };
}
function meshBounds(pos) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[i + k]); b[k + 3] = Math.max(b[k + 3], pos[i + k]); }
  return b;
}

/** Sweep a profile along a closed planar centreline, then twist about X. */
function sweep(line, prof, twistFn) {
  const n = line.length, m = prof.pts.length;
  const pos = new Float32Array(n * m * 3), idx = new Uint32Array(n * m * 6);
  const centre = [];
  for (let i = 0; i < n; i++) {
    const a = line[(i - 1 + n) % n], b = line[(i + 1) % n], c = line[i];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = ty, ny = -tx;                      // outward for CCW
    const th = twistFn ? twistFn(c[0]) : 0, ct = Math.cos(th), st = Math.sin(th);
    for (let j = 0; j < m; j++) {
      const [u, v] = prof.pts[j];
      const x = c[0] + u * nx, y = c[1] + u * ny, z = v;
      const k = (i * m + j) * 3;
      pos[k] = x; pos[k + 1] = y * ct - z * st; pos[k + 2] = y * st + z * ct;
    }
    centre.push([c[0], c[1] * ct, c[1] * st]);
  }
  let t = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const a = i * m + j, b = ((i + 1) % n) * m + j, c = ((i + 1) % n) * m + (j + 1) % m, d = i * m + (j + 1) % m;
    idx[t++] = a; idx[t++] = b; idx[t++] = c; idx[t++] = a; idx[t++] = c; idx[t++] = d;
  }
  return { mesh: flipIfInside({ pos, idx }), centre };
}
function cylinderMesh(r, len, seg = 16) {             // along Y, centred
  const pos = [], idx = [];
  for (let k = 0; k < 2; k++) for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pos.push(r * Math.cos(a), (k - 0.5) * len, r * Math.sin(a)); }
  const c0 = pos.length / 3; pos.push(0, -len / 2, 0); const c1 = pos.length / 3; pos.push(0, len / 2, 0);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    idx.push(i, j, seg + j, i, seg + j, seg + i, c0, j, i, c1, seg + i, seg + j);
  }
  return flipIfInside({ pos: new Float32Array(pos), idx: new Uint32Array(idx) });
}
function sphereMesh(r, seg = 20) {
  const pos = [], idx = [], rings = Math.max(8, seg >> 1);
  for (let i = 0; i <= rings; i++) { const th = (i / rings) * Math.PI; for (let j = 0; j < seg; j++) { const ph = (j / seg) * TAU; pos.push(r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)); } }
  // collapse poles to single vertices for a clean closed mesh
  const P = [], remap = [];
  for (let i = 0; i <= rings; i++) for (let j = 0; j < seg; j++) {
    if ((i === 0 || i === rings) && j > 0) { remap.push(remap[i * seg]); continue; }
    remap.push(P.length / 3); P.push(pos[(i * seg + j) * 3], pos[(i * seg + j) * 3 + 1], pos[(i * seg + j) * 3 + 2]);
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = remap[i * seg + j], b = remap[i * seg + (j + 1) % seg], c = remap[(i + 1) * seg + (j + 1) % seg], d = remap[(i + 1) * seg + j];
    if (a !== b) idx.push(a, d, b);
    if (c !== d) idx.push(b, d, c);
  }
  return flipIfInside({ pos: new Float32Array(P), idx: new Uint32Array(idx) });
}

/* ---------------- collision samples & linking ---------------- */
/** spheres [x,y,z,r] along a centreline with spacing ≤ r/2 */
function tubeSamples(centre, r) {
  const out = [];
  for (let i = 0; i < centre.length; i++) {
    const a = centre[i], b = centre[(i + 1) % centre.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), k = Math.max(1, Math.ceil(l / (r * 0.5)));
    for (let s = 0; s < k; s++) { const t = s / k; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r]); }
  }
  return out;
}
function xformSamples(S, m) { return S.map(s => { const q = mApply(m, s); return [q[0], q[1], q[2], s[3]]; }); }
function sampleBox(S) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const s of S) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], s[k] - s[3]); b[k + 3] = Math.max(b[k + 3], s[k] + s[3]); }
  return b;
}
/** minimum surface gap between two sphere clouds (negative = overlap) */
function gapOf(A, B, cut = 99, stopBelow = -Infinity) {
  const ba = sampleBox(A), bb = sampleBox(B);
  const dx = Math.max(0, ba[0] - bb[3], bb[0] - ba[3]), dy = Math.max(0, ba[1] - bb[4], bb[1] - ba[4]), dz = Math.max(0, ba[2] - bb[5], bb[2] - ba[5]);
  if (Math.hypot(dx, dy, dz) > cut) return cut;
  let best = Infinity;
  const Bf = B.filter(s => s[0] + s[3] > ba[0] - 2 && s[0] - s[3] < ba[3] + 2);
  for (const a of A) {
    if (a[0] + a[3] < bb[0] - 2 || a[0] - a[3] > bb[3] + 2) continue;
    for (const b of Bf) {
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - a[3] - b[3];
      if (d < best) { best = d; if (best < stopBelow) return best; }
    }
  }
  return best === Infinity ? cut : best;
}
/** Gauss linking number of two closed polylines (≈ ±1 when linked, 0 when not) */
function linking(P, Q) {
  let s = 0;
  const n = P.length, m = Q.length;
  for (let i = 0; i < n; i++) {
    const a0 = P[i], a1 = P[(i + 1) % n];
    const da = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]], ma = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2];
    for (let j = 0; j < m; j++) {
      const b0 = Q[j], b1 = Q[(j + 1) % m];
      const db = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]], mb = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, (b0[2] + b1[2]) / 2];
      const r = [ma[0] - mb[0], ma[1] - mb[1], ma[2] - mb[2]], rl = Math.hypot(r[0], r[1], r[2]);
      if (rl < 1e-9) continue;
      const cx = da[1] * db[2] - da[2] * db[1], cy = da[2] * db[0] - da[0] * db[2], cz = da[0] * db[1] - da[1] * db[0];
      s += (cx * r[0] + cy * r[1] + cz * r[2]) / (rl * rl * rl);
    }
  }
  return s / (4 * Math.PI);
}
const decimate = (P, n) => { const k = Math.max(1, Math.floor(P.length / n)); return P.filter((_, i) => i % k === 0); };

/* ============================================================
   ENGINE
   ============================================================ */
export const NOZZLE = {                 // minimum printable wire Ø and minimum gap per nozzle
  0.2: { wire: 0.6, gap: 0.18 },
  0.4: { wire: 1.2, gap: 0.3 },
  0.6: { wire: 1.8, gap: 0.4 },
};

export function createChainEngine(wasm = null, font = null) {
  const MF = wasm && wasm.Manifold, CS = wasm && wasm.CrossSection;
  const bodies = new Map();            // key → body
  const warn = new Set();

  /* ---------- Manifold helpers ---------- */
  const toManifold = (mesh) => {
    const m = new wasm.Mesh({ numProp: 3, vertProperties: mesh.pos, triVerts: mesh.idx });
    m.merge();
    return new MF(m);
  };
  const fromManifold = (mf) => { const g = mf.getMesh(); const pos = new Float32Array(g.vertProperties.length / g.numProp * 3); for (let i = 0, k = 0; i < g.vertProperties.length; i += g.numProp) { pos[k++] = g.vertProperties[i]; pos[k++] = g.vertProperties[i + 1]; pos[k++] = g.vertProperties[i + 2]; } return { pos, idx: new Uint32Array(g.triVerts) }; };
  const box = (x0, y0, z0, x1, y1, z1) => MF.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);

  /* ---------- RING body ----------
     spec: { shape:'stadium'|'rrect'|'circle'|heart|star|diamond|hexagon|'custom', L, W, r, rc, profile, twist(deg), bar } */
  function ringBody(spec) {
    const key = 'ring:' + JSON.stringify(spec);
    if (bodies.has(key)) return bodies.get(key);
    const { L, W, r } = spec;
    let line;
    if (SHAPES[spec.shape]) line = SHAPES[spec.shape](L, W);
    else if (spec.shape === 'custom' && spec.poly) line = fitBox(chaikin(spec.poly, 2), L, W);
    else line = rrectLine(L, W, spec.rc ?? Math.min(L, W) / 2);
    line = resample(ccw(line), Math.max(0.25, r * 0.55));
    const prof = profile(spec.profile || 'round', r);
    const tw = (spec.twist || 0) * D2R;
    const twistFn = tw ? (x) => tw * Math.sin(clamp(x / (L / 2), -1, 1) * Math.PI / 2) : null;
    const { mesh, centre } = sweep(line, prof, twistFn);
    let body = { key, kind: 'ring', spec, mesh, centre, r, ext: prof.ext, L, W };
    body.samples = tubeSamples(centre, prof.ext);
    if (spec.bar) {                               // mariner / anchor centre bar
      const bl = W - 2 * r * 0.2, bar = cylinderMesh(r * 0.85, bl, 14);
      body.samples = body.samples.concat(tubeSamples([[0, -bl / 2, 0], [0, bl / 2, 0]].map(p => p), r * 0.85).slice(0, Math.ceil(bl / (r * 0.4))));
      if (MF) {
        try { body.mesh = fromManifold(MF.union(toManifold(mesh), toManifold(bar))); }
        catch { body.mesh = { pos: concatF(mesh.pos, bar.pos), idx: concatI(mesh.idx, bar.idx, mesh.pos.length / 3) }; }
      } else body.mesh = { pos: concatF(mesh.pos, bar.pos), idx: concatI(mesh.idx, bar.idx, mesh.pos.length / 3) };
    }
    let x0 = Infinity, x1 = -Infinity;
    for (const c of centre) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); }
    body.reachL = -x0; body.reachR = x1;
    body.loop = decimate(centre, 72);
    body.volume = meshVolume(body.mesh.pos, body.mesh.idx);
    bodies.set(key, body);
    return body;
  }
  const concatF = (a, b) => { const o = new Float32Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  const concatI = (a, b, off) => { const o = new Uint32Array(a.length + b.length); o.set(a); for (let i = 0; i < b.length; i++) o[a.length + i] = b[i] + off; return o; };

  /** a body in a given tilt, resting on the bed (z ≥ 0) */
  function posed(body, tilt) {
    const k = body.key + '@' + tilt.toFixed(4);
    if (body.poses && body.poses[k]) return body.poses[k];
    const R = mRx(tilt);
    let minZ = Infinity;
    for (let i = 0; i < body.mesh.pos.length; i += 3) minZ = Math.min(minZ, R[8] * body.mesh.pos[i] + R[9] * body.mesh.pos[i + 1] + R[10] * body.mesh.pos[i + 2]);
    const m = mMul(mT(0, 0, -minZ), R);
    const p = { m, samples: xformSamples(body.samples, m), loop: body.loop ? body.loop.map(q => mApply(m, q)) : null };
    body.poses = body.poses || {}; body.poses[k] = p;
    return p;
  }

  /* ---------- pitch solver between two ring poses ---------- */
  const solveCache = new Map();
  function solvePair(bA, tA, bB, tB, c) {
    const key = bA.key + tA + '|' + bB.key + tB + '|' + c;
    if (solveCache.has(key)) return solveCache.get(key);
    const A = posed(bA, tA), B = posed(bB, tB);
    const sh = (S, dx) => S.map(s => [s[0] + dx, s[1], s[2], s[3]]);
    const shl = (P, dx) => P.map(q => [q[0] + dx, q[1], q[2]]);
    const lA = decimate(A.loop, 48), lB = decimate(B.loop, 48);
    const ok = (p) => {
      const g = gapOf(A.samples, sh(B.samples, p), 99, c);
      if (g < c) return { ok: false, g };
      const lk = Math.abs(linking(lA, shl(lB, p)));
      return { ok: lk > 0.5, g, lk };
    };
    const hi = bA.reachR + bB.reachL, fine = Math.max(0.04, Math.min(bA.r, bB.r) * 0.08);
    const coarse = Math.max(fine, Math.min(0.3, Math.min(bA.r, bB.r) * 0.3));
    // coarse scan from "bars on top of each other" down, then a fine scan if the window is narrow
    const scan = (step) => {
      let up = null, low = null;
      for (let p = hi; p > 0.2; p -= step) {
        if (ok(p).ok) { if (up === null) up = p; low = p; }
        else if (up !== null) break;
      }
      return [up, low];
    };
    let [pUp, pLow] = scan(coarse);
    if (pUp === null) [pUp, pLow] = scan(fine);
    let res;
    if (pUp === null) res = { ok: false };
    else {
      let a = pUp, b = Math.min(hi, pUp + coarse);             // refine upper bound
      for (let i = 0; i < 10; i++) { const mid = (a + b) / 2; if (ok(mid).ok) a = mid; else b = mid; }
      pUp = a;
      let lo = Math.max(0.2, pLow - coarse), l2 = pLow;          // refine lower bound
      for (let i = 0; i < 8; i++) { const mid = (lo + l2) / 2; if (ok(mid).ok) l2 = mid; else lo = mid; }
      pLow = l2;
      const slack = Math.min(0.35 * (pUp - pLow), Math.max(0.25, c));
      res = { ok: true, p: pUp - slack, pUp, pLow, pMid: (pUp + pLow) / 2 };
    }
    solveCache.set(key, res);
    return res;
  }

  return { ringBody, posed, solvePair, bodies, warn, MF, CS, box, toManifold, fromManifold, meshVolume, sphereMesh, cylinderMesh, sweep, profile, rrectLine, resample, ccw, gapOf, linking, xformSamples, tubeSamples, concatF, concatI, meshBounds, transformMesh };
}

export { mMul, mRx, mRz, mT, mApply, M_ID, meshVolume, transformMesh, meshBounds, SHAPES, chaikin, fitBox, clean, clamp, TAU, D2R };
