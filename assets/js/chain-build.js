/* ============================================================
   HOTEND HQ — Chain generator: styles, plates, layout, extras
   Builds a complete, printable chain from user parameters on top
   of the link engine in chain-core.js.
   ============================================================ */
import {
  createChainEngine, NOZZLE, mMul, mRx, mRz, mT, mApply, meshVolume, transformMesh, meshBounds, clean, clamp, TAU, D2R,
} from './chain-core.js?v=86943a3a24';

const Q = Math.PI / 4, H = Math.PI / 2;
const IN = 25.4;

/* ------------------------------------------------------------
   Style catalogue. Every style is a recipe for the link engine.
   ring   — tube links, alternating ±45° (or flat + twisted for curbs)
   special— own builders (ball, snake, herringbone, bike, kits)
   ------------------------------------------------------------ */
export const STYLES = {
  cable:       { name: 'Cable (round)',        group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 1.3, d: { linkL: 8, linkW: 6.2, wire: 1.4 } },
  oval:        { name: 'Cable (oval)',         group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 1.75, d: { linkL: 10, linkW: 6, wire: 1.5 } },
  trace:       { name: 'Elongated / trace',    group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 2.3, d: { linkL: 11, linkW: 4.8, wire: 1.2 } },
  longshort:   { name: 'Long & short',         group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 2.1, pattern: [1, 0.55], d: { linkL: 12, linkW: 5.6, wire: 1.4 } },
  rolo:        { name: 'Rolo / belcher',       group: 'Easy',   kind: 'ring', shape: 'circle', ratio: 1, d: { linkL: 7.5, linkW: 7.5, wire: 1.8 } },
  paperclip:   { name: 'Paperclip',            group: 'Easy',   kind: 'ring', shape: 'rrect', ratio: 2.8, rc: 0.34, d: { linkL: 16, linkW: 5.6, wire: 1.3 } },
  flatclip:    { name: 'Flat paperclip',       group: 'Easy',   kind: 'ring', shape: 'rrect', ratio: 2.8, rc: 0.34, profile: 'flat', d: { linkL: 16, linkW: 6, wire: 1.4 } },
  mariner:     { name: 'Mariner / anchor',     group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 1.6, bar: true, d: { linkL: 12, linkW: 7.4, wire: 1.5 } },
  ladder:      { name: 'Ladder',               group: 'Easy',   kind: 'ring', shape: 'rrect', ratio: 0.55, rc: 0.28, d: { linkL: 5.5, linkW: 10, wire: 1.3 } },
  shaped:      { name: 'Shaped links',         group: 'Easy',   kind: 'ring', shape: 'heart', ratio: 1.0, d: { linkL: 12, linkW: 11, wire: 1.3 } },
  name:        { name: 'Name / letter chain',  group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 1.6, letters: true, d: { linkL: 8, linkW: 5.6, wire: 1.3 } },
  custom:      { name: 'Custom link shape',    group: 'Easy',   kind: 'ring', shape: 'stadium', ratio: 1.6, customPlate: true, d: { linkL: 8, linkW: 5.6, wire: 1.3 } },
  curb:        { name: 'Curb',                 group: 'Medium', kind: 'ring', shape: 'stadium', ratio: 1.55, twist: 45, flat: true, d: { linkL: 9.5, linkW: 6.2, wire: 1.6 } },
  dcurb:       { name: 'Double / diamond curb',group: 'Medium', kind: 'ring', shape: 'stadium', ratio: 1.45, twist: 45, flat: true, profile: 'faceted', d: { linkL: 9, linkW: 6.4, wire: 1.6 } },
  cuban:       { name: 'Cuban / Miami',        group: 'Medium', kind: 'ring', shape: 'stadium', ratio: 1.2, twist: 45, flat: true, heavy: true, d: { linkL: 8.5, linkW: 7.4, wire: 2.2 } },
  figaro:      { name: 'Figaro',               group: 'Medium', kind: 'ring', shape: 'stadium', ratio: 1.45, twist: 45, flat: true, pattern: [2.1, 1, 1, 1], d: { linkL: 13, linkW: 5.8, wire: 1.5 } },
  pattern:     { name: 'Custom pattern',       group: 'Medium', kind: 'ring', shape: 'stadium', ratio: 1.6, userPattern: true, d: { linkL: 10, linkW: 6, wire: 1.4 } },
  box:         { name: 'Box',                  group: 'Medium', kind: 'ring', shape: 'rrect', ratio: 1, rc: 0.2, profile: 'square', d: { linkL: 6.4, linkW: 6.4, wire: 1.4 } },
  ball:        { name: 'Ball / bead',          group: 'Medium', kind: 'ball', d: { linkL: 8, linkW: 6, wire: 1.2 } },
  bike:        { name: 'Bike / roller chain',  group: 'Medium', kind: 'bike', d: { linkL: 12, linkW: 7, wire: 1.6 } },
  rope:        { name: 'Rope',                 group: 'Hard',   kind: 'ring', shape: 'stadium', ratio: 1.5, twist: 62, flat: true, rope: true, d: { linkL: 8, linkW: 5.4, wire: 1.2 } },
  snake:       { name: 'Articulated snake',    group: 'Hard',   kind: 'snake', d: { linkL: 6, linkW: 5.5, wire: 1.2 } },
  herringbone: { name: 'Herringbone (hinged)', group: 'Hard',   kind: 'snake', flatSeg: true, d: { linkL: 6, linkW: 7, wire: 1.2 } },
  kitbyz:      { name: 'Byzantine (kit)'     , group: 'Hand-assembled', kind: 'kit', kit: 'byzantine', d: { linkL: 6, linkW: 6, wire: 1.6 } },
  singapore:   { name: 'Singapore (kit)',      group: 'Hand-assembled', kind: 'kit', kit: 'singapore', d: { linkL: 6, linkW: 6, wire: 1.6 } },
  wheat:       { name: 'Wheat / spiga (kit)',  group: 'Hand-assembled', kind: 'kit', kit: 'wheat', d: { linkL: 6, linkW: 6, wire: 1.6 } },
};

export const DEFAULTS = {
  style: 'oval', shape: 'heart', lengthMM: 18 * IN, wire: 1.6, linkL: 10, linkW: 6, profile: 'round',
  nozzle: 0.4, bedX: 256, bedY: 256, clearance: 0.35,
  ends: 'loops', extender: false, jumpRings: true,
  graduated: 0, twoTone: false, stations: 0, beadD: 7,
  name: 'MAYA', pattern: 'long, short, short, rolo', letterH: 9, plateT: 1.6,
  material: 'petg', pricePerKg: 20,
};
const DENSITY = { pla: 1.24, petg: 1.27, silk: 1.24, tpu: 1.21, abs: 1.04, asa: 1.07 };

/* ============================================================ */
export function buildChain(wasm, font, opts, polys = null) {
  const p = Object.assign({}, DEFAULTS, clean(opts));
  const E = createChainEngine(wasm, font);
  const { MF, CS } = E;
  const warn = [];
  const st = STYLES[p.style] || STYLES.oval;
  const nz = NOZZLE[p.nozzle] || NOZZLE[0.4];
  const c = Math.max(p.clearance, 0.05);
  let r = p.wire / 2;
  if (p.wire < nz.wire - 1e-6) warn.push(`Wire ${p.wire} mm is thinner than a ${p.nozzle} mm nozzle can print reliably (${nz.wire} mm minimum). Links may snap.`);
  if (c < nz.gap - 1e-6) warn.push(`Gap ${c} mm is tight for a ${p.nozzle} mm nozzle (${nz.gap} mm minimum). Links may fuse together.`);
  if (st.group === 'Hard') warn.push(`${st.name} is experimental on FDM printers. Print the test strip first.`);

  let out;
  if (st.kind === 'ball') out = buildBall(E, p, c, warn);
  else if (st.kind === 'snake') out = buildSnake(E, p, c, warn, st);
  else if (st.kind === 'bike') out = buildBike(E, p, c, warn);
  else if (st.kind === 'kit') out = buildKit(E, p, c, warn, st);
  else out = buildRingChain(E, font, p, c, warn, st, polys);
  out.warn = [...new Set(warn.concat(out.warn || []))];
  out.params = p;
  out.stats = stats(out, p);
  return out;
}

/* ============================================================
   RING CHAINS  (cable family, curb family, plates)
   ============================================================ */
function ringSpec(p, st, scale = 1, lenMul = 1) {
  const W = p.linkW * scale, rr = (p.wire / 2) * (st.heavy ? 1 : 1) * Math.sqrt(scale);
  let L = p.linkL * scale * lenMul;
  let shape = st.style === 'shaped' ? (p.shape || 'heart') : st.shape;
  if (shape === 'circle') L = W;
  const spec = { shape: shape === 'circle' ? 'stadium' : shape, L, W, r: rr, profile: st.profile || p.profile || 'round' };
  if (st.rc) spec.rc = W * st.rc;
  if (st.twist) spec.twist = st.twist;
  if (st.bar) spec.bar = true;
  return spec;
}

