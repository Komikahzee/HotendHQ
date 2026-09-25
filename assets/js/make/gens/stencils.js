/* Stencils: text, images and letter sets, with bridges added so islands (the middle of O, A, B…) stay in. */
import { R, S, B, X, U, F } from '../core.js?v=95f6f46afd';

const bridgeItems = () => [
  B('bridges', 'Add bridges to islands', true, { hint: 'Keeps the middles of letters like O, A, B, D, P, R, Q, 4, 6, 8, 9 attached to the stencil.' }),
  R('bridgeW', 'Bridge width', 0.6, 6, 0.1, 1.6, 'mm', { show: s => s.bridges, hint: 'At least 2–3 nozzle widths so they print solid.' }),
  S('bridgeDir', 'Bridge direction', [['v', 'Vertical'], ['h', 'Horizontal'], ['both', 'Both (cross)']], 'v', { show: s => s.bridges }),
];
const plateItems = (def = {}) => [
  R('margin', 'Margin around the design', 3, 60, 0.5, def.margin ?? 12, 'mm'),
  R('thick', 'Thickness', 0.4, 4, 0.1, def.thick ?? 1.2, 'mm', { hint: '0.8–1.2 mm is flexible enough to sit flat on curved surfaces.' }),
  R('radius', 'Corner radius', 0, 20, 0.5, 4, 'mm'),
  R('rim', 'Stiffening rim', 0, 4, 0.1, 0, 'mm', { hint: 'A raised edge that stops big stencils curling. 0 for none.' }),
  B('hole', 'Hanging hole', true),
  B('tab', 'Pull tab', false, { hint: 'A tab on one side to lift the stencil without smudging.' }),
];

