/* Fidget spinners (bearing or print-in-place) and spinner rings. */
import { R, S, B, C, D2R } from '../core.js?v=95f6f46afd';

// ball bearings: outer Ø, bore, width (mm)
const BEARINGS = { '608': [22, 8, 7], '688': [16, 8, 5], 'R188': [12.7, 6.35, 4.762], '626': [19, 6, 6], '6000': [26, 10, 8] };
// weights: [pocket Ø, thickness each, shape]
const WEIGHTS = { b608: [22, 7, 'round'], b688: [16, 5, 'round'], nutM8: [13, 6.5, 'hex'], nutM6: [10, 5, 'hex'], penny: [19.05, 1.52, 'round'],
  nickel: [21.21, 1.95, 'round'], quarter: [24.26, 1.75, 'round'], euro2: [25.75, 2.2, 'round'], euro1: [23.25, 2.33, 'round'], solid: [0, 0, 'none'], custom: [0, 0, 'round'] };
const WEIGHT_OPTS = [['b608', '608 bearing (22 mm)'], ['b688', '688 bearing (16 mm)'], ['nutM8', 'M8 hex nut'], ['nutM6', 'M6 hex nut'], ['penny', 'US penny'],
  ['nickel', 'US nickel'], ['quarter', 'US quarter'], ['euro1', '€1 coin'], ['euro2', '€2 coin'], ['solid', 'None (solid plastic)'], ['custom', 'Custom round weight']];

const bodyGroups = () => [
  { title: 'Shape', open: true, items: [
    R('arms', 'Arms', 1, 8, 1, 3, ''),
    S('style', 'Arm style', [['lobes', 'Round lobes'], ['bar', 'Straight bars'], ['ring', 'Lobes joined by a ring'], ['star', 'Pointed star'], ['tri', 'Rounded body'], ['wing', 'Swept wings']], 'lobes'),
    R('armR', 'Arm length (centre to weight)', 15, 60, 0.5, 28, 'mm'),
    R('wall', 'Wall around pockets', 1.2, 6, 0.1, 2.4, 'mm'),
    R('edge', 'Rounded edges', 0, 3, 0.1, 1.2, 'mm'),
  ] },
  { title: 'Weights', open: true, items: [
    S('weight', 'Weight in each arm', WEIGHT_OPTS, 'b608', { hint: 'Heavier weights far from the middle spin longer.' }),
    R('wD', 'Weight Ø', 5, 30, 0.1, 20, 'mm', { show: s => s.weight === 'custom' }),
    R('wT', 'Weight thickness', 1, 12, 0.1, 5, 'mm', { show: s => s.weight === 'custom' }),
    R('coins', 'Coins per pocket', 1, 6, 1, 3, '', { show: s => ['penny', 'nickel', 'quarter', 'euro1', 'euro2'].includes(s.weight) }),
    R('wFit', 'Weight fit', -0.2, 0.5, 0.05, 0.1, 'mm', { hint: 'Added to the pocket. Lower for a tighter press fit.' }),
  ] },
];

