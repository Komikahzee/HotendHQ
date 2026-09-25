/* Mic stand accessories: mic clips, shock mounts, thread adapters, stand cable clips, pop filters and phone mounts.
   Everything that hangs off a stand uses the same two-part hinge: a tab on the accessory and a fork on the mount,
   joined with one bolt so the angle can be set and locked. */
import { R, S, B, C, D2R } from '../core.js?v=95f6f46afd';

// [label, major Ø, pitch]
const THREADS = {
  '58': ['5/8″-27 (US / most mic stands)', 15.875, 25.4 / 27],
  '38': ['3/8″-16 (European stands)', 9.525, 25.4 / 16],
  '14': ['1/4″-20 (camera & tripod screw)', 6.35, 25.4 / 20],
};
// [clearance hole Ø, nut across flats, nut height, name]
const BOLTS = { m4: [4.4, 7, 3.2, 'M4'], m5: [5.4, 8, 4, 'M5'], m6: [6.6, 10, 5, 'M6 or 1/4″'] };
const THREAD_OPTS = Object.entries(THREADS).map(([k, v]) => [k, v[0]]);
const isThread = (k) => k in THREADS;
const boltLen = (need) => [10, 12, 16, 20, 25, 30, 35, 40, 50].find(l => l >= need) || Math.ceil(need / 5) * 5;

/* ---------- shared control groups ---------- */
const mountGroup = (def, extra = {}) => ({ title: 'Mount', open: true, ...extra, items: [
  S('mount', 'Attach to', [['58', 'Stand thread 5/8″-27 (US)'], ['38', 'Stand thread 3/8″-16 (EU)'], ['14', 'Tripod screw 1/4″-20'], ['tube', 'Snap onto a stand or boom tube'], ['screw', 'Bolt-tight tube clamp']], def,
    { hint: 'Every mount has a hinge so you can set the angle, then lock it with the bolt.' }),
  R('depth', 'Thread depth', 6, 20, 0.5, 11, 'mm', { show: s => isThread(s.mount), hint: 'How far the stand stud screws in.' }),
  R('fitT', 'Thread clearance', 0.05, 0.6, 0.05, 0.25, 'mm', { show: s => isThread(s.mount), hint: 'Extra room around printed threads. Raise it if the thread binds, lower it if it wobbles.' }),
  R('tubeD', 'Tube Ø', 10, 40, 0.5, 20, 'mm', { show: s => s.mount === 'tube' || s.mount === 'screw', hint: 'Measure the stand or boom where it will clamp.' }),
  R('grip', 'Snap opening', 60, 95, 1, 82, '%', { show: s => s.mount === 'tube', hint: 'Opening as a share of the tube Ø. Lower grips harder but is harder to snap on.' }),
  R('clampW', 'Clamp height', 10, 40, 0.5, 16, 'mm', { show: s => s.mount === 'tube' || s.mount === 'screw' }),
] });
const hingeGroup = (extra = {}) => ({ title: 'Hinge', ...extra, items: [
  S('bolt', 'Hinge bolt', [['m4', 'M4'], ['m5', 'M5'], ['m6', 'M6 or 1/4″']], 'm5'),
  R('kT', 'Tab thickness', 4, 12, 0.5, 6, 'mm'),
  R('earT', 'Fork ear thickness', 3, 8, 0.5, 5, 'mm', { hint: 'Grows automatically to fit the nut pocket.' }),
  R('hingeFit', 'Hinge play', 0.2, 1.2, 0.05, 0.5, 'mm', { hint: 'Total gap between the tab and the fork. The bolt clamps it tight.' }),
  B('nutTrap', 'Hex nut pocket', true, { hint: 'Holds the nut so you only need one tool.' }),
] });
const colours = (a, b) => ({ title: 'Colours', items: [C('colMain', a, '#23262b'), C('colMount', b, '#f3662e')] });

