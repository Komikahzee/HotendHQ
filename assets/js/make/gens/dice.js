/* Dice: d4, d6, d8, d10, d12, d20 and d100, with numbers, words or pips engraved on every face. */
import { R, S, B, X, C, F } from '../core.js?v=95f6f46afd';

const PHI = (1 + Math.sqrt(5)) / 2;
const DICE = [['d4', 'd4 (tetrahedron)'], ['d6', 'd6 (cube)'], ['d8', 'd8 (octahedron)'], ['d10', 'd10 (0–9)'], ['d100', 'd100 / percentile (00–90)'], ['d12', 'd12 (dodecahedron)'], ['d20', 'd20 (icosahedron)'], ['set', 'Full set (all seven)']];
const DEF_SIZE = { d4: 20, d6: 16, d8: 16, d10: 16, d100: 16, d12: 18, d20: 20 };

export default {
  id: 'dice', title: 'Dice', usesBed: true,
  file: (s) => `dice-${s.die}`,
  modes: {
    dice: {
      label: 'Dice', title: 'Custom dice',
      blurb: 'Every face is engraved, and opposite faces add up like real dice. Swap in your own words or symbols, or pips on a d6.',
      groups: [
        { title: 'Die', open: true, items: [
          S('die', 'Die', DICE, 'd20'),
          R('size', 'Size', 8, 60, 0.5, 20, 'mm', { labelFn: s => s.die === 'd4' ? 'Size (edge length)' : s.die === 'set' ? 'Size (scales the whole set)' : 'Size (face to face)',
            hint: 'Standard: d4 20 mm edge, d6 16 mm, d8 and d10 16 mm, d12 18 mm, d20 20 mm.' }),
          R('round', 'Rounded edges', 0, 100, 1, 30, '%', { hint: '0 is sharp edges, 100 is very round. Rounder dice tumble longer.' }),
          R('d10h', 'd10 height', 0.8, 1.6, 0.02, 1.1, '×', { show: s => s.die === 'd10' || s.die === 'd100', hint: 'How pointed the d10 is.' }),
        ] },
        { title: 'Faces', open: true, items: [
          S('faces', 'Face markings', [['numbers', 'Numbers'], ['custom', 'My own text on each face'], ['pips', 'Pips (d6 only)'], ['blank', 'Blank']], 'numbers'),
          X('labels', 'Face text', 'YES,NO,MAYBE,ASK AGAIN,LATER,SURE', { show: s => s.faces === 'custom', max: 400,
            hint: 'Separate faces with commas, in face order. Missing faces are left blank; extras are ignored.' }),
          S('d4style', 'd4 numbering', [['top', 'Read at the top point'], ['bottom', 'Read along the bottom edge']], 'top', { show: s => s.die === 'd4' || s.die === 'set' }),
          F('font', 'Font', 'inter'),
          R('textSize', 'Text size', 20, 90, 1, 55, '%', { hint: 'Height of the numbers as a share of the face.' }),
          S('mark69', 'Mark 6 and 9', [['dot', 'Dot after (6. and 9.)'], ['line', 'Underline'], ['none', 'Don\'t mark']], 'line', { show: s => s.faces === 'numbers' && s.die !== 'd4' && s.die !== 'd6' }),
          S('pipStyle', 'Pip shape', [['round', 'Round'], ['square', 'Square'], ['star', 'Star']], 'round', { show: s => s.faces === 'pips' }),
          B('bigOne', 'Big pip on the 1', true, { show: s => s.faces === 'pips' }),
        ] },
        { title: 'Engraving & colour', open: true, items: [
          R('depth', 'Engrave depth', 0.3, 2, 0.1, 0.8, 'mm'),
          B('ink', 'Fill the engraving in a second colour', false, { hint: 'Adds the numbers as their own object, flush with the faces, for multi-material printers.' }),
          C('colDie', 'Die colour', '#1182c9'),
          C('colInk', 'Number colour', '#f2f4f7'),
        ] },
      ],
      presets: [
        ['Classic d20', { die: 'd20', size: 20, round: 25 }],
        ['Pip d6', { die: 'd6', faces: 'pips', size: 16, round: 40 }],
        ['Full RPG set', { die: 'set', size: 20, round: 25, colDie: '#7a4fc9' }],
        ['Decision die', { die: 'd6', faces: 'custom', labels: 'YES,NO,MAYBE,ASK AGAIN,LATER,SURE', textSize: 26, font: 'bebas' }],
        ['Two-colour', { die: 'd20', ink: true, colDie: '#23262b', colInk: '#d6a93a' }],
      ],
      test: [{ die: 'd6', faces: 'pips' }, { die: 'd4' }, { die: 'd10' }, { die: 'd6', faces: 'custom' }, { die: 'set' }],
    },
  },

  async build(K, p, ctx) {
    const font = p.faces === 'blank' ? null : await ctx.font(p.font);
    const warn = [], info = { facts: [], lines: [] };
    const kinds = p.die === 'set' ? ['d4', 'd6', 'd8', 'd10', 'd100', 'd12', 'd20'] : [p.die];
    const dice = [], inks = [];
    for (const kind of kinds) {
      const size = p.die === 'set' ? DEF_SIZE[kind] * p.size / 20 : p.size;
      const r = makeDie(K, kind, size, p, font, warn);
      dice.push(r.die); inks.push(r.ink);
    }
    let laidD = dice, laidI = inks;
    if (dice.length > 1) {                          // one row, same offsets for die and ink
      let x = 0; laidD = []; laidI = [];
      dice.forEach((d, i) => { const b = K.bb(d); const dx = x - b.min[0]; laidD.push(d.translate([dx, 0, 0])); if (inks[i]) laidI.push(inks[i].translate([dx, 0, 0])); x += b.w + 6; });
    }
    const parts = [{ name: 'dice', label: dice.length > 1 ? 'Dice' : kinds[0], m: K.union(laidD), colorKey: 'colDie', color: p.colDie }];
    const ink = K.union(laidI.filter(Boolean));
    if (ink) parts.push({ name: 'numbers', label: 'Numbers', m: ink, colorKey: 'colInk', color: p.colInk });
    info.facts.push(kinds.length > 1 ? `${kinds.length} dice` : kinds[0]);
    info.lines.push('Each die sits on a face, so no supports are needed. 0.12–0.16 mm layers give crisp numbers.');
    if (!p.ink) info.lines.push('To colour the numbers by hand, paint the engraving and wipe the face with a damp cloth before it dries.');
    if (p.round > 70) info.lines.push('Very round dice roll unevenly on a hard table; they are fine for play but not perfectly fair.');
    return { parts, warn, info };
  },
};