export default {
  id: 'fidget-spinners', title: 'Fidget spinners', usesBed: false,
  file: (s) => `fidget-${s.mode}`,
  modes: {
    bearing: {
      label: 'Bearing spinner', title: 'Spinner with a bearing', icon: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="4.5" r="2.5"/><circle cx="5.5" cy="16" r="2.5"/><circle cx="18.5" cy="16" r="2.5"/>',
      blurb: 'The classic: a skateboard-style bearing in the middle and weights in the arms. Includes the two finger caps.',
      groups: [
        { title: 'Centre bearing', open: true, items: [
          S('bearing', 'Bearing', [['608', '608 (22 × 8 × 7 mm, skateboard)'], ['688', '688 (16 × 8 × 5 mm)'], ['R188', 'R188 (12.7 × 6.35 × 4.76 mm)'], ['626', '626 (19 × 6 × 6 mm)'], ['6000', '6000 (26 × 10 × 8 mm)']], '608'),
          R('fit', 'Bearing fit', -0.2, 0.5, 0.05, 0.05, 'mm', { hint: 'Added to the hole. 0 to 0.1 mm is a press fit on most printers.' }),
          R('thick', 'Body thickness', 4, 14, 0.1, 7, 'mm', { hint: 'Usually the bearing width.' }),
        ] },
        ...bodyGroups(),
        { title: 'Finger caps', items: [
          B('caps', 'Include two finger caps', true),
          R('capD', 'Cap Ø', 12, 30, 0.5, 20, 'mm', { show: s => s.caps }),
          R('capT', 'Cap thickness', 1.2, 5, 0.1, 2.2, 'mm', { show: s => s.caps }),
          S('capStyle', 'Cap shape', [['dish', 'Dished (finger rests)'], ['flat', 'Flat'], ['dome', 'Domed']], 'dish', { show: s => s.caps }),
          R('capFit', 'Cap shaft fit', -0.3, 0.2, 0.05, -0.1, 'mm', { show: s => s.caps, hint: 'Negative is a tighter fit in the bearing bore.' }),
        ] },
        { title: 'Colours', items: [C('colBody', 'Body', '#1182c9'), C('colCap', 'Caps', '#f3662e')] },
      ],
      presets: [['Classic tri', { arms: 3, style: 'lobes', weight: 'b608' }], ['Coin spinner', { arms: 3, weight: 'quarter', coins: 4, style: 'ring' }],
        ['Bar spinner', { arms: 2, style: 'bar', weight: 'nutM8', armR: 32 }], ['Star', { arms: 5, style: 'star', weight: 'penny', coins: 4, armR: 30 }], ['Mini', { bearing: '688', thick: 5, weight: 'b688', armR: 20 }]],
      test: [{ weight: 'custom' }, { weight: 'penny' }, { style: 'bar' }],
    },
    pip: {
      label: 'No bearing', title: 'Print-in-place spinner', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
      blurb: 'No bearing needed: the centre hub prints already trapped inside the body on a V-shaped track, with a gap all round.',
      groups: [
        { title: 'Hub', open: true, items: [
          R('hubD', 'Hub Ø', 14, 30, 0.5, 20, 'mm'),
          R('thick', 'Body thickness', 6, 14, 0.1, 8, 'mm'),
          R('gap', 'Gap', 0.2, 0.8, 0.05, 0.4, 'mm', { hint: 'Clearance around the hub. Raise it if the hub is stuck after printing.' }),
          B('dimple', 'Finger dimples in the hub', true),
        ] },
        ...bodyGroups(),
        { title: 'Colours', items: [C('colBody', 'Body', '#1182c9'), C('colCap', 'Hub', '#f3662e')] },
      ],
      presets: [['Tri spinner', { arms: 3 }], ['Solid swirl', { arms: 4, style: 'wing', weight: 'solid' }], ['Coin ring', { arms: 3, style: 'ring', weight: 'nickel', coins: 3 }]],
      test: [{ weight: 'solid' }],
    },
    ring: {
      label: 'Spinner ring', title: 'Spinner ring', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/>',
      blurb: 'A worry ring: an outer band spins freely around the inner band. Prints as one piece.',
      groups: [
        { title: 'Ring', open: true, items: [
          S('sizeBy', 'Size by', [['us', 'US ring size'], ['mm', 'Inside diameter']], 'us'),
          R('usSize', 'US size', 3, 15, 0.5, 9, '', { show: s => s.sizeBy === 'us' }),
          R('innerD', 'Inside diameter', 14, 24, 0.1, 19, 'mm', { show: s => s.sizeBy === 'mm' }),
          R('width', 'Band width', 5, 14, 0.5, 8, 'mm'),
          R('gap', 'Gap', 0.2, 0.7, 0.05, 0.35, 'mm'),
          S('texture', 'Outer band', [['plain', 'Plain'], ['grooves', 'Grooves'], ['ribs', 'Ribbed'], ['beads', 'Beaded']], 'grooves'),
        ] },
        { title: 'Colours', items: [C('colBody', 'Inner band', '#23262b'), C('colCap', 'Outer band', '#d6a93a')] },
      ],
      presets: [['Size 7', { usSize: 7 }], ['Size 10 wide', { usSize: 10, width: 10 }]],
      test: [{ sizeBy: 'mm' }],
    },
  },

  async build(K, p) {
    const warn = [], info = { facts: [], lines: [] };
    if (p.mode === 'ring') return ring(K, p, info);
    // ---- the body outline
    const W = WEIGHTS[p.weight] || WEIGHTS.solid;
    let wD = p.weight === 'custom' ? p.wD : W[0], wT = p.weight === 'custom' ? p.wT : W[1];
    const coin = ['penny', 'nickel', 'quarter', 'euro1', 'euro2'].includes(p.weight);
    if (coin) wT = W[1] * p.coins;
    const pocketR = wD / 2 + p.wFit;
    let centreR;
    if (p.mode === 'bearing') { const [od] = BEARINGS[p.bearing]; centreR = od / 2 + p.fit + p.wall + 1; }
    else centreR = p.hubD / 2 + p.gap + 1.2 + p.wall;
    const lobeR = (wD ? pocketR : 7) + p.wall;
    const T = p.thick;
    if (wD && p.armR < centreR + lobeR - p.wall) { warn.push('Arms are too short for these weights: they were lengthened.'); p.armR = centreR + lobeR - p.wall + 1; }
    const n = p.arms, arm = (i) => (90 + 360 * i / n) * D2R;
    const centre = K.circle(centreR, 96);
    let body = centre;
    for (let i = 0; i < n; i++) {
      const a = arm(i), x = p.armR * Math.cos(a), y = p.armR * Math.sin(a);
      const lobe = K.circle(lobeR, 96).translate([x, y]);
      let piece;
      if (p.style === 'bar') piece = K.rect(p.armR, lobeR * 1.2).translate([p.armR / 2, 0]).rotate(a / D2R).add(lobe);
      else if (p.style === 'star') piece = K.poly([[0, -centreR * 0.8], [p.armR + lobeR * 1.2, 0], [0, centreR * 0.8]]).rotate(a / D2R).add(lobe);
      else if (p.style === 'wing') { const sw = K.poly(Array.from({ length: 21 }, (_, k) => { const t = k / 20, r = t * p.armR, th = t * 0.6; return [r * Math.cos(th), r * Math.sin(th) + lobeR * (1 - t) * 0.9]; }).concat(Array.from({ length: 21 }, (_, k) => { const t = 1 - k / 20, r = t * p.armR, th = t * 0.6; return [r * Math.cos(th), r * Math.sin(th) - lobeR * 0.9 * (1 - t) - 2]; }))); piece = K.CS.hull([centre, lobe]).intersect(K.circle(p.armR + lobeR, 96)).add(sw.rotate(a / D2R - 17)); }
      else piece = K.CS.hull([centre, lobe]);
      body = body.add(piece);
    }
    if (p.style === 'tri') body = K.CS.hull([centre, ...Array.from({ length: n }, (_, i) => K.circle(lobeR, 64).translate([p.armR * Math.cos(arm(i)), p.armR * Math.sin(arm(i))]))]);
    if (p.style === 'ring') body = body.add(K.circle(p.armR + lobeR * 0.45, 128).subtract(K.circle(p.armR - lobeR * 0.45, 128)));
    if (p.style === 'lobes' && n > 1) { // soften the joins between lobes
      body = body.offset(2, 'Round').offset(-2, 'Round');
    }
    // ---- holes
    let hole2 = null;
    if (p.mode === 'bearing') hole2 = K.circle(BEARINGS[p.bearing][0] / 2 + p.fit, 96);
    let m = K.softSlab(body, T, p.edge);
    const pockets = [];
    for (let i = 0; i < n; i++) {
      const a = arm(i), x = p.armR * Math.cos(a), y = p.armR * Math.sin(a);
      if (!wD) continue;
      const shape = W[2] === 'hex' ? K.regular(6, pocketR / Math.cos(Math.PI / 6), 0) : K.circle(pocketR, 96);
      const depth = Math.min(wT + 0.1, T + 1);
      if (wT >= T - 0.4) pockets.push(K.extrude(shape, T + 2).translate([x, y, -1]));              // through
      else pockets.push(K.extrude(shape, depth + 0.01).translate([x, y, T - depth]));                // blind, from the top
    }
    if (wT > T + 0.01) warn.push(`The weights (${wT.toFixed(1)} mm) are thicker than the body (${T} mm) and will stick out.`);
    if (hole2) pockets.push(K.extrude(hole2, T + 2).translate([0, 0, -1]));
    if (pockets.length) m = m.subtract(K.union(pockets));
    const parts = [];
    let hub = null;
    if (p.mode === 'pip') {
      // V-track: the body has a ridge pointing in; the hub has a matching groove, with a gap all round
      const rh = p.hubD / 2, g = Math.min(2, T / 3), c = p.gap;
      const hubProf = [[0, 0], [rh, 0], [rh, T / 2 - g], [rh - g, T / 2], [rh, T / 2 + g], [rh, T], [0, T]];
      // the hole is the hub's profile grown by the gap in every direction (so the gap is true on the slopes too)
      const cut = K.poly(hubProf).offset(c, 'Miter', 4).intersect(K.poly([[0, -2], [rh + 5, -2], [rh + 5, T + 2], [0, T + 2]]));
      m = m.subtract(K.revolve(cut, 96));
      hub = K.revolve(K.poly(hubProf), 96);
      if (p.dimple) { const dr = rh * 0.7, sag = Math.min(1.2, T / 5), R = (dr * dr + sag * sag) / (2 * sag); hub = hub.subtract(K.sphere(R, 96).translate([0, 0, T + R - sag])); }
      info.lines.push('Print as one piece with no supports. When it comes off the bed, twist the hub firmly once to break any strands.');
    }
    parts.push({ name: 'body', label: 'Body', m, colorKey: 'colBody', color: p.colBody });
    if (hub) parts.push({ name: 'hub', label: 'Hub', m: hub, colorKey: 'colCap', color: p.colCap });
    if (p.mode === 'bearing' && p.caps) {
      const [od, bore, bw] = BEARINGS[p.bearing];
      const cap = () => {
        let c = K.softSlab(K.circle(p.capD / 2, 64), p.capT, Math.min(0.8, p.capT / 3));
        if (p.capStyle === 'dish') { const sag = Math.min(0.8, p.capT - 0.8), rr = p.capD * 0.35, R = (rr * rr + sag * sag) / (2 * sag); c = c.subtract(K.sphere(R, 64).translate([0, 0, p.capT + R - sag])); }
        if (p.capStyle === 'dome') c = c.add(K.sphere(p.capD / 2, 64).scale([1, 1, 0.18]).intersect(K.cyl(p.capD / 2, p.capD, 64)).translate([0, 0, p.capT]));
        const spacer = K.cyl(bore / 2 + 1.2, 0.5, 48).translate([0, 0, -0.5]);            // stops the cap rubbing the outer race
        const shaft = K.cyl(bore / 2 + p.capFit, bw / 2 - 0.4, 48).translate([0, 0, -0.5 - (bw / 2 - 0.4)]);
        return K.onBed(c.add(spacer).add(shaft).rotate([180, 0, 0]), false);
      };
      const off = Math.max(...m.boundingBox().max) + p.capD / 2 + 6;
      parts.push({ name: 'caps', label: 'Finger caps', m: K.union([cap().translate([off, -p.capD / 2 - 3, 0]), cap().translate([off, p.capD / 2 + 3, 0])]), colorKey: 'colCap', color: p.colCap });
      info.lines.push('Press the bearing in from one side, then push a cap into each side of the bearing\'s centre.');
    }
    if (wD && p.weight !== 'solid') info.lines.push(coin ? `Stack ${p.coins} coins in each pocket; a drop of glue keeps them in.` : 'Press the weights in after printing. A small clamp or vise helps.');
    info.facts.push(`${n} arm${n > 1 ? 's' : ''}`);
    return { parts, warn, info };
  },
};