export default {
  id: 'stencils', title: 'Stencils', usesBed: true, usesNozzle: true,
  file: (s) => `stencil-${s.mode === 'image' ? 'image' : s.mode === 'set' ? 'letters' : (s.text || 'text')}`,
  modes: {
    text: {
      label: 'Text', title: 'Text stencil', icon: '<path d="M4 6h16M12 6v13M8 19h8"/>',
      blurb: 'Words and names for paint, spray, chalk or etching cream. Letters with islands get bridges automatically.',
      groups: [
        { title: 'Text', open: true, items: [
          X('text', 'Text', 'HOBBY\nROOM', { multiline: true, rows: 3, max: 200 }),
          F('font', 'Font', 'inter'),
          R('size', 'Letter size (capital height)', 5, 200, 0.5, 30, 'mm'),
          R('spacing', 'Letter spacing', -0.05, 0.8, 0.01, 0.08, 'em', { hint: 'A little extra spacing keeps thin plate between letters strong.' }),
          R('lineH', 'Line spacing', 0.8, 2.5, 0.05, 1.3, '×'),
          S('align', 'Alignment', [['center', 'Centre'], ['left', 'Left'], ['right', 'Right']], 'center'),
        ] },
        { title: 'Bridges', open: true, items: bridgeItems() },
        { title: 'Stencil plate', open: true, items: plateItems() },
      ],
      presets: [
        ['Bold word', { text: 'HOBBY\nROOM', font: 'inter', size: 30 }],
        ['Spray paint', { text: 'FRAGILE', font: 'blackops', size: 40, bridges: false, thick: 1.6, rim: 1 }],
        ['Army style', { text: 'CRATE 07', font: 'stencil', size: 35, bridges: false }],
        ['Script name', { text: 'Olivia', font: 'pacifico', size: 30, bridgeW: 1.4 }],
        ['House number', { text: '128', font: 'bebas', size: 120, margin: 20, thick: 1.6 }],
      ],
    },
    image: {
      label: 'Image', title: 'Image or shape stencil', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 5 5 3-3 5 5"/><circle cx="15" cy="9" r="1.6"/>',
      blurb: 'Upload a logo or drawing, or pick a shape. Dark areas are cut out; islands get bridges.',
      groups: [
        { title: 'Design', open: true, items: [
          S('shape', 'Design', [['upload', 'Your image…'], ['star', 'Star'], ['heart', 'Heart'], ['circle', 'Circle'], ['hex', 'Hexagon'], ['moon', 'Crescent moon'], ['ring', 'Ring (needs bridges)']], 'star'),
          U('img', 'Upload an image', { show: s => s.shape === 'upload', hint: 'Traced on your device and never uploaded. High-contrast images work best.' }),
          R('size', 'Design size', 10, 300, 1, 80, 'mm'),
          B('mirror', 'Mirror it', false, { hint: 'For etching glass from the back, or reverse stencilling.' }),
        ] },
        { title: 'Bridges', open: true, items: bridgeItems() },
        { title: 'Stencil plate', open: true, items: plateItems() },
      ],
      test: [{ shape: 'ring' }, { shape: 'moon' }],
      presets: [['Star', { shape: 'star' }], ['Heart', { shape: 'heart' }], ['Ring', { shape: 'ring' }], ['Crescent moon', { shape: 'moon' }], ['Your image', { shape: 'upload' }]],
    },
    set: {
      label: 'Letter set', title: 'Letter set', icon: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
      blurb: 'One small stencil per character, laid out as a set. Combine them to spell anything.',
      groups: [
        { title: 'Characters', open: true, items: [
          X('chars', 'Characters', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', { max: 80, hint: 'Every character gets its own tile.' }),
          F('font', 'Font', 'inter'),
          R('size', 'Letter size', 5, 80, 0.5, 20, 'mm'),
          R('tile', 'Tile margin', 2, 20, 0.5, 5, 'mm'),
          R('gap', 'Gap between tiles', 1, 10, 0.5, 3, 'mm'),
        ] },
        { title: 'Bridges', open: true, items: bridgeItems() },
        { title: 'Tiles', items: [
          R('thick', 'Thickness', 0.4, 4, 0.1, 1.2, 'mm'),
          R('radius', 'Corner radius', 0, 10, 0.5, 2, 'mm'),
          B('notch', 'Alignment notches', true, { hint: 'Small notches at the baseline so letters line up when you stencil a word.' }),
        ] },
      ],
      presets: [['A–Z', { chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }], ['0–9', { chars: '0123456789' }], ['a–z', { chars: 'abcdefghijklmnopqrstuvwxyz' }]],
    },
  },

  async build(K, p, ctx) {
    const warn = [], info = { facts: [], lines: [] };
    const minBridge = p.nozzle * 2;
    if (p.bridges && p.bridgeW < minBridge) warn.push(`Bridges of ${p.bridgeW} mm are under two lines with a ${p.nozzle} mm nozzle and may not print. Try ${minBridge.toFixed(1)} mm or more.`);
    if (p.thick < 0.6) warn.push('Stencils under 0.6 mm are very fragile. Handle them gently.');
    const bridged = (cut) => { const r = addBridges(K, cut, p); if (r.n) info.facts.push(`${r.n} bridge${r.n > 1 ? 's' : ''} added`); if (r.islandsLeft) warn.push(`${r.islandsLeft} island${r.islandsLeft > 1 ? 's' : ''} would fall out. Turn on bridges or use a stencil font.`); return r.cs; };

    if (p.mode === 'set') {
      const font = await ctx.font(p.font);
      const chars = [...new Set([...String(p.chars || '').replace(/\s/g, '')])].slice(0, 80);
      if (!chars.length) return { parts: [], warn: ['Type the characters you want.'] };
      const glyphs = chars.map(ch => K.text(font, ch, { size: p.size })).filter(Boolean);
      const maxW = Math.max(...glyphs.map(g => K.size2(g)[0]));
      const tw = maxW + 2 * p.tile, th = p.size * 1.35 + 2 * p.tile;         // same tile for every letter so they line up
      const tiles = [];
      let total = 0, lost = 0;
      for (const g of glyphs) {
        const b = g.bounds();
        let cut = g.translate([-(b.min[0] + b.max[0]) / 2, -p.size / 2 + p.size * 0.12]);   // baseline at a fixed height in every tile
        const r = addBridges(K, p.bridges ? cut : { noBridge: true, cs: cut }, p); total += r.n; cut = r.cs;
        if (r.islandsLeft) lost += r.islandsLeft;
        let plate = K.rrect(tw, th, p.radius);
        if (p.notch) { const v = K.poly([[-1.2, 0], [1.2, 0], [0, 1.6]]); const by = -p.size / 2 + p.size * 0.12; plate = plate.subtract(v.rotate(-90).translate([-tw / 2, by])).subtract(v.rotate(90).translate([tw / 2, by])); }
        tiles.push(K.extrude(plate.subtract(cut), p.thick));
      }
      if (total) info.facts.push(`${total} bridges`);
      if (lost) warn.push(`${lost} island${lost > 1 ? 's' : ''} would fall out. Turn on bridges or use a stencil font.`);
      const laid = K.layout(tiles, p.gap, Math.max(60, p.bedX - 10));
      info.facts.unshift(`${tiles.length} tiles`);
      info.lines.push('Tape the stencil down or use repositionable spray adhesive, and dab paint straight down with a stiff brush or sponge.');
      return { parts: [{ name: 'tiles', label: 'Letter tiles', m: K.union(laid), color: '#f3662e' }], warn, info };
    }

    let cut;
    if (p.mode === 'image') {
      const r = p.size / 2;
      switch (p.shape) {
        case 'upload':
          if (!p.polys || !p.polys.length) return { parts: [], warn: ['Upload an image, or pick a shape.'] };
          cut = K.fit(K.polys(p.polys), p.size, p.size); break;
        case 'star': cut = K.star(5, r, r * 0.42); break;
        case 'heart': cut = K.heart(p.size); break;
        case 'circle': cut = K.circle(r); break;
        case 'hex': cut = K.regular(6, r, 30); break;
        case 'moon': cut = K.circle(r).subtract(K.circle(r * 0.85).translate([r * 0.45, r * 0.2])); break;
        case 'ring': cut = K.circle(r).subtract(K.circle(r * 0.6)); break;
      }
      if (p.mirror) cut = cut.mirror([1, 0]);
    } else {
      const font = await ctx.font(p.font);
      cut = K.text(font, p.text, { size: p.size, spacing: p.spacing, align: p.align, lineHeight: p.lineH / 1.35 });
      if (!cut) return { parts: [], warn: ['Type some text.'] };
    }
    cut = K.center2(cut);
    cut = p.bridges ? bridged(cut) : bridged({ noBridge: true, cs: cut }) ;
    const [cw, ch] = K.size2(cut);
    let W = cw + 2 * p.margin, H = ch + 2 * p.margin;
    let plate = K.rrect(W, H, p.radius);
    if (p.hole) { const hr = Math.max(2.5, Math.min(5, p.margin / 3)); plate = plate.subtract(K.circle(hr).translate([-W / 2 + p.margin / 2 + 0.5, H / 2 - p.margin / 2 - 0.5])); }
    if (p.tab) plate = plate.add(K.rrect(24, 18, 6).translate([W / 2 + 6, 0]));
    let m = K.extrude(plate.subtract(cut), p.thick);
    if (p.rim > 0) { const inner = K.rrect(W - 2 * Math.min(4, p.margin / 2), H - 2 * Math.min(4, p.margin / 2), Math.max(0, p.radius - 2)); m = m.add(K.extrude(K.rrect(W, H, p.radius).subtract(inner), p.rim).translate([0, 0, p.thick])); }
    info.facts.unshift(`${Math.round(W)} × ${Math.round(H)} mm`);
    info.lines.push('Print the stencil flat with 0.2 mm layers. PETG bends without cracking; PLA stays flatter.');
    info.lines.push('Tape it down or use repositionable spray adhesive, and dab paint straight down so it doesn\'t creep under the edges.');
    return { parts: [{ name: 'stencil', label: 'Stencil', m, color: '#f3662e' }], warn, info };
  },
};

/** Cut region → the same region with bridge strips removed wherever it would free an island.
    An island is any hole inside a cut component: the plate inside an O, the triangle in an A. */
export function addBridges(K, cut, p) {
  if (cut.noBridge) { const cs = cut.cs; return { cs, n: 0, islandsLeft: countIslands(cs) }; }
  let n = 0, cs = cut;
  const comps = cut.decompose();
  const strips = [];
  for (const comp of comps) {
    const polys = comp.toPolygons();
    const cb = comp.bounds();
    for (const poly of polys) {
      if (area(poly) >= 0) continue;                         // outer outline (anticlockwise) – not an island
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (p.bridgeDir === 'v' || p.bridgeDir === 'both') strips.push(K.rect(p.bridgeW, cb.max[1] - cb.min[1] + 2).translate([cx, (cb.min[1] + cb.max[1]) / 2]));
      if (p.bridgeDir === 'h' || p.bridgeDir === 'both') strips.push(K.rect(cb.max[0] - cb.min[0] + 2, p.bridgeW).translate([(cb.min[0] + cb.max[0]) / 2, cy]));
      n++;
    }
  }
  if (strips.length) cs = cut.subtract(K.CS.union(strips));
  return { cs, n, islandsLeft: countIslands(cs) };
}
function countIslands(cs) { let k = 0; for (const comp of cs.decompose()) for (const poly of comp.toPolygons()) if (area(poly) < 0) k++; return k; }
function area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
