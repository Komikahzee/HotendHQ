/* ============================================================
   HOTEND HQ — Gridfinity geometry core
   Pure geometry: takes a Manifold WASM instance + parameters,
   returns watertight solids. No DOM, so it runs in a Web Worker
   (browser) and in Node (tests) unchanged.

   Spec reference: Zack Freedman's Gridfinity — 42 mm grid,
   7 mm height units, 0.8 / 1.8 / 2.15 mm stepped base profile.
   All units mm. X = width, Y = depth (front is -Y), Z = up.
   ============================================================ */

export const SPEC = {
  pitch: 42,          // grid pitch
  unitH: 7,           // height unit
  clear: 0.25,        // bin clearance per side (41.5 bin in 42 cell)
  footH: 4.75,        // bin foot profile height
  binR: 3.75,         // bin outer corner radius
  plateR: 4,          // baseplate cell corner radius
  plateProfileH: 4.65,// baseplate receiver profile height
  lipH: 4.25,         // stacking lip height above body
  magnetInset: 13,    // magnet centres at ±13 mm from cell centre
};

const CORNER_SEG = 10;

/* ---------- small helpers ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** drop undefined / NaN so defaults survive partial parameter objects */
const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && !(typeof v === 'number' && !isFinite(v))));

/** points of a rounded rectangle at height z (as Vec3), CCW */
function rrPts(w, d, r, z = 0, cx = 0, cy = 0) {
  r = clamp(r, 0.05, Math.min(w, d) / 2 - 0.01);
  const hx = w / 2 - r, hy = d / 2 - r, pts = [];
  const corners = [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]];
  for (const [x, y, a0] of corners)
    for (let i = 0; i <= CORNER_SEG; i++) {
      const a = (a0 + (90 * i) / CORNER_SEG) * Math.PI / 180;
      pts.push([cx + x + r * Math.cos(a), cy + y + r * Math.sin(a), z]);
    }
  return pts;
}
const rr2 = (w, d, r, cx = 0, cy = 0) => rrPts(w, d, r, 0, cx, cy).map(p => [p[0], p[1]]);

/* ---------- mini font (flattened Inter ExtraBold outlines) ---------- */
function textPolys(font, str) {
  const s = 1 / font.cap;            // 1 unit = cap height
  const polys = []; let x = 0;
  for (const ch of str) {
    const g = font.g[ch] || font.g['?'];
    if (!g) continue;
    for (const c of g.c) {
      const poly = [];
      for (let i = 0; i < c.length; i += 2) poly.push([(c[i] + x) * s, c[i + 1] * s]);
      polys.push(poly);
    }
    x += g.a;
  }
  return { polys, width: x * s };
}

