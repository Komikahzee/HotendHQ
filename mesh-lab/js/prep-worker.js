// Mesh Lab print prep. Turns a raw AI mesh (open skins, double walls, thousands of loose crumbs) into one
// closed, printable solid, without losing the AI's surface detail:
//
//   1. narrow-band signed distance to the raw surface on a voxel grid (exact point-triangle distances)
//   2. seal: gaps up to `sealMM` are bridged (closing), and an axis-ray vote catches big openings
//      such as the open bottom of a bust, so the inside is still found
//   3. keep the main body, fill sealed air pockets
//   4. CSG on the distance field: flat cut, round plinth with a chamfer, even-wall hollow, drain hole
//   5. surface nets (always closed), Taubin smoothing, then every outer vertex is snapped back onto the
//      raw AI surface, so the detail is the AI's own and not the voxel grid's
//   6. checks: open / non-manifold edges, volume, size, filament
//
// Everything is in millimetres, Z up, the print bed at Z = 0.

const post = (type, data, transfer) => self.postMessage({ type, ...data }, transfer || []);
const say = (msg, pct) => post('progress', { msg, pct });

self.onmessage = (e) => {
  try {
    const out = prep(e.data);
    post('done', out, [out.positions.buffer, out.indices.buffer, out.isBase.buffer].concat(out.colors ? [out.colors.buffer] : []));
  } catch (err) {
    post('error', { msg: String(err && err.message || err) });
  }
};