function buildRingChain(E, font, p, c, warn, st, polys) {
  st = Object.assign({ style: p.style }, st);
  const target = p.lengthMM;
  const baseSpec = ringSpec(p, st);

  // opening check: a neighbour's wire must pass through the link
  const ext = E.profile(baseSpec.profile, baseSpec.r).ext;
  if (baseSpec.W - 2 * ext < 2 * ext + 2 * c) warn.push('Links are too narrow for their wire: the opening must fit another link plus the gap. Increase link width or thin the wire.');

  /* --- the repeating unit --- */
  let unit = [];
  if (st.userPattern) {
    const TOK = { long: 1.6, short: 0.8, oval: 1.2, round: 0.75, rolo: 'rolo', clip: 2.2, paperclip: 2.2 };
    const toks = String(p.pattern || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
    for (const t0 of toks) {
      const m = t0.match(/^([a-z]+)(?:x(\d+))?$/) || [];
      const nm = m[1], n = +(m[2] || 1), v = TOK[nm];
      if (!v) { warn.push(`Pattern word "${t0}" not recognised. Use long, short, oval, round, rolo or clip (add x2 to repeat).`); continue; }
      for (let i = 0; i < Math.min(n, 12); i++) unit.push(v === 'rolo' ? { rolo: true } : { lenMul: v / 1.6 });
    }
    if (!unit.length) unit = [{ lenMul: 1 }];
  } else if (st.pattern) unit = st.pattern.map(m => ({ lenMul: m / Math.max(...st.pattern) }));
  else unit = [{ lenMul: 1 }];

  const specFor = (u, scale) => {
    if (u.rolo) { const s = ringSpec(p, st, scale); s.L = s.W; s.shape = 'stadium'; return s; }
    const s = ringSpec(p, st, scale, u.lenMul || 1);
    if (s.L < s.W && s.shape === 'stadium') s.L = s.W;      // never shorter than wide
    return s;
  };

  /* --- estimate link count to hit the length, then build items --- */
  const b0 = E.ringBody(baseSpec);
  const t0 = st.flat ? 0 : Q, t1 = st.flat ? 0 : -Q;
  const Hc = E.posed(b0, t0).m[11];                  // every link's centre sits at this height
  const s0 = E.solvePair(b0, t0, b0, t1, c);
  if (!s0.ok) { warn.push('These links cannot interlock with that gap: widen the links, lengthen them, or thin the wire.'); return emptyOut(); }
  const avgPitch = s0.p * (unit.reduce((a, u) => a + (u.lenMul || 1), 0) / unit.length || 1);
  let n = Math.max(3, Math.round(target / avgPitch) + 1);
  if (n > 1600) { warn.push('That is over 1,600 links. Length capped; use bigger links for long chains.'); n = 1600; }
  const connSpec = connectorFor(E, baseSpec, c);
  const plateOpts = { conn: connSpec, c, t: p.plateT, Hc };
  const endless = p.ends === 'endless';
  const warnKeep = warn.length;
  const makeSeq = (n) => {
    warn.length = warnKeep;
    const items = [];

    const scaleAt = (i, N) => (p.graduated > 0 ? 1 + (p.graduated / 100) * 0.9 * Math.sin(Math.PI * (i / Math.max(1, N - 1))) : 1);
    const q20 = (v) => Math.round(v * 10) / 10;
    for (let i = 0; i < n; i++) {
      const u = unit[i % unit.length];
      items.push({ type: 'ring', spec: specFor(u, q20(scaleAt(i, n))), color: 0 });
    }

    /* --- plates: letters / custom shape / station beads ---
       Plates carry lug bars that the neighbouring ±45° links thread
       directly. Every link that touches a plate uses connSpec.       */
    const plateItems = [];
    if (st.letters) {
      const txt = String(p.name || '').toUpperCase().replace(/[^A-Z0-9&+!?.'-]/g, '').slice(0, 16);
      if (!txt) warn.push('Type a name to put on the chain.');
      for (const ch of txt) {
        const pl = letterPlate(E, font, ch, p, plateOpts);
        if (pl) plateItems.push(pl); else warn.push(`Could not make "${ch}".`);
      }
    }
    if (st.customPlate) {
      if (!polys || !polys.length) warn.push('Upload an SVG or image to use as the link shape.');
      else {
        const pl = customPlate(E, polys, p, plateOpts);
        if (pl) {   // the whole chain is made of the custom shape
          const cL = E.ringBody(connSpec).L;
          const k = Math.max(2, Math.round(target / (pl.body.len + cL * 0.7)));
          for (let i = 0; i < Math.min(k, 200); i++) plateItems.push(pl);
        }
      }
    }
    if (plateItems.length) {
      const cL = E.ringBody(connSpec).L;
      const plateLen = plateItems.reduce((a, pl) => a + pl.body.len + cL * 0.7, 0);
      const remove = st.customPlate ? items.length : Math.min(items.length - 2, Math.round(plateLen / avgPitch));
      const mid = Math.floor((items.length - remove) / 2);
      items.splice(mid, remove, ...plateItems.map(pl => ({ type: 'plate', body: pl.body, color: 0 })));
    }
    if (p.stations > 0 && !st.letters && !st.customPlate) {
      const bead = beadPlate(E, p, plateOpts);
      const every = Math.max(3, Math.round((p.stations * 10) / avgPitch));
      for (let i = every; i < items.length - 3; i += every + 1) items.splice(i, 0, { type: 'plate', body: bead.body, color: 1 });
    }

    /* --- ends --- */
    // end rings: as big as possible while still printing at ≥ 35° (flatter rings sag and barely interlock)
    const ext0 = E.profile('round', connSpec.r).ext;
    const wMax35 = 2 * (Hc - ext0) / Math.sin(35 * D2R);
    const bigRing = (scale) => { const s2 = { ...connSpec, shape: 'stadium' }; s2.W = round2(clamp(connSpec.W * scale, Math.min(connSpec.W, wMax35), Math.max(wMax35, 4 * ext0 + 2 * c + 0.6))); s2.L = s2.W; delete s2.twist; delete s2.bar; s2.profile = 'round'; return s2; };
    if (endless) { /* no end links, no clasp: the last link threads the first */ }
    else if (p.ends === 'toggle') {
      const tb = toggleBar(E, p, plateOpts, bigRing(1.9));
      items.unshift({ type: 'ring', spec: bigRing(1.9), color: 0, end: true });
      items.push({ type: 'plate', body: tb, color: 0 });
    } else if (p.ends === 'loops') {
      items.unshift({ type: 'ring', spec: bigRing(1.35), color: 0, end: true });
      if (!p.extender) items.push({ type: 'ring', spec: bigRing(1.35), color: 0, end: true });
    }
    if (p.extender && !endless) {
      const k = Math.max(2, Math.round(2 * IN / (s0.p * 0.72)));
      const xs = { ...connSpec }; xs.r = round2(Math.max(connSpec.r * 0.85, (NOZZLE[p.nozzle] || NOZZLE[0.4]).wire / 2)); xs.L = round2(Math.max(xs.W, connSpec.L * 0.8));
      for (let i = 0; i < k; i++) items.push({ type: 'ring', spec: xs, color: 0, ext: true });
      items.push({ type: 'plate', body: beadPlate(E, p, plateOpts, true).body, color: 0, ext: true });
    }

    /* --- every plate is flanked by connector links --- */
    const seq = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i], prev = seq[seq.length - 1];
      if (it.type === 'plate' && prev && !(prev.type === 'ring' && prev.conn)) seq.push({ type: 'ring', spec: connSpec, conn: true, color: it.color });
      if (it.type === 'ring' && prev && prev.type === 'plate') seq.push({ type: 'ring', spec: connSpec, conn: true, color: prev.color });
      if (!(it.type === 'ring' && prev && prev.type === 'plate' && false)) seq.push(it);
    }
    // a plate at either end still needs a link on its open side only if it has a lug there (bead drop / toggle bar have one lug)
    if (p.twoTone) { let k = 0; for (const it of seq) if (it.type === 'ring') it.color = (k++) % 2; }

    return seq;
  };

  /* --- 1D solve along X, then correct the link count until the length is right --- */
  const measure = (pl) => { const main = pl.filter(it => !it.ext); const a = main[0], b = main[main.length - 1];
    const er = (it, sg) => it.type === 'ring' ? (sg < 0 ? it.body.reachL : it.body.reachR) + it.body.ext : (sg < 0 ? -it.body.x0 : it.body.x1);
    return b.x - a.x + er(a, -1) + er(b, 1); };
  let placed = null, close = null;
  // endless: the last link must thread the first, so they need opposite tilts (an even count of flips)
  const closing = (pl) => {
    const a = pl[pl.length - 1], b = pl[0];
    if (a.type !== 'ring' || b.type !== 'ring') return null;
    const s = E.solvePair(a.body, a.tilt, b.body, b.tilt, c);
    return s.ok ? s : null;
  };
  for (let it = 0; it < 6; it++) {
    const seq = makeSeq(n);
    placed = solveLine(E, seq, c, st, warn, Hc);
    if (!placed) return emptyOut();
    if (endless) {
      close = closing(placed);
      if (!close) { n = clamp(n + 1, 4, 1600); if (it < 5) continue; warn.push('Could not close this chain into a loop. Try plain end loops instead.'); return emptyOut(); }
    }
    const len = endless ? placed[placed.length - 1].x - placed[0].x + close.p : measure(placed), baseCount = seq.filter(q => q.type === 'ring' && !q.conn && !q.end && !q.ext).length || 1;
    const per = len / Math.max(1, n);
    const dn = Math.round((target - len) / Math.max(per, 0.5));
    if (Math.abs(target - len) <= Math.max(per * 0.6, 2) || dn === 0) break;
    n = clamp(n + (endless && dn % 2 ? dn + Math.sign(dn) : dn), 3, 1600);   // keep the flip count even
  }
  if (endless) {
    if (target < 24 * IN - 1) warn.push(`An endless chain has to slip over your head. ${fmtIn(target)} is short for that; 24 in (610 mm) or longer is safer.`);
    const out = layoutClosed(E, placed, close, p, c, warn);
    if (out) { addExtras(E, out, p, c, {}, warn); return out; }
    // too big for one closed loop on this bed: print it open and close it with a jump ring
    const o = layoutOnBed(E, placed, p, c, warn, { r: baseSpec.r, ringBody: b0, closeRing: true });
    warn.push(o.parts.filter(q => q.name !== 'jump-rings').length > 1
      ? 'Too long to print as one loop on this bed, so it prints in parts. Join them, and close the loop, with the jump rings included.'
      : 'This chain can\u2019t print as one closed loop on this bed, so it prints open. Close it with one of the jump rings included.');
    return o;
  }
  return layoutOnBed(E, placed, p, c, warn, { r: baseSpec.r, ringBody: b0 });
}
const round2 = (v) => Math.round(v * 50) / 50;
const fmtIn = (mm) => `${(mm / IN).toFixed(1).replace(/\.0$/, '')} in`;
function emptyOut() { return { parts: [], bodies: [], instances: [], warn: [] }; }

/** the link that threads plate lugs: the chain's own link, lengthened if needed so two bars fit inside */
function connectorFor(E, base, c) {
  const s = { ...base, shape: base.shape === 'rrect' || base.shape === 'stadium' ? base.shape : 'stadium' };
  delete s.twist; delete s.bar;
  if (s.profile === 'flat') s.profile = 'round';
  const ext = E.profile(s.profile, s.r).ext;
  const wb = Math.max(1.1, 1.5 * s.r);
  s.W = round2(Math.max(s.W, 4 * ext + 2 * c + 0.8));
  s.L = round2(Math.max(s.L, s.W, 2 * ext + 2 * (wb + 2 * c) + 0.8));
  return s;
}

/* ------------------------------------------------------------
   Plates: flat solids with raised lug bars. A neighbouring link at
   ±45° threads the bar the way a key ring threads a rod. The bar
   sits at that link's centre height; posts stand outside the link's
   footprint; then the link itself, fattened by the gap, is cut out,
   so the clearance is exact whatever the plate shape.
   ------------------------------------------------------------ */
function lugKit(E, conn, c, Hc) {
  const body = E.ringBody(conn);
  const tf = Hc ? fitHeight(E, conn, Hc, false).tilt : Q;
  const A = E.posed(body, tf), B = E.posed(body, -tf);
  const L0 = A.m[11];                                   // link centre height when resting on the bed
  const ext = body.ext, wb = Math.max(1.1, 1.5 * conn.r), hb = Math.max(0.9, Math.min(2 * conn.r, (conn.W - 2 * ext - 2 * c) * 0.5));
  let yMax = 0;
  for (const S of [A.samples, B.samples]) for (const q of S) yMax = Math.max(yMax, Math.abs(q[1]) + q[3]);
  const yf = yMax + c, legW = Math.max(1.0, 1.3 * conn.r), yl = yf + legW;
  // fattened link (both tilts) for the clearance cut
  const fat = E.ringBody({ ...conn, r: conn.r + c });
  // fattened link at the same centre height, both tilt directions
  const fatMF = [tf, -tf].map(t => { const m = E.posed(fat, t).m.slice(); m[11] = L0; return E.toManifold(E.transformMesh(fat.mesh, m)); });
  return { body, L0, ext, wb, hb, yf, yl, top: L0 + hb / 2, fatMF };
}
/** add lugs to a plate whose body spans x ∈ [x0, x1]; returns { mf, ringL, ringR } (link centre x per side) */
function addLugs(E, mf, x0, x1, kit, left, right, c) {
  const { MF } = E;
  const parts = [mf], cuts = [], res = {};
  const side = (sgn) => {
    const xe = sgn > 0 ? x1 : x0;
    const xr = xe + sgn * (c + kit.ext + kit.body.reachL);          // neighbour link centre
    const inner = xr - sgn * (kit.body.reachL - kit.ext);            // link's inner end nearest the plate
    const xb = inner + sgn * (c + kit.wb / 2 + 0.12);                // bar centre
    const xa = Math.min(xe - sgn * 0.6, xb + sgn * kit.wb / 2), xz = Math.max(xe - sgn * 0.6, xb + sgn * kit.wb / 2);
    // posts (outside the link footprint) + cross bar + end rail
    for (const sy of [-1, 1]) parts.push(E.box(xa, sy > 0 ? kit.yf : -kit.yl, 0, xz, sy > 0 ? kit.yl : -kit.yf, kit.top));
    parts.push(E.box(xb - kit.wb / 2, -kit.yl, kit.L0 - kit.hb / 2, xb + kit.wb / 2, kit.yl, kit.top));
    const r0 = Math.min(xe - sgn * 1.2, xe), r1 = Math.max(xe - sgn * 1.2, xe);
    parts.push(E.box(r0, -kit.yl, 0, r1 + (sgn > 0 ? 0.3 : 0), kit.yl, Math.min(kit.top, 1.2)));
    for (const f of kit.fatMF) cuts.push(f.translate([xr, 0, 0]));
    return xr;
  };
  if (right) res.ringR = side(+1);
  if (left) res.ringL = side(-1);
  let m = MF.union(parts);
  if (cuts.length) m = m.subtract(MF.union(cuts));
  res.mf = m;
  return res;
}
function finishPlate(E, key, mf, lugs, extra = {}) {
  const mesh = E.fromManifold(mf);
  const b = meshBounds(mesh.pos);
  const body = {
    key, kind: 'plate', mesh, volume: meshVolume(mesh.pos, mesh.idx),
    ringL: lugs.ringL ?? null, ringR: lugs.ringR ?? null,
    x0: b[0], x1: b[3], len: b[3] - b[0], wid: b[4] - b[1], ...extra,
  };
  E.bodies.set(key, body);
  return body;
}
function railed(E, cs, kit, x0, x1) {
  // make sure every island reaches a centre rail that runs to both lugs
  const { CS } = E;
  const hr = Math.max(1.0, kit.body.spec ? 1.2 : 1.2);
  const rail = CS.square([x1 - x0 + 0.2, hr * 2]).translate([x0 - 0.1, -hr]);
  let all = CS.union([cs, rail]);
  const isl = all.decompose();
  if (isl.length > 1) {
    const struts = [];
    for (const is of isl) {
      const bb = is.bounds(); const cx = (bb.min[0] + bb.max[0]) / 2, cy = (bb.min[1] + bb.max[1]) / 2;
      if (bb.min[1] <= 0 && bb.max[1] >= 0 && bb.min[0] <= x0 + 0.5) continue;
      const y0 = Math.min(cy, 0), y1 = Math.max(cy, 0), w = 1.1;
      struts.push(CS.square([w, y1 - y0 + 0.4]).translate([cx - w / 2, y0 - 0.2]));
    }
    if (struts.length) all = CS.union([all, ...struts]);
  }
  return all;
}
const kitCache = new WeakMap();
function kitFor(E, opts) {
  let m = kitCache.get(E); if (!m) { m = new Map(); kitCache.set(E, m); }
  const k = JSON.stringify(opts.conn) + opts.c + ':' + (opts.Hc || 0).toFixed(3);
  if (!m.has(k)) m.set(k, lugKit(E, opts.conn, opts.c, opts.Hc));
  return m.get(k);
}
function letterPlate(E, font, ch, p, opts) {
  if (!font || !E.CS) return null;
  const key = `letter:${ch}:${p.letterH}:${p.plateT}:${JSON.stringify(opts.conn)}:${opts.c}:${(opts.Hc || 0).toFixed(3)}`;
  if (E.bodies.has(key)) return { body: E.bodies.get(key) };
  const kit = kitFor(E, opts);
  const gl = font.g[ch] || font.g['?'];
  if (!gl || !gl.c.length) return null;
  const s = p.letterH / font.cap;
  const polys = gl.c.map(cn => { const q = []; for (let i = 0; i < cn.length; i += 2) q.push([cn[i] * s, (cn[i + 1] - font.cap / 2) * s]); return q; });
  let cs = new E.CS(polys, 'NonZero');
  const bb = cs.bounds(), cx = (bb.min[0] + bb.max[0]) / 2;
  cs = cs.translate([-cx, 0]);
  const x0 = bb.min[0] - cx, x1 = bb.max[0] - cx;
  cs = railed(E, cs, kit, x0, x1);
  const lugs = addLugs(E, cs.extrude(p.plateT), x0, x1, kit, true, true, opts.c);
  return { body: finishPlate(E, key, lugs.mf, lugs) };
}
function customPlate(E, polys, p, opts) {
  if (!E.CS) return null;
  const sig = polys.length + ':' + polys.reduce((a, q) => a + q.length, 0) + ':' + (polys[0][0] || []).join(',');
  const key = `custom:${sig}:${p.letterH}:${p.plateT}:${JSON.stringify(opts.conn)}:${opts.c}:${(opts.Hc || 0).toFixed(3)}`;
  if (E.bodies.has(key)) return { body: E.bodies.get(key) };
  const kit = kitFor(E, opts);
  let cs = new E.CS(polys, 'EvenOdd');
  const bb = cs.bounds(), h = bb.max[1] - bb.min[1] || 1, s = (p.letterH * 1.3) / h;
  cs = cs.translate([-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2]).scale([s, s]);
  const b2 = cs.bounds();
  cs = railed(E, cs, kit, b2.min[0], b2.max[0]);
  const lugs = addLugs(E, cs.extrude(p.plateT), b2.min[0], b2.max[0], kit, true, true, opts.c);
  return { body: finishPlate(E, key, lugs.mf, lugs) };
}
function beadPlate(E, p, opts, drop = false) {
  const key = `bead:${p.beadD}:${JSON.stringify(opts.conn)}:${opts.c}:${drop}:${(opts.Hc || 0).toFixed(3)}`;
  if (E.bodies.has(key)) return { body: E.bodies.get(key) };
  const kit = kitFor(E, opts);
  const R = Math.max(p.beadD / 2, kit.top * 0.6, 2.5);
  const zc = R * 0.82;
  const ball = E.toManifold(E.sphereMesh(R, 36)).translate([0, 0, zc]).intersect(E.box(-R - 1, -R - 1, 0, R + 1, R + 1, 2 * R + 2));
  const lugs = addLugs(E, ball, -R * 0.8, R * 0.8, kit, true, !drop, opts.c);
  return { body: finishPlate(E, key, lugs.mf, lugs) };
}
function toggleBar(E, p, opts, ringSpec) {
  const key = `toggleBar:${JSON.stringify(ringSpec)}:${JSON.stringify(opts.conn)}:${opts.c}:${(opts.Hc || 0).toFixed(3)}`;
  if (E.bodies.has(key)) return E.bodies.get(key);
  const kit = kitFor(E, opts);
  const t = Math.max(p.plateT, 2 * opts.conn.r, 1.8);
  const bl = ringSpec.W - 2 * ringSpec.r + 7, bw = Math.max(2.4, 3 * opts.conn.r);
  const cap = E.CS.hull([E.CS.circle(bw / 2, 24).translate([0, bl / 2 - bw / 2]), E.CS.circle(bw / 2, 24).translate([0, -bl / 2 + bw / 2])]);
  const lugs = addLugs(E, cap.extrude(t), -bw / 2, bw / 2, kit, true, false, opts.c);
  return finishPlate(E, key, lugs.mf, lugs, { toggle: 'bar' });
}

/* ------------------------------------------------------------
   Common centre height: every link in a chain must sit with its
   centre at the same height above the bed or neighbours cannot
   thread each other. Plain links reach it by tilting (wider =
   flatter), curb-family links by adjusting their twist.
   ------------------------------------------------------------ */
function centreHeight(E, spec, tilt) { return E.posed(E.ringBody(spec), tilt).m[11]; }
function fitHeight(E, spec, Hc, twisted) {
  const key = JSON.stringify(spec) + Hc.toFixed(3) + twisted;
  E._fit = E._fit || new Map();
  if (E._fit.has(key)) return E._fit.get(key);
  let res;
  if (twisted) {
    let lo = 12, hi = 80;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (centreHeight(E, { ...spec, twist: round2(mid) }, 0) < Hc) lo = mid; else hi = mid; }
    const tw = round2((lo + hi) / 2);
    res = { spec: { ...spec, twist: tw }, tilt: 0, off: Math.abs(centreHeight(E, { ...spec, twist: tw }, 0) - Hc) };
  } else {
    let lo = 8 * D2R, hi = 88 * D2R;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (centreHeight(E, spec, mid) < Hc) lo = mid; else hi = mid; }
    const t = Math.round(((lo + hi) / 2) / D2R * 20) / 20 * D2R;
    res = { spec, tilt: t, off: Math.abs(centreHeight(E, spec, t) - Hc) };
  }
  E._fit.set(key, res);
  return res;
}