/* ---------- geometry ---------- */
function verts(kind, p) {
  switch (kind) {
    case 'd4': return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case 'd6': return [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z])));
    case 'd8': return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'd12': { const a = 1 / PHI, v = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z])));
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) v.push([0, s1 * a, s2 * PHI], [s1 * a, s2 * PHI, 0], [s2 * PHI, 0, s1 * a]); return v; }
    case 'd20': { const v = []; for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) v.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]); return v; }
    case 'd10': case 'd100': {
      const h = p.d10h, c36 = Math.cos(Math.PI / 5), z0 = h * (1 - c36) / (1 + c36), v = [[0, 0, h], [0, 0, -h]];
      for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5, b = a + Math.PI / 5; v.push([Math.cos(a), Math.sin(a), z0], [Math.cos(b), Math.sin(b), -z0]); }
      return v;
    }
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** faces of a convex polyhedron: groups of vertices that share a supporting plane */
function faces(V) {
  const out = [], seen = new Set();
  const n = V.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nr = cross(sub(V[j], V[i]), sub(V[k], V[i]));
    if (Math.hypot(...nr) < 1e-9) continue;
    nr = norm(nr); let d = dot(nr, V[i]);
    if (d < 0) { nr = mul(nr, -1); d = -d; }
    if (V.some(v => dot(nr, v) > d + 1e-6)) continue;           // not a supporting plane
    const key = nr.map(x => x.toFixed(4)).join();
    if (seen.has(key)) continue; seen.add(key);
    const ids = V.map((v, q) => Math.abs(dot(nr, v) - d) < 1e-6 ? q : -1).filter(q => q >= 0);
    const c = mul(ids.reduce((a, q) => add(a, V[q]), [0, 0, 0]), 1 / ids.length);
    out.push({ n: nr, d, ids, c });
  }
  return out;
}

