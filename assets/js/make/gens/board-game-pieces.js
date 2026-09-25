/* Board game pieces: tokens and coins, pawns, meeples, resource bits and card stands — as whole sets. */
import { R, S, B, X, C, F, D2R } from '../core.js?v=95f6f46afd';

const PLAYER_COLS = ['#d63b32', '#1182c9', '#3e9b4f', '#f5c542', '#7a4fc9', '#f2f4f7', '#23262b', '#f3662e'];
const playerItems = (defN = 4, defEach = 4, max = 20) => [
  R('players', 'Players (colours)', 1, 8, 1, defN, '', { hint: 'Each player is its own object in the 3MF, so it can print in its own colour.' }),
  R('each', 'Pieces per player', 1, max, 1, defEach, ''),
  ...PLAYER_COLS.map((c, i) => C('col' + (i + 1), `Player ${i + 1} colour`, c, { show: s => s.players > i })),
];
const TOKEN_SHAPES = [['circle', 'Round coin'], ['hex', 'Hexagon'], ['square', 'Square'], ['rsquare', 'Rounded square'], ['triangle', 'Triangle'], ['octagon', 'Octagon'], ['shield', 'Shield'], ['star', 'Star'], ['heart', 'Heart']];

export default {
  id: 'board-game-pieces', title: 'Board game pieces', usesBed: true,
  file: (s) => `game-${s.mode}`,
  modes: {
    tokens: {
      label: 'Tokens', title: 'Tokens & coins', icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>',
      blurb: 'Numbered tokens, coins, damage counters and markers. Numbers can count up automatically across the set.',
      groups: [
        { title: 'Shape', open: true, items: [
          S('shape', 'Shape', TOKEN_SHAPES, 'circle'),
          R('size', 'Size', 10, 80, 0.5, 25, 'mm'),
          R('thick', 'Thickness', 1.5, 10, 0.1, 3, 'mm'),
          R('rim', 'Raised rim', 0, 3, 0.1, 0.8, 'mm', { hint: '0 for no rim. A rim protects the face and makes coins look minted.' }),
          B('stack', 'Stackable (recess underneath)', false, { hint: 'The rim of one token sits in the recess of the next.' }),
        ] },
        { title: 'Face', open: true, items: [
          S('face', 'Face', [['count', 'Numbers counting up'], ['text', 'The same text on every token'], ['list', 'A list (one per token)'], ['icon', 'Icon'], ['blank', 'Blank']], 'count'),
          R('from', 'Start at', 0, 999, 1, 1, '', { show: s => s.face === 'count' }),
          R('step', 'Count by', 1, 100, 1, 1, '', { show: s => s.face === 'count' }),
          X('prefix', 'Before the number', '', { show: s => s.face === 'count', max: 6, placeholder: 'e.g. $' }),
          X('text', 'Text', 'VP', { show: s => s.face === 'text', max: 12 }),
          X('list', 'List', 'GOLD,WOOD,STONE,FOOD', { show: s => s.face === 'list', max: 300, hint: 'Comma separated. Makes one token per item.' }),
          S('icon', 'Icon', [['star', 'Star'], ['heart', 'Heart'], ['skull', 'Skull'], ['coin', 'Coin ($)'], ['shield', 'Shield'], ['bolt', 'Lightning']], 'star', { show: s => s.face === 'icon' }),
          F('font', 'Font', 'slab', { show: s => ['count', 'text', 'list'].includes(s.face) }),
          R('textSize', 'Text size', 20, 90, 1, 50, '%', { show: s => s.face !== 'blank' }),
          S('style', 'Face style', [['raised', 'Raised'], ['engrave', 'Engraved']], 'raised', { show: s => s.face !== 'blank' }),
          R('relief', 'Raised height / engrave depth', 0.2, 2, 0.1, 0.6, 'mm', { show: s => s.face !== 'blank' }),
          B('back', 'Same face on the back', false, { show: s => s.face !== 'blank' && s.style === 'engrave' }),
        ] },
        { title: 'Set', open: true, items: [
          R('count', 'How many', 1, 60, 1, 10, '', { show: s => s.face !== 'list' }),
          R('gap', 'Gap between pieces', 2, 15, 0.5, 4, 'mm'),
          C('colToken', 'Token colour', '#d6a93a'), C('colFace', 'Face colour', '#23262b', { show: s => s.face !== 'blank' && s.style === 'raised' }),
        ] },
      ],
      presets: [
        ['Numbered 1–10', { face: 'count', from: 1, count: 10 }],
        ['Coins', { face: 'count', shape: 'circle', prefix: '$', from: 5, step: 5, count: 8, rim: 1, font: 'bebas', colToken: '#d6a93a' }],
        ['Damage counters', { face: 'icon', icon: 'skull', shape: 'hex', count: 12, colToken: '#d63b32', colFace: '#f2f4f7' }],
        ['Resources', { face: 'list', list: 'GOLD,WOOD,STONE,FOOD,WOOL,IRON', shape: 'rsquare', font: 'bebas', textSize: 36 }],
        ['Victory points', { face: 'text', text: 'VP', shape: 'star', count: 12, colToken: '#f5c542' }],
      ],
      test: [{ face: 'text' }, { face: 'list' }, { face: 'icon' }, { style: 'engrave' }],
    },
    pawns: {
      label: 'Pawns', title: 'Pawns', icon: '<circle cx="12" cy="6" r="3"/><path d="M9 20h6l-1-6h-4z"/><path d="M7 21h10"/>',
      blurb: 'Classic turned pawns in several shapes, one colour per player.',
      groups: [
        { title: 'Pawn', open: true, items: [
          S('style', 'Style', [['classic', 'Classic (ball head)'], ['cone', 'Cone'], ['peg', 'Peg'], ['chess', 'Chess pawn'], ['bishop', 'Tall with a point']], 'classic'),
          R('height', 'Height', 12, 80, 0.5, 24, 'mm'),
          R('baseD', 'Base diameter', 6, 40, 0.5, 13, 'mm'),
          R('weightD', 'Weight pocket underneath Ø', 0, 30, 0.5, 0, 'mm', { hint: '0 for none. Glue in a coin or washer so pawns don\'t tip over.' }),
          R('weightH', 'Weight pocket depth', 0.5, 6, 0.1, 1.6, 'mm', { show: s => s.weightD > 0 }),
        ] },
        { title: 'Players', open: true, items: playerItems(4, 4) },
      ],
      presets: [['Ludo set', { style: 'classic', players: 4, each: 4 }], ['Chess-style', { style: 'chess', height: 30 }], ['Tall pegs', { style: 'peg', height: 30, baseD: 10 }]],
    },
    meeples: {
      label: 'Meeples', title: 'Meeples & figures', icon: '<circle cx="12" cy="5" r="2.5"/><path d="M5 11l4-2h6l4 2-1 2-3-1v4l2 6h-4l-2-4-2 4H6l2-6v-4l-3 1z"/>',
      blurb: 'Flat worker pieces and figures, one colour per player.',
      groups: [
        { title: 'Figure', open: true, items: [
          S('figure', 'Figure', [['meeple', 'Meeple (worker)'], ['house', 'House'], ['tree', 'Tree'], ['horse', 'Knight / horse head'], ['ship', 'Ship'], ['robot', 'Robot']], 'meeple'),
          R('height', 'Height', 10, 60, 0.5, 16, 'mm'),
          R('thick', 'Thickness', 3, 20, 0.5, 8, 'mm'),
          R('round', 'Rounded edges', 0, 2, 0.1, 0.6, 'mm'),
        ] },
        { title: 'Players', open: true, items: playerItems(4, 5) },
      ],
      presets: [['Workers', { figure: 'meeple', each: 5 }], ['Villages', { figure: 'house', each: 5 }], ['Forest', { figure: 'tree', players: 1, each: 10, col1: '#3e9b4f' }]],
      test: [{ round: 0 }],
    },
    bits: {
      label: 'Bits', title: 'Cubes & resource bits', icon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
      blurb: 'Cubes, discs, cylinders and hex bits for resources, influence and scoring.',
      groups: [
        { title: 'Bit', open: true, items: [
          S('bit', 'Shape', [['cube', 'Cube'], ['disc', 'Disc'], ['cyl', 'Cylinder'], ['hex', 'Hex prism'], ['tri', 'Triangle prism'], ['bar', 'Bar / ingot'], ['gem', 'Gem']], 'cube'),
          R('size', 'Size', 4, 30, 0.5, 8, 'mm'),
          R('round', 'Rounded edges', 0, 3, 0.1, 0.8, 'mm', { show: s => s.bit === 'cube' || s.bit === 'bar' }),
        ] },
        { title: 'Players', open: true, items: playerItems(4, 10, 60) },
      ],
      presets: [['Cubes', { bit: 'cube', each: 12 }], ['Gems', { bit: 'gem', players: 5, each: 8 }], ['Ingots', { bit: 'bar', players: 3, each: 6, col1: '#d6a93a', col2: '#c9ced6', col3: '#8a5a3b' }]],
      test: [{ bit: 'bar' }],
    },
    stands: {
      label: 'Card stands', title: 'Card & standee stands', icon: '<rect x="8" y="3" width="8" height="12" rx="1"/><path d="M5 20h14l-2-4H7z"/>',
      blurb: 'Bases that hold cardboard standees or cards upright. Measure your card or board thickness.',
      groups: [
        { title: 'Stand', open: true, items: [
          S('base', 'Base shape', [['round', 'Round'], ['oval', 'Oval'], ['rect', 'Rectangle'], ['hex', 'Hexagon']], 'round'),
          R('width', 'Width', 15, 120, 0.5, 30, 'mm'),
          R('depth', 'Depth', 10, 80, 0.5, 20, 'mm', { show: s => s.base !== 'round' && s.base !== 'hex' }),
          R('baseH', 'Base height', 2, 12, 0.5, 4, 'mm'),
          R('card', 'Card / board thickness', 0.3, 4, 0.05, 1.8, 'mm', { hint: 'Standee card is usually 1.5–2 mm; playing cards about 0.3 mm.' }),
          R('fit', 'Fit', -0.2, 0.6, 0.05, 0.15, 'mm', { hint: 'Added to the slot. Lower for a tighter grip.' }),
          R('slotH', 'Slot depth', 3, 20, 0.5, 8, 'mm'),
          R('tilt', 'Lean back', 0, 20, 1, 0, '°'),
        ] },
        { title: 'Players', open: true, items: playerItems(1, 6) },
      ],
      presets: [['Standee bases', { base: 'round', card: 1.8, each: 8 }], ['Card holder', { base: 'rect', width: 70, depth: 25, card: 0.35, fit: 0.25, slotH: 10, tilt: 10, each: 2 }]],
      test: [{ base: 'oval' }],
    },
  },

  async build(K, p, ctx) {
    const warn = [], info = { facts: [], lines: [] };
    const layoutSets = (sets) => {                // sets: [{name,label,colorKey,items:[manifold…]}] → same grid, parts per set
      const all = sets.flatMap((s, si) => s.items.map(m => ({ si, m })));
      const cell = Math.max(...all.map(({ m }) => { const b = K.bb(m); return Math.max(b.w, b.d); })) + p.gap;
      const cols = Math.max(1, Math.floor((p.bedX - 10 + p.gap) / cell));
      const out = sets.map(() => []);
      all.forEach(({ si, m }, i) => { const b = K.bb(m); out[si].push(m.translate([(i % cols) * cell - (b.min[0] + b.max[0]) / 2, Math.floor(i / cols) * cell - (b.min[1] + b.max[1]) / 2, 0])); });
      if (Math.ceil(all.length / cols) * cell > p.bedY) warn.push('The whole set is bigger than your bed: print it in batches.');
      return sets.map((s, i) => ({ name: s.name, label: s.label, colorKey: s.colorKey, color: p[s.colorKey], m: K.union(out[i]) }));
    };
    p.gap = p.gap ?? 5;
    if (p.mode === 'tokens') {
      const font = ['count', 'text', 'list'].includes(p.face) ? await ctx.font(p.font) : null;
      const labels = p.face === 'list' ? String(p.list || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 60)
        : Array.from({ length: p.count }, (_, i) => p.face === 'count' ? `${p.prefix || ''}${p.from + i * p.step}` : p.face === 'text' ? p.text : '');
      if (!labels.length) return { parts: [], warn: ['Add at least one item to the list.'] };
      const outline = tokenShape(K, p.shape, p.size);
      const tokens = [], faces = [];
      const T = p.thick;
      for (const lab of labels) {
        let body = K.extrude(outline, T);
        const rw = Math.max(1, p.size * 0.07), inset = p.stack ? 0.8 : 0;
        if (p.rim > 0) {
          const ring = outline.offset(-inset, 'Round').subtract(outline.offset(-inset - rw, 'Round'));
          if (!ring.isEmpty()) body = body.add(K.extrude(ring, p.rim).translate([0, 0, T]));
          if (p.stack) {               // matching groove underneath: the rim of the token below drops into it
            const groove = outline.offset(-inset + 0.25, 'Round').subtract(outline.offset(-inset - rw - 0.25, 'Round'));
            if (T > p.rim + 1) body = body.subtract(K.extrude(groove, p.rim + 0.2).translate([0, 0, -0.01]));
          }
        }
        let face = null;
        if (p.face === 'icon') face = K.fit(tokenIcon(K, p.icon), p.size * p.textSize / 100, p.size * p.textSize / 100);
        else if (lab && font) { const t = K.text(font, lab, { size: 10 }); if (t) { const [w, h] = K.size2(t); const k = Math.min(p.size * p.textSize / 100 / h, p.size * 0.72 / w); face = K.center2(t).scale([k, k]); } }
        let top = null;
        if (face) {
          if (p.style === 'raised') top = K.extrude(face, p.relief).translate([0, 0, T]);
          else { body = body.subtract(K.extrude(face, p.relief + 0.01).translate([0, 0, T - p.relief])); if (p.back) body = body.subtract(K.extrude(face.mirror([1, 0]), p.relief + 0.01).translate([0, 0, -0.01])); }
        }
        tokens.push(body); faces.push(top);
      }
      // lay tokens + faces out on the same grid
      if (p.stack && p.rim > 0 && T <= p.rim + 1) warn.push(`Stacking needs tokens thicker than ${(p.rim + 1).toFixed(1)} mm for the groove underneath.`);
      if (p.stack && p.rim <= 0) warn.push('Stacking uses the raised rim: give the tokens a rim.');
      const cell = p.size * 1.02 + p.gap, cols = Math.max(1, Math.floor((p.bedX - 10 + p.gap) / cell));
      const at = (i) => [(i % cols) * cell, Math.floor(i / cols) * cell, 0];
      const parts = [{ name: 'tokens', label: 'Tokens', m: K.union(tokens.map((m, i) => m.translate(at(i)))), colorKey: 'colToken', color: p.colToken }];
      const fl = faces.map((m, i) => m && m.translate(at(i))).filter(Boolean);
      if (fl.length) parts.push({ name: 'faces', label: 'Numbers & icons', m: K.union(fl), colorKey: 'colFace', color: p.colFace });
      info.facts.push(`${labels.length} token${labels.length > 1 ? 's' : ''}`);
      if (fl.length) info.lines.push(`Two colours on one nozzle: change filament on the first layer above Z = ${(T + (p.rim > 0 ? 0 : 0)).toFixed(2)} mm.`);
      if (Math.ceil(labels.length / cols) * cell > p.bedY) warn.push('The whole set is bigger than your bed: print it in batches.');
      info.lines.push('Print face up. Ironing the top layer in your slicer makes coins look pressed.');
      return { parts, warn, info };
    }
    const sets = [];
    for (let pl = 0; pl < p.players; pl++) {
      const items = [];
      for (let i = 0; i < p.each; i++) {
        if (p.mode === 'pawns') items.push(pawn(K, p));
        else if (p.mode === 'meeples') items.push(meeple(K, p));
        else if (p.mode === 'bits') items.push(bit(K, p));
        else items.push(stand(K, p));
      }
      sets.push({ name: 'player' + (pl + 1), label: `Player ${pl + 1}`, colorKey: 'col' + (pl + 1), items });
    }
    const parts = layoutSets(sets);
    info.facts.push(`${p.players * p.each} pieces`);
    if (p.players > 1) info.lines.push('Each player is its own object in the 3MF. With one colour at a time, hide the others in your slicer and print in batches.');
    if (p.mode === 'stands') info.lines.push('Print a single stand first to check the grip, then adjust Fit.');
    if (p.mode === 'pawns') info.lines.push('Pawns print upright with no supports. Use 0.12–0.16 mm layers for smooth curves.');
    return { parts, warn, info };
  },
};