/* ------------------------------------------------------------
   1D solve: centre x, tilt and pose for every item
   ------------------------------------------------------------ */
function solveLine(E, seq, c, st, warn, Hc) {
  const out = [];
  let x = 0, prev = null, sign = 1, failed = false, steep = false;
  for (let i = 0; i < seq.length; i++) {
    const it = seq[i];
    if (it.type === 'plate') {
      const body = it.body;
      if (prev) x = prev.x - body.ringL;             // the previous link threads this plate's left lug
      out.push({ ...it, x, tilt: 0, pose: { m: mT(0, 0, 0) } });
      prev = out[out.length - 1];
      continue;
    }
    const twisted = !!it.spec.twist && !it.conn && !it.end;
    const fit = fitHeight(E, twisted ? it.spec : { ...it.spec, twist: undefined }, Hc, twisted);
    const spec = clean(fit.spec);
    if (fit.off > 0.15 || (!twisted && (fit.tilt < 14 * D2R || fit.tilt > 84 * D2R))) steep = true;
    const body = E.ringBody(spec);
    let tilt = twisted ? 0 : sign * fit.tilt;
    if (!twisted) sign = -sign;
    if (prev) {
      if (prev.type === 'plate') x = prev.x + prev.body.ringR;
      else {
        let s = E.solvePair(prev.body, prev.tilt, body, tilt, c);
        if (!s.ok && tilt !== 0) { tilt = -tilt; sign = -sign; s = E.solvePair(prev.body, prev.tilt, body, tilt, c); }
        if (!s.ok) { failed = true; break; }
        x = prev.x + s.p;
        it.pMid = s.pMid; it.pSolved = s.p;
      }
    }
    out.push({ ...it, spec, body, x, tilt, pose: E.posed(body, tilt) });
    prev = out[out.length - 1];
  }
  if (steep) warn.push('Some links differ a lot in size from their neighbours, so they print steeper or flatter than 45°. Check the preview.');
  if (failed) { warn.push('Two neighbouring links cannot interlock with this gap. Try wider links or a thinner wire.'); return null; }

  // second-neighbour check (parallel links two apart must not touch)
  for (let i = 0; i + 2 < out.length; i++) {
    const a = out[i], b = out[i + 2];
    if (a.type !== 'ring' || b.type !== 'ring') continue;
    const A = a.pose.samples, B = b.pose.samples.map(s => [s[0] + (b.x - a.x), s[1], s[2], s[3]]);
    const g = E.gapOf(A, B, 5);
    if (g < c) {
      const need = c - g + 0.05;
      for (let k = i + 1; k < out.length; k++) out[k].x += need / 2;
      for (let k = i + 2; k < out.length; k++) out[k].x += need / 2;
    }
  }
  return out;
}