function prep({ positions, indices, colors, opt }) {
  const t0 = performance.now();
  const o = Object.assign({
    heightMM: 120, res: 288, sealMM: 1.2, rayFill: true, keepLargest: true,
    base: 'plinth', cutMM: 2, plinthH: 12, plinthScale: 1.0, chamfer: 1.2,
    hollow: false, wallMM: 2.4, drainMM: 6, smooth: 2, snap: true, denoise: 4, denoiseSigma: 0.5, sharpen: 0.3,
    rotX: 0, rotY: 0, rotZ: 0, upAxis: 'y',
  }, opt || {});

  // ---- 1. orient (glTF is Y up) and scale -----------------------------------------------------------
  say('Placing the model', 1);
  const nv = positions.length / 3;
  const P = new Float32Array(positions.length);
  const R = rotation(o);
  for (let i = 0; i < nv; i++) {
    let x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (o.upAxis === 'y') { const t = y; y = -z; z = t; }
    P[i * 3] = R[0] * x + R[1] * y + R[2] * z;
    P[i * 3 + 1] = R[3] * x + R[4] * y + R[5] * z;
    P[i * 3 + 2] = R[6] * x + R[7] * y + R[8] * z;
  }
  let bb = bounds(P);
  const plinthH = o.base === 'plinth' ? o.plinthH : 0;
  const cut = o.base === 'none' ? 0 : o.cutMM;
  const bodyH = Math.max(5, o.heightMM - plinthH + cut);
  const s = bodyH / Math.max(1e-9, bb.max[2] - bb.min[2]);
  const cx0 = (bb.min[0] + bb.max[0]) / 2, cy0 = (bb.min[1] + bb.max[1]) / 2;
  for (let i = 0; i < nv; i++) {
    P[i * 3] = (P[i * 3] - cx0) * s; P[i * 3 + 1] = (P[i * 3 + 1] - cy0) * s; P[i * 3 + 2] = (P[i * 3 + 2] - bb.min[2]) * s + plinthH - cut;
  }
  bb = bounds(P);
  const T = indices;
  const nt = T.length / 3;

  // ---- grid --------------------------------------------------------------------------------------
  const ext = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  const h = Math.max(ext[0], ext[1], ext[2]) / o.res;
  const pad = 4 + Math.ceil(o.sealMM / h);
  const zFloor = Math.min(bb.min[2], 0);
  const org = [bb.min[0] - pad * h, bb.min[1] - pad * h, zFloor - pad * h];
  const nx = Math.ceil(ext[0] / h) + 2 * pad + 1, ny = Math.ceil(ext[1] / h) + 2 * pad + 1;
  const nz = Math.ceil((bb.max[2] - zFloor) / h) + 2 * pad + 1;
  const sxy = nx * ny, N = sxy * nz;
  if (N > 75e6) throw new Error(`That is ${Math.round(N / 1e6)} million voxels, too many for the browser. Lower the detail.`);
  const BAND = 1.75 * h;

  // ---- 2. narrow-band signed distance ---------------------------------------------------------------
  say(`Measuring the surface (${(nt / 1000).toFixed(0)}k triangles, ${nx}×${ny}×${nz} voxels)`, 4);
  let F = new Float32Array(N).fill(BAND); // BAND = far, sign unknown
  const tri = new Float64Array(9), q = new Float64Array(3);
  const step = Math.max(1, Math.floor(nt / 40));
  for (let t = 0; t < nt; t++) {
    if (t % step === 0) say('Measuring the surface', 4 + 30 * t / nt);
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    for (let k = 0; k < 3; k++) { tri[k] = P[a + k]; tri[3 + k] = P[b + k]; tri[6 + k] = P[c + k]; }
    const ux = tri[3] - tri[0], uy = tri[4] - tri[1], uz = tri[5] - tri[2];
    const vx = tri[6] - tri[0], vy = tri[7] - tri[1], vz = tri[8] - tri[2];
    const fnx = uy * vz - uz * vy, fny = uz * vx - ux * vz, fnz = ux * vy - uy * vx;
    if (fnx === 0 && fny === 0 && fnz === 0) continue;
    const i0 = clampI(Math.floor((Math.min(tri[0], tri[3], tri[6]) - BAND - org[0]) / h - 0.5) + 1, 0, nx - 1);
    const i1 = clampI(Math.floor((Math.max(tri[0], tri[3], tri[6]) + BAND - org[0]) / h - 0.5), 0, nx - 1);
    const j0 = clampI(Math.floor((Math.min(tri[1], tri[4], tri[7]) - BAND - org[1]) / h - 0.5) + 1, 0, ny - 1);
    const j1 = clampI(Math.floor((Math.max(tri[1], tri[4], tri[7]) + BAND - org[1]) / h - 0.5), 0, ny - 1);
    const k0 = clampI(Math.floor((Math.min(tri[2], tri[5], tri[8]) - BAND - org[2]) / h - 0.5) + 1, 0, nz - 1);
    const k1 = clampI(Math.floor((Math.max(tri[2], tri[5], tri[8]) + BAND - org[2]) / h - 0.5), 0, nz - 1);
    for (let k = k0; k <= k1; k++) {
      const pz = org[2] + (k + 0.5) * h;
      for (let j = j0; j <= j1; j++) {
        const py = org[1] + (j + 0.5) * h, row = k * sxy + j * nx;
        for (let i = i0; i <= i1; i++) {
          const px = org[0] + (i + 0.5) * h;
          const d2 = closestOnTri(px, py, pz, tri, q);
          const id = row + i;
          if (d2 < F[id] * F[id]) F[id] = Math.sqrt(d2);
        }
      }
    }
  }

  // ---- 3. inside / outside -------------------------------------------------------------------------
  say('Sealing holes', 36);
  // F holds the unsigned distance to the raw surface. The solid is everything within half a voxel of the
  // surface (a skin that no 6-connected path can slip through) plus everything the outside can't reach.
  // No triangle normals are trusted: AI meshes have double walls and flipped patches, and normal-based
  // signs turn those into a worm-like noise on the print.
  const SKIN = 0.51 * h;
  let surf = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (F[i] < SKIN) surf[i] = 1;
  const kSeal = Math.max(0, Math.round(o.sealMM / h));
  // blocked = skin grown by the seal distance (chamfer distance transform, 3-4-5 metric)
  let blocked = surf;
  if (kSeal > 0) {
    const D = chamferFrom(surf, nx, ny, nz, 1);
    blocked = new Uint8Array(N);
    const lim = kSeal * 3;
    for (let i = 0; i < N; i++) if (D[i] <= lim) blocked[i] = 1;
  }
  // With a base, the cut plane acts as a lid: an AI model that is open underneath (a bust, a figure cut
  // off at the table) still has a closed inside above the cut.
  const zc = plinthH; // top of the plinth = bottom of the cut model
  const kLid = o.base === 'none' ? -1 : clampI(Math.floor((zc - org[2]) / h - 0.5), -1, nz - 1);
  if (kLid >= 0) { if (blocked === surf) blocked = surf.slice(); blocked.fill(1, 0, (kLid + 1) * sxy); }
  let outside = floodBoundary(blocked, nx, ny, nz); // 1 = reached from outside
  blocked = null;
  if (kSeal > 0) regrow(outside, surf, nx, ny, nz, kSeal); // win back the ring the seal took off the outside
  // AI skins are full of holes and double walls, so the flood alone often leaks inside. Ray vote: from each
  // voxel, look along 26 directions; a voxel that sees the skin in nearly every direction is inside. A
  // concave spot on the outside (under a chin, between an arm and the body) still sees out in many.
  // Second vote: fill each 2D slice along X, Y and Z separately; inside in at least two of the three.
  let vote = null, axes = null;
  if (o.rayFill) {
    say('Finding the inside', 42);
    const wall = new Uint8Array(N), W = 0.9 * h;
    for (let i = 0; i < N; i++) if (F[i] < W) wall[i] = 1;
    if (kLid >= 0) wall.fill(1, 0, (kLid + 1) * sxy);
    vote = rayVote26(wall, nx, ny, nz, (p) => say('Finding the inside', 42 + 4 * p));
    const sw = kLid >= 0 ? surf.slice() : surf;
    if (kLid >= 0) sw.fill(1, 0, (kLid + 1) * sxy);
    axes = sliceVote(sw, nx, ny, nz);
  }
  const need = o.rayNeed ?? 24;
  let solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) solid[i] = (surf[i] || !outside[i] || (vote && (vote[i] >= need || axes[i] >= 2))) ? 1 : 0;
  axes = null;
  vote = null;
  if (kLid >= 0) solid.fill(0, 0, (kLid + 1) * sxy); // below the cut goes anyway
  if (o.debug) { const sl = {}; for (const f of [0.3, 0.5, 0.7, 0.85]) { const k = Math.floor(nz * f); sl[f] = { nx, ny, a: solid.slice(k * sxy, (k + 1) * sxy), s: surf.slice(k * sxy, (k + 1) * sxy) }; } post('debug', { sl }); }
  say('Keeping the main body', 48);
  let pieces = 1;
  if (o.keepLargest) pieces = keepLargest(solid, nx, ny, nz);
  fillPockets(solid, nx, ny, nz);

  // field: distance minus the skin half-width outside, negative inside. The surface this gives sits half a
  // voxel proud of the AI surface; the snap step below puts it back exactly.
  for (let i = 0; i < N; i++) {
    const v = F[i];
    if (!solid[i]) F[i] = Math.max(v - SKIN, 0.02 * h);
    else F[i] = v < SKIN ? v - SKIN : -Math.min(v, BAND);
  }

  // ---- 4. CSG: cut, plinth, hollow, drain ----------------------------------------------------------
  say('Adding the base', 52);
  let base = null;
  if (o.base !== 'none') {
    // footprint of the model just above the cut decides the plinth
    const kz0 = clampI(Math.floor((zc - org[2]) / h), 0, nz - 1), kz1 = clampI(kz0 + Math.ceil(4 / h), 0, nz - 1);
    let sx = 0, sy = 0, n = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = kz0; k <= kz1; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (F[k * sxy + j * nx + i] < 0) {
        const x = org[0] + (i + 0.5) * h, y = org[1] + (j + 0.5) * h;
        sx += x; sy += y; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!n) { x0 = bb.min[0]; x1 = bb.max[0]; y0 = bb.min[1]; y1 = bb.max[1]; sx = (x0 + x1) / 2; sy = (y0 + y1) / 2; n = 1; }
    const fx = x1 - x0, fy = y1 - y0;
    base = { cx: sx / n, cy: sy / n, r: Math.max(6, 0.5 * Math.max(fx, fy) * 0.9 * o.plinthScale), foot: [fx, fy] };
    for (let k = 0; k < nz; k++) {
      const z = org[2] + (k + 0.5) * h;
      for (let j = 0; j < ny; j++) {
        const y = org[1] + (j + 0.5) * h;
        for (let i = 0; i < nx; i++) {
          const x = org[0] + (i + 0.5) * h, id = k * sxy + j * nx + i;
          let f = Math.max(F[id], zc - z); // flat cut
          if (o.base === 'plinth') {
            const dr = Math.hypot(x - base.cx, y - base.cy) - base.r;
            let g = Math.max(dr, -z, z - (zc + 0.6));
            if (o.chamfer > 0) g = Math.max(g, (dr + o.chamfer) * 0.7071 + (z - (zc + 0.6)) * 0.7071);
            g = Math.max(g, (dr + o.chamfer) * 0.7071 - z * 0.7071); // bottom chamfer too (elephant foot)
            f = Math.min(f, g);
          }
          F[id] = clampF(f, -BAND * 4, BAND * 4);
        }
      }
    }
  }
  let chambers = 0;
  if (o.hollow && o.wallMM > 0) {
    say('Hollowing', 58);
    const inside = new Uint8Array(N);
    for (let i = 0; i < N; i++) inside[i] = F[i] < 0 ? 0 : 1; // seed = not material
    const D = chamferFrom(inside, nx, ny, nz, 1); // distance (×3) to the nearest non-material voxel
    const C = new Float32Array(N);
    for (let i = 0; i < N; i++) C[i] = (D[i] / 3) * h - o.wallMM;
    boxBlur3(C, nx, ny, nz);
    let cav = 0;
    for (let i = 0; i < N; i++) if (C[i] > 0) { cav++; if (C[i] > F[i]) F[i] = C[i]; }
    if (cav) chambers = countCavities(F, nx, ny, nz);
    if (o.drainMM > 0 && base && cav) {
      const rd = o.drainMM / 2, top = (o.base === 'plinth' ? 0 : zc) + o.wallMM + 3 * h;
      const dx = base.cx + Math.min(base.r * 0.25, 4), dy = base.cy;
      for (let k = 0; k < nz; k++) {
        const z = org[2] + (k + 0.5) * h; if (z > top + h * 2) break;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const x = org[0] + (i + 0.5) * h, y = org[1] + (j + 0.5) * h, id = k * sxy + j * nx + i;
          const dcyl = Math.max(Math.hypot(x - dx, y - dy) - rd, z - top);
          if (-dcyl > F[id]) F[id] = -dcyl;
        }
      }
    }
  }
  // keep the border outside so the surface is always closed
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) F[k * sxy + j * nx + i] = BAND;
  }
  solidFree(solid);
  say('Removing pinch points', 64);
  const pinches = wellComposed(F, nx, ny, nz, h);

  // ---- 5. surface nets ------------------------------------------------------------------------------
  say('Building the surface', 66);
  let { V, I } = surfaceNets(F, nx, ny, nz, org, h);
  F = surf = outside = solid = null; // free the voxel grids (hundreds of MB) before the mesh passes
  const nV = V.length / 3;
  if (o.smooth > 0) { say('Smoothing', 76); taubin(V, I, o.smooth); }
  let snapped = 0;
  const nV0 = V.length / 3, isBase = new Uint8Array(nV0);
  if (o.base !== 'none') for (let v = 0; v < nV0; v++) if (V[v * 3 + 2] < zc + 1.2 * h) isBase[v] = 1;
  let vcol = null;
  if (colors) { vcol = new Uint8Array(nV0 * 3); vcol.has = new Uint8Array(nV0); }
  if (o.snap || vcol) {
    say(o.snap ? 'Snapping to the AI surface' : 'Reading the AI colours', 80);
    // leave the base, the cut face, the drain and the hollow alone
    snapped = snapToRaw(V, I, P, T, h, (x, y, z, v) => !isBase[v], colors, vcol, o.snap);
  }
  if (snapped) despike(V, I, h, isBase);
  if (o.denoise > 0) { say('Cleaning the surface', 84); bilateralDenoise(V, I, o.denoise, o.denoiseSigma ?? 0.5); }
  if (o.sharpen > 0) { say('Boosting detail', 88); sharpen(V, I, o.sharpen); }
  if (vcol) fillColours(vcol, I, nV0);

  // ---- 6. checks ------------------------------------------------------------------------------------
  say('Checking the mesh', 92);
  const chk = edgeCheck(I, nV);
  let vol = 0, bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  for (let i = 0; i < nV; i++) {
    const x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2];
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
  }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6;
  }
  // bed at Z = 0, centred
  const ox = (bx0 + bx1) / 2, oy = (by0 + by1) / 2;
  for (let i = 0; i < nV; i++) { V[i * 3] -= ox; V[i * 3 + 1] -= oy; V[i * 3 + 2] -= bz0; }
  say('Done', 100);
  return {
    positions: V, indices: I, colors: vcol, isBase,
    stats: {
      triangles: I.length / 3, vertices: nV, voxel: h, grid: [nx, ny, nz],
      size: [bx1 - bx0, by1 - by0, bz1 - bz0], volume: vol / 1000, // cm³
      grams: (vol / 1000) * 1.24, openEdges: chk.open, nonManifold: chk.nonManifold,
      piecesFound: pieces, chambers, pinches, snapped: nV ? snapped / nV : 0, rawTriangles: nt,
      ms: Math.round(performance.now() - t0),
    },
  };
}