function ring(K, p, info) {
  const ri = (p.sizeBy === 'us' ? 11.63 + 0.8128 * p.usSize : p.innerD) / 2;
  const H = p.width, g = Math.min(0.9, H / 6), c = p.gap, ti = 1.3, to = 1.3;
  const r1 = ri + ti;                                                     // inner band outer surface
  const inner = [[ri, 0], [r1, 0], [r1, H / 2 - g], [r1 + g, H / 2], [r1, H / 2 + g], [r1, H], [ri, H]];
  const ro0 = r1 + c, ro1 = ro0 + g + to;                                 // outer band
  // the outer band's inside is the inner band's profile grown by the gap
  const grown = K.poly(inner).offset(c, 'Miter', 4);
  const outerCS = K.poly([[ri, 0], [ro1, 0], [ro1, H], [ri, H]]).subtract(grown);
  let band = K.revolve(K.poly(inner), 128);
  let outerBand = K.revolve(outerCS, 128);
  if (p.texture === 'grooves') for (const z of [H * 0.25, H * 0.75]) outerBand = outerBand.subtract(K.revolve(K.poly([[ro1 - 0.4, z - 0.4], [ro1 + 1, z - 0.4], [ro1 + 1, z + 0.4], [ro1 - 0.4, z + 0.4]]), 128));
  if (p.texture === 'ribs') { const ribs = []; const n = Math.round(2 * Math.PI * ro1 / 2.2); for (let i = 0; i < n; i++) ribs.push(K.box(0.7, 1.4, H - 1.2).translate([ro1, 0, 0.6]).rotate([0, 0, 360 * i / n])); outerBand = outerBand.subtract(K.union(ribs)); }
  if (p.texture === 'beads') { const beads = []; const n = Math.round(2 * Math.PI * ro1 / 2.6); for (let i = 0; i < n; i++) beads.push(K.sphere(0.9, 16).translate([ro1, 0, H / 2]).rotate([0, 0, 360 * i / n])); outerBand = outerBand.add(K.union(beads)); }
  info.facts.push(`inside Ø ${(ri * 2).toFixed(1)} mm`);
  info.lines.push('Print flat as one piece. Twist the outer band firmly once after printing to free it.');
  info.lines.push('Ring sizes vary by maker: measure a ring that fits you if you can, and choose Inside diameter.');
  return { parts: [{ name: 'inner', label: 'Inner band', m: band, colorKey: 'colBody', color: p.colBody }, { name: 'outer', label: 'Outer band', m: outerBand, colorKey: 'colCap', color: p.colCap }], warn: [], info };
}