/* ------------------------------------------------------------
   Bed layout: straight, or a serpentine with U-turns; split
   into segments (joined by jump rings) when it will not fit.
   ------------------------------------------------------------ */
function itemWidth(it) {
  if (it.type === 'plate') return Math.max(it.body.wid, 4);
  return Math.max(it.body.W, it.body.L * 0.6) + 2 * it.body.r;
}
function layoutOnBed(E, placed, p, c, warn, ctx) {
  const margin = 6;
  const Wmax = Math.max(...placed.map(itemWidth));
  const Lmax = Math.max(...placed.map(it => it.type === 'plate' ? it.body.len : it.body.L + 2 * it.body.r));
  const total = placed[placed.length - 1].x - placed[0].x;
  let Rt = Math.max(Wmax * 1.6, Lmax * 1.25, 8);
  const plateOnTurns = placed.some(it => it.type === 'plate');
  if (plateOnTurns) Rt = Math.max(Rt, Lmax * 1.6);

  for (let attempt = 0; attempt < 5; attempt++) {
    const rowLen = p.bedX - 2 * margin - 2 * Rt - Wmax;
    const maxRows = Math.max(1, Math.floor((p.bedY - 2 * margin - Wmax) / (2 * Rt)) + 1);
    const straightFits = total + Lmax < p.bedX - 2 * margin || total + Lmax < Math.hypot(p.bedX, p.bedY) - 3 * margin;
    let segments;
    if (straightFits) segments = [placed];
    else {
      if (rowLen < Lmax * 3) { warn.push('This bed is too small to fold the chain; printing it in straight sections.'); }
      const cap = rowLen > Lmax * 3 ? maxRows * rowLen + (maxRows - 1) * Math.PI * Rt : Math.hypot(p.bedX, p.bedY) - 3 * margin - Lmax;
      const nSeg = Math.max(1, Math.ceil(total / (cap * 0.97)));
      segments = splitSegments(placed, nSeg);
    }
    const parts = [];
    let bad = false;
    segments.forEach((seg, si) => {
      const res = placeSegment(E, seg, p, c, Rt, margin, Wmax, Lmax, straightFits && segments.length === 1);
      if (!res.ok) bad = true;
      parts.push({ name: segments.length > 1 ? `chain-part-${si + 1}-of-${segments.length}` : 'chain', label: segments.length > 1 ? `Part ${si + 1} of ${segments.length}` : 'Chain', instances: res.instances, bounds: res.bounds });
    });
    if (bad && attempt < 4) { Rt *= 1.35; continue; }
    if (bad) warn.push('Some links sit close together on the U-turns. The chain is still printable, but check the preview before printing.');
    if (segments.length > 1) warn.push(`Too long for one ${p.bedX} × ${p.bedY} mm bed: split into ${segments.length} parts. Join them with the jump rings included.`);
    const out = assemble(E, parts);
    out.jumpRingsNeeded = segments.length - 1 + (ctx.closeRing ? 1 : 0);
    const endReach = (it, sgn) => it.type === 'ring' ? (sgn < 0 ? it.body.reachL : it.body.reachR) + it.body.ext : (sgn < 0 ? -it.body.x0 : it.body.x1);
    out.lengthMM = total + endReach(placed[0], -1) + endReach(placed[placed.length - 1], 1);
    out.linkCount = placed.length;
    out.items = placed;
    addExtras(E, out, p, c, ctx, warn);
    return out;
  }
}
/** Endless chains: lay the links around one closed loop (a circle, or a rounded rectangle that
    fills the bed), scaled until the last link sits exactly one solved pitch from the first.
    Returns null if the loop can't fit on the bed. */