// ---------------------------------------------------------------------------------------------------
function rotation(o) {
  const r = Math.PI / 180, a = o.rotX * r, b = o.rotY * r, c = o.rotZ * r;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  // Rz * Ry * Rx
  return [
    cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
    sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
    -sb, cb * sa, cb * ca,
  ];
}
function bounds(P) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { min: mn, max: mx };
}
const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
const clampF = (v, a, b) => (v < a ? a : v > b ? b : v);
function solidFree() {}

// Squared distance from p to triangle tri (9 numbers), closest point into q. Ericson, RTCD 5.1.5.
function closestOnTri(px, py, pz, t, q) {
  const ax = t[0], ay = t[1], az = t[2], bx = t[3], by = t[4], bz = t[5], cx = t[6], cy = t[7], cz = t[8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let x, y, z;
  if (d1 <= 0 && d2 <= 0) { x = ax; y = ay; z = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { x = bx; y = by; z = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); x = ax + v * abx; y = ay + v * aby; z = az + v * abz; }
      else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { x = cx; y = cy; z = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); x = ax + w * acx; y = ay + w * acy; z = az + w * acz; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); x = bx + w * (cx - bx); y = by + w * (cy - by); z = bz + w * (cz - bz);
            } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              x = ax + abx * v + acx * w; y = ay + aby * v + acy * w; z = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  q[0] = x; q[1] = y; q[2] = z;
  const dx = px - x, dy = py - y, dz = pz - z;
  return dx * dx + dy * dy + dz * dz;
}