/* ============================================================ */
export function createGridfinity(wasm, font = null) {
  const { Manifold, CrossSection } = wasm;
  const U = (arr) => arr.length ? (arr.length === 1 ? arr[0] : Manifold.union(arr)) : null;

  const prism = (poly2, z0, z1) =>
    new CrossSection([poly2], 'Positive').extrude(z1 - z0).translate([0, 0, z0]);
  const rrect = (w, d, r, z0, z1, cx = 0, cy = 0) => prism(rr2(w, d, r, cx, cy), z0, z1);
  const cyl = (r, z0, z1, x = 0, y = 0, seg = 40, r2) =>
    Manifold.cylinder(z1 - z0, r, r2 ?? r, seg).translate([x, y, z0]);

  /** loft through rounded-rect layers by hulling consecutive pairs */
  function loft(layers, cx = 0, cy = 0) {
    const parts = [];
    for (let i = 0; i < layers.length - 1; i++) {
      const a = layers[i], b = layers[i + 1];
      parts.push(Manifold.hull([
        ...rrPts(a.w, a.d, a.r, a.z, cx, cy), ...rrPts(b.w, b.d, b.r, b.z, cx, cy)]));
    }
    return U(parts);
  }

  /** column/row widths for n units (0.5 steps → trailing half cell) */
  function cellSizes(n, pitch, half) {
    if (half) return Array(Math.round(n * 2)).fill(pitch / 2);
    const full = Math.floor(n + 1e-9), out = Array(full).fill(pitch);
    if (n - full > 0.25) out.push(pitch / 2);
    return out;
  }
  const centers = (sizes) => {
    const tot = sizes.reduce((a, b) => a + b, 0); let x = -tot / 2;
    return sizes.map(s => { const c = x + s / 2; x += s; return c; });
  };

  /** text as a CrossSection, fitted into a box of maxW × maxH, centred on (cx,cy) */
  function textCS(str, maxW, maxH, cx = 0, cy = 0) {
    if (!font || !str || !str.trim()) return null;
    const { polys, width } = textPolys(font, str);
    if (!polys.length) return null;
    const k = Math.min(maxH, maxW / Math.max(width, 0.01));
    if (k < 1.5) return null;          // below ~1.5 mm cap height it won't print
    return new CrossSection(polys, 'NonZero').scale([k, k]).translate([cx - width * k / 2, cy - k / 2]);
  }

  /* ---------------- hole tools ---------------- */
  function magnetTool(p, x, y, z0, z1) {
    const r = p.magD / 2;
    let m = cyl(r, z0, z1, x, y, 48);
    if (p.magRibs) {
      const ribs = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, rr = r + 0.3 - 0.28;
        ribs.push(cyl(0.3, z0 - 0.1, z1 + 0.1, x + rr * Math.cos(a), y + rr * Math.sin(a), 12));
      }
      m = m.subtract(U(ribs));
    }
    return m;
  }

  /* ============================================================
     BIN  (also used for lids and tool holders)
     ============================================================ */
  function bin(o) {
    const p = Object.assign({
      nx: 2, ny: 1, hUnits: 3, hMM: 0, pitch: SPEC.pitch, clear: SPEC.clear,
      halfGrid: false, wall: 1.2, floor: 1.2, lip: true, lite: false, solid: false,
      divX: 0, divY: 0, ratiosX: '', ratiosY: '', divT: 1.2, divLower: 0,
      scoop: 0, tab: 'none', tabDepth: 13, tabLen: 100, labels: '', textMode: 'engrave', textDepth: 0.6,
      holes: 'none', holeWhere: 'all', magD: 6.5, magDepth: 2.4, magRibs: false, magCover: 0,
      screwD: 3, screwDepth: 6,
      // cutouts (tool holder)
      cut: 'none', cutA: 10, cutB: 20, cutDepth: 12, cutClear: 0.2, cutGap: 2.5, cutMargin: 3,
      cutLayout: 'auto', cutCols: 3, cutRows: 3, cutStagger: false, cutRot: 0, cutCham: 0.6,
      // top text (lids / holders)
      topText: '', topTextSize: 8,
    }, clean(o));
    const warn = [];
    const P = p.pitch, fh = SPEC.footH;
    const colW = cellSizes(p.nx, P, p.halfGrid), rowW = cellSizes(p.ny, P, p.halfGrid);
    const G = colW.reduce((a, b) => a + b, 0), GD = rowW.reduce((a, b) => a + b, 0);
    const W = G - 2 * p.clear, D = GD - 2 * p.clear, R = SPEC.binR;
    let H = p.hMM > 0 ? p.hMM : p.hUnits * SPEC.unitH;

    // floor: must clear the deepest hole
    let floor = p.floor;
    const needScrew = (p.holes === 'screw' || p.holes === 'both') && !p.lite;
    if (needScrew && fh + floor < p.screwDepth + 0.6) {
      floor = +(p.screwDepth + 0.6 - fh).toFixed(2);
      warn.push(`Floor raised to ${floor} mm so screw holes don't break through.`);
    }
    const magTop = p.magCover + p.magDepth;
    if ((p.holes === 'magnet' || p.holes === 'both') && !p.lite && magTop > fh - 0.6)
      warn.push('Magnet pocket is deeper than the foot — check your magnet depth.');
    const zf = fh + (p.lite ? 0.8 : floor);
    if (H < zf + 1) { H = +(zf + 1).toFixed(2); warn.push(`Height raised to ${H} mm (minimum for this floor).`); }
    const T = p.lip ? H + SPEC.lipH : H;

    /* ---- outer solid: feet + body ---- */
    const cx = centers(colW), cy = centers(rowW), feet = [], footList = [];
    for (let i = 0; i < colW.length; i++) for (let j = 0; j < rowW.length; j++) {
      const Fw = colW[i] - 2 * p.clear, Fd = rowW[j] - 2 * p.clear;
      footList.push({ x: cx[i], y: cy[j], w: Fw, d: Fd, i, j });
      feet.push(loft([
        { w: Fw - 5.9, d: Fd - 5.9, r: 0.8, z: 0 },
        { w: Fw - 4.3, d: Fd - 4.3, r: 1.6, z: 0.8 },
        { w: Fw - 4.3, d: Fd - 4.3, r: 1.6, z: 2.6 },
        { w: Fw, d: Fd, r: R, z: fh },
        { w: Fw - 0.4, d: Fd - 0.4, r: R - 0.2, z: fh + 0.2 },
      ], cx[i], cy[j]));
    }
    let solid = U([...feet, rrect(W, D, R, fh, T)]);

    /* ---- cavity ---- */
    const cav = [], cuts = [];
    const wi = p.wall, Wi = W - 2 * wi, Di = D - 2 * wi;
    const inset = (k, z) => ({ w: W - 2 * k, d: D - 2 * k, r: Math.max(R - k, 0.4), z });
    const capZ = p.lip ? H - 0.6 : H;       // interior features stay below a stacked bin's feet

    if (p.solid) {
      if (p.lip) cav.push(loft([inset(2.7, H), inset(2.0, H + 0.7), inset(2.0, H + 2.5),
        inset(0.25, T), inset(-0.75, T + 1)]));
    } else {
      let layers;
      if (p.lip) {
        const zs = H - (2.7 - wi);
        layers = [];
        if (wi < 2.7) {
          if (zs > zf) layers.push(inset(wi, zf), inset(wi, zs));
          else layers.push(inset(2.7 - (H - zf), zf));
        } else layers.push(inset(wi, zf), inset(wi, H), inset(2.7, H + 0.001));
        layers.push(inset(2.7, H), inset(2.0, H + 0.7), inset(2.0, H + 2.5), inset(0.25, T), inset(-0.75, T + 1));
        layers = layers.filter((l, i, a) => i === 0 || l.z > a[i - 1].z - 1e-9);
      } else layers = [inset(wi, zf), inset(wi, T + 1)];
      cav.push(loft(layers));

      if (p.lite) {             // hollow feet
        for (const f of footList) cav.push(loft([
          { w: f.w - 4.3 - 2 * wi, d: f.d - 4.3 - 2 * wi, r: Math.max(1.6 - wi, 0.3), z: 0.8 },
          { w: f.w - 4.3 - 2 * wi, d: f.d - 4.3 - 2 * wi, r: Math.max(1.6 - wi, 0.3), z: 2.6 },
          { w: f.w - 2 * wi, d: f.d - 2 * wi, r: Math.max(R - wi, 0.4), z: fh },
          { w: f.w - 2 * wi, d: f.d - 2 * wi, r: Math.max(R - wi, 0.4), z: zf + 0.5 },
        ], f.x, f.y));
      }
    }

    /* ---- base holes ---- */
    if (p.holes !== 'none' && !p.lite) {
      const nI = colW.length - 1, nJ = rowW.length - 1;
      for (const f of footList) {
        if (p.holeWhere === 'corners' && !((f.i === 0 || f.i === nI) && (f.j === 0 || f.j === nJ))) continue;
        const full = f.w > 30 && f.d > 30;
        const spots = full
          ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [f.x + a * SPEC.magnetInset, f.y + b * SPEC.magnetInset])
          : [[f.x, f.y]];
        for (const [x, y] of spots) {
          if (p.holes === 'magnet' || p.holes === 'both') cuts.push(p.magCover > 0
            ? magnetTool(p, x, y, p.magCover, p.magCover + p.magDepth)
            : magnetTool(p, x, y, -1, p.magDepth));
          if (p.holes === 'screw' || p.holes === 'both') cuts.push(cyl(p.screwD / 2, -1, p.screwDepth, x, y, 32));
        }
      }
    }

    /* ---- compartments ---- */
    const split = (n, ratioStr, span) => {
      let r = String(ratioStr || '').split(/[,\s:]+/).map(Number).filter(v => v > 0);
      if (r.length !== n + 1) r = Array(n + 1).fill(1);
      const sum = r.reduce((a, b) => a + b, 0); let acc = -span / 2; const edges = [acc];
      for (const v of r) { acc += span * v / sum; edges.push(acc); }
      return edges;                       // n+2 edges; inner edges are divider centres
    };
    const ex = split(p.divX, p.ratiosX, Wi), ey = split(p.divY, p.ratiosY, Di);
    const t = p.divT, adds = [];
    const compX = [], compY = [];
    for (let k = 0; k < ex.length - 1; k++)
      compX.push([ex[k] + (k > 0 ? t / 2 : 0), ex[k + 1] - (k < ex.length - 2 ? t / 2 : 0)]);
    for (let k = 0; k < ey.length - 1; k++)
      compY.push([ey[k] + (k > 0 ? t / 2 : 0), ey[k + 1] - (k < ey.length - 2 ? t / 2 : 0)]);

    if (!p.solid) {
      const dTop = Math.max(zf + 1, capZ - p.divLower);
      for (let k = 1; k < ex.length - 1; k++)
        adds.push(Manifold.cube([t, Di + 0.2, dTop - zf + 0.02]).translate([ex[k] - t / 2, -Di / 2 - 0.1, zf - 0.01]));
      for (let k = 1; k < ey.length - 1; k++)
        adds.push(Manifold.cube([Wi + 0.2, t, dTop - zf + 0.02]).translate([-Wi / 2 - 0.1, ey[k] - t / 2, zf - 0.01]));

      // scoops: concave fillet at the front of each row
      if (p.scoop > 0) {
        for (const [y0, y1] of compY) {
          const rs = p.scoop * Math.min(capZ - zf, (y1 - y0) * 0.6, 30);
          if (rs < 1) continue;
          const blk = Manifold.cube([Wi + 0.2, rs + 0.01, rs + 0.01]).translate([-Wi / 2 - 0.1, y0 - 0.01, zf - 0.01]);
          const c = Manifold.cylinder(Wi + 1, rs, rs, 64).rotate([0, 90, 0]).translate([-Wi / 2 - 0.5, y0 + rs, zf + rs]);
          adds.push(blk.subtract(c));
        }
      }

      // label tabs: 45° overhang-free shelves along the back of each row
      if (p.tab !== 'none') {
        const labels = String(p.labels || '').split('|');
        let li = 0; const txt = [];
        for (let j = compY.length - 1; j >= 0; j--) {
          const [y0, y1] = compY[j];
          const d = Math.min(p.tabDepth, (y1 - y0) * 0.8, capZ - zf - 0.5);
          if (d < 3) { li += compX.length; continue; }
          for (const [x0, x1] of compX) {
            const cw = x1 - x0, len = Math.max(6, Math.min(cw, cw * p.tabLen / 100));
            let a = x0, b = x0 + len;
            if (p.tab === 'right') { a = x1 - len; b = x1; }
            if (p.tab === 'center') { a = (x0 + x1 - len) / 2; b = a + len; }
            if (p.tab === 'full') { a = x0; b = x1; }
            const pts = [];
            for (const x of [a - (p.tab === 'full' || a <= x0 + 1e-6 ? 0.05 : 0), b + (b >= x1 - 1e-6 ? 0.05 : 0)])
              pts.push([x, y1 + 0.05, capZ], [x, y1 - d, capZ], [x, y1 + 0.05, capZ - d - 0.05]);
            adds.push(Manifold.hull(pts));
            const label = (labels[li++] || '').trim();
            if (label && font) {
              const cs = textCS(label, (b - a) - 2, d * 0.62, (a + b) / 2, y1 - d / 2);
              if (cs) txt.push(cs);
              else warn.push(`Label "${label}" is too small to print on this tab.`);
            }
          }
        }
        if (txt.length) {
          const cs = CrossSection.union(txt), td = p.textDepth;
          if (p.textMode === 'emboss') adds.push(cs.extrude(td + 0.01).translate([0, 0, capZ - 0.01]));
          else cuts.push(cs.extrude(td + 1).translate([0, 0, capZ - td]));
        }
      }
    }

    /* ---- tool-holder cutouts (solid bins) ---- */
    let cutCount = 0;
    if (p.solid && p.cut !== 'none') {
      const zt = H, c = p.cutClear, cham = p.cutCham;
      let depth = Math.min(p.cutDepth, zt - fh - 0.8);
      if (depth < p.cutDepth) warn.push(`Cutout depth limited to ${depth.toFixed(1)} mm to keep the base intact.`);
      let sx, sy, tool;
      if (p.cut === 'circle') {
        const r = p.cutA / 2 + c; sx = sy = 2 * r;
        tool = (x, y) => U([cyl(r, zt - depth, zt + 1, x, y, 48),
          cham > 0 ? cyl(r, zt - cham, zt + 0.01, x, y, 48, r + cham + 0.01) : null].filter(Boolean));
      } else if (p.cut === 'hex') {
        const rc = (p.cutA / 2 + c) / Math.cos(Math.PI / 6);
        sx = 2 * rc; sy = p.cutA + 2 * c;
        tool = (x, y) => U([cyl(rc, zt - depth, zt + 1, x, y, 6),
          cham > 0 ? cyl(rc, zt - cham, zt + 0.01, x, y, 6, rc + cham / Math.cos(Math.PI / 6) + 0.01) : null].filter(Boolean));
      } else {
        let a = p.cutA + 2 * c, b = (p.cut === 'rect' ? p.cutB : Math.max(p.cutB, p.cutA)) + 2 * c;
        if (p.cutRot) [a, b] = [b, a];
        sx = a; sy = b;
        const r = p.cut === 'slot' ? Math.min(a, b) / 2 : Math.min(1, Math.min(a, b) / 4);
        tool = (x, y) => U([rrect(a, b, r, zt - depth, zt + 1, x, y),
          cham > 0 ? loft([{ w: a, d: b, r, z: zt - cham }, { w: a + 2 * cham, d: b + 2 * cham, r: r + cham, z: zt + 0.01 }], x, y) : null].filter(Boolean));
      }
      const m = p.cutMargin, g = p.cutGap, AW = W - 2 * m, AD = D - 2 * m;
      const spots = [];
      if (p.cutLayout === 'manual') {
        const nc = Math.max(1, p.cutCols | 0), nr = Math.max(1, p.cutRows | 0);
        const px = nc > 1 ? (AW - sx) / (nc - 1) : 0, py = nr > 1 ? (AD - sy) / (nr - 1) : 0;
        if ((nc > 1 && px < sx + 0.8) || (nr > 1 && py < sy + 0.8)) warn.push('Cutouts overlap — reduce rows/columns or size.');
        for (let i = 0; i < nc; i++) for (let j = 0; j < nr; j++)
          spots.push([nc > 1 ? -AW / 2 + sx / 2 + i * px : 0, nr > 1 ? -AD / 2 + sy / 2 + j * py : 0]);
      } else {
        const px = sx + g, py0 = sy + g;
        const py = p.cutStagger ? Math.max(py0 * 0.866, sy + g * 0.6) : py0;
        const nr = Math.max(0, Math.floor((AD - sy) / py + 1e-6) + 1);
        const ncFull = Math.max(0, Math.floor((AW - sx) / px + 1e-6) + 1);
        const stag = p.cutStagger && nr > 1;
        const nc2 = stag ? Math.max(0, Math.floor((AW - sx - px / 2) / px + 1e-6) + 1) : ncFull;
        const rowsH = (nr - 1) * py;
        for (let j = 0; j < nr; j++) {
          const odd = stag && j % 2 === 1, nc = odd ? nc2 : ncFull;
          const spanW = (nc - 1) * px + (stag ? px / 2 : 0);
          for (let i = 0; i < nc; i++)
            spots.push([-spanW / 2 + i * px + (odd ? px / 2 : 0), -rowsH / 2 + j * py]);
        }
        if (!spots.length) warn.push('No cutouts fit — make the bin bigger or the cutout smaller.');
      }
      for (const [x, y] of spots) cuts.push(tool(x, y));
      cutCount = spots.length;
    }

    /* ---- top text (lids & holders) ---- */
    if (p.solid && p.topText && font) {
      const cs = textCS(p.topText, W - 10, p.topTextSize, 0, 0);
      if (cs) {
        const td = p.textDepth, ztop = H;
        if (p.textMode === 'emboss') adds.push(cs.extrude(td + 0.01).translate([0, 0, ztop - 0.01]));
        else cuts.push(cs.extrude(td + 1).translate([0, 0, ztop - td]));
      } else warn.push('Top text is too small to print — shorten it or increase size.');
    }

    if (cav.length) solid = solid.subtract(U(cav));
    if (adds.length) solid = U([solid, ...adds]);
    if (cuts.length) solid = solid.subtract(U(cuts));

    const pause = p.magCover > 0 && (p.holes === 'magnet' || p.holes === 'both')
      ? +(p.magCover + p.magDepth).toFixed(2) : null;
    return {
      solid, warn,
      info: { W, D, H: T, bodyH: H, floorZ: zf, pauseZ: pause, cutCount,
        compartments: compX.length * compY.length },
    };
  }

  /* ============================================================
     BASEPLATE
     ============================================================ */
  function baseplate(o) {
    const p = Object.assign({
      nx: 3, ny: 3, pitch: SPEC.pitch, halfGrid: false,
      padL: 0, padR: 0, padF: 0, padB: 0, cornerR: SPEC.plateR,
      floor: 0, magnets: false, magD: 6.5, magDepth: 2.4, magRibs: false, pushOut: false,
      weighted: false, skeleton: false, mount: 'none', joinL: false, joinR: false, joinF: false, joinB: false,
      clips: false,
    }, clean(o));
    const warn = [], P = p.pitch;
    let t = p.floor;
    if (p.magnets && t < p.magDepth) { t = p.magDepth + (p.pushOut ? 1 : 0.4); warn.push(`Floor set to ${t} mm to hold the magnets.`); }
    if (p.weighted && t < 6.4) { t = 6.4; warn.push('Floor set to 6.4 mm for the weight pockets.'); }
    if (p.mount !== 'none' && t < 2) { t = 2.4; warn.push('Floor set to 2.4 mm for countersunk mounting screws.'); }
    const anyJoin = p.joinL || p.joinR || p.joinF || p.joinB;
    if (p.clips && anyJoin && t < 3.2) { t = Math.max(t, 3.2); warn.push('Floor set to 3.2 mm to fit the connector clips.'); }
    t = +t.toFixed(2);
    const Ht = t + SPEC.plateProfileH;

    const colW = cellSizes(p.nx, P, p.halfGrid), rowW = cellSizes(p.ny, P, p.halfGrid);
    const GX = colW.reduce((a, b) => a + b, 0), GY = rowW.reduce((a, b) => a + b, 0);
    const Wp = GX + p.padL + p.padR, Dp = GY + p.padF + p.padB;
    const ox = (p.padL - p.padR) / 2, oy = (p.padF - p.padB) / 2;       // grid centre offset
    const cx = centers(colW).map(v => v + ox), cy = centers(rowW).map(v => v + oy);

    // outer: rounded only on free edges; joined edges stay square so pieces butt together
    let outer;
    const r = p.cornerR;
    const sqL = p.joinL, sqR = p.joinR, sqF = p.joinF, sqB = p.joinB;
    if (!(sqL || sqR || sqF || sqB)) outer = rrect(Wp, Dp, r, 0, Ht);
    else {
      outer = rrect(Wp, Dp, r, 0, Ht);
      const fills = [];
      const x0 = -Wp / 2, y0 = -Dp / 2;
      const corner = (x, y) => fills.push(Manifold.cube([r + 0.01, r + 0.01, Ht]).translate([x, y, 0]));
      if (sqL || sqF) corner(x0, y0);
      if (sqR || sqF) corner(Wp / 2 - r - 0.01, y0);
      if (sqL || sqB) corner(x0, Dp / 2 - r - 0.01);
      if (sqR || sqB) corner(Wp / 2 - r - 0.01, Dp / 2 - r - 0.01);
      outer = U([outer, ...fills]);
    }

    const cuts = [];
    for (let i = 0; i < colW.length; i++) for (let j = 0; j < rowW.length; j++) {
      const S = colW[i], SD = rowW[j], x = cx[i], y = cy[j];
      const L = [
        { w: S - 5.7, d: SD - 5.7, r: 1.15, z: t },
        { w: S - 4.3, d: SD - 4.3, r: 1.85, z: t + 0.7 },
        { w: S - 4.3, d: SD - 4.3, r: 1.85, z: t + 2.5 },
        { w: S, d: SD, r: SPEC.plateR, z: Ht },
        { w: S + 2, d: SD + 2, r: SPEC.plateR + 1, z: Ht + 1 },
      ];
      if (t === 0) L.unshift({ w: S - 5.7, d: SD - 5.7, r: 1.15, z: -1 });
      cuts.push(loft(L, x, y));

      if (t > 0) {
        const full = S > 30 && SD > 30;
        const mags = full
          ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + a * SPEC.magnetInset, y + b * SPEC.magnetInset])
          : [[x, y]];
        if (p.magnets) for (const [mx, my] of mags) {
          cuts.push(magnetTool(p, mx, my, t - p.magDepth, t + 0.5));
          if (p.pushOut) cuts.push(cyl(1.5, -1, t, mx, my, 24));
        }
        if (p.weighted && full) cuts.push(rrect(21.4, 21.4, 1, -1, 4, x, y));
        if (p.skeleton && full) {
          const inner = new CrossSection([rr2(S - 5.7 - 3, SD - 5.7 - 3, 2, x, y)], 'Positive');
          const keep = [];
          for (const [mx, my] of mags) {
            keep.push(CrossSection.circle(p.magD / 2 + 2, 40).translate([mx, my]));
            const sx = Math.sign(mx - x), sy = Math.sign(my - y);
            keep.push(CrossSection.square([30, 30]).translate([mx + (sx < 0 ? -30 : 0), my + (sy < 0 ? -30 : 0)]));
          }
          if (p.mount === 'all' || p.mount === 'corners') keep.push(CrossSection.circle(5, 40).translate([x, y]));
          if (p.weighted) keep.push(CrossSection.square([25.4, 25.4], true).translate([x, y]));
          const hole = CrossSection.difference([inner, ...keep]);
          if (!hole.isEmpty()) cuts.push(hole.extrude(t + 2).translate([0, 0, -1]));
        }
        const isCorner = (i === 0 || i === colW.length - 1) && (j === 0 || j === rowW.length - 1);
        if (p.mount === 'all' || (p.mount === 'corners' && isCorner)) {
          cuts.push(cyl(1.75, -1, t + 1, x, y, 32));
          cuts.push(cyl(1.75, t - 1.75, t + 0.01, x, y, 32, 3.5 + 0.01));
        }
      }
    }

    // bowtie connector pockets on joined edges (bottom side)
    let clipCount = 0;
    if (p.clips && anyJoin) {
      const d = 3.0, bt = (cxp, cyp, rot) => {
        // half-bowtie pocket: narrow (5.9) at the joint, wide (10.3) inboard, so the clip locks; +0.15 clearance
        const poly = [[-0.2, -2.95], [0, -2.95], [10.15, -5.15], [10.15, 5.15], [0, 2.95], [-0.2, 2.95]];
        return new CrossSection([poly], 'Positive').rotate(rot).translate([cxp, cyp]).extrude(d + 0.01).translate([0, 0, -0.01]);
      };
      const X0 = -Wp / 2, X1 = Wp / 2, Y0 = -Dp / 2, Y1 = Dp / 2;
      if (p.joinL) for (const y of cy) { cuts.push(bt(X0, y, 0)); clipCount++; }
      if (p.joinR) for (const y of cy) { cuts.push(bt(X1, y, 180)); clipCount++; }
      if (p.joinF) for (const x of cx) { cuts.push(bt(x, Y0, 90)); clipCount++; }
      if (p.joinB) for (const x of cx) { cuts.push(bt(x, Y1, 270)); clipCount++; }
    }

    const solid = outer.subtract(U(cuts));
    return { solid, warn, info: { W: Wp, D: Dp, H: Ht, floor: t, cells: colW.length * rowW.length, clipCount } };
  }

  /** printable bowtie clip that joins two baseplate pieces */
  function clip(n = 1) {
    const poly = [[-10, -5], [0, -2.8], [10, -5], [10, 5], [0, 2.8], [-10, 5]];
    const one = new CrossSection([poly], 'Positive').extrude(2.8);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(one.translate([(i % 5) * 24 - 48, Math.floor(i / 5) * 14, 0]));
    return { solid: U(parts), warn: [], info: { W: 20, D: 10, H: 2.8 } };
  }

  return { bin, baseplate, clip };
}