function layoutClosed(E, placed, close, p, c, warn) {
  const margin = 6, n = placed.length;
  const Wmax = Math.max(...placed.map(itemWidth));
  const Lmax = Math.max(...placed.map(it => it.type === 'plate' ? it.body.len : it.body.L + 2 * it.body.r));
  const xs0 = placed.map(it => it.x - placed[0].x);
  const extra = new Float64Array(n), centred = new Uint8Array(n);   // extra[0] is the closing pair (last → first)                 // extra spacing per pair (i-1 → i), added where the curve crowds links
  let xs = xs0.slice();
  const loopLen = xs0[n - 1] + close.p;
  const sgCache = new Map();
  const straightGap = (i, d) => {           // the same pair's gap laid out straight, as solved
    const key = i * 4 + d; if (sgCache.has(key)) return sgCache.get(key);
    const a = placed[i], j = (i + d) % n, b = placed[j];
    const dx = j > i ? b.x - a.x : (xs0[n - 1] - xs0[i]) + close.p + (j > 0 ? xs0[j] : 0);
    const g = E.gapOf(a.pose.samples, b.pose.samples.map(q => [q[0] + dx, q[1], q[2], q[3]]), 5);
    sgCache.set(key, g); return g;
  };
  const availX = p.bedX - 2 * margin - Wmax, availY = p.bedY - 2 * margin - Wmax;
  const Rmin = Math.max(Wmax * 1.6, Lmax * 1.6, 12);
  // path families: circle first (cleanest), then rounded rectangles with shrinking corner radius
  const shapes = [];
  if (loopLen / Math.PI <= Math.min(availX, availY)) shapes.push({ kind: 'circle' });
  for (const k of [0.5, 0.35, 0.22]) shapes.push({ kind: 'rrect', k });
  const pathFor = (sh, sc) => {
    if (sh.kind === 'circle') {
      const R = sc * loopLen / (2 * Math.PI), P = 2 * Math.PI * R;
      return { P, w: 2 * R, h: 2 * R, R, at: (u) => { const a = (u / P) * 2 * Math.PI - Math.PI / 2; return { x: R * Math.cos(a), y: R * Math.sin(a), yaw: a + Math.PI / 2 }; } };
    }
    // rounded rectangle with the bed's aspect, scaled by sc; traced anticlockwise from the bottom straight
    const ar = availX / availY, w = sc * loopLen / (2 * (1 + 1 / ar)), h = w / ar;
    const Rc = Math.min(Math.max(Rmin, sh.k * Math.min(w, h)), Math.min(w, h) / 2 - 0.01);
    const a = w - 2 * Rc, b = h - 2 * Rc, P = 2 * a + 2 * b + 2 * Math.PI * Rc, q = Math.PI * Rc / 2;
    const segs = [['l', a, 0], ['c', q, 0], ['l', b, Math.PI / 2], ['c', q, Math.PI / 2], ['l', a, Math.PI], ['c', q, Math.PI], ['l', b, 1.5 * Math.PI], ['c', q, 1.5 * Math.PI]];
    return { P, w, h, R: Rc, at: (u) => {
      u = ((u % P) + P) % P;
      let x = -a / 2, y = -h / 2;
      for (const [t, L, dir] of segs) {
        const cx = x - Math.sin(dir) * Rc, cy = y + Math.cos(dir) * Rc, a0 = dir - Math.PI / 2;   // arc centre on the left
        if (u <= L) {
          if (t === 'l') return { x: x + Math.cos(dir) * u, y: y + Math.sin(dir) * u, yaw: dir };
          const th = u / Rc;
          return { x: cx + Rc * Math.cos(a0 + th), y: cy + Rc * Math.sin(a0 + th), yaw: dir + th };
        }
        if (t === 'l') { x += Math.cos(dir) * L; y += Math.sin(dir) * L; }
        else { x = cx + Rc * Math.cos(dir); y = cy + Rc * Math.sin(dir); }
        u -= L;
      }
      return { x, y, yaw: 0 };
    } };
  };
  const march = (path) => {
    // loop curves are gentle (radius many links long), so every pair keeps its straight solved pitch
    const S = [0];
    for (let i = 1; i < n; i++) {
      const pitch = xs[i] - xs[i - 1];
      let sv = S[i - 1] + pitch;
      for (let k = 0; k < 5; k++) {
        const A = path.at(S[i - 1]), B = path.at(sv), ch = Math.hypot(B.x - A.x, B.y - A.y);
        if (Math.abs(ch - pitch) < 1e-4) break;
        sv += pitch - ch;
      }
      S.push(sv);
    }
    const A = path.at(S[n - 1]), B = path.at(path.P);
    const room = path.P - S[n - 1];                               // arc left for the closing pair
    return { S, err: room > 0 ? Math.hypot(B.x - A.x, B.y - A.y) - (close.p + extra[0]) : -1e9 };
  };
  for (let round = 0; round < 8; round++) {
  let crowded = null;
  for (const sh of shapes) {
    // bisection on the scale: too small → last link overruns the first; too big → gap
    let lo = 0.8, hi = 1.3, best = null;
    if (march(pathFor(sh, hi)).err < 0) continue;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2, m = march(pathFor(sh, mid));
      if (m.err < 0) lo = mid; else { hi = mid; best = { sc: mid, m }; }
      if (hi - lo < 1e-6) break;
    }
    if (!best || Math.abs(best.m.err) > 0.05) continue;
    const path = pathFor(sh, best.sc);
    if (path.w > availX + 1e-6 || path.h > availY + 1e-6) continue;
    const P = best.m.S.map(u => path.at(u));
    const inst = placed.map((it, i) => {
      const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
      const yaw = Math.atan2(b.y - a.y, b.x - a.x);
      return { body: it.body.key, m: mMul(mMul(mT(P[i].x, P[i].y, 0), mRz(yaw)), it.pose.m), color: it.color, _it: it };
    });
    // every neighbour pair, including last→first, plus links two apart, must keep the gap
    const bad = [];
    for (let i = 0; i < n; i++) for (const d of [1, 2]) {
      const a = inst[i], b = inst[(i + d) % n];
      if (a._it.type !== 'ring' || b._it.type !== 'ring') continue;
      const g = E.gapOf(E.xformSamples(a._it.body.samples, a.m), E.xformSamples(b._it.body.samples, b.m), 5);
      // the loop may not crowd a pair more than the straight chain already does
      const want = Math.min(c * 0.8, straightGap(i, d) - 0.03);
      if (g < want) bad.push({ i, d, need: want - g + 0.05 });
    }
    if (bad.length) { if (!crowded) crowded = bad; continue; }
    for (const q of inst) delete q._it;
    const parts = [{ name: 'chain', label: 'Chain', instances: inst, bounds: [-path.w / 2 - Wmax / 2, -path.h / 2 - Wmax / 2, path.w / 2 + Wmax / 2, path.h / 2 + Wmax / 2] }];
    const out = assemble(E, parts);
    out.jumpRingsNeeded = 0;
    out.lengthMM = xs[n - 1] + close.p + extra[0];   // includes any extra curve spacing
    out.linkCount = n;
    out.items = placed;
    return out;
  }
  // crowded on the curve: open those pitches a little (well inside the interlock window) and try again
  if (!crowded) return null;
  let grew = false;
  for (const { i, d, need } of crowded) {
    if (d === 1) {                       // a neighbour pair rubbing on the curve: centre it in its interlock window
      const j = (i + 1) % n, it = placed[j];
      const mid = j > 0 ? (it.pMid && it.pSolved ? it.pMid - it.pSolved : null) : (close.pMid ? close.pMid - close.p : null);
      if (!centred[j] && mid !== null) { extra[j] = mid; centred[j] = 1; grew = true; }
      continue;
    }
    for (const j of [(i + 1) % n, (i + 2) % n]) if (extra[j] < 0.45) { extra[j] = Math.min(0.45, extra[j] + need / 2); grew = true; }
  }
  if (!grew) return null;
  let acc = 0;
  xs = xs0.map((v, i) => (acc += i ? extra[i] : 0, v + acc));
  }
  return null;
}
function splitSegments(placed, nSeg) {
  const total = placed[placed.length - 1].x - placed[0].x, segs = [];
  let start = 0;
  for (let s = 1; s < nSeg; s++) {
    const xt = placed[0].x + total * s / nSeg;
    let k = placed.findIndex((it, i) => i > start && it.x >= xt);
    // cut between two plain rings
    while (k > start + 1 && k < placed.length - 1 && !(placed[k - 1].type === 'ring' && placed[k].type === 'ring' && !placed[k - 1].conn && !placed[k].conn)) k++;
    if (k <= start || k >= placed.length) break;
    segs.push(placed.slice(start, k)); start = k;
  }
  segs.push(placed.slice(start));
  return segs;
}
/** map 1D positions onto a straight line or serpentine path; returns world instances */
function placeSegment(E, seg, p, c, Rt, margin, Wmax, Lmax, straight) {
  const x0 = seg[0].x, xs = seg.map(it => it.x - x0);
  const total = xs[xs.length - 1];
  let path;
  if (straight && total + Lmax < p.bedX - 2 * margin) {
    path = (s) => ({ x: s - total / 2, y: 0, yaw: 0 });
  } else if (straight) {
    const a = Math.atan2(p.bedY, p.bedX);
    path = (s) => ({ x: (s - total / 2) * Math.cos(a), y: (s - total / 2) * Math.sin(a), yaw: a });
  } else {
    const rowLen = p.bedX - 2 * margin - 2 * Rt - Wmax;
    const unit = rowLen + Math.PI * Rt;
    path = (s) => {
      const k = Math.floor(s / unit), u = s - k * unit, dir = k % 2 ? -1 : 1;
      const y = k * 2 * Rt;
      if (u <= rowLen) return { x: dir > 0 ? -rowLen / 2 + u : rowLen / 2 - u, y, yaw: dir > 0 ? 0 : Math.PI };
      const a = (u - rowLen) / Rt;                  // 0..π
      const cx = dir > 0 ? rowLen / 2 : -rowLen / 2, cy = y + Rt;
      const ang = dir > 0 ? -Math.PI / 2 + a : -Math.PI / 2 - a;
      return { x: cx + Rt * Math.cos(ang), y: cy + Rt * Math.sin(ang), yaw: (dir > 0 ? 0 : Math.PI) + (dir > 0 ? a : -a) };
    };
  }
  // chord-correct positions so neighbours keep their solved pitch on curves
  // keep a run of plates (a name, a centre charm) on one straight row instead of a U-turn
  let s0 = 0;
  if (!straight) {
    const rowLen = p.bedX - 2 * margin - 2 * Rt - Wmax, unit = rowLen + Math.PI * Rt;
    const maxRows = Math.max(1, Math.floor((p.bedY - 2 * margin - Wmax) / (2 * Rt)) + 1);
    const cap = maxRows * rowLen + (maxRows - 1) * Math.PI * Rt;
    const pl = seg.map((it, i) => it.type === 'plate' ? i : -1).filter(i => i >= 0);
    if (pl.length && pl.length < seg.length * 0.6) {
      const pad = Lmax * 1.2, a = xs[pl[0]] - pad, bEnd = xs[pl[pl.length - 1]] + pad;
      if (bEnd - a < rowLen) {
        const order = [...Array(maxRows).keys()].sort((x, y) => (x % 2) - (y % 2) || x - y);   // rows running left-to-right first, so letters read the right way up
        for (const k of order) {
          const o = Math.max(0, k * unit + (rowLen - (bEnd - a)) / 2 - a);   // centre the run in row k
          if (o + total <= cap && o + a >= k * unit - 1e-6 && o + bEnd <= k * unit + rowLen + 1e-6) { s0 = o; break; }
        }
      }
    }
  }
  const S = [s0];
  const onCurve = (s0) => !straight && Math.abs(path(s0 + 0.5).yaw - path(s0 - 0.5).yaw) > 1e-6;
  for (let i = 1; i < seg.length; i++) {
    let pitch = xs[i] - xs[i - 1];
    if (seg[i].pMid && seg[i].pSolved && onCurve(S[i - 1] + pitch / 2)) pitch += seg[i].pMid - seg[i].pSolved;   // links centred in each other on turns
    let s = S[i - 1] + pitch;
    for (let k = 0; k < 4; k++) {
      const a = path(S[i - 1]), b = path(s), ch = Math.hypot(b.x - a.x, b.y - a.y);
      if (Math.abs(ch - pitch) < 1e-3) break;
      s += pitch - ch;
    }
    S.push(s);
  }
  const P = S.map(path);
  const inst = seg.map((it, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const yaw = (i === 0 || i === P.length - 1) ? P[i].yaw : Math.atan2(b.y - a.y, b.x - a.x);
    const m = mMul(mMul(mT(P[i].x, P[i].y, 0), mRz(yaw)), it.pose.m);
    return { body: it.body.key, m, color: it.color, _it: it };
  });
  // verify ring neighbours on curves
  let ok = true;
  for (let i = 0; i + 1 < inst.length; i++) {
    const a = inst[i], b = inst[i + 1];
    if (a._it.type !== 'ring' || b._it.type !== 'ring') continue;
    if (Math.abs(((P[i].yaw - P[i + 1].yaw + 3 * Math.PI) % TAU) - Math.PI) < 1e-4) continue;   // straight
    const A = E.xformSamples(a._it.body.samples, a.m), B = E.xformSamples(b._it.body.samples, b.m);
    if (E.gapOf(A, B, 5) < c * 0.8) { ok = false; break; }
  }
  // centre on the bed
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const q of P) { bx0 = Math.min(bx0, q.x); bx1 = Math.max(bx1, q.x); by0 = Math.min(by0, q.y); by1 = Math.max(by1, q.y); }
  const ox = -(bx0 + bx1) / 2, oy = -(by0 + by1) / 2;
  for (const q of inst) { q.m = mMul(mT(ox, oy, 0), q.m); delete q._it; }
  return { ok, instances: inst, bounds: [bx0 + ox - Wmax / 2, by0 + oy - Wmax / 2, bx1 + ox + Wmax / 2, by1 + oy + Wmax / 2] };
}

