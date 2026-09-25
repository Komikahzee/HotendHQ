/* Pen adapters for cutting machines (Cricut, Silhouette…) and comfort grips for pens, pencils and craft knives. */
import { R, S, B, C, D2R } from '../core.js?v=95f6f46afd';

/* Starting points only: machines and pens vary, so the page asks people to measure.
   [clamp Ø, clamp length, collar Ø, collar height] */
const MACHINES = {
  cricut: [9.5, 22, 12.2, 2.5],
  silhouette: [11.8, 20, 14.6, 2.2],
  brother: [10, 24, 13, 3],
  custom: null,
};

export default {
  id: 'pen-grips', title: 'Pen grips & cutter adapters', usesBed: false,
  file: (s) => s.mode === 'adapter' ? `pen-adapter-${s.machine}-${s.penD}mm` : `pen-grip-${s.innerD}mm`,
  modes: {
    adapter: {
      label: 'Cutter adapter', title: 'Pen adapter for cutting machines', icon: '<path d="M9 3h6v5l-1 2v7l-2 4-2-4v-7l-1-2z"/><path d="M7 8h10"/>',
      blurb: 'Holds any pen or marker in your cutter\'s accessory clamp. Measure your clamp (or an original pen) and your pen with calipers for a perfect fit.',
      groups: [
        { title: 'Machine', open: true, items: [
          S('machine', 'Machine', [['cricut', 'Cricut Explore / Maker (clamp A)'], ['silhouette', 'Silhouette Cameo 4 / Portrait 3'], ['brother', 'Brother ScanNCut pen holder'], ['custom', 'Custom (measured)']], 'cricut',
            { hint: 'The machine sets starting sizes. Check them against your clamp with calipers.' }),
          R('clampD', 'Body Ø (in the clamp)', 6, 16, 0.05, 9.5, 'mm', { show: s => s.machine === 'custom' }),
          R('clampL', 'Body length below the collar', 10, 40, 0.5, 22, 'mm', { show: s => s.machine === 'custom' }),
          R('collarD', 'Collar Ø', 8, 22, 0.1, 12.2, 'mm', { show: s => s.machine === 'custom', hint: 'The ring that rests on top of the clamp and sets the height.' }),
          R('collarH', 'Collar height', 1, 6, 0.1, 2.5, 'mm', { show: s => s.machine === 'custom' }),
          R('clampFit', 'Body fit', -0.3, 0.3, 0.05, 0, 'mm', { hint: 'Added to the body Ø. Lower it if the adapter is loose in the clamp.' }),
          R('topL', 'Length above the collar', 5, 50, 0.5, 18, 'mm'),
        ] },
        { title: 'Your pen', open: true, items: [
          R('penD', 'Pen barrel Ø', 3, 14, 0.05, 9.5, 'mm', { hint: 'Measure where the pen will sit in the adapter.' }),
          R('penFit', 'Pen fit', -0.2, 0.6, 0.05, 0.15, 'mm'),
          S('hold', 'Holding the pen', [['screw', 'Thumb/set screw (M3)'], ['collet', 'Slotted collet + rubber band'], ['press', 'Snug press fit'], ['split', 'Split sleeve (squeezes on)']], 'screw'),
          S('stop', 'Pen depth', [['through', 'Open all the way through'], ['stop', 'Stop inside so every pen sits at the same depth']], 'stop'),
          R('tipD', 'Tip hole Ø', 1, 10, 0.1, 4, 'mm', { show: s => s.stop === 'stop', hint: 'The narrow hole the tip pokes through, below the stop.' }),
          R('tipL', 'Stop height from the bottom', 2, 30, 0.5, 8, 'mm', { show: s => s.stop === 'stop' }),
        ] },
        { title: 'Extras', items: [
          B('ribs', 'Grip ribs on the top', true),
          B('test', 'Also print fit-test rings', false, { hint: 'Three short rings at the body Ø and ±0.2 mm, to try in the clamp before the real thing.' }),
          C('colBody', 'Colour', '#1ea39a'),
        ] },
      ],
      presets: [
        ['Cricut + thick marker', { machine: 'cricut', penD: 11.3, hold: 'screw', stop: 'stop', tipD: 7, topL: 24 }],
        ['Cricut + fineliner', { machine: 'cricut', penD: 8.6, hold: 'collet', stop: 'stop', tipD: 3.5 }],
        ['Cricut + pencil', { machine: 'cricut', penD: 7.2, hold: 'press' }],
        ['Silhouette + marker', { machine: 'silhouette', penD: 10, hold: 'screw' }],
      ],
      test: [{ machine: 'custom' }, { hold: 'collet' }, { hold: 'split' }],
    },
    grip: {
      label: 'Comfort grip', title: 'Comfort grip', icon: '<path d="M8 3h8l-1 18H9z"/><path d="M8.5 9h7M8.7 13h6.6"/>',
      blurb: 'A soft, chunky grip that slides onto a pen, pencil, brush or craft knife. Print in TPU for a cushioned grip.',
      groups: [
        { title: 'Fit', open: true, items: [
          R('innerD', 'Pen / handle Ø', 4, 20, 0.05, 8, 'mm', { hint: 'Measure the barrel. Pencils are about 7–8 mm, most pens 8–11 mm.' }),
          R('gripFit', 'Fit', -0.4, 0.4, 0.05, -0.1, 'mm', { hint: 'Negative grips tighter (good for TPU).' }),
          R('length', 'Length', 15, 80, 0.5, 35, 'mm'),
          B('slit', 'Slit down one side', false, { hint: 'Lets a rigid grip clip onto a pen instead of sliding on.' }),
        ] },
        { title: 'Shape', open: true, items: [
          S('shape', 'Shape', [['bulb', 'Bulb (fat in the middle)'], ['taper', 'Tapered (fat at the back)'], ['straight', 'Straight tube'], ['tri', 'Triangular (tripod grip)'], ['grooves', 'Finger grooves'], ['hex', 'Hexagonal']], 'bulb'),
          R('outerD', 'Widest Ø', 8, 35, 0.5, 16, 'mm'),
          S('texture', 'Texture', [['none', 'Smooth'], ['rings', 'Rings'], ['ribs', 'Lengthwise ribs'], ['dimples', 'Dimples']], 'rings'),
          C('colGrip', 'Colour', '#e86fa6'),
        ] },
      ],
      presets: [['Pencil', { innerD: 7.3, outerD: 14, shape: 'tri' }], ['Pen', { innerD: 9.5, outerD: 17, shape: 'bulb' }],
        ['Craft knife', { innerD: 8, outerD: 15, shape: 'grooves', length: 45 }], ['Chunky (easy grip)', { innerD: 9, outerD: 26, shape: 'bulb', length: 45, texture: 'dimples' }]],
      test: [{ shape: 'hex' }, { shape: 'straight' }],
    },
  },

  async build(K, p) {
    const warn = [], info = { facts: [], lines: [] }, parts = [];
    if (p.mode === 'grip') return grip(K, p, info, warn);
    const M = MACHINES[p.machine];
    const clampD = (M ? M[0] : p.clampD) + p.clampFit, clampL = M ? M[1] : p.clampL, collarD = M ? M[2] : p.collarD, collarH = M ? M[3] : p.collarH;
    const bore = p.penD + p.penFit;
    const wall = (clampD - bore) / 2, thick = wall < 0.8;
    if (thick && p.stop !== 'stop') warn.push(`Your pen (${p.penD} mm) is wider than the ${clampD.toFixed(1)} mm body can hold. Choose "Stop inside" under Pen depth: the pen then rests above the clamp and only its tip goes down the middle.`);
    const topR = Math.max(clampD / 2, bore / 2 + (p.hold === 'screw' ? 3.6 : 1.6));
    const L = clampL + collarH + p.topL;
    // body of revolution: clamp section, a 45° under-collar so it prints without supports, collar, top section
    const ch = Math.max(0, (collarD - clampD) / 2);
    const prof = [[0, 0], [clampD / 2, 0], [clampD / 2, clampL - ch], [collarD / 2, clampL], [collarD / 2, clampL + collarH], [topR, clampL + collarH], [topR, L - 0.6], [topR - 0.6, L], [0, L]];
    let m = K.revolve(K.poly(prof), 96);
    // the pen hole
    let holeProf;
    if (p.stop === 'stop') {
      // a pen wider than the clamp body has to rest above it, with only the tip going down
      const tl = thick ? Math.max(p.tipL, clampL + collarH) : Math.min(p.tipL, L - 5), tr = Math.min(p.tipD / 2, bore / 2 - 0.3, clampD / 2 - 0.8);
      if (thick && p.tipL < clampL + collarH) info.lines.push(`The pen is wider than the clamp body, so it rests ${(clampL + collarH).toFixed(1)} mm up, at the collar.`);
      holeProf = [[0, -1], [tr, -1], [tr, tl], [bore / 2, tl + (bore / 2 - tr)], [bore / 2, L + 1], [0, L + 1]];   // 45° shoulder the pen rests on
    } else holeProf = [[0, -1], [bore / 2, -1], [bore / 2, L + 1], [0, L + 1]];
    m = m.subtract(K.revolve(K.poly(holeProf), 96));
    const top0 = clampL + collarH;
    if (p.ribs) { const ribs = []; for (let i = 0; i < 12; i++) ribs.push(K.box(0.8, 1.2, p.topL - 2).translate([topR, 0, top0 + 1]).rotate([0, 0, 30 * i])); m = m.add(K.union(ribs)); }
    if (p.hold === 'screw') {
      // M3 thumb screw through the top section, with a nut trap
      const z = top0 + p.topL / 2;
      m = m.subtract(K.cyl(1.65, topR + 2, 24).rotate([0, 90, 0]).translate([0, 0, z]));
      const nut = K.extrude(K.regular(6, 5.7 / 2 / Math.cos(Math.PI / 6), 0), 2.6).rotate([0, 90, 0]).translate([bore / 2 + 0.6, 0, z]);
      m = m.subtract(nut).subtract(K.box(2.6, 5.9, p.topL / 2 + 2).translate([bore / 2 + 0.6 + 1.3, 0, z]));   // slot to drop the nut in from the top
      info.lines.push('Drop an M3 nut into the slot, then screw an M3 bolt (or thumb screw) in from the side to clamp the pen.');
    } else if (p.hold === 'collet') {
      const sl = Math.min(p.topL * 0.8, 14);
      for (let i = 0; i < 4; i++) m = m.subtract(K.box(1, topR * 2 + 2, sl + 1).translate([0, 0, L - sl]).rotate([0, 0, 45 * i]));
      m = m.subtract(K.revolve(K.poly([[topR - 0.7, L - sl * 0.45], [topR + 1, L - sl * 0.45], [topR + 1, L - sl * 0.45 + 1.4], [topR - 0.7, L - sl * 0.45 + 1.4]]), 64));
      info.lines.push('Slide the pen in, then stretch a small rubber band or O-ring into the groove to squeeze the collet shut.');
    } else if (p.hold === 'split') {
      m = m.subtract(K.box(1.2, topR + 2, L + 2).translate([0, topR / 2 + 1, -1]));
      info.lines.push('Print in PETG so the split sleeve flexes onto the pen instead of cracking.');
    } else info.lines.push('Push the pen in firmly. If it is loose, lower Pen fit by 0.05 mm and reprint.');
    parts.push({ name: 'adapter', label: 'Adapter', m, colorKey: 'colBody', color: p.colBody });
    if (p.test) {
      const rings = [-0.2, 0, 0.2].map((d, i) => { const r = clampD / 2 + d; let t = K.revolve(K.poly([[r - 1.4, 0], [r, 0], [r, 8], [r - 1.4, 8]]), 96); for (let k = 0; k <= i; k++) t = t.subtract(K.box(0.8, 1.2, 2).translate([r - 0.3, 0, 7]).rotate([0, 0, 30 * k])); return t.translate([collarD + 8 + i * (clampD + 6), 0, 0]); });
      parts.push({ name: 'test', label: 'Fit-test rings', m: K.union(rings), colorKey: 'colBody', color: p.colBody });
      info.lines.push('Test rings: 1 notch = −0.2 mm, 2 notches = as set, 3 notches = +0.2 mm. Use the one that sits snugly in the clamp.');
    }
    info.facts.push(`fits a ${p.penD} mm pen`);
    info.lines.push('Print standing up (clamp end down). The collar has a 45° underside, so no supports are needed.');
    if (p.machine !== 'custom') info.lines.push('The machine sizes are starting points. Measure your clamp or an original pen with calipers and switch to Custom if it doesn\'t sit right.');
    return { parts, warn, info };
  },
};