// Chamfer (3-4-5) distance to the nearest voxel where seed[i] === val, as Uint16 (in thirds of a voxel).
function chamferFrom(seed, nx, ny, nz, val) {
  const sxy = nx * ny, N = sxy * nz, D = new Uint16Array(N), INF = 65000;
  for (let i = 0; i < N; i++) D[i] = seed[i] === val ? 0 : INF;
  const offs = [];
  for (let dz = -1; dz <= 0; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dz === 0 && (dy > 0 || (dy === 0 && dx >= 0))) continue;
    const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    offs.push([dx, dy, dz, n === 1 ? 3 : n === 2 ? 4 : 5]);
  }
  const pass = (sign) => {
    const o = offs.map(([dx, dy, dz, w]) => [sign * dx, sign * dy, sign * dz, w, sign * (dx + dy * nx + dz * sxy)]);
    const k0 = sign > 0 ? 0 : nz - 1, k1 = sign > 0 ? nz : -1;
    const j0 = sign > 0 ? 0 : ny - 1, j1 = sign > 0 ? ny : -1;
    const i0 = sign > 0 ? 0 : nx - 1, i1 = sign > 0 ? nx : -1;
    for (let k = k0; k !== k1; k += sign) for (let j = j0; j !== j1; j += sign) {
      const row = k * sxy + j * nx;
      for (let i = i0; i !== i1; i += sign) {
        const id = row + i;
        let d = D[id]; if (d === 0) continue;
        for (let m = 0; m < o.length; m++) {
          const om = o[m], x = i + om[0], y = j + om[1], z = k + om[2];
          if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
          const v = D[id + om[4]] + om[3]; if (v < d) d = v;
        }
        D[id] = d;
      }
    }
  };
  pass(1); pass(-1);
  return D;
}

// 6-connected flood from the grid border through voxels where wall[i] === 0.
function floodBoundary(wall, nx, ny, nz) {
  const sxy = nx * ny, N = sxy * nz, out = new Uint8Array(N), Q = new Int32Array(N);
  let qh = 0, qt = 0;
  const push = (id) => { if (!wall[id] && !out[id]) { out[id] = 1; Q[qt++] = id; } };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) push(k * sxy + j * nx + i);
  }
  while (qh < qt) {
    const id = Q[qh++], i = id % nx, j = ((id / nx) | 0) % ny, k = (id / sxy) | 0;
    if (i > 0) push(id - 1); if (i < nx - 1) push(id + 1);
    if (j > 0) push(id - nx); if (j < ny - 1) push(id + nx);
    if (k > 0) push(id - sxy); if (k < nz - 1) push(id + sxy);
  }
  return out;
}
// Grow `out` by up to k steps through non-surface voxels.
function regrow(out, surf, nx, ny, nz, k) {
  const sxy = nx * ny, N = sxy * nz;
  let front = [];
  for (let id = 0; id < N; id++) if (out[id]) {
    const i = id % nx, j = ((id / nx) | 0) % ny, z = (id / sxy) | 0;
    if ((i > 0 && !out[id - 1]) || (i < nx - 1 && !out[id + 1]) || (j > 0 && !out[id - nx]) || (j < ny - 1 && !out[id + nx]) || (z > 0 && !out[id - sxy]) || (z < nz - 1 && !out[id + sxy])) front.push(id);
  }
  for (let s = 0; s < k && front.length; s++) {
    const next = [];
    const tryp = (id) => { if (!out[id] && !surf[id]) { out[id] = 1; next.push(id); } };
    for (const id of front) {
      const i = id % nx, j = ((id / nx) | 0) % ny, z = (id / sxy) | 0;
      if (i > 0) tryp(id - 1); if (i < nx - 1) tryp(id + 1);
      if (j > 0) tryp(id - nx); if (j < ny - 1) tryp(id + nx);
      if (z > 0) tryp(id - sxy); if (z < nz - 1) tryp(id + sxy);
    }
    front = next;
  }
}
// For every voxel: in how many of the 6 axis directions does a surface voxel lie?
function rayVote(surf, nx, ny, nz) {
  const sxy = nx * ny, N = sxy * nz, V = new Uint8Array(N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const row = k * sxy + j * nx;
    let seen = 0; for (let i = 0; i < nx; i++) { if (surf[row + i]) seen = 1; else V[row + i] += seen; }
    seen = 0; for (let i = nx - 1; i >= 0; i--) { if (surf[row + i]) seen = 1; else V[row + i] += seen; }
  }
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    let seen = 0; for (let j = 0; j < ny; j++) { const id = k * sxy + j * nx + i; if (surf[id]) seen = 1; else V[id] += seen; }
    seen = 0; for (let j = ny - 1; j >= 0; j--) { const id = k * sxy + j * nx + i; if (surf[id]) seen = 1; else V[id] += seen; }
  }
  const seenA = new Uint8Array(sxy);
  for (let k = 0; k < nz; k++) for (let c = 0; c < sxy; c++) { const id = k * sxy + c; if (surf[id]) seenA[c] = 1; else V[id] += seenA[c]; }
  seenA.fill(0);
  for (let k = nz - 1; k >= 0; k--) for (let c = 0; c < sxy; c++) { const id = k * sxy + c; if (surf[id]) seenA[c] = 1; else V[id] += seenA[c]; }
  return V;
}
// For every voxel: along how many of the 26 grid directions does a wall voxel lie? One sweep per direction,
// in the order that has the voxel behind already done.
function rayVote26(wall, nx, ny, nz, prog) {
  const sxy = nx * ny, N = sxy * nz, V = new Uint8Array(N), seen = new Uint8Array(N);
  let d = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy && !dz) continue;
    prog?.(d++ / 26);
    const off = dx + dy * nx + dz * sxy; // the neighbour behind is v - off
    const k0 = dz > 0 ? 0 : nz - 1, k1 = dz > 0 ? nz : -1, ks = dz > 0 ? 1 : -1;
    const j0 = dy > 0 ? 0 : ny - 1, j1 = dy > 0 ? ny : -1, js = dy > 0 ? 1 : -1;
    const i0 = dx > 0 ? 0 : nx - 1, i1 = dx > 0 ? nx : -1, is = dx > 0 ? 1 : -1;
    // for a zero component any order works; reuse the ascending one
    for (let k = (dz ? k0 : 0); k !== (dz ? k1 : nz); k += (dz ? ks : 1)) {
      for (let j = (dy ? j0 : 0); j !== (dy ? j1 : ny); j += (dy ? js : 1)) {
        const row = k * sxy + j * nx;
        for (let i = (dx ? i0 : 0); i !== (dx ? i1 : nx); i += (dx ? is : 1)) {
          const v = row + i, pi = i - dx, pj = j - dy, pk = k - dz;
          let s = 0;
          if (pi >= 0 && pj >= 0 && pk >= 0 && pi < nx && pj < ny && pk < nz) { const u = v - off; s = wall[u] | seen[u]; }
          seen[v] = s;
          if (s && !wall[v]) V[v]++;
        }
      }
    }
  }
  return V;
}