function makeDie(K, kind, size, p, font, warn) {
  const V0 = verts(kind, p), F0 = faces(V0);
  // scale: d4 by edge length, others face to face
  let s;
  if (kind === 'd4') s = size / Math.hypot(...sub(V0[0], V0[1]));
  else s = size / (2 * F0[0].d);
  const V = V0.map(v => mul(v, s)), FF = F0.map(f => ({ ...f, d: f.d * s, c: mul(f.c, s) }));
  let die = K.M.hull(V);
  const Rout = Math.max(...V.map(v => Math.hypot(...v))), Rin = Math.min(...FF.map(f => f.d));
  if (p.round > 0) {                                   // trim corners with a sphere between the in- and out-radius
    const r = Rout - (Rout - Rin) * (p.round / 100) * 0.9;
    die = die.intersect(K.sphere(r, 96));
  }
  // order faces so opposite faces sum to N+1 (d10: to 9)
  const N = FF.length, order = new Array(N).fill(-1);
  if (kind !== 'd4') {
    const used = new Set(); let lo = 0, hi = N - 1;
    // pair each face with its opposite (normals point the other way)
    const pairs = [];
    for (let i = 0; i < N; i++) { if (used.has(i)) continue; let j = -1, best = 2; for (let q = 0; q < N; q++) if (q !== i && !used.has(q)) { const dd = dot(FF[i].n, FF[q].n); if (dd < best) { best = dd; j = q; } } used.add(i); used.add(j); pairs.push([i, j]); }
    // number around the die so neighbours differ: sort pairs by angle from a pole
    pairs.sort((a, b) => Math.atan2(FF[a[0]].n[1], FF[a[0]].n[0]) - Math.atan2(FF[b[0]].n[1], FF[b[0]].n[0]) || FF[b[0]].n[2] - FF[a[0]].n[2]);
    pairs.forEach(([i, j], k) => { order[i] = k % 2 ? hi - Math.floor(k / 2) : lo + Math.floor(k / 2); order[j] = N - 1 - order[i]; });
  }
  const labelFor = (idx) => {
    if (p.faces === 'custom') { const list = String(p.labels || '').split(',').map(t => t.trim()); return list[idx] ?? ''; }
    if (kind === 'd10') return String(idx);
    if (kind === 'd100') return idx === 0 ? '00' : String(idx * 10);
    return String(idx + 1);
  };
  const cuts = [];
  const place = (cs, f, up, z = 0) => {                 // put a 2D label on a face; +Y of the label points along `up`
    const n = f.n, u = norm(sub(up, mul(n, dot(up, n)))), r = cross(u, n);
    const depth = p.depth;
    const m3 = K.extrude(cs, depth + 0.05).translate([0, 0, -depth]);
    const o = add(f.c, mul(n, 0.02 + z));
    return m3.transform([r[0], r[1], r[2], 0, u[0], u[1], u[2], 0, n[0], n[1], n[2], 0, o[0], o[1], o[2], 1]);
  };
  if (p.faces !== 'blank') FF.forEach((f, i) => {
    // face corners in order around the face (so edges are real edges, not diagonals)
    const e1 = norm(sub(V[f.ids[0]], f.c)), e2 = cross(f.n, e1);
    const pts = f.ids.map(q => V[q]).sort((a, b) => Math.atan2(dot(sub(a, f.c), e2), dot(sub(a, f.c), e1)) - Math.atan2(dot(sub(b, f.c), e2), dot(sub(b, f.c), e1)));
    const inr = Math.min(...pts.map((a, k) => {  // distance from the face centre to each edge
      const b = pts[(k + 1) % pts.length], e = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(f.c, a), e) / dot(e, e)));
      return Math.hypot(...sub(f.c, add(a, mul(e, t)))); }));
    // "up" on the face: towards the pole for d10, a vertex for triangles/pentagons, an edge for squares
    let up;
    if (kind === 'd10' || kind === 'd100') up = sub(V[f.n[2] > 0 ? 0 : 1], f.c);
    else if (kind === 'd6') up = Math.abs(f.n[2]) > 0.5 ? [0, 1, 0] : [0, 0, 1];
    else up = sub(pts.reduce((a, v) => (dot(v, [0.3, 0.5, 0.8]) > dot(a, [0.3, 0.5, 0.8]) ? v : a)), f.c);
    if (kind === 'd4') {                                // three numbers per face, each pointing at its corner
      pts.forEach((vtx) => {
        const vi = V.indexOf(vtx), val = String(vi + 1);
        const toV = sub(vtx, f.c), dist = Math.hypot(...toV);
        const g = p.faces === 'custom' ? labelText(K, font, labelFor(vi), dist * p.textSize / 100 * 0.55) : labelText(K, font, val, dist * p.textSize / 100 * 0.55);
        if (!g) return;
        // top-read: next to its corner; bottom-read: along the opposite edge. Either way the number points at its corner.
        const along = p.d4style === 'top' ? 0.5 : -0.3;
        const fc = { ...f, c: add(f.c, mul(norm(toV), dist * along)) };
        cuts.push(place(g, fc, toV));
      });
      return;
    }
    const idx = order[i], text = labelFor(idx);
    let cs = null;
    const hMax = inr * 2 * p.textSize / 100;
    if (p.faces === 'pips' && kind === 'd6') cs = pips(K, idx + 1, inr * 2, p);
    else if (p.faces === 'pips') { if (i === 0 && !warn.includes('Pips are only for the d6; the other dice show numbers.')) warn.push('Pips are only for the d6; the other dice show numbers.'); cs = labelText(K, font, text, hMax, inr * 1.6); }
    else cs = labelText(K, font, text, hMax, inr * 1.6);
    if (cs && p.faces === 'numbers' && (text === '6' || text === '9') && kind !== 'd6' && p.mark69 !== 'none') {
      const b = cs.bounds(), w = b.max[0] - b.min[0], h = b.max[1] - b.min[1];
      cs = p.mark69 === 'line' ? cs.add(K.rect(w, Math.max(0.6, h * 0.1)).translate([(b.min[0] + b.max[0]) / 2, b.min[1] - h * 0.16]))
        : cs.add(K.circle(Math.max(0.5, h * 0.08)).translate([b.max[0] + h * 0.14, b.min[1] + h * 0.08]));
      cs = K.center2(cs);
    }
    if (cs) cuts.push(place(cs, f, up));
  });
  let ink = null;
  if (cuts.length) {
    const all = K.union(cuts);
    ink = p.ink ? die.intersect(all) : null;
    die = die.subtract(all);
  }
  // rest the die on a face (lowest face down)
  const down = FF.reduce((a, f) => (f.n[2] < a.n[2] ? f : a));
  const nz = [0, 0, -1], ax = cross(down.n, nz), ang = Math.acos(Math.max(-1, Math.min(1, dot(down.n, nz))));
  const rot = (m) => { if (Math.hypot(...ax) < 1e-9) return ang > 1 ? m.rotate([180, 0, 0]) : m; const a = norm(ax), c = Math.cos(ang), s2 = Math.sin(ang), t = 1 - c;
    const R = [t * a[0] * a[0] + c, t * a[0] * a[1] + s2 * a[2], t * a[0] * a[2] - s2 * a[1], 0, t * a[0] * a[1] - s2 * a[2], t * a[1] * a[1] + c, t * a[1] * a[2] + s2 * a[0], 0, t * a[0] * a[2] + s2 * a[1], t * a[1] * a[2] - s2 * a[0], t * a[2] * a[2] + c, 0, 0, 0, 0, 1];
    return m.transform(R); };
  die = rot(die); if (ink) ink = rot(ink);
  const b = die.boundingBox(), sh = [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]];
  return { die: die.translate(sh), ink: ink ? ink.translate(sh) : null };
}
function labelText(K, font, str, h, maxW = Infinity) {
  if (!font || !str) return null;
  const lines = String(str).split(/\s*\|\s*|\\n/);
  let cs = K.text(font, lines.join('\n'), { size: 10, align: 'center', lineHeight: 0.95 });
  if (!cs) return null;
  cs = K.center2(cs);
  const [w, hh] = K.size2(cs), k = Math.min(h / hh, maxW / w);
  return cs.scale([k, k]);
}
function pips(K, n, faceW, p) {
  const g = faceW * 0.26, r = faceW * 0.085;
  const at = { 1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]], 4: [[-1, 1], [1, 1], [-1, -1], [1, -1]], 5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]], 6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]] }[n] || [];
  const one = (x, y, rr) => p.pipStyle === 'square' ? K.rect(rr * 1.7, rr * 1.7).translate([x, y]) : p.pipStyle === 'star' ? K.star(5, rr * 1.25, rr * 0.55).translate([x, y]) : K.circle(rr, 48).translate([x, y]);
  let cs = null;
  for (const [x, y] of at) { const rr = n === 1 && p.bigOne ? r * 2.2 : r; const c = one(x * g, y * g, rr); cs = cs ? cs.add(c) : c; }
  return cs;
}