/* ============================================================
   Drawer fitter — pure maths, shared by UI and tests
   ============================================================ */
export function fitDrawer(o) {
  const p = Object.assign({ W: 400, D: 300, H: 60, bedX: 220, bedY: 220, tol: 1, half: true,
    align: 'center', pitch: SPEC.pitch, margin: 5, plateFloor: 0 }, clean(o));
  const P = p.pitch, step = p.half ? 0.5 : 1;
  const ux = Math.floor(((p.W - p.tol) / P) / step + 1e-9) * step;
  const uy = Math.floor(((p.D - p.tol) / P) / step + 1e-9) * step;
  const gx = ux * P, gy = uy * P;
  const spareX = Math.max(0, p.W - p.tol - gx), spareY = Math.max(0, p.D - p.tol - gy);
  let padL, padR, padF, padB;
  if (p.align === 'center') { padL = padR = spareX / 2; padF = padB = spareY / 2; }
  else { padL = 0; padR = spareX; padF = 0; padB = spareY; }   // front-left
  const splitAxis = (units, bed, padA, padB) => {
    const cells = cellList(units);
    for (let n = 1; n <= cells.length; n++) {
      const groups = [];
      const base = Math.floor(cells.length / n), extra = cells.length % n;
      let k = 0;
      for (let g = 0; g < n; g++) { const c = base + (g < extra ? 1 : 0); groups.push(cells.slice(k, k + c)); k += c; }
      const ok = groups.every((gr, gi) => {
        const w = gr.reduce((a, b) => a + b, 0) * P + (gi === 0 ? padA : 0) + (gi === n - 1 ? padB : 0);
        return w <= bed - p.margin;
      });
      if (ok) return groups;
    }
    return null;
  };
  const cellList = (u) => { const f = Math.floor(u + 1e-9), a = Array(f).fill(1); if (u - f > 0.25) a.push(0.5); return a; };
  let gX = splitAxis(ux, p.bedX, padL, padR), gY = splitAxis(uy, p.bedY, padF, padB), rotated = false;
  // try the bed the other way round if it helps
  const gX2 = splitAxis(ux, p.bedY, padL, padR), gY2 = splitAxis(uy, p.bedX, padF, padB);
  if (gX2 && gY2 && (!gX || !gY || gX2.length * gY2.length < gX.length * gY.length)) { gX = gX2; gY = gY2; rotated = true; }
  const pieces = [];
  if (gX && gY && ux > 0 && uy > 0) {
    gY.forEach((ry, j) => gX.forEach((rx, i) => {
      const nx = rx.reduce((a, b) => a + b, 0), ny = ry.reduce((a, b) => a + b, 0);
      pieces.push({
        id: `${String.fromCharCode(65 + j)}${i + 1}`, i, j, nx, ny,
        padL: i === 0 ? padL : 0, padR: i === gX.length - 1 ? padR : 0,
        padF: j === 0 ? padF : 0, padB: j === gY.length - 1 ? padB : 0,
        joinL: i > 0, joinR: i < gX.length - 1, joinF: j > 0, joinB: j < gY.length - 1,
      });
    }));
  }
  const plateH = p.plateFloor + SPEC.plateProfileH;
  const maxBinH = Math.floor((p.H - plateH - SPEC.lipH - 1) / SPEC.unitH);
  return { ux, uy, padL, padR, padF, padB, cols: gX?.length || 0, rows: gY?.length || 0,
    pieces, rotated, maxBinUnits: Math.max(0, maxBinH), maxBinUnitsNoLip: Math.max(0, Math.floor((p.H - plateH - 1) / SPEC.unitH)) };
}