/** collect unique bodies referenced by the parts */
function assemble(E, parts) {
  const used = new Set(parts.flatMap(pt => pt.instances.map(i => i.body)));
  const bodies = [...used].map(k => { const b = E.bodies.get(k); return { key: k, pos: b.mesh.pos, idx: b.mesh.idx, volume: b.volume }; });
  return { parts, bodies };
}

/* ------------------------------------------------------------
   Extras: jump rings (open C-rings) on their own plate
   ------------------------------------------------------------ */
function cRing(E, wire, id, t) {
  const key = `cring:${wire}:${id}:${t}`;
  if (E.bodies.has(key)) return E.bodies.get(key);
  const Ro = id / 2 + wire, Ri = id / 2;
  let mf = E.CS.circle(Ro, 48).subtract(E.CS.circle(Ri, 48)).extrude(t);
  mf = mf.subtract(E.box(Ri - 0.5, -wire * 0.28, -1, Ro + 0.5, wire * 0.28, t + 1));
  const mesh = E.fromManifold(mf);
  const b = { key, kind: 'plate', mesh, volume: meshVolume(mesh.pos, mesh.idx) };
  E.bodies.set(key, b);
  return b;
}
function addExtras(E, out, p, c, ctx, warn) {
  const n = (out.jumpRingsNeeded || 0) + (p.jumpRings ? 2 : 0);
  if (!n || !E.CS) return;
  const wire = Math.max(p.wire, 1.2), id = 2 * p.wire + 3 * c + 1.2;
  const ring = cRing(E, wire, round2(id), wire);
  const pitch = id + 2 * wire + 3, inst = [];
  for (let i = 0; i < n; i++) inst.push({ body: ring.key, m: mT((i - (n - 1) / 2) * pitch, 0, 0), color: 0 });
  out.parts.push({ name: 'jump-rings', label: `Jump rings ×${n}`, instances: inst, bounds: [-(n * pitch) / 2, -id, (n * pitch) / 2, id] });
  if (!out.bodies.find(b => b.key === ring.key)) out.bodies.push({ key: ring.key, pos: ring.mesh.pos, idx: ring.mesh.idx, volume: ring.volume });
  out.jumpRingCount = n;
}

/* ============================================================
   SPECIAL STYLES
   ============================================================ */
function linearParts(E, name, bodies, instances, pitchLen, p, warn) {
  // lay a straight chain; if longer than the bed diagonal, split into rows of separate parts
  const total = pitchLen, maxLen = Math.hypot(p.bedX, p.bedY) - 20;
  const out = { parts: [], bodies: bodies.map(b => ({ key: b.key, pos: b.mesh.pos, idx: b.mesh.idx, volume: b.volume })) };
  const nSeg = Math.max(1, Math.ceil(total / maxLen));
  const per = Math.ceil(instances.length / nSeg);
  const a = total > p.bedX - 20 ? Math.atan2(p.bedY, p.bedX) : 0;
  for (let s = 0; s < nSeg; s++) {
    const seg = instances.slice(s * per, (s + 1) * per);
    if (!seg.length) break;
    const x0 = seg[0].x, x1 = seg[seg.length - 1].x, mid = (x0 + x1) / 2;
    const R = mRz(a);
    out.parts.push({
      name: nSeg > 1 ? `${name}-part-${s + 1}-of-${nSeg}` : name, label: nSeg > 1 ? `Part ${s + 1} of ${nSeg}` : 'Chain',
      instances: seg.map(it => ({ body: it.body, color: it.color || 0, m: mMul(R, mMul(mT(it.x - mid, 0, 0), it.m || mT(0, 0, 0))) })),
    });
  }
  if (nSeg > 1) warn.push(`Printed in ${nSeg} straight parts to fit the bed. Join them with the jump rings included.`);
  out.jumpRingsNeeded = nSeg - 1;
  return out;
}