// For every voxel: in how many of the three axis-aligned 2D slices through it is it enclosed by the wall?
function sliceVote(wall, nx, ny, nz) {
  const sxy = nx * ny, N = sxy * nz, V = new Uint8Array(N);
  const run = (A, B, C, idx) => { // slices along C, each A×B, 4-connected flood from the slice border
    const out = new Uint8Array(A * B), Q = new Int32Array(A * B);
    for (let c = 0; c < C; c++) {
      out.fill(0); let qh = 0, qt = 0;
      const push = (a, b) => { const q = b * A + a; if (!out[q] && !wall[idx(a, b, c)]) { out[q] = 1; Q[qt++] = q; } };
      for (let a = 0; a < A; a++) { push(a, 0); push(a, B - 1); }
      for (let b = 0; b < B; b++) { push(0, b); push(A - 1, b); }
      while (qh < qt) {
        const q = Q[qh++], a = q % A, b = (q / A) | 0;
        if (a > 0) push(a - 1, b); if (a < A - 1) push(a + 1, b); if (b > 0) push(a, b - 1); if (b < B - 1) push(a, b + 1);
      }
      for (let b = 0; b < B; b++) for (let a = 0; a < A; a++) { const id = idx(a, b, c); if (!out[b * A + a] && !wall[id]) V[id]++; }
    }
  };
  run(nx, ny, nz, (a, b, c) => c * sxy + b * nx + a);
  run(ny, nz, nx, (a, b, c) => b * sxy + a * nx + c);
  run(nx, nz, ny, (a, b, c) => b * sxy + c * nx + a);
  return V;
}

// Keep the largest 6-connected solid component. Returns how many components there were.
function keepLargest(solid, nx, ny, nz) {
  const sxy = nx * ny, N = sxy * nz, seen = new Uint8Array(N), Q = new Int32Array(N);
  let best = -1, bestN = 0, count = 0;
  const bfs = (seed, mark) => {
    let qh = 0, qt = 0; Q[qt++] = seed; seen[seed] = mark;
    while (qh < qt) {
      const id = Q[qh++], i = id % nx, j = ((id / nx) | 0) % ny, k = (id / sxy) | 0;
      const nb = [i > 0 ? id - 1 : -1, i < nx - 1 ? id + 1 : -1, j > 0 ? id - nx : -1, j < ny - 1 ? id + nx : -1, k > 0 ? id - sxy : -1, k < nz - 1 ? id + sxy : -1];
      for (const n of nb) if (n >= 0 && solid[n] && seen[n] !== mark) { seen[n] = mark; Q[qt++] = n; }
    }
    return qt;
  };
  for (let id = 0; id < N; id++) if (solid[id] && !seen[id]) {
    const n = bfs(id, 1); count++;
    if (n > bestN) { bestN = n; best = id; }
  }
  if (count > 1) {
    bfs(best, 2);
    for (let id = 0; id < N; id++) if (solid[id] && seen[id] !== 2) solid[id] = 0;
  }
  return count;
}
// Anything the outside can't reach becomes solid (sealed air pockets, inner skins).
function fillPockets(solid, nx, ny, nz) {
  const out = floodBoundary(solid, nx, ny, nz);
  for (let i = 0; i < solid.length; i++) if (!solid[i] && !out[i]) solid[i] = 1;
}
// Number of separate hollow chambers (field > 0 not connected to the outside).
function countCavities(F, nx, ny, nz) {
  const N = F.length, wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = F[i] < 0 ? 1 : 0;
  const out = floodBoundary(wall, nx, ny, nz);
  const air = new Uint8Array(N);
  for (let i = 0; i < N; i++) air[i] = (!wall[i] && !out[i]) ? 1 : 0;
  const sxy = nx * ny, seen = new Uint8Array(N), Q = new Int32Array(N); let n = 0;
  for (let s = 0; s < N; s++) if (air[s] && !seen[s]) {
    n++; let qh = 0, qt = 0; Q[qt++] = s; seen[s] = 1;
    while (qh < qt) {
      const id = Q[qh++], i = id % nx, j = ((id / nx) | 0) % ny, k = (id / sxy) | 0;
      const nb = [i > 0 ? id - 1 : -1, i < nx - 1 ? id + 1 : -1, j > 0 ? id - nx : -1, j < ny - 1 ? id + nx : -1, k > 0 ? id - sxy : -1, k < nz - 1 ? id + sxy : -1];
      for (const m of nb) if (m >= 0 && air[m] && !seen[m]) { seen[m] = 1; Q[qt++] = m; }
    }
  }
  return n;
}
function boxBlur3(A, nx, ny, nz) {
  const sxy = nx * ny, tmp = new Float32Array(A.length);
  const run = (src, dst, stride, len, count, base) => {
    for (let c = 0; c < count; c++) {
      const b = base(c);
      for (let t = 0; t < len; t++) {
        const id = b + t * stride;
        const l = t > 0 ? src[id - stride] : src[id], r = t < len - 1 ? src[id + stride] : src[id];
        dst[id] = (l + src[id] + r) / 3;
      }
    }
  };
  run(A, tmp, 1, nx, ny * nz, (c) => c * nx);
  run(tmp, A, nx, ny, nx * nz, (c) => ((c / nx) | 0) * sxy + (c % nx));
  tmp.set(A);
  run(tmp, A, sxy, nz, sxy, (c) => c);
}

// Make the solid "well-composed": no two voxels that touch only along an edge or at a corner. Those are the
// only places a dual surface can pinch into a non-manifold edge or vertex, so after this the mesh is a
// clean 2-manifold. Each fix adds one voxel, barely inside, so the surface moves by a hair.
function wellComposed(F, nx, ny, nz, h) {
  const sxy = nx * ny, eps = -0.05 * h, IN = (id) => F[id] < 0;
  let fixed = 0;
  for (let pass = 0; pass < 8; pass++) {
    let n = 0;
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const b = k * sxy + j * nx + i;
      const c = [b, b + 1, b + nx, b + nx + 1, b + sxy, b + sxy + 1, b + sxy + nx, b + sxy + nx + 1];
      let m = 0; for (let q = 0; q < 8; q++) if (IN(c[q])) m |= 1 << q;
      if (m === 0 || m === 255) continue;
      // 2x2 face diagonals on the six faces of the cube
      const faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
      let hit = -1;
      for (const f of faces) {
        const a = (m >> f[0]) & 1, bb = (m >> f[1]) & 1, cc = (m >> f[2]) & 1, d = (m >> f[3]) & 1;
        if (a === cc && bb === d && a !== bb) { hit = a ? f[1] : f[0]; break; }
      }
      if (hit < 0) {
        // corner diagonals: exactly a pair of opposite corners differs from the other six
        for (const [p, r] of [[0, 7], [1, 6], [2, 5], [3, 4]]) {
          const pm = (1 << p) | (1 << r);
          if (m === pm) { hit = p ^ 1; break; }        // two lone inside corners: join them
          if (m === (255 ^ pm)) { hit = p; break; }    // two lone outside corners: fill one
        }
      }
      if (hit >= 0) { F[c[hit]] = eps; n++; }
    }
    fixed += n;
    if (!n) break;
  }
  return fixed;
}