export default {
  id: 'mic-accessories', title: 'Mic stand accessories', usesBed: false,
  file: (s) => `mic-${s.mode || 'part'}`,
  modes: {
    clip: {
      label: 'Mic clip', title: 'Mic clip',
      blurb: 'A snap-in C clip, tapered clip for handheld mics, or a closed ring for pencil condensers, on a hinged mount.',
      groups: [
        { title: 'Clip', open: true, items: [
          S('style', 'Clip style', [['c', 'C clip (snap in)'], ['taper', 'Tapered C clip (handheld mics)'], ['ring', 'Closed ring (slide in)']], 'c'),
          R('micD', 'Mic Ø', 15, 60, 0.1, 24, 'mm', { hint: 'Measure the mic where the clip will hold it. For a tapered clip this is the wide end.' }),
          R('micD2', 'Mic Ø at the narrow end', 12, 60, 0.1, 21, 'mm', { show: s => s.style === 'taper' }),
          R('clipL', 'Clip length', 12, 60, 0.5, 28, 'mm'),
          R('wall', 'Wall', 2, 6, 0.1, 3.2, 'mm'),
          R('open', 'Opening', 60, 150, 1, 110, '°', { show: s => s.style !== 'ring', hint: 'How much of the ring is cut away. The gap should be a bit smaller than the mic so it snaps in.' }),
          B('ribs', 'Grip ribs inside', true),
          B('setScrew', 'M3 set screw', true, { show: s => s.style === 'ring', hint: 'A 2.8 mm hole for a self-tapping M3 screw to lock the mic.' }),
        ] },
        mountGroup('58'), hingeGroup(), colours('Clip', 'Mount'),
      ],
      presets: [['Handheld mic, tapered', { style: 'taper', micD: 25, micD2: 21, clipL: 32 }], ['Pencil condenser ring', { style: 'ring', micD: 21 }], ['Large C clip (40 mm)', { micD: 40, clipL: 34, wall: 3.6 }],
        ['European 3/8″ stand', { mount: '38' }], ['Clamp on a boom', { mount: 'screw', tubeD: 18 }]],
      test: [{ style: 'ring', setScrew: false }, { ribs: false, open: 150 }, { mount: 'tube' }, { mount: '14', bolt: 'm4', nutTrap: false }, { style: 'taper', micD2: 60 }],
    },
    shock: {
      label: 'Shock mount', title: 'Elastic shock mount',
      blurb: 'An inner ring holds the mic and floats on rubber bands or elastic cord inside an outer frame, cutting stand thumps.',
      groups: [
        { title: 'Rings', open: true, items: [
          R('micD', 'Mic Ø', 15, 60, 0.1, 22, 'mm'),
          R('ringH', 'Ring height', 6, 30, 0.5, 12, 'mm'),
          R('travel', 'Float gap', 10, 30, 0.5, 13, 'mm', { hint: 'Space between the rings: more gap isolates better.' }),
          R('wall', 'Wall', 2, 5, 0.1, 2.6, 'mm'),
          R('anchors', 'Anchor points', 3, 8, 1, 4, ''),
          S('band', 'Suspension', [['band', 'Rubber bands or hair ties (hooks)'], ['cord', 'Elastic cord (eyelets)']], 'band'),
          R('cordD', 'Cord Ø', 1, 4, 0.1, 2, 'mm', { show: s => s.band === 'cord' }),
          B('setScrew', 'M3 set screw in the inner ring', true),
        ] },
        mountGroup('58'), hingeGroup(), colours('Rings', 'Mount'),
      ],
      presets: [['Pencil condenser', { micD: 21 }], ['Large diaphragm (50 mm)', { micD: 50, ringH: 18, travel: 15, anchors: 6 }], ['Elastic cord', { band: 'cord', anchors: 6 }], ['Boom clamp', { mount: 'screw', tubeD: 18 }]],
      test: [{ band: 'cord', cordD: 4 }, { anchors: 8, travel: 10 }, { setScrew: false }, { mount: 'tube' }],
    },
    adapter: {
      label: 'Thread adapter', title: 'Stand thread adapter',
      blurb: 'Join any mix of 5/8″, 3/8″ and 1/4″ threads, male or female, or make a sleeve insert that shrinks a 5/8″ clip to 3/8″.',
      groups: [
        { title: 'Ends', open: true, items: [
          S('astyle', 'Adapter style', [['stack', 'Two ends with a grip between'], ['insert', 'Sleeve insert (thread inside a thread)']], 'stack'),
          S('aT', 'End A thread', THREAD_OPTS, '38', { hint: 'For an insert, End A is the outside thread.' }),
          S('aG', 'End A', [['female', 'Female (hole)'], ['male', 'Male (stud)']], 'female', { show: s => s.astyle === 'stack' }),
          R('aLen', 'End A length', 4, 25, 0.5, 10, 'mm'),
          S('bT', 'End B thread', THREAD_OPTS, '58', { hint: 'For an insert, End B is the inside thread.' }),
          S('bG', 'End B', [['female', 'Female (hole)'], ['male', 'Male (stud)']], 'male', { show: s => s.astyle === 'stack' }),
          R('bLen', 'End B length', 4, 25, 0.5, 10, 'mm', { show: s => s.astyle === 'stack' }),
          R('fitT', 'Thread clearance', 0.05, 0.6, 0.05, 0.25, 'mm', { hint: 'Female threads grow and male threads shrink by this much.' }),
        ] },
        { title: 'Body', open: true, items: [
          S('gstyle', 'Grip', [['hex', 'Hex (fits a spanner)'], ['knurl', 'Knurled'], ['round', 'Plain round'], ['wings', 'Wings (thumb screw)']], 'knurl', { show: s => s.astyle === 'stack' }),
          R('gripH', 'Grip height', 3, 40, 0.5, 8, 'mm', { show: s => s.astyle === 'stack', hint: 'Make it long to use the adapter as a stand extension.' }),
          R('gripD', 'Grip Ø', 0, 50, 0.5, 0, 'mm', { show: s => s.astyle === 'stack', hint: '0 sizes it to the threads.' }),
          R('wall', 'Wall around female threads', 2, 6, 0.1, 3, 'mm', { show: s => s.astyle === 'stack' }),
          B('flange', 'Collar on top', true, { show: s => s.astyle === 'insert' }),
          B('slot', 'Screwdriver slot', true, { show: s => s.astyle === 'insert' }),
        ] },
        { title: 'Colours', items: [C('colMain', 'Adapter', '#f3662e')] },
      ],
      presets: [['EU stand → US clip', { aT: '38', aG: 'female', bT: '58', bG: 'male' }], ['US stand → EU clip', { aT: '58', aG: 'female', bT: '38', bG: 'male' }],
        ['5/8″ → 3/8″ insert', { astyle: 'insert', aT: '58', bT: '38', aLen: 10 }], ['Camera on a mic stand', { aT: '58', aG: 'female', bT: '14', bG: 'male', bLen: 7 }],
        ['Stand extension', { aT: '58', aG: 'female', bT: '58', bG: 'male', gripH: 30, gstyle: 'round' }]],
      test: [{ aG: 'male', bG: 'female' }, { aG: 'male', bG: 'male', gstyle: 'hex' }, { aG: 'female', bG: 'female', gstyle: 'wings' }, { astyle: 'insert', flange: false, slot: false }, { astyle: 'insert', aT: '38', bT: '58' }, { gripD: 40 }],
    },
    cable: {
      label: 'Cable clip', title: 'Stand cable clip',
      blurb: 'Keeps XLR and USB cables tidy along a stand or boom. Snap-on, bolt-on or zip-tie mounts, for one to four cables.',
      groups: [
        { title: 'Stand', open: true, items: [
          R('tubeD', 'Tube Ø', 10, 45, 0.5, 20, 'mm', { hint: 'Measure the stand or boom.' }),
          S('cmount', 'Mount', [['snap', 'Snap on'], ['screw', 'Bolt clamp (M4)'], ['strap', 'Zip tie or hook-and-loop strap']], 'snap'),
          R('grip', 'Snap opening', 60, 95, 1, 82, '%', { show: s => s.cmount === 'snap' }),
          R('tieW', 'Strap width', 2.5, 12, 0.1, 4.8, 'mm', { show: s => s.cmount === 'strap' }),
          R('tieT', 'Strap thickness', 1, 3, 0.1, 1.4, 'mm', { show: s => s.cmount === 'strap' }),
        ] },
        { title: 'Cables', open: true, items: [
          R('cables', 'Cables', 1, 4, 1, 1, ''),
          R('cableD', 'Cable Ø', 3, 14, 0.1, 6.5, 'mm', { hint: 'XLR is usually 6–7 mm, USB about 4 mm.' }),
          S('holder', 'Holder', [['hook', 'Snap-in hook'], ['loop', 'Closed loop (thread the cable through)']], 'hook'),
          R('hookOpen', 'Hook opening', 50, 95, 1, 75, '%', { show: s => s.holder === 'hook', hint: 'Share of the cable Ø.' }),
        ] },
        { title: 'Size', items: [
          R('width', 'Clip width', 5, 30, 0.5, 10, 'mm'),
          R('wall', 'Wall', 1.6, 5, 0.1, 2.6, 'mm'),
          R('copies', 'Copies', 1, 12, 1, 4, ''),
        ] },
        { title: 'Colours', items: [C('colMain', 'Clips', '#1182c9')] },
      ],
      presets: [['Single XLR', {}], ['Two cables', { cables: 2 }], ['Thin boom arm', { tubeD: 16, width: 8 }], ['Zip-tie mount', { cmount: 'strap' }], ['Bolt clamp, 3 cables', { cmount: 'screw', cables: 3, tubeD: 25 }]],
      test: [{ holder: 'loop' }, { cables: 4, cableD: 14 }, { cmount: 'strap', tieW: 12, tieT: 3 }, { cmount: 'screw', width: 5 }, { copies: 1 }],
    },
    pop: {
      label: 'Pop filter', title: 'Pop filter',
      blurb: 'A fabric hoop that traps nylon mesh between two rings (single or double layer), or a fully printed grille, on a hinged arm.',
      groups: [
        { title: 'Filter', open: true, items: [
          R('ringD', 'Filter Ø', 70, 180, 1, 130, 'mm', { hint: 'The open area the voice passes through. A 6″ filter is about 150 mm.' }),
          S('mesh', 'Filter type', [['fabric', 'Fabric hoop (nylon mesh or stocking)'], ['grille', 'Printed grille']], 'fabric'),
          S('layers', 'Layers', [['1', 'Single'], ['2', 'Double with an air gap']], '1', { show: s => s.mesh === 'fabric' }),
          R('innerH', 'Ring height', 4, 15, 0.5, 6, 'mm'),
          R('rWall', 'Ring wall', 2, 5, 0.1, 2.8, 'mm'),
          R('fabricFit', 'Fabric allowance', 0.2, 1.5, 0.05, 0.6, 'mm', { show: s => s.mesh === 'fabric', hint: 'Gap between the rings that grips the fabric. Thicker fabric needs more.' }),
          R('gap', 'Air gap', 3, 15, 0.5, 6, 'mm', { show: s => s.mesh === 'fabric' && s.layers === '2' }),
          R('hole', 'Grille hole', 1.5, 5, 0.1, 2.5, 'mm', { show: s => s.mesh === 'grille' }),
          R('bar', 'Grille bar', 0.6, 1.6, 0.05, 0.8, 'mm', { show: s => s.mesh === 'grille', hint: 'About two line widths.' }),
        ] },
        { title: 'Arm', open: true, items: [
          R('armL', 'Arm length', 15, 150, 1, 50, 'mm'),
          R('armW', 'Arm width', 6, 20, 0.5, 10, 'mm'),
          R('armT', 'Arm thickness', 4, 12, 0.5, 7, 'mm'),
          S('popMount', 'Arm ends in', [['hinge', 'Hinged mount'], ['goose', 'Gooseneck socket']], 'hinge'),
          R('gooseD', 'Gooseneck Ø', 5, 14, 0.1, 9, 'mm', { show: s => s.popMount === 'goose', hint: 'The socket grips it with an M3 set screw.' }),
        ] },
        mountGroup('tube', { show: s => s.popMount === 'hinge' }), hingeGroup({ show: s => s.popMount === 'hinge' }), colours('Filter', 'Mount'),
      ],
      presets: [['6″ fabric filter', { ringD: 150 }], ['Double layer', { layers: '2' }], ['Printed grille', { mesh: 'grille', ringD: 110 }], ['Gooseneck', { popMount: 'goose' }], ['On the stand thread', { mount: '58' }]],
      test: [{ mesh: 'grille', hole: 5, bar: 1.6 }, { layers: '2', gap: 15 }, { popMount: 'goose', gooseD: 14 }, { mount: 'screw' }, { armL: 150 }],
    },
    phone: {
      label: 'Phone mount', title: 'Phone mount for a mic stand',
      blurb: 'A slide-in phone cradle sized to your phone and case, on a hinged mount for any stand, boom or tripod screw.',
      groups: [
        { title: 'Phone', open: true, items: [
          S('orient', 'Hold the phone', [['p', 'Upright (portrait)'], ['l', 'Sideways (landscape)']], 'p'),
          R('phoneW', 'Phone width with case', 55, 100, 0.5, 76, 'mm', { show: s => s.orient === 'p' }),
          R('phoneL', 'Phone length with case', 110, 190, 0.5, 152, 'mm', { show: s => s.orient === 'l' }),
          R('phoneT', 'Phone thickness with case', 6, 18, 0.1, 11, 'mm'),
          R('fit', 'Fit allowance', 0, 2, 0.1, 0.6, 'mm'),
        ] },
        { title: 'Cradle', open: true, items: [
          R('holdH', 'Cradle height', 12, 70, 0.5, 30, 'mm'),
          R('lip', 'Front lip', 1.5, 8, 0.1, 3, 'mm', { hint: 'How far the lips reach over the screen edge.' }),
          R('wall', 'Wall', 2, 5, 0.1, 2.6, 'mm'),
          B('ledge', 'Bottom ledge', true),
          B('port', 'Charging cable slot', true, { show: s => s.ledge }),
          R('portW', 'Slot width', 8, 30, 0.5, 14, 'mm', { show: s => s.ledge && s.port }),
        ] },
        mountGroup('tube'), hingeGroup(), colours('Cradle', 'Mount'),
      ],
      presets: [['Upright phone', {}], ['Sideways', { orient: 'l', holdH: 40 }], ['Rugged case', { phoneW: 84, phoneT: 16 }], ['Tripod screw', { mount: '14' }], ['Stand thread', { mount: '58' }]],
      test: [{ ledge: false }, { port: false }, { orient: 'l', phoneL: 190 }, { mount: 'screw' }, { lip: 8, wall: 5 }],
    },
  },

  async build(K, p) {
    const warn = [], info = { facts: [], lines: [] };
    const soft = (cs, r = 0.5) => cs.offset(r, 'Round').offset(-2 * r, 'Round').offset(r, 'Round');
    const parts = [];
    const hinge = () => {
      const [hD, af, nh, name] = BOLTS[p.bolt], tabR = hD / 2 + 3.2, eT = Math.max(p.earT, p.nutTrap ? nh + 1.6 : 2.4), gap = p.kT + p.hingeFit;
      return { hD, af, nh, name, tabR, eT, gap, span: gap + 2 * eT };
    };

    /* the tab on the accessory: grows from the back wall (y = yb, going −y) to a rounded end with the bolt hole */
    const tab = (h, { yb0, yi0, yb1 = yb0, yi1 = yi0, L }) => {
      const yh = Math.min(yb0, yb1) - (h.tabR + 2.5), zc = Math.max(h.tabR, L / 2);
      const sl = (yb, yi, z) => K.box(p.kT, Math.max(0.2, Math.abs(yi - yb)), 0.01).translate([0, (yb + yi) / 2, z]);
      const t = K.hull([sl(yb0, yi0, 0), sl(yb1, yi1, L - 0.01), K.cyl(h.tabR, p.kT).rotate([0, 90, 0]).translate([-p.kT / 2, yh, zc])]);
      return { m: t, hole: K.cyl(h.hD / 2, p.kT + 2).rotate([0, 90, 0]).translate([-p.kT / 2 - 1, yh, zc]) };
    };

    /* a tube clamp outline centred on the origin: 'tube' = snap C opening +x, 'screw' = split ring with lugs at +x */
    const clamp2D = (kind, tubeD, wall, grip) => {
      const r = tubeD / 2 + 0.15, ro = r + wall, lugL = 10, lugT = 5.5;
      let cs = K.circle(ro).subtract(K.circle(r));
      if (kind === 'screw') {
        for (const s of [-1, 1]) cs = cs.add(K.rect(wall + lugL, lugT).translate([r + (wall + lugL) / 2, s * (1 + lugT / 2)]));
        cs = cs.subtract(K.circle(r));
        cs = cs.subtract(K.rect(ro + lugL, 2).translate([r - 0.5 + (ro + lugL) / 2, 0]));
      } else if (kind === 'tube') cs = cs.subtract(K.rect(ro * 2, tubeD * grip / 100).translate([ro, 0]));
      return { cs: soft(cs, 0.4), r, ro, lugX: ro + lugL / 2, lugY: 1 + lugT };
    };
    const clampBolt = (m, c, W) => {       // M4 through the lugs, nut pocket on one side
      m = m.subtract(K.cyl(2.2, c.lugY * 2 + 2).rotate([90, 0, 0]).translate([c.lugX, c.lugY + 1, W / 2]));
      return m.subtract(K.cyl(7 / 2 / Math.cos(Math.PI / 6), 3.4, 6).rotate([90, 0, 0]).translate([c.lugX, c.lugY + 0.01, W / 2]));
    };

    /* the mount with the hinge fork */
    const mountPart = (h) => {
      const pair = (anchor, hx, hz) => {
        let m = null;
        for (const s of [-1, 1]) {
          const yc = s * (h.gap / 2 + h.eT / 2);
          const e = K.hull([anchor(yc), K.cyl(h.tabR, h.eT).rotate([90, 0, 0]).translate([hx, yc + h.eT / 2, hz])]);
          m = m ? m.add(e) : e;
        }
        return { m, cut: (b) => {
          b = b.subtract(K.cyl(h.hD / 2, h.span + 2).rotate([90, 0, 0]).translate([hx, h.span / 2 + 1, hz]));
          if (p.nutTrap) b = b.subtract(K.cyl(h.af / 2 / Math.cos(Math.PI / 6), h.nh + 0.3, 6).rotate([90, 0, 0]).translate([hx, h.span / 2 + 0.01, hz]));
          return b;
        } };
      };
      let base;
      if (isThread(p.mount)) {
        const [label, maj, pitch] = THREADS[p.mount];
        const bossR = maj / 2 + p.fitT + 3.2, bH = p.depth + 2.5;
        base = K.hull([K.cyl(bossR, bH), K.box(2 * h.tabR, h.span, 3).translate([0, 0, bH - 3])]);
        const f = pair(yc => K.box(2 * h.tabR, h.eT, 0.5).translate([0, yc, bH - 0.5]), 0, bH + h.tabR + 2);
        base = f.cut(base.add(f.m));
        base = base.subtract(K.threadHole({ major: maj, pitch, length: p.depth, clearance: p.fitT }));
        base = base.subtract(K.cyl(maj / 2 + p.fitT + 0.8, 1.2, 0, maj / 2 + p.fitT - 0.4).translate([0, 0, -0.01]));
        info.lines.push(`The mount screws onto a ${label} stud. Print it standing up (as shown) so the thread comes out clean.`);
      } else {
        const W = Math.max(p.clampW, 2 * h.tabR + 1), c = clamp2D(p.mount, p.tubeD, 3.2, p.grip);
        base = K.extrude(c.cs, W);
        const f = pair(yc => K.box(0.8, h.eT, W).translate([-(c.ro - 1.2), yc, 0]), -(c.ro + h.tabR + 2), W / 2);
        base = f.cut(base.add(f.m));
        if (p.mount === 'screw') { base = clampBolt(base, c, W); info.lines.push('Tighten the tube clamp with an M4 × 16 bolt and nut.'); }
        else if (p.grip > 90) warn.push('A snap opening over 90% barely grips. Try 80–85%.');
      }
      info.facts.push(`${h.name} × ${boltLen(h.span + h.nh + 1)} mm hinge bolt`);
      return base;
    };
    const addHinged = (label, main, t, h, mainName = 'main', nested = null) => {
      const m = main.add(t.m).subtract(t.hole);
      parts.push({ name: mainName, label, m, colorKey: 'colMain', color: p.colMain });
      if (nested) parts.push(nested);
      parts.push({ name: 'mount', label: 'Mount', m: mountPart(h), colorKey: 'colMount', color: p.colMount });
      info.lines.push(`Push the tab into the fork, add the bolt and nut, set the angle and tighten.`);
    };

    /* ---------------- modes ---------------- */
    if (p.mode === 'clip') {
      const h = hinge(), r = p.micD / 2, w = p.wall, L = p.clipL;
      const taper = p.style === 'taper', k = taper ? Math.min(1, p.micD2 / p.micD) : 1;
      if (taper && p.micD2 >= p.micD) warn.push('The narrow end is not narrower than the wide end, so the clip is straight.');
      let cs = K.circle(r + w, 128).subtract(K.circle(r, 128));
      if (p.style !== 'ring') {
        const a0 = 90 - p.open / 2, pts = [[0, 0]];
        for (let i = 0; i <= 16; i++) { const a = (a0 + p.open * i / 16) * D2R; pts.push([(r + w + 5) * 2 * Math.cos(a), (r + w + 5) * 2 * Math.sin(a)]); }
        cs = cs.subtract(K.poly(pts));
        const chord = 2 * r * Math.sin(p.open / 2 * D2R);
        if (p.open >= 180 || chord > p.micD * 0.93) warn.push(`The opening (${chord.toFixed(1)} mm) is almost as wide as the mic, so it will not hold it. Use a smaller opening.`);
        else if (chord < p.micD * 0.68) warn.push(`The opening (${chord.toFixed(1)} mm) is narrow for a ${p.micD} mm mic. It will be hard to snap in unless you print in PETG or TPU.`);
        info.facts.push(`${chord.toFixed(1)} mm opening`);
      }
      if (p.ribs) for (let a = 0; a < 360; a += 30) {
        const rel = ((a - 90 + 540) % 360) - 180;
        if (p.style !== 'ring' && Math.abs(rel) < p.open / 2 + 8) continue;
        cs = cs.add(K.circle(1, 16).translate([r * Math.cos(a * D2R), r * Math.sin(a * D2R)]));
      }
      cs = soft(cs, 0.3);
      let clip = K.extrude(cs, L, { scaleTop: [k, k] });
      if (p.style === 'ring' && p.setScrew) clip = clip.subtract(K.cyl(1.4, w + 3, 20).rotate([-90, 0, 0]).translate([0, r - 1, L / 2]));
      const t = tab(h, { yb0: -(r + w), yi0: -(r + 0.3), yb1: -(r + w) * k, yi1: -(r + 0.3) * k, L });
      addHinged('Clip', clip, t, h, 'clip');
      info.facts.push(`${p.micD} mm mic`);
      info.lines.push(p.style === 'ring' ? 'Slide the mic through the ring, then snug the set screw.' : 'Print the clip standing up (as shown) so the C flexes along its layers instead of splitting them. PETG flexes best.');
    }

    else if (p.mode === 'shock') {
      const h = hinge(), ri = p.micD / 2 + 0.15, w = p.wall, ro = ri + w + p.travel, H = p.ringH, n = p.anchors;
      const hook = (rad, dir) => {                // a T-hook (bands) or eyelet (cord) growing from radius rad in direction dir (+1 out, −1 in)
        if (p.band === 'cord') {
          const e = p.cordD / 2 + 1.6, c = rad + dir * (e - 0.4);
          return { add: K.circle(e, 32).translate([c, 0]).add(K.rect(e * 1.6, e).translate([rad + dir * (e / 2 - 0.4), 0])), cut: K.circle(p.cordD / 2 + 0.25, 24).translate([c, 0]) };
        }
        const stem = K.rect(4.5, 3).translate([rad + dir * 2, 0]), cap = K.rect(2, 8).translate([rad + dir * 4.8, 0]);
        return { add: stem.add(cap), cut: null };
      };
      const ringWith = (r0, r1, rad, dir, off) => {
        let cs = K.circle(r1, 128).subtract(K.circle(r0, 128)); const cuts = [];
        for (let i = 0; i < n; i++) { const a = off + 360 * i / n, hk = hook(rad, dir); cs = cs.add(hk.add.rotate(a)); if (hk.cut) cuts.push(hk.cut.rotate(a)); }
        for (const c of cuts) cs = cs.subtract(c);
        return soft(dir > 0 ? cs.subtract(K.circle(r0, 128)) : cs, 0.3);
      };
      let inner = K.extrude(ringWith(ri, ri + w, ri + w - 0.3, 1, 90), H);
      if (p.setScrew) inner = inner.subtract(K.cyl(1.4, w + 3, 20).rotate([-90, 0, 0]).translate([0, ri - 1, H / 2]));
      const outer = K.extrude(ringWith(ro, ro + w, ro + 0.3, -1, 90 + 180 / n), H);
      const reach = p.band === 'cord' ? 2 * (p.cordD + 3.2) : 11;
      if (p.travel < reach) warn.push(`The float gap is tight for these anchors. Raise it to at least ${Math.ceil(reach)} mm.`);
      const t = tab(h, { yb0: -(ro + w), yi0: -(ro + 0.3), L: H });
      addHinged('Outer ring', outer, t, h, 'outer', { name: 'inner', label: 'Inner ring', m: inner, colorKey: 'colMain', color: p.colMain, nest: true });
      info.facts.push(`${p.micD} mm mic`, `${n} anchors`);
      info.lines.push(p.band === 'cord' ? 'Lace elastic cord in a zigzag between the inner and outer eyelets, pull it evenly tight and knot it.'
        : 'Stretch rubber bands or hair ties from each inner hook to the two nearest outer hooks so the inner ring floats centred.');
      info.lines.push('The rings print nested together (as shown) in one go.');
    }

    else if (p.mode === 'adapter') {
      const T = (k) => THREADS[k], fit = p.fitT;
      if (p.astyle === 'insert') {
        let oT = p.aT, iT = p.bT;
        if (T(oT)[1] < T(iT)[1]) { [oT, iT] = [iT, oT]; warn.push('End A must be the larger (outside) thread for an insert, so the two were swapped.'); }
        if (oT === iT) warn.push('Both threads are the same size, so an insert cannot fit one inside the other. Pick two different threads.');
        const [, oM, oP] = T(oT), [, iM, iP] = T(iT), L = p.aLen;
        const wallMin = (oM - fit) / 2 - 0.6134 * oP - (iM / 2 + fit);
        if (wallMin < 1.2) warn.push(`The wall between the threads would only be ${Math.max(0, wallMin).toFixed(1)} mm. Use the two-ended adapter for this pair instead.`);
        let m = K.thread({ major: oM - fit, pitch: oP, length: L });
        let top = L;
        if (p.flange) { m = m.add(K.cyl(oM / 2 + 2.2, 2).translate([0, 0, L - 0.01])); top = L + 2; }
        if (oT !== iT) m = m.subtract(K.thread({ major: iM + 2 * fit, pitch: iP, length: top + 1, lead: false }).translate([0, 0, -0.5]));
        if (p.slot) m = m.subtract(K.box(p.flange ? oM + 5 : oM, 1.4, 1.2).translate([0, 0, top - 1.19]));
        parts.push({ name: 'adapter', label: 'Insert', m, colorKey: 'colMain', color: p.colMain });
        info.facts.push(`${T(oT)[0].split(' ')[0]} outside`, `${T(iT)[0].split(' ')[0]} inside`);
        info.lines.push('Screw the insert into the clip with a flat screwdriver in the slot. Print in PETG or PA for strength.');
      } else {
        const ends = [[p.aT, p.aG, p.aLen], [p.bT, p.bG, p.bLen]];
        const bodyD = ([k, g]) => g === 'female' ? T(k)[1] + 2 * fit + 2 * p.wall : T(k)[1] + 2;
        const gD = Math.max(p.gripD, bodyD(ends[0]), bodyD(ends[1]) + (p.gstyle === 'hex' ? 0 : 0), 10);
        if (p.gripD && p.gripD < Math.max(bodyD(ends[0]), bodyD(ends[1]))) warn.push(`The grip was widened to ${gD.toFixed(1)} mm to fit around the threads.`);
        const section = ([k, g, len], z0, up) => {
          const [, maj, pitch] = T(k);
          if (g === 'male') {
            let m = K.thread({ major: maj - fit, pitch, length: len });
            return up ? m.translate([0, 0, z0]) : m.rotate([180, 0, 0]).translate([0, 0, z0]);
          }
          return K.cyl(bodyD([k, g]) / 2, len).translate([0, 0, up ? z0 : z0 - len]);
        };
        const holeOf = ([k, g, len], zEnd, up) => {    // female hole entering from the open end
          const [, maj, pitch] = T(k);
          let hl = K.thread({ major: maj + 2 * fit, pitch, length: len + 0.5, lead: false });
          const ch = K.cyl(maj / 2 + fit + 0.8, 1.2, 0, maj / 2 + fit - 0.4);
          hl = hl.add(ch.translate([0, 0, -0.01]));
          return up ? hl.rotate([180, 0, 0]).translate([0, 0, zEnd + 0.01]) : hl.translate([0, 0, zEnd - 0.01]);
        };
        const [A, Bn] = ends, zg0 = A[2], zg1 = A[2] + p.gripH;
        let grip;
        if (p.gstyle === 'hex') grip = K.cyl(gD / 2 / Math.cos(Math.PI / 6), p.gripH, 6);
        else if (p.gstyle === 'knurl') {
          const n = Math.max(12, Math.round(gD * Math.PI / 2.4)); let cs = K.circle(gD / 2, n * 4);
          for (let i = 0; i < n; i++) cs = cs.subtract(K.circle(0.6, 12).translate([gD / 2 * Math.cos(i / n * Math.PI * 2), gD / 2 * Math.sin(i / n * Math.PI * 2)]));
          grip = K.extrude(cs, p.gripH);
        } else if (p.gstyle === 'wings') grip = K.cyl(gD / 2, p.gripH).add(K.extrude(K.rrect(gD * 2.6, Math.max(4, gD * 0.35), 2), p.gripH));
        else grip = K.cyl(gD / 2, p.gripH);
        grip = grip.translate([0, 0, zg0]);
        let m = grip.add(section(A, zg0, false)).add(section(Bn, zg1, true));
        if (A[1] === 'female') m = m.subtract(holeOf(A, 0, false));
        if (Bn[1] === 'female') m = m.subtract(holeOf(Bn, zg1 + Bn[2], true));
        if (A[1] === 'female' && Bn[1] === 'female' && p.gripH < 3) warn.push('Two female ends need at least 3 mm of grip between them.');
        // print with a female end (or the wider end) on the bed
        if (A[1] === 'male' && Bn[1] === 'female') m = m.rotate([180, 0, 0]);
        parts.push({ name: 'adapter', label: 'Adapter', m, colorKey: 'colMain', color: p.colMain });
        const nm = ([k, g]) => `${g} ${T(k)[0].split(' ')[0]}`;
        info.facts.push(`${nm(A)} → ${nm(Bn)}`);
        if (A[1] === 'male' && Bn[1] === 'male') info.lines.push('Both ends are studs, so one prints standing on its thread. Slow the first layers down or add a brim.');
        info.lines.push('Printed threads are strong enough for mics, clips and phones. For heavy cameras use PETG or PA and 100% infill.');
      }
    }

    else if (p.mode === 'cable') {
      const r = p.tubeD / 2 + 0.15, w = p.wall, cr = p.cableD / 2 + 0.2, n = p.cables;
      const strap = p.cmount === 'strap';
      const ws = strap ? Math.max(w, p.tieT + 2.4) : w;
      const W = strap ? Math.max(p.width, p.tieW + 3) : p.cmount === 'screw' ? Math.max(p.width, 8) : p.width;
      if (W > p.width) info.lines.push(`The clip was made ${W} mm wide to fit the ${strap ? 'strap' : 'bolt'}.`);
      let outer, inner = [];
      if (strap) {                                   // saddle that sits on the tube, strap runs through it
        const ro = r + ws;
        outer = K.circle(ro, 128).intersect(K.rect(ro, ro * 2).translate([-ro / 2 - r * 0.3, 0]));
        inner.push(K.circle(r, 128));
      } else {
        const c = clamp2D(p.cmount === 'screw' ? 'screw' : 'tube', p.tubeD, w, p.grip);
        outer = c.cs; inner.push(K.circle(r, 128));
      }
      const ro = r + ws, xc = -(ro + cr + w - 0.6), span = (n - 1) * (2 * cr + w);
      const centres = Array.from({ length: n }, (_, i) => [xc, -span / 2 + i * (2 * cr + w)]);
      let holders = K.CS.hull([K.rect(1, Math.min(span + 2 * cr, 2 * ro * 0.8)).translate([-(r + ws * 0.5), 0]), ...centres.map(([x, y]) => K.circle(cr + w, 48).translate([x, y]))]);
      for (const [x, y] of centres) {
        inner.push(K.circle(cr, 48).translate([x, y]));
        if (p.holder === 'hook') inner.push(K.rect(cr + w + 2, p.cableD * p.hookOpen / 100).translate([x - (cr + w + 2) / 2, y]));
      }
      let cs = outer.add(holders);
      for (const c of inner) cs = cs.subtract(c);
      if (!strap && p.cmount !== 'screw') cs = cs.subtract(K.rect(ro * 2, p.tubeD * p.grip / 100).translate([ro, 0]));
      cs = soft(cs, 0.4);
      let m = K.extrude(cs, W);
      if (strap) m = m.subtract(K.box(p.tieT + 0.3, ro * 4, p.tieW + 0.5).translate([-(r + 0.9 + (p.tieT + 0.3) / 2), 0, (W - p.tieW - 0.5) / 2]));
      if (p.cmount === 'screw') m = clampBolt(m, clamp2D('screw', p.tubeD, w, p.grip), W);
      if (p.holder === 'hook' && p.hookOpen > 92) warn.push('A hook opening over 92% will let the cable fall out.');
      if (p.cmount === 'snap' && p.grip > 90) warn.push('A snap opening over 90% barely grips the tube.');
      const copies = Array.from({ length: p.copies }, () => m);
      const b0 = K.bb(m), cols = Math.ceil(Math.sqrt(p.copies)), laid = K.layout(copies, 5, cols * (b0.w + 5) - 1);
      parts.push({ name: 'clips', label: p.copies > 1 ? `${p.copies} clips` : 'Clip', m: K.union(laid), colorKey: 'colMain', color: p.colMain });
      info.facts.push(`${p.tubeD} mm tube`, `${n} × ${p.cableD} mm cable`);
      info.lines.push(strap ? `Thread a ${p.tieW} mm zip tie or strap through the tunnel and round the tube.` : p.cmount === 'screw' ? 'Close the clamp with an M4 × 16 bolt and nut.' : 'Snap the clip onto the tube, then press the cable into the hook.');
    }

    else if (p.mode === 'pop') {
      const D = p.ringD, w = p.rWall, fabric = p.mesh === 'fabric', two = fabric && p.layers === '2';
      const iH = p.innerH, lipT = 1.2;
      let ring, outerR;
      if (fabric) {
        const iOD = D + 2 * w, oID = iOD + 2 * p.fabricFit, oOD = oID + 2 * w;
        outerR = oOD / 2;
        const H = lipT + (two ? 2 * iH + p.gap : iH) + 0.4;
        ring = K.cyl(oOD / 2, H, 160).subtract(K.cyl(oID / 2, H + 1, 160).translate([0, 0, lipT])).subtract(K.cyl(oID / 2 - 1.6, H + 2, 160).translate([0, 0, -1]));
        const innerRing = K.cyl(iOD / 2, iH, 160).subtract(K.cyl(D / 2, iH + 2, 160).translate([0, 0, -1]));
        parts.push({ name: 'inner', label: two ? 'Inner rings' : 'Inner ring', m: two ? K.union(K.layout([innerRing, innerRing], 6, 400)) : innerRing, colorKey: 'colMain', color: p.colMain });
        if (two) parts.push({ name: 'spacer', label: 'Spacer ring', m: K.cyl(iOD / 2, p.gap, 160).subtract(K.cyl(D / 2 + 1, p.gap + 2, 160).translate([0, 0, -1])), colorKey: 'colMount', color: p.colMount });
        info.lines.push(two ? 'Stretch mesh over each inner ring, drop one in, then the spacer, then the second: the air gap between layers stops more plosives.'
          : 'Stretch nylon mesh (an old stocking works) over the inner ring and press it into the outer ring. Trim the excess.');
      } else {
        const gT = Math.max(1.2, 3 * (p.nozzle || 0.4)), pitch = p.hole + p.bar, H = iH + lipT;
        outerR = D / 2 + w;
        let bars = [];
        for (let x = -D / 2 - pitch; x <= D / 2 + pitch; x += pitch) bars.push(K.rect(p.bar, D + 4).translate([x, 0]));
        const grid = K.CS.union(bars).intersect(K.circle(D / 2 + 0.5, 160));
        ring = K.cyl(outerR, H, 160).subtract(K.cyl(D / 2, H + 2, 160).translate([0, 0, -1]));
        ring = ring.add(K.extrude(grid, gT / 2)).add(K.extrude(grid.rotate(90), gT / 2).translate([0, 0, gT / 2]));
        if (p.bar < 2 * (p.nozzle || 0.4)) warn.push(`Grille bars thinner than two line widths (${(2 * (p.nozzle || 0.4)).toFixed(1)} mm) may not print.`);
        info.lines.push('The grille prints as two crossed layers of bars. Print the first layers slowly.');
        info.facts.push(`${p.hole} mm holes`);
      }
      // arm, lying flat, running −y from the ring
      const aY0 = -(outerR - 1), aY1 = -(outerR + p.armL);
      let main = ring.add(K.extrude(K.rect(p.armW, aY0 - aY1).translate([0, (aY0 + aY1) / 2]), p.armT));
      if (p.popMount === 'goose') {
        const s = p.gooseD + 7, bl = Math.max(16, p.gooseD * 1.8);
        let blk = K.box(s, bl, s).translate([0, aY1 - bl / 2 + 0.5, 0]);
        blk = blk.subtract(K.cyl(p.gooseD / 2 + 0.15, bl, 48).rotate([90, 0, 0]).translate([0, aY1 + 0.5 - 3, s / 2]));
        blk = blk.subtract(K.cyl(1.4, s, 16).translate([0, aY1 - bl / 2, s / 2]));   // M3 set screw from the top
        main = main.add(blk);
        parts.unshift({ name: 'filter', label: 'Filter ring', m: main, colorKey: 'colMain', color: p.colMain });
        info.lines.push(`Push a ${p.gooseD} mm gooseneck into the socket and lock it with a self-tapping M3 screw.`);
      } else {
        const h = hinge();
        const t = tab(h, { yb0: aY1 + 0.5, yi0: aY1 + 3, L: p.armT });
        const m = main.add(t.m).subtract(t.hole);
        parts.unshift({ name: 'filter', label: 'Filter ring', m, colorKey: 'colMain', color: p.colMain });
        parts.push({ name: 'mount', label: 'Mount', m: mountPart(h), colorKey: 'colMount', color: p.colMount });
        info.lines.push('Push the tab into the fork, add the bolt, tilt the filter to face the mic and tighten.');
      }
      info.facts.push(`${D} mm filter`);
      info.lines.push('Set the filter 5–10 cm in front of the mic.');
    }

    else if (p.mode === 'phone') {
      const h = hinge(), span = (p.orient === 'l' ? p.phoneL : p.phoneW) + p.fit, dT = p.phoneT + p.fit, w = p.wall, backT = Math.max(w, 3);
      const oW = span + 2 * w, oD = backT + dT + w;
      let cs = K.rect(oW, oD).translate([0, (dT + w - backT) / 2]);
      cs = cs.subtract(K.rect(span, dT).translate([0, dT / 2]));
      cs = cs.subtract(K.rect(Math.max(4, span - 2 * p.lip), w + 2).translate([0, dT + w / 2]));
      cs = soft(cs, 0.6);
      let m = K.extrude(cs, p.holdH);
      if (p.ledge) {
        let floor = soft(K.rect(oW, oD).translate([0, (dT + w - backT) / 2]), 0.6);
        if (p.port) floor = floor.subtract(K.rect(Math.min(p.portW, span - 6), dT + w + 2).translate([0, (dT + w + 2) / 2 + 1.2]));
        m = m.add(K.extrude(floor, 2.4));
      }
      if (p.lip > span * 0.3) warn.push('The front lips cover a lot of the screen.');
      const t = tab(h, { yb0: -backT, yi0: -0.4, L: p.holdH });
      addHinged('Cradle', m, t, h, 'cradle');
      info.facts.push(`${span.toFixed(1)} × ${dT.toFixed(1)} mm pocket`);
      info.lines.push('Slide the phone in from the top. Measure with the case on; if it is tight, raise the fit allowance.');
    }

    // lay the parts out in a row on the bed; nested parts keep their place inside the one before
    let x = 0, prev = null;
    for (const pt of parts) {
      if (pt.nest && prev) { pt.m = pt.m.translate(prev); delete pt.nest; continue; }
      const b = K.bb(pt.m); prev = [x - b.min[0], -(b.min[1] + b.max[1]) / 2, -b.min[2]];
      pt.m = pt.m.translate(prev); x += b.w + 8;
    }
    return { parts, warn, info };
  },
};