/* Ball / bead chain: hollow beads with a flat, open bottom; dumbbell connectors whose knobs sit on the bed. */
function buildBall(E, p, c, warn) {
  if (!E.MF) return emptyOut();
  const R = Math.max(p.linkW / 2, 2.6), wall = Math.max(0.8, 0.22 * R), Ri = R - wall;
  const zc = Ri - c - 0.05, ro = Math.sqrt(Math.max(0, Ri * Ri - zc * zc));
  let k = ro + 0.3;
  if (k > zc && 2 * k > Ri + zc - c) { warn.push('Beads are too small to hold their connectors. Use a bead size of at least 5.5 mm.'); k = (Ri + zc - c) / 2; }
  const hr = Math.max(k - c - 0.12, 0.5), rr = Math.max(hr - c - 0.08, 0.3);
  if (2 * rr < (NOZZLE[p.nozzle] || NOZZLE[0.4]).wire * 0.8) warn.push('Connector rods are very thin at this bead size. Go bigger, or use a finer nozzle.');
  const gap = Math.max(0.8, p.wire * 0.6), s = 2 * R + gap;
  const bk = `bead:${R}:${c}`;
  let bead = E.bodies.get(bk);
  if (!bead) {
    let m = E.toManifold(E.sphereMesh(R, 40)).translate([0, 0, zc]);
    m = m.subtract(E.toManifold(E.sphereMesh(Ri, 36)).translate([0, 0, zc]));
    m = m.intersect(E.box(-R - 1, -R - 1, 0, R + 1, R + 1, zc + R + 1));
    m = m.subtract(E.MF.cylinder(2 * R + 2, hr, hr, 24).rotate([0, 90, 0]).translate([-R - 1, 0, k]));
    const mesh = E.fromManifold(m);
    bead = { key: bk, mesh, volume: meshVolume(mesh.pos, mesh.idx) }; E.bodies.set(bk, bead);
  }
  const ck = `balllink:${s}:${k}:${rr}`;
  let con = E.bodies.get(ck);
  if (!con) {
    const kn = E.toManifold(E.sphereMesh(k, 24));
    let m = E.MF.union([kn.translate([0, 0, k]), kn.translate([s, 0, k]), E.MF.cylinder(s, rr, rr, 16).rotate([0, 90, 0]).translate([0, 0, k])]);
    m = m.intersect(E.box(-k - 1, -k - 1, 0, s + k + 1, k + 1, 2 * k + 1));
    const mesh = E.fromManifold(m);
    con = { key: ck, mesh, volume: meshVolume(mesh.pos, mesh.idx) }; E.bodies.set(ck, con);
  }
  const nB = Math.max(3, Math.round(p.lengthMM / s) + 1), inst = [];
  for (let i = 0; i < nB; i++) {
    inst.push({ body: bk, x: i * s, color: p.twoTone ? i % 2 : 0 });
    if (i < nB - 1) inst.push({ body: ck, x: i * s, color: 0 });
  }
  const out = linearParts(E, 'ball-chain', [bead, con], inst, (nB - 1) * s, p, warn);
  out.linkCount = nB; out.lengthMM = (nB - 1) * s + 2 * R;
  addExtras(E, out, p, c, {}, warn);
  return out;
}

/* Articulated snake / hinged herringbone: segments joined by ball-and-socket, flat bottoms, printed in place. */
function buildSnake(E, p, c, warn, st) {
  if (!E.MF) return emptyOut();
  const W = Math.max(p.linkW, 4.2), Lseg = Math.max(p.linkL * 0.55, W * 0.8, 3.2);
  const flat = !!st.flatSeg;
  const Rb = W * (flat ? 0.3 : 0.34), Rc = Rb + c, zc = Rc + 0.55;                  // socket centre height
  const Hbody = flat ? zc + Rc + 0.8 : zc + Math.max(Rc + 0.8, W / 2);
  const mouth = Math.sqrt(Math.max(0.01, Rc * Rc - (0.9 * Rc) ** 2));
  const rn = Math.max(Math.min(mouth - c - 0.12, Rb * 0.55), 0.35);
  if (rn < 0.5) warn.push('The snake joints are very small at this width. Make it wider for a stronger chain.');
  const gap = c + 0.25;
  const key = `snake:${W}:${Lseg}:${c}:${flat}`;
  let seg = E.bodies.get(key);
  if (!seg) {
    const bodyShape = flat
      ? E.CS.hull([E.CS.circle(0.8, 16).translate([-Lseg / 2 + 0.8, -W / 2 + 0.8]), E.CS.circle(0.8, 16).translate([Lseg / 2 - 0.8, -W / 2 + 0.8]), E.CS.circle(0.8, 16).translate([Lseg / 2 - 0.8, W / 2 - 0.8]), E.CS.circle(0.8, 16).translate([-Lseg / 2 + 0.8, W / 2 - 0.8])])
      : null;
    let m = flat
      ? bodyShape.extrude(Hbody)
      : E.MF.cylinder(Lseg, W / 2, W / 2, 32).rotate([0, 90, 0]).translate([-Lseg / 2, 0, Hbody - W / 2]).intersect(E.box(-Lseg, -W, 0, Lseg, W, Hbody + 1))
        .add(E.box(-Lseg / 2, -W / 2 * 0.86, 0, Lseg / 2, W / 2 * 0.86, Hbody - W / 2));
    // socket at the back
    const sx = -Lseg / 2 + 0.9 * Rc;
    m = m.subtract(E.toManifold(E.sphereMesh(Rc, 32)).translate([sx, 0, zc]));
    m = m.subtract(E.MF.cylinder(Lseg, mouth, mouth, 24).rotate([0, 90, 0]).translate([-Lseg / 2 - 1, 0, zc]).intersect(E.box(-Lseg, -W, -1, sx, W, Hbody + 1)));
    // neck + ball at the front, reaching into the next segment's socket
    const bx = Lseg / 2 + gap + 0.9 * Rc;
    m = m.add(E.MF.cylinder(bx - Lseg / 2 + 0.3, rn, rn, 16).rotate([0, 90, 0]).translate([Lseg / 2 - 0.3, 0, zc]));
    m = m.add(E.toManifold(E.sphereMesh(Rb, 28)).translate([bx, 0, zc]));
    if (flat) {   // herringbone chevrons on top
      const grooves = [];
      for (let i = -2; i <= 2; i++) {
        const g1 = E.box(-0.25, 0, 0, 0.25, W, 1).rotate([0, 0, 35]).translate([i * Lseg / 5, 0, Hbody - 0.45]);
        const g2 = E.box(-0.25, -W, 0, 0.25, 0, 1).rotate([0, 0, -35]).translate([i * Lseg / 5, 0, Hbody - 0.45]);
        grooves.push(g1, g2);
      }
      m = m.subtract(E.MF.union(grooves));
    }
    m = m.intersect(E.box(-Lseg * 2, -W * 2, 0, Lseg * 3, W * 2, Hbody + 2));
    const mesh = E.fromManifold(m);
    seg = { key, mesh, volume: meshVolume(mesh.pos, mesh.idx) }; E.bodies.set(key, seg);
  }
  const pitch = Lseg + gap, n = Math.max(3, Math.round(p.lengthMM / pitch)), inst = [];
  for (let i = 0; i < n; i++) inst.push({ body: key, x: i * pitch, color: p.twoTone ? i % 2 : 0 });
  const out = linearParts(E, flat ? 'herringbone' : 'snake-chain', [seg], inst, (n - 1) * pitch, p, warn);
  out.linkCount = n; out.lengthMM = n * pitch;
  warn.push('The last segment ends in a free ball: add a jump ring through the neck, or pair it with a clasp from the clasp generator.');
  addExtras(E, out, p, c, {}, warn);
  return out;
}

/* Bike / roller chain: printed on its side, plates standing, pins through bushings. */
function buildBike(E, p, c, warn) {
  if (!E.MF) return emptyOut();
  const P = Math.max(p.linkL * 0.7, 6), h = Math.max(p.linkW * 0.8, 4), tp = Math.max(p.wire * 0.75, 1.0);
  const rp = Math.max(p.wire * 0.45, 0.6), rh = rp + c, rbo = rh + Math.max(0.6, tp * 0.6);
  const yi = rbo * 1.3 + c;                               // inner plate inner face
  const yo = yi + tp + c;                                 // outer plate inner face
  const plate = (len) => E.CS.hull([E.CS.circle(h / 2, 32).translate([-len / 2, 0]), E.CS.circle(h / 2, 32).translate([len / 2, 0])]);
  const standing = (cs, y0, y1) => cs.extrude(y1 - y0).rotate([90, 0, 0]).translate([0, y1, h / 2]);
  const ik = `bikeInner:${P}:${h}:${c}`;
  if (!E.bodies.has(ik)) {
    let pl = plate(P).subtract(E.CS.circle(rh, 24).translate([-P / 2, 0])).subtract(E.CS.circle(rh, 24).translate([P / 2, 0]));
    let m = E.MF.union([standing(pl, yi, yi + tp), standing(pl, -yi - tp, -yi)]);
    const bush = E.MF.cylinder(2 * yi + 0.2, rbo, rbo, 24).subtract(E.MF.cylinder(2 * yi + 2, rh, rh, 24).translate([0, 0, -1])).rotate([90, 0, 0]);
    for (const sx of [-P / 2, P / 2]) m = m.add(bush.translate([sx, yi + 0.1, h / 2]));
    const mesh = E.fromManifold(m); E.bodies.set(ik, { key: ik, mesh, volume: meshVolume(mesh.pos, mesh.idx) });
  }
  const ok = `bikeOuter:${P}:${h}:${c}`;
  if (!E.bodies.has(ok)) {
    const pl = plate(P);
    let m = E.MF.union([standing(pl, yo, yo + tp), standing(pl, -yo - tp, -yo)]);
    const pin = E.MF.cylinder(2 * (yo + tp), rp, rp, 20).rotate([90, 0, 0]);
    for (const sx of [-P / 2, P / 2]) m = m.add(pin.translate([sx, yo + tp, h / 2]));
    const mesh = E.fromManifold(m); E.bodies.set(ok, { key: ok, mesh, volume: meshVolume(mesh.pos, mesh.idx) });
  }
  const n = Math.max(2, Math.round(p.lengthMM / P)), inst = [];
  for (let i = 0; i < n; i++) inst.push({ body: i % 2 ? ok : ik, x: i * P, color: p.twoTone ? i % 2 : 0 });
  if (n % 2 === 0) inst.push({ body: ik, x: n * P, color: 0 });
  const out = linearParts(E, 'roller-chain', [E.bodies.get(ik), E.bodies.get(ok)], inst, n * P, p, warn);
  out.linkCount = inst.length; out.lengthMM = n * P + h;
  warn.push('Roller chain prints on its side and bends one way, like a real bike chain. Both ends are open bushings for jump rings.');
  addExtras(E, out, p, c, {}, warn);
  return out;
}