// Dual (surface nets) mesh of F < 0. Closed by construction. Two z-slabs of cell indices at a time.
function surfaceNets(F, nx, ny, nz, org, h) {
  const sxy = nx * ny, cx = nx - 1, cy = ny - 1, cz = nz - 1, cxy = cx * cy;
  let V = new Float32Array(1 << 20), nV = 0, I = new Uint32Array(1 << 21), nI = 0;
  const pushV = (x, y, z) => { if (nV * 3 + 3 > V.length) { const t = new Float32Array(V.length * 2); t.set(V); V = t; } V[nV * 3] = x; V[nV * 3 + 1] = y; V[nV * 3 + 2] = z; return nV++; };
  const pushT = (a, b, c) => { if (nI + 3 > I.length) { const t = new Uint32Array(I.length * 2); t.set(I); I = t; } I[nI++] = a; I[nI++] = b; I[nI++] = c; };
  const slabs = [new Int32Array(cxy).fill(-1), new Int32Array(cxy).fill(-1)];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    const d1 = dist2(V, a, c), d2 = dist2(V, b, d);
    if (d1 <= d2) { pushT(a, b, c); pushT(a, c, d); } else { pushT(a, b, d); pushT(b, c, d); }
  };
  for (let k = 0; k < cz; k++) {
    const cur = slabs[k & 1], prev = slabs[(k + 1) & 1];
    cur.fill(-1);
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const b = k * sxy + j * nx + i;
      let mask = 0;
      for (let c = 0; c < 8; c++) { const cc = corner[c]; const v = F[b + cc[0] + cc[1] * nx + cc[2] * sxy]; val[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [e0, e1] of edges) {
        const a = val[e0], bb = val[e1];
        if ((a < 0) === (bb < 0)) continue;
        const t = a / (a - bb), c0 = corner[e0], c1 = corner[e1];
        sx += c0[0] + t * (c1[0] - c0[0]); sy += c0[1] + t * (c1[1] - c0[1]); sz += c0[2] + t * (c1[2] - c0[2]); n++;
      }
      cur[j * cx + i] = pushV(org[0] + (i + 0.5 + sx / n) * h, org[1] + (j + 0.5 + sy / n) * h, org[2] + (k + 0.5 + sz / n) * h);
    }
    // faces for the grid edges whose four cells are now known
    for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const vid = k * sxy + j * nx + i;
      // z-edge at voxel (i+1, j+1, k) -> (i+1, j+1, k+1): cells (i..i+1, j..j+1) in slab k
      if (i > 0 && j > 0) {
        const a0 = vid, a1 = vid + sxy; // voxel (i, j, k) and (i, j, k+1)
        const fa = F[a0] < 0, fb = F[a1] < 0;
        if (fa !== fb) quad(cur[(j - 1) * cx + i - 1], cur[(j - 1) * cx + i], cur[j * cx + i], cur[j * cx + i - 1], !fa);
      }
      if (k > 0) {
        // x-edge at voxel (i, j, k) -> (i+1, j, k): cells (i, j-1..j, k-1..k)
        if (j > 0) {
          const fa = F[vid] < 0, fb = F[vid + 1] < 0;
          if (fa !== fb) quad(prev[(j - 1) * cx + i], cur[(j - 1) * cx + i], cur[j * cx + i], prev[j * cx + i], fa);
        }
        // y-edge at voxel (i, j, k) -> (i, j+1, k): cells (i-1..i, j, k-1..k)
        if (i > 0) {
          const fa = F[vid] < 0, fb = F[vid + nx] < 0;
          if (fa !== fb) quad(prev[j * cx + i - 1], prev[j * cx + i], cur[j * cx + i], cur[j * cx + i - 1], fa);
        }
      }
    }
  }
  return { V: V.slice(0, nV * 3), I: I.slice(0, nI) };
}
function dist2(V, a, b) { const dx = V[a * 3] - V[b * 3], dy = V[a * 3 + 1] - V[b * 3 + 1], dz = V[a * 3 + 2] - V[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; }

function adjacency(I, nV) {
  const start = new Uint32Array(nV + 1);
  for (let t = 0; t < I.length; t += 3) for (let c = 0; c < 3; c++) start[I[t + c] + 1] += 2;
  for (let v = 0; v < nV; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nV), adj = new Uint32Array(start[nV]);
  for (let t = 0; t < I.length; t += 3) for (let c = 0; c < 3; c++) {
    const v = I[t + c]; adj[fill[v]++] = I[t + (c + 1) % 3]; adj[fill[v]++] = I[t + (c + 2) % 3];
  }
  return { start, adj };
}
function taubin(V, I, iters) {
  const nV = V.length / 3, { start, adj } = adjacency(I, nV), tmp = new Float32Array(V.length);
  const step = (lam) => {
    for (let v = 0; v < nV; v++) {
      const s0 = start[v], s1 = start[v + 1], n = s1 - s0;
      if (!n) { tmp[v * 3] = V[v * 3]; tmp[v * 3 + 1] = V[v * 3 + 1]; tmp[v * 3 + 2] = V[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (let q = s0; q < s1; q++) { const u = adj[q] * 3; x += V[u]; y += V[u + 1]; z += V[u + 2]; }
      tmp[v * 3] = V[v * 3] + lam * (x / n - V[v * 3]);
      tmp[v * 3 + 1] = V[v * 3 + 1] + lam * (y / n - V[v * 3 + 1]);
      tmp[v * 3 + 2] = V[v * 3 + 2] + lam * (z / n - V[v * 3 + 2]);
    }
    V.set(tmp);
  };
  for (let i = 0; i < iters; i++) { step(0.5); step(-0.53); }
}

// Move each vertex onto the closest point of the raw AI surface when it is within a voxel of it.
function snapToRaw(V, VI, P, T, h, allow, C, vcol, snapOn = true) {
  // vertex normals: a snap must move a vertex roughly along its normal, never sideways onto a crumb
  const NV = new Float32Array(V.length);
  for (let t = 0; t < VI.length; t += 3) {
    const a = VI[t] * 3, b = VI[t + 1] * 3, c = VI[t + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { NV[v] += nx; NV[v + 1] += ny; NV[v + 2] += nz; }
  }
  const cs = h, R = 1.0 * h, nt = T.length / 3;
  const bb = bounds(V);
  const o = [bb.min[0] - 2 * h, bb.min[1] - 2 * h, bb.min[2] - 2 * h];
  const gx = Math.ceil((bb.max[0] - o[0]) / cs) + 3, gy = Math.ceil((bb.max[1] - o[1]) / cs) + 3, gz = Math.ceil((bb.max[2] - o[2]) / cs) + 3;
  const G = gx * gy * gz;
  if (G > 120e6) return 0;
  const cnt = new Uint32Array(G + 1);
  const range = (t, cb) => {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const lo = [0, 0, 0], hi = [0, 0, 0], dims = [gx, gy, gz];
    for (let k = 0; k < 3; k++) {
      lo[k] = clampI(Math.floor((Math.min(P[a + k], P[b + k], P[c + k]) - R - o[k]) / cs), 0, dims[k] - 1);
      hi[k] = clampI(Math.floor((Math.max(P[a + k], P[b + k], P[c + k]) + R - o[k]) / cs), 0, dims[k] - 1);
    }
    for (let z = lo[2]; z <= hi[2]; z++) for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) cb((z * gy + y) * gx + x);
  };
  for (let t = 0; t < nt; t++) range(t, (c) => { cnt[c + 1]++; });
  for (let c = 0; c < G; c++) cnt[c + 1] += cnt[c];
  if (cnt[G] > 60e6) return 0;
  const fill = cnt.slice(0, G), list = new Uint32Array(cnt[G]);
  for (let t = 0; t < nt; t++) range(t, (c) => { list[fill[c]++] = t; });
  const tri = new Float64Array(9), q = new Float64Array(3);
  let moved = 0;
  const nV = V.length / 3;
  for (let v = 0; v < nV; v++) {
    const x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2];
    if (!allow(x, y, z, v)) continue;
    const cx = Math.floor((x - o[0]) / cs), cy = Math.floor((y - o[1]) / cs), cz = Math.floor((z - o[2]) / cs);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= gx || cy >= gy || cz >= gz) continue;
    const c = (cz * gy + cy) * gx + cx;
    let best = R * R, bx = 0, by = 0, bz = 0, hit = false, bt = 0;
    for (let p = cnt[c]; p < cnt[c + 1]; p++) {
      const t = list[p], a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, cc = T[t * 3 + 2] * 3;
      for (let k = 0; k < 3; k++) { tri[k] = P[a + k]; tri[3 + k] = P[b + k]; tri[6 + k] = P[cc + k]; }
      const d2 = closestOnTri(x, y, z, tri, q);
      if (d2 < best) { best = d2; bx = q[0]; by = q[1]; bz = q[2]; hit = true; bt = t; }
    }
    if (hit && C) {
      // colour of the AI texture at the closest point (barycentric blend of the raw vertex colours)
      const t = bt, a = T[t * 3], b = T[t * 3 + 1], cc = T[t * 3 + 2];
      const w = bary(bx, by, bz, P, a, b, cc);
      for (let k = 0; k < 3; k++) vcol[v * 3 + k] = Math.round(w[0] * C[a * 3 + k] + w[1] * C[b * 3 + k] + w[2] * C[cc * 3 + k]);
      vcol.has[v] = 1;
    }
    if (hit && snapOn) {
      const dx = bx - x, dy = by - y, dz = bz - z, dl = Math.hypot(dx, dy, dz);
      const nl = Math.hypot(NV[v * 3], NV[v * 3 + 1], NV[v * 3 + 2]) || 1;
      if (dl > 0.05 * h && Math.abs(dx * NV[v * 3] + dy * NV[v * 3 + 1] + dz * NV[v * 3 + 2]) / (dl * nl) < 0.6) continue;
      V[v * 3] = bx; V[v * 3 + 1] = by; V[v * 3 + 2] = bz; moved++;
    }
  }
  return moved;
}

// Snapping can catch a vertex on a stray AI crumb and leave a pin-prick bump. Any vertex standing well
// off the average of its neighbours is pulled back onto it (a few passes, so clustered spikes go too).
function despike(V, I, h, fixed) {
  const nV = V.length / 3, { start, adj } = adjacency(I, nV), lim = (0.4 * h) ** 2;
  for (let pass = 0; pass < 3; pass++) {
    let n = 0;
    for (let v = 0; v < nV; v++) {
      if (fixed[v]) continue;
      const s0 = start[v], s1 = start[v + 1], k = s1 - s0;
      if (!k) continue;
      let x = 0, y = 0, z = 0;
      for (let p = s0; p < s1; p++) { const u = adj[p] * 3; x += V[u]; y += V[u + 1]; z += V[u + 2]; }
      x /= k; y /= k; z /= k;
      const dx = V[v * 3] - x, dy = V[v * 3 + 1] - y, dz = V[v * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz > lim) { V[v * 3] = x; V[v * 3 + 1] = y; V[v * 3 + 2] = z; n++; }
    }
    if (!n) break;
  }
}

const _w = [0, 0, 0];
function bary(px, py, pz, P, a, b, c) {
  a *= 3; b *= 3; c *= 3;
  const v0x = P[b] - P[a], v0y = P[b + 1] - P[a + 1], v0z = P[b + 2] - P[a + 2];
  const v1x = P[c] - P[a], v1y = P[c + 1] - P[a + 1], v1z = P[c + 2] - P[a + 2];
  const v2x = px - P[a], v2y = py - P[a + 1], v2z = pz - P[a + 2];
  const d00 = v0x * v0x + v0y * v0y + v0z * v0z, d01 = v0x * v1x + v0y * v1y + v0z * v1z, d11 = v1x * v1x + v1y * v1y + v1z * v1z;
  const d20 = v2x * v0x + v2y * v0y + v2z * v0z, d21 = v2x * v1x + v2y * v1y + v2z * v1z, den = d00 * d11 - d01 * d01;
  if (Math.abs(den) < 1e-20) { _w[0] = 1; _w[1] = 0; _w[2] = 0; return _w; }
  let v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
  v = Math.min(1, Math.max(0, v)); w = Math.min(1 - v, Math.max(0, w));
  _w[0] = 1 - v - w; _w[1] = v; _w[2] = w; return _w;
}

// Feature-preserving denoise (bilateral normal filtering, then vertices moved to fit the filtered normals).
// Removes the AI's speckle and voxel ripple but keeps creases: collars, folds, chain links, eyelids.
function bilateralDenoise(V, I, iters, sigmaR) {
  const nV = V.length / 3, nF = I.length / 3;
  const start = new Uint32Array(nV + 1);
  for (let k = 0; k < I.length; k++) start[I[k] + 1]++;
  for (let v = 0; v < nV; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nV), vf = new Uint32Array(I.length);
  for (let k = 0; k < I.length; k++) vf[fill[I[k]]++] = (k / 3) | 0;
  const N = new Float32Array(nF * 3), Cn = new Float32Array(nF * 3), A = new Float32Array(nF), N2 = new Float32Array(nF * 3);
  const faces = () => {
    let el = 0;
    for (let f = 0; f < nF; f++) {
      const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
      const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12;
      N[f * 3] = nx / l; N[f * 3 + 1] = ny / l; N[f * 3 + 2] = nz / l; A[f] = l / 2;
      Cn[f * 3] = (V[a] + V[b] + V[c]) / 3; Cn[f * 3 + 1] = (V[a + 1] + V[b + 1] + V[c + 1]) / 3; Cn[f * 3 + 2] = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
      el += Math.sqrt(ux * ux + uy * uy + uz * uz);
    }
    return el / nF;
  };
  for (let it = 0; it < iters; it++) {
    const sS = faces() * 1.5, iS = 1 / (2 * sS * sS), iR = 1 / (2 * sigmaR * sigmaR);
    for (let pass = 0; pass < 2; pass++) {
      for (let f = 0; f < nF; f++) {
        const fx = N[f * 3], fy = N[f * 3 + 1], fz = N[f * 3 + 2], cx = Cn[f * 3], cy = Cn[f * 3 + 1], cz = Cn[f * 3 + 2];
        let sx = 0, sy = 0, sz = 0;
        for (let c = 0; c < 3; c++) {
          const v = I[f * 3 + c];
          for (let q = start[v]; q < start[v + 1]; q++) {
            const g = vf[q];
            const dx = Cn[g * 3] - cx, dy = Cn[g * 3 + 1] - cy, dz = Cn[g * 3 + 2] - cz;
            const nx = N[g * 3] - fx, ny = N[g * 3 + 1] - fy, nz = N[g * 3 + 2] - fz;
            const w = A[g] * Math.exp(-(dx * dx + dy * dy + dz * dz) * iS - (nx * nx + ny * ny + nz * nz) * iR);
            sx += w * N[g * 3]; sy += w * N[g * 3 + 1]; sz += w * N[g * 3 + 2];
          }
        }
        const l = Math.hypot(sx, sy, sz) || 1;
        N2[f * 3] = sx / l; N2[f * 3 + 1] = sy / l; N2[f * 3 + 2] = sz / l;
      }
      N.set(N2);
    }
    // vertex update (Sun et al. 2007): pull each vertex onto the planes of its filtered faces
    for (let k = 0; k < 4; k++) {
      for (let f = 0; f < nF; f++) {
        const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
        Cn[f * 3] = (V[a] + V[b] + V[c]) / 3; Cn[f * 3 + 1] = (V[a + 1] + V[b + 1] + V[c + 1]) / 3; Cn[f * 3 + 2] = (V[a + 2] + V[b + 2] + V[c + 2]) / 3;
      }
      for (let v = 0; v < nV; v++) {
        const n = start[v + 1] - start[v]; if (!n) continue;
        let dx = 0, dy = 0, dz = 0;
        const x = V[v * 3], y = V[v * 3 + 1], z = V[v * 3 + 2];
        for (let q = start[v]; q < start[v + 1]; q++) {
          const g = vf[q], nx = N[g * 3], ny = N[g * 3 + 1], nz = N[g * 3 + 2];
          const d = nx * (Cn[g * 3] - x) + ny * (Cn[g * 3 + 1] - y) + nz * (Cn[g * 3 + 2] - z);
          dx += nx * d; dy += ny * d; dz += nz * d;
        }
        V[v * 3] = x + dx / n; V[v * 3 + 1] = y + dy / n; V[v * 3 + 2] = z + dz / n;
      }
    }
  }
}

// Detail boost: push each vertex away from its neighbourhood average along the normal (unsharp mask).
function sharpen(V, I, amount) {
  const nV = V.length / 3, { start, adj } = adjacency(I, nV);
  const NV = new Float32Array(V.length), D = new Float32Array(nV);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { NV[v] += nx; NV[v + 1] += ny; NV[v + 2] += nz; }
  }
  // two rings of averaging = the "blurred" surface; detail = offset from it, measured along the normal
  const B = Float32Array.from(V), T2 = new Float32Array(V.length);
  for (let r = 0; r < 2; r++) {
    for (let v = 0; v < nV; v++) {
      const s0 = start[v], s1 = start[v + 1], n = s1 - s0; if (!n) { T2[v * 3] = B[v * 3]; T2[v * 3 + 1] = B[v * 3 + 1]; T2[v * 3 + 2] = B[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0; for (let q = s0; q < s1; q++) { const u = adj[q] * 3; x += B[u]; y += B[u + 1]; z += B[u + 2]; }
      T2[v * 3] = x / n; T2[v * 3 + 1] = y / n; T2[v * 3 + 2] = z / n;
    }
    B.set(T2);
  }
  for (let v = 0; v < nV; v++) {
    const l = Math.hypot(NV[v * 3], NV[v * 3 + 1], NV[v * 3 + 2]) || 1;
    const nx = NV[v * 3] / l, ny = NV[v * 3 + 1] / l, nz = NV[v * 3 + 2] / l;
    D[v] = (V[v * 3] - B[v * 3]) * nx + (V[v * 3 + 1] - B[v * 3 + 1]) * ny + (V[v * 3 + 2] - B[v * 3 + 2]) * nz;
    V[v * 3] += amount * D[v] * nx; V[v * 3 + 1] += amount * D[v] * ny; V[v * 3 + 2] += amount * D[v] * nz;
  }
}

// Give every vertex that found no AI colour the colour of its nearest coloured neighbour (BFS over edges).
function fillColours(vcol, I, nV) {
  const { start, adj } = adjacency(I, nV), has = vcol.has;
  let front = [];
  for (let v = 0; v < nV; v++) if (has[v]) front.push(v);
  while (front.length) {
    const next = [];
    for (const v of front) for (let q = start[v]; q < start[v + 1]; q++) {
      const u = adj[q]; if (has[u]) continue;
      has[u] = 1; vcol[u * 3] = vcol[v * 3]; vcol[u * 3 + 1] = vcol[v * 3 + 1]; vcol[u * 3 + 2] = vcol[v * 3 + 2]; next.push(u);
    }
    front = next;
  }
}

// Open edges (used once) and non-manifold edges (used 3+ times).
function edgeCheck(I, nV) {
  const ne = I.length, keys = new Float64Array(ne);
  for (let t = 0; t < ne; t += 3) for (let c = 0; c < 3; c++) {
    const a = I[t + c], b = I[t + (c + 1) % 3];
    keys[t + c] = a < b ? a * nV + b : b * nV + a;
  }
  keys.sort();
  let open = 0, nonManifold = 0;
  for (let i = 0; i < ne;) {
    let j = i + 1; while (j < ne && keys[j] === keys[i]) j++;
    const n = j - i; if (n === 1) open++; else if (n > 2) nonManifold++;
    i = j;
  }
  return { open, nonManifold };
}