/* ============================================================
   Export writers: binary STL, 3MF, ZIP (store)
   ============================================================ */
export function meshToSTL(pos, idx, name = 'hotendhq') {
  const nt = idx.length / 3, buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = `Hotend HQ Gridfinity - ${name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
    for (const v of [a, b, c]) { dv.setFloat32(o, pos[v], true); dv.setFloat32(o + 4, pos[v + 1], true); dv.setFloat32(o + 8, pos[v + 2], true); o += 12; }
    o += 2;
  }
  return new Uint8Array(buf);
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = (s) => new TextEncoder().encode(s);

export function zip(files) {           // files: [{name, data:Uint8Array}]
  const parts = [], central = []; let off = 0;
  for (const f of files) {
    const nm = enc(f.name), crc = crc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
    h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + sz;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let k = 0;
  for (const a of all) { out.set(a, k); k += a.length; }
  return out;
}

/** 3MF (one object per mesh), laid out side by side */
export function meshesTo3MF(meshes) {  // [{name,pos,idx}]
  let objs = '', items = '', id = 1, xoff = 0;
  for (const m of meshes) {
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < m.pos.length; i += 3) { minX = Math.min(minX, m.pos[i]); maxX = Math.max(maxX, m.pos[i]); }
    const v = [], t = [];
    for (let i = 0; i < m.pos.length; i += 3) v.push(`<vertex x="${+m.pos[i].toFixed(4)}" y="${+m.pos[i + 1].toFixed(4)}" z="${+m.pos[i + 2].toFixed(4)}"/>`);
    for (let i = 0; i < m.idx.length; i += 3) t.push(`<triangle v1="${m.idx[i]}" v2="${m.idx[i + 1]}" v3="${m.idx[i + 2]}"/>`);
    const nm = String(m.name).replace(/[<>&"]/g, '');
    objs += `<object id="${id}" name="${nm}" type="model"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>`;
    items += `<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${(xoff - minX).toFixed(3)} 0 0"/>`;
    xoff += (maxX - minX) + 10; id++;
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Hotend HQ Gridfinity Generator</metadata><resources>${objs}</resources><build>${items}</build></model>`;
  return zip([
    { name: '[Content_Types].xml', data: enc('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>') },
    { name: '_rels/.rels', data: enc('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>') },
    { name: '3D/3dmodel.model', data: enc(model) },
  ]);
}