function tokenShape(K, shape, s) {
  const r = s / 2;
  switch (shape) {
    case 'hex': return K.regular(6, r, 30);
    case 'square': return K.rect(s * 0.9, s * 0.9);
    case 'rsquare': return K.rrect(s * 0.9, s * 0.9, s * 0.16);
    case 'triangle': return K.center2(K.regular(3, r, 90)).offset(-0.001, 'Round');
    case 'octagon': return K.regular(8, r, 22.5);
    case 'shield': return K.shield(s * 0.85, s);
    case 'star': return K.star(5, r, r * 0.55);
    case 'heart': return K.heart(s);
    default: return K.circle(r, 96);
  }
}
function tokenIcon(K, icon) {
  switch (icon) {
    case 'heart': return K.heart(10);
    case 'skull': { let h = K.circle(5, 48).add(K.rrect(6, 4, 1).translate([0, -4.5])); h = h.subtract(K.circle(1.4).translate([-2, 0.3])).subtract(K.circle(1.4).translate([2, 0.3])).subtract(K.poly([[0, -1], [0.8, -2.4], [-0.8, -2.4]])); for (const x of [-1.5, 0, 1.5]) h = h.subtract(K.rect(0.5, 2).translate([x, -5.8])); return h; }
    case 'coin': return K.circle(5, 48).subtract(K.circle(4.2, 48)).add(K.rect(1, 6)).add(K.poly([[-2.4, 1.6], [2.4, 1.6], [2.4, 2.4], [-2.4, 2.4]])).add(K.poly([[-2.4, -2.4], [2.4, -2.4], [2.4, -1.6], [-2.4, -1.6]]));
    case 'shield': return K.shield(8, 10);
    case 'bolt': return K.poly([[1, 5], [-3, -0.5], [0, -0.5], [-1, -5], [3, 0.8], [0, 0.8]]);
    default: return K.star(5, 5, 2.3);
  }
}
function pawn(K, p) {
  const H = p.height, R0 = p.baseD / 2, pts = [[0, 0]];
  const prof = {
    classic: [[1, 0], [1, 0.08], [0.85, 0.14], [0.5, 0.5], [0.42, 0.62], [0.62, 0.66], [0.62, 0.7], [0.32, 0.72]],
    cone: [[1, 0], [1, 0.06], [0.28, 0.78], [0.3, 0.8]],
    peg: [[1, 0], [1, 0.08], [0.72, 0.12], [0.5, 0.2], [0.5, 0.62], [0.58, 0.66]],
    chess: [[1, 0], [1, 0.1], [0.8, 0.14], [0.8, 0.2], [0.55, 0.26], [0.36, 0.55], [0.6, 0.6], [0.6, 0.64], [0.3, 0.66]],
    bishop: [[1, 0], [1, 0.08], [0.7, 0.14], [0.42, 0.55], [0.55, 0.6], [0.3, 0.64]],
  }[p.style];
  for (const [x, y] of prof) pts.push([x * R0, y * H]);
  let headR = { classic: 0.3, cone: 0.16, peg: 0.36, chess: 0.34, bishop: 0.3 }[p.style] * H * (p.style === 'peg' ? 1 : 0.9);
  headR = Math.min(headR, R0 * 1.05);
  const topY = pts[pts.length - 1][1];
  pts.push([0, topY]);
  let m = K.revolve(K.poly(pts), 64);
  if (p.style === 'bishop') m = m.add(K.cyl(headR * 0.9, H - topY - headR * 0.4, 48, 0.2).translate([0, 0, topY]));
  else m = m.add(K.sphere(headR, 48).translate([0, 0, Math.min(H - headR, topY + headR * 0.75)]));
  if (p.weightD > 0) m = m.subtract(K.cyl(Math.min(p.weightD / 2, R0 - 0.8), Math.min(p.weightH, H * 0.3), 48).translate([0, 0, -0.01]));
  return K.onBed(m.intersect(K.box(R0 * 4, R0 * 4, H)), false);
}
function meeple(K, p) {
  const s = p.height, fig = {
    meeple: [[-0.5, 0], [-0.18, 0], [0, 0.26], [0.18, 0], [0.5, 0], [0.32, 0.38], [0.52, 0.52], [0.46, 0.62], [0.2, 0.6], [0.2, 0.68], [0.22, 0.78], [0.14, 0.92], [0, 0.97], [-0.14, 0.92], [-0.22, 0.78], [-0.2, 0.68], [-0.2, 0.6], [-0.46, 0.62], [-0.52, 0.52], [-0.32, 0.38]],
    house: [[-0.4, 0], [0.4, 0], [0.4, 0.58], [0.5, 0.58], [0, 1], [-0.5, 0.58], [-0.4, 0.58]],
    tree: [[-0.08, 0], [0.08, 0], [0.08, 0.18], [0.42, 0.18], [0.2, 0.45], [0.34, 0.45], [0.12, 0.72], [0.24, 0.72], [0, 1], [-0.24, 0.72], [-0.12, 0.72], [-0.34, 0.45], [-0.2, 0.45], [-0.42, 0.18], [-0.08, 0.18]],
    horse: [[-0.36, 0], [0.34, 0], [0.26, 0.12], [0.16, 0.34], [0.36, 0.5], [0.4, 0.62], [0.26, 0.66], [0.06, 0.6], [0.12, 0.78], [0.02, 0.98], [-0.12, 0.86], [-0.22, 0.72], [-0.3, 0.42], [-0.24, 0.12]],
    ship: [[-0.5, 0.1], [0.5, 0.1], [0.4, 0], [-0.4, 0], [-0.5, 0.1], [-0.52, 0.22], [0.52, 0.22], [0.5, 0.1], [0.04, 0.22], [0.04, 1], [0.42, 0.34], [0.04, 0.34], [-0.04, 0.34], [-0.04, 0.9], [-0.36, 0.34], [-0.04, 0.34], [-0.04, 0.22]],
    robot: [[-0.3, 0], [-0.12, 0], [-0.12, 0.22], [0.12, 0.22], [0.12, 0], [0.3, 0], [0.3, 0.3], [0.44, 0.3], [0.44, 0.56], [0.3, 0.56], [0.3, 0.6], [0.22, 0.6], [0.22, 0.9], [0.04, 0.9], [0.04, 1], [-0.04, 1], [-0.04, 0.9], [-0.22, 0.9], [-0.22, 0.6], [-0.3, 0.6], [-0.3, 0.56], [-0.44, 0.56], [-0.44, 0.3], [-0.3, 0.3]],
  }[p.figure];
  let cs = K.poly(fig.map(([x, y]) => [x * s, y * s]));
  if (p.figure === 'ship') cs = K.poly(fig.slice(0, 4).map(([x, y]) => [x * s, y * s])).add(K.rect(0.08 * s, 0.8 * s).translate([0, 0.6 * s])).add(K.poly([[0.06 * s, 0.34 * s], [0.42 * s, 0.34 * s], [0.06 * s, 0.95 * s]])).add(K.poly([[-0.06 * s, 0.34 * s], [-0.34 * s, 0.34 * s], [-0.06 * s, 0.8 * s]])).add(K.rect(1.04 * s, 0.12 * s).translate([0, 0.16 * s]));
  if (p.figure === 'robot') cs = cs.subtract(K.circle(0.045 * s).translate([-0.09 * s, 0.76 * s])).subtract(K.circle(0.045 * s).translate([0.09 * s, 0.76 * s]));
  if (p.figure === 'house') cs = cs.subtract(K.rect(0.18 * s, 0.26 * s).translate([0, 0.13 * s + 0.001]));
  // standing up: extrude the silhouette as thickness, then stand it on its base
  const r = Math.min(p.round, p.thick / 2 - 0.3, s * 0.05);
  let m = r > 0.05 ? K.chamferSlab(cs.offset(-r, 'Round').offset(r, 'Round'), p.thick, r) : K.extrude(cs, p.thick);
  m = m.rotate([90, 0, 0]);
  return K.onBed(m, true);
}
function bit(K, p) {
  const s = p.size;
  switch (p.bit) {
    case 'disc': return K.cyl(s / 2, s * 0.35, 48);
    case 'cyl': return K.cyl(s * 0.4, s, 48);
    case 'hex': return K.extrude(K.regular(6, s / 2, 30), s * 0.55);
    case 'tri': return K.extrude(K.regular(3, s * 0.6, 90), s * 0.6);
    case 'gem': return K.onBed(K.M.hull([K.cyl(s * 0.5, 0.01, 8).translate([0, 0, s * 0.35]), K.cyl(s * 0.36, 0.01, 8).translate([0, 0, s * 0.6]), K.sphere(0.01, 6)]));
    case 'bar': { const w = s * 1.8, d = s * 0.9, h = s * 0.6, r = Math.min(p.round, h / 2 - 0.1); return K.M.hull([K.slab(w, d, 0.01, Math.min(r, d / 2 - 0.1)), K.slab(w * 0.8, d * 0.7, 0.01, Math.min(r, d * 0.35 - 0.1)).translate([0, 0, h - 0.01])]); }
    default: { const r = Math.min(p.round, s / 2 - 0.1); if (r <= 0.05) return K.box(s, s, s);
      return K.M.hull([-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => K.sphere(r, 16).translate([x * (s / 2 - r), y * (s / 2 - r), s / 2 + z * (s / 2 - r)]))))); }
  }
}
function stand(K, p) {
  const W = p.width, D = p.base === 'round' || p.base === 'hex' ? W : p.depth, H = p.baseH;
  const shape = p.base === 'round' ? K.circle(W / 2, 64) : p.base === 'oval' ? K.ellipse(W, D) : p.base === 'hex' ? K.regular(6, W / 2, 0) : K.rrect(W, D, 3);
  const base = K.chamferSlab(shape, H, Math.min(1, H / 3));
  const slotW = p.card + p.fit, slotL = W * 0.72;
  // a ridge on top of the base with a slot down its middle (0.8 mm into the base), leaning back if asked
  let post = K.slab(slotL + 4, slotW + 3.2, p.slotH, 1.2).subtract(K.box(slotL, slotW, p.slotH + 2).translate([0, 0, -0.8]));
  let slotInBase = K.box(slotL, slotW, 1).translate([0, 0, -0.8]);
  if (p.tilt) { post = post.rotate([-p.tilt, 0, 0]); slotInBase = slotInBase.rotate([-p.tilt, 0, 0]); }
  const m = base.add(post.translate([0, 0, H]).subtract(K.box(W * 3, D * 3, H).translate([0, 0, -H + 0.001]))).subtract(slotInBase.translate([0, 0, H]));
  return K.onBed(m, true);
}