function grip(K, p, info, warn) {
  const ri = (p.innerD + p.gripFit) / 2, Ro = Math.max(p.outerD / 2, ri + 1.2), L = p.length;
  if (p.outerD / 2 < ri + 1.2) warn.push('The grip is only as wide as the pen plus a minimum wall.');
  const N = 24, prof = [[ri, 0]];
  const rAt = (t) => {
    switch (p.shape) {
      case 'bulb': return ri + 1.2 + (Ro - ri - 1.2) * Math.sin(Math.PI * t) ** 0.8;
      case 'taper': return ri + 1.2 + (Ro - ri - 1.2) * Math.min(1, t * 1.4);
      case 'grooves': return Ro - (Ro - ri - 1.4) * 0.35 * (0.5 + 0.5 * Math.cos(t * Math.PI * 6)) * Math.sin(Math.PI * t) ** 0.3;
      default: return Ro;
    }
  };
  let m;
  if (p.shape === 'tri' || p.shape === 'hex') {
    const n = p.shape === 'tri' ? 3 : 6, cs = K.regular(n, Ro / Math.cos(Math.PI / n), 90).offset(-Ro * 0.12, 'Round').offset(Ro * 0.12, 'Round');
    m = K.softSlab(cs, L, Math.min(1.5, L / 6));
  } else {
    for (let i = 0; i <= N; i++) prof.push([rAt(i / N), L * i / N]);
    prof.push([ri, L]);
    m = K.revolve(K.poly(prof), 96);
  }
  m = m.subtract(K.cyl(ri, L + 2, 64).translate([0, 0, -1]));
  if (p.texture === 'rings') { const g = []; for (let z = 4; z < L - 3; z += 3) g.push(K.revolve(K.poly([[Ro - 0.5, z], [Ro + 3, z - 0.6], [Ro + 3, z + 0.6]]), 96)); if (g.length) m = m.subtract(K.union(g)); }
  if (p.texture === 'ribs') { const g = []; const n = Math.round(Ro * 1.6); for (let i = 0; i < n; i++) g.push(K.box(0.9, 1.4, L - 6).translate([Ro, 0, 3]).rotate([0, 0, 360 * i / n])); m = m.subtract(K.union(g)); }
  if (p.texture === 'dimples') { const g = []; for (let z = 5; z < L - 4; z += 4.5) for (let i = 0; i < 8; i++) g.push(K.sphere(1.3, 12).translate([Ro + 0.5, 0, z]).rotate([0, 0, 45 * i + (z % 9 ? 22.5 : 0)])); if (g.length) m = m.subtract(K.union(g)); }
  if (p.slit) m = m.subtract(K.box(Math.max(1, ri * 0.5), Ro + 2, L + 2).translate([0, Ro / 2 + 1, -1]));
  info.facts.push(`for a ${p.innerD} mm barrel`);
  info.lines.push('Print standing up. TPU (95A) gives a soft, squishy grip; PLA or PETG make a firm one.');
  return { parts: [{ name: 'grip', label: 'Grip', m, colorKey: 'colGrip', color: p.colGrip }], warn, info };
}