/* Hand-assembled kits: open rings/links laid flat in a grid, plus instructions. */
const KIT_INFO = {
  byzantine: { ar: 3.5, perMM: (id) => 4 / id, shape: 'ring', steps: 'Close 2 rings, add 2 through them, fold the last pair back, open the doubles apart, and thread 2 rings through the gap. Repeat.' },
  singapore: { ar: 3.2, perMM: (id) => 1.6 / id, shape: 'twist', steps: 'Close one link, feed the next through it, then give every link a quarter twist the same way as you go.' },
  wheat:     { ar: 3.0, perMM: (id) => 2.2 / id, shape: 'oval', steps: 'Fold each oval into a V, then stack each V through the previous two, turning 90° every link.' },
};
function buildKit(E, p, c, warn, st) {
  if (!E.CS) return emptyOut();
  const info = KIT_INFO[st.kit];
  const wire = Math.max(p.wire, (NOZZLE[p.nozzle] || NOZZLE[0.4]).wire), id = +(wire * info.ar).toFixed(2);
  const key = `kit:${st.kit}:${wire}:${id}`;
  let body = E.bodies.get(key);
  if (!body) {
    let cs;
    if (info.shape === 'ring') cs = E.CS.circle(id / 2 + wire, 40).subtract(E.CS.circle(id / 2, 40));
    else {
      const L = id * 1.8;
      const o = E.CS.hull([E.CS.circle(id / 2 + wire, 32).translate([-L / 2 + id / 2, 0]), E.CS.circle(id / 2 + wire, 32).translate([L / 2 - id / 2, 0])]);
      const i = E.CS.hull([E.CS.circle(id / 2, 32).translate([-L / 2 + id / 2, 0]), E.CS.circle(id / 2, 32).translate([L / 2 - id / 2, 0])]);
      cs = o.subtract(i);
    }
    let m = cs.extrude(wire).subtract(E.box(0, -wire * 0.26, -1, id * 3, wire * 0.26, wire + 1).translate([id / 2 - 0.4, 0, 0]));
    const mesh = E.fromManifold(m);
    body = { key, mesh, volume: meshVolume(mesh.pos, mesh.idx) }; E.bodies.set(key, body);
  }
  const n = Math.ceil(info.perMM(id) * p.lengthMM * 1.1);
  const b = meshBounds(body.mesh.pos), sx = b[3] - b[0] + 1.6, sy = b[4] - b[1] + 1.6;
  const cols = Math.max(1, Math.floor((p.bedX - 12) / sx)), rows = Math.max(1, Math.floor((p.bedY - 12) / sy));
  const perPlate = cols * rows, plates = Math.ceil(n / perPlate);
  const out = { parts: [], bodies: [{ key, pos: body.mesh.pos, idx: body.mesh.idx, volume: body.volume }] };
  for (let pl = 0; pl < plates; pl++) {
    const cnt = Math.min(perPlate, n - pl * perPlate), inst = [];
    const cUsed = Math.min(cols, cnt), rUsed = Math.ceil(cnt / cols);
    for (let i = 0; i < cnt; i++) {
      const cx = i % cols, cy = Math.floor(i / cols);
      inst.push({ body: key, color: 0, m: mT((cx - (cUsed - 1) / 2) * sx, (cy - (rUsed - 1) / 2) * sy, 0) });
    }
    out.parts.push({ name: `${st.kit}-kit-${pl + 1}`, label: plates > 1 ? `Plate ${pl + 1} of ${plates}` : 'Kit', instances: inst });
  }
  out.linkCount = n; out.lengthMM = p.lengthMM;
  out.kitSteps = info.steps;
  warn.push(`Hand-assembled: ${n} open ${info.shape === 'ring' ? 'rings' : 'links'} (${id} mm inside, ${wire} mm wire, 10% spare). Print in PETG or nylon so they flex closed. ${info.steps}`);
  return out;
}

/* ------------------------------------------------------------
   Test strip: three short chains at gap −0.1, set, +0.1 mm
   ------------------------------------------------------------ */
export function buildTestStrip(wasm, font, opts) {
  const base = Object.assign({}, DEFAULTS, clean(opts));
  const st = STYLES[base.style] || STYLES.oval;
  const parts = [], bodies = new Map(), warn = [];
  const gaps = [base.clearance - 0.1, base.clearance, base.clearance + 0.1].map(v => +Math.max(0.1, v).toFixed(2));
  let yOff = 0;
  for (const g of gaps) {
    const pp = { ...base, clearance: g, ends: 'none', extender: false, jumpRings: false, stations: 0, graduated: 0, twoTone: false };
    if (st.kind === 'ring' && !st.letters && !st.customPlate) pp.lengthMM = Math.min(60, base.lengthMM);
    else if (st.kind === 'kit') pp.lengthMM = 10; else pp.lengthMM = Math.min(50, base.lengthMM);
    const ch = buildChain(wasm, font, pp);
    if (!ch.parts.length) { warn.push(`Gap ${g} mm: ${ch.warn[0] || 'could not build'}`); continue; }
    for (const b of ch.bodies) bodies.set(b.key, b);
    const inst = ch.parts[0].instances;
    let ymin = Infinity, ymax = -Infinity;
    for (const i of inst) { ymin = Math.min(ymin, i.m[7]); ymax = Math.max(ymax, i.m[7]); }
    const h = Math.max(12, ymax - ymin + (pp.linkW + 6));
    parts.push(...inst.map(i => ({ ...i, m: mMul(mT(0, yOff, 0), i.m) })));
    yOff += h;
    // gap label: engraved digits on a small tag
    if (font && wasm) {
      const E = createChainEngine(wasm, font);
      const txt = g.toFixed(2);
      const s = 4 / font.cap, polys = [];
      let x = 0;
      for (const ch2 of txt) { const gl = font.g[ch2]; if (!gl) continue; for (const cn of gl.c) { const q = []; for (let k = 0; k < cn.length; k += 2) q.push([(cn[k] + x) * s, cn[k + 1] * s]); polys.push(q); } x += gl.a; }
      const tw = x * s;
      let tag = E.CS.square([tw + 3, 6]).translate([-1.5, -1]).extrude(1.2);
      tag = tag.add(new E.CS(polys, 'NonZero').extrude(0.6).translate([0, 0, 1.2]));
      const mesh = E.fromManifold(tag), key = `tag:${txt}`;
      bodies.set(key, { key, pos: mesh.pos, idx: mesh.idx, volume: meshVolume(mesh.pos, mesh.idx) });
      let minx = Infinity; for (const i of inst) minx = Math.min(minx, i.m[3]);
      parts.push({ body: key, color: 1, m: mT(minx - tw - 12, yOff - h + h / 2 - 2, 0) });
    }
  }
  const all = { parts: [{ name: 'clearance-test-strip', label: 'Test strip', instances: parts }], bodies: [...bodies.values()], warn };
  // centre
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const i of parts) { x0 = Math.min(x0, i.m[3]); x1 = Math.max(x1, i.m[3]); y0 = Math.min(y0, i.m[7]); y1 = Math.max(y1, i.m[7]); }
  for (const i of parts) i.m = mMul(mT(-(x0 + x1) / 2, -(y0 + y1) / 2, 0), i.m);
  all.gaps = gaps;
  return all;
}

/* ------------------------------------------------------------ */
function stats(out, p) {
  let vol = 0, count = 0;
  const vb = new Map(out.bodies.map(b => [b.key, b.volume]));
  for (const pt of out.parts) for (const i of pt.instances) { vol += Math.abs(vb.get(i.body) || 0); count++; }
  const grams = vol / 1000 * (DENSITY[p.material] || 1.24);
  const minutes = vol / 1000 * 3.2 + count * 0.07 + 4;
  return {
    volume: vol, grams, cost: grams / 1000 * (p.pricePerKg || 20), minutes,
    links: out.linkCount || count, lengthMM: out.lengthMM || 0, parts: out.parts.length,
  };
}
