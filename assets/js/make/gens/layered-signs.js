/* Multicolour layered signs: base, border, outline and text as separate coloured parts. */
import { R, S, B, X, C, F, U, D2R } from '../core.js?v=95f6f46afd';
import { icon } from './plant-markers.js?v=a26b1208fe';

const SHAPES = [['rrect', 'Rounded rectangle'], ['rect', 'Rectangle'], ['oval', 'Oval'], ['circle', 'Circle'], ['hex', 'Hexagon'],
  ['octagon', 'Octagon'], ['shield', 'Shield'], ['arch', 'Arch (round top)'], ['banner', 'Banner (notched ends)'], ['cloud', 'Rounded blob'], ['outline', 'Cut to the text shape']];

export default {
  id: 'layered-signs', title: 'Layered signs', usesBed: false,
  file: (s) => `sign-${(s.line1 || 'sign')}`,
  modes: {
    sign: {
      label: 'Sign', title: 'Layered sign',
      blurb: 'Build a sign in layers: a base, a border, an outline around the letters, and the letters on top. Each layer is its own colour.',
      groups: [
        { title: 'Text', open: true, items: [
          X('line1', 'Main text', 'Hotend HQ', { max: 60 }),
          F('font1', 'Main font', 'lobster'),
          R('size1', 'Main text size (capital height)', 5, 120, 0.5, 26, 'mm'),
          X('line2', 'Second line (optional)', 'WORKSHOP', { max: 80 }),
          F('font2', 'Second line font', 'inter'),
          R('size2', 'Second line size', 3, 80, 0.5, 9, 'mm', { show: s => !!s.line2 }),
          R('spacing', 'Letter spacing', -0.15, 0.6, 0.01, 0, 'em'),
          R('lineGap', 'Gap between lines', 0, 40, 0.5, 5, 'mm', { show: s => !!s.line2 }),
          S('align', 'Alignment', [['center', 'Centre'], ['left', 'Left'], ['right', 'Right']], 'center'),
        ] },
        { title: 'Sign shape & size', open: true, items: [
          S('shape', 'Shape', SHAPES, 'rrect'),
          S('sizing', 'Size', [['auto', 'Fit around the text'], ['fixed', 'Fixed width and height']], 'auto'),
          R('pad', 'Space around the text', 2, 60, 0.5, 10, 'mm', { show: s => s.sizing === 'auto' }),
          R('W', 'Width', 30, 400, 1, 180, 'mm', { show: s => s.sizing === 'fixed' }),
          R('H', 'Height', 20, 400, 1, 80, 'mm', { show: s => s.sizing === 'fixed' }),
          R('radius', 'Corner radius', 0, 40, 0.5, 8, 'mm', { show: s => s.shape === 'rrect' }),
          R('baseT', 'Base thickness', 1, 10, 0.1, 3, 'mm'),
        ] },
        { title: 'Layers', open: true, items: [
          S('plan', 'Colour method', [['stack', 'Stacked: change filament by height (any printer)'], ['multi', 'Multi-material: any colour anywhere (AMS / MMU)']], 'stack',
            { hint: 'Stacked prints each colour on top of the last. Multi-material needs a printer that can switch colours mid-layer.' }),
          R('outline', 'Outline around letters', 0, 12, 0.1, 2.5, 'mm', { hint: '0 for no outline. A sticker-style edge makes text readable from across a room.' }),
          R('outlineH', 'Outline layer height', 0.2, 6, 0.1, 1, 'mm', { show: s => s.outline > 0 }),
          R('textH', 'Letter height', 0.2, 8, 0.1, 1.2, 'mm'),
          S('textMode', 'Letters', [['raised', 'Raised'], ['inlay', 'Inlaid flush in the base']], 'raised', { show: s => s.plan === 'multi' }),
          R('border', 'Border width', 0, 15, 0.1, 3, 'mm', { hint: '0 for no border.' }),
          R('borderGap', 'Border inset from edge', 0, 20, 0.1, 2, 'mm', { show: s => s.border > 0 }),
          R('borderH', 'Border height', 0.2, 6, 0.1, 1, 'mm', { show: s => s.border > 0 }),
          B('double', 'Double border', false, { show: s => s.border > 0 }),
        ] },
        { title: 'Graphic', items: [
          S('icon', 'Icon', [['none', 'None'], ['heart', 'Heart'], ['star', 'Star'], ['leaf', 'Leaf'], ['flower', 'Flower'], ['sun', 'Sun'], ['home', 'House'], ['paw', 'Paw print'], ['upload', 'Your image…']], 'none'),
          U('img', 'Upload a logo or picture', { show: s => s.icon === 'upload', hint: 'Traced on your device and never uploaded. Simple, high-contrast images work best.' }),
          S('iconPos', 'Position', [['left', 'Left of the text'], ['right', 'Right of the text'], ['above', 'Above the text']], 'left', { show: s => s.icon !== 'none' }),
          R('iconSize', 'Size', 5, 150, 0.5, 26, 'mm', { show: s => s.icon !== 'none' }),
          S('iconLayer', 'Printed as', [['text', 'Same layer as the letters'], ['outline', 'Same layer as the outline']], 'text', { show: s => s.icon !== 'none' }),
        ] },
        { title: 'Colours', items: [
          C('colBase', 'Base', '#23262b'), C('colOutline', 'Outline', '#f2f4f7', { show: s => s.outline > 0 || (s.icon !== 'none' && s.iconLayer === 'outline') }),
          C('colBorder', 'Border', '#f2f4f7', { show: s => s.border > 0 && !(s.plan === 'stack' && s.outline > 0), hint: 'With stacked colours the border prints with the outline.' }),
          C('colText', 'Letters', '#f3662e'),
        ] },
        { title: 'Mounting', items: [
          S('mount', 'Mounting', [['none', 'None'], ['keyhole', 'Two keyhole slots on the back'], ['holes', 'Two screw holes'], ['hang', 'Two hanging holes at the top'],
            ['magnets', 'Magnet pockets on the back'], ['stand', 'Desk stand (separate part)']], 'keyhole'),
          R('screwD', 'Screw size', 2.5, 6, 0.1, 4, 'mm', { show: s => ['keyhole', 'holes', 'hang'].includes(s.mount), hint: 'Shank diameter of the screw or nail.' }),
          R('magD', 'Magnet Ø', 3, 20, 0.1, 10.2, 'mm', { show: s => s.mount === 'magnets', hint: 'Add 0.2 mm to the magnet size.' }),
          R('magT', 'Magnet thickness', 1, 5, 0.1, 2.1, 'mm', { show: s => s.mount === 'magnets' }),
          R('standA', 'Stand angle', 60, 85, 1, 75, '°', { show: s => s.mount === 'stand' }),
        ] },
      ],
      presets: [
        ['Workshop sign', { line1: 'Workshop', line2: 'EST. 2026', font1: 'blackops', font2: 'inter', shape: 'banner', colBase: '#23262b', colText: '#f3662e', colOutline: '#f2f4f7', colBorder: '#f2f4f7' }],
        ['Name plate', { line1: 'Maya', line2: '', font1: 'pacifico', shape: 'outline', outline: 4, border: 0, mount: 'stand', colBase: '#1182c9', colOutline: '#f2f4f7', colText: '#e86fa6' }],
        ['House number', { line1: '42', line2: 'MAPLE STREET', font1: 'bebas', size1: 70, size2: 10, shape: 'rrect', colBase: '#f2f4f7', colText: '#23262b', colOutline: '#f2f4f7', outline: 0, colBorder: '#23262b', mount: 'holes' }],
        ['Door sign', { line1: 'Do not disturb', line2: '', font1: 'dancing', size1: 16, shape: 'oval', mount: 'hang', colBase: '#7a4fc9', colText: '#f2f4f7', colOutline: '#23262b' }],
        ['Desk badge', { line1: 'Alex', line2: 'ENGINEERING', font1: 'slab', shape: 'shield', mount: 'stand', colBase: '#1c2f6b', colText: '#d6a93a', colBorder: '#d6a93a', colOutline: '#1c2f6b', outline: 0 }],
      ],
    },
  },

  async build(K, p, ctx) {
    const warn = [], parts = [];
    const f1 = await ctx.font(p.font1), f2 = await ctx.font(p.font2);
    // ---- the text block (and graphic), centred on the origin
    let t1 = p.line1 ? K.text(f1, p.line1, { size: p.size1, spacing: p.spacing, align: p.align }) : null;
    let t2 = p.line2 ? K.text(f2, p.line2, { size: p.size2, spacing: p.spacing, align: p.align }) : null;
    if (t1) t1 = K.center2(t1); if (t2) t2 = K.center2(t2);
    const [w1, h1] = t1 ? K.size2(t1) : [0, 0], [w2, h2] = t2 ? K.size2(t2) : [0, 0];
    const blockW = Math.max(w1, w2), blockH = h1 + (t2 ? p.lineGap + h2 : 0);
    const alignX = (w) => p.align === 'left' ? (w - blockW) / 2 : p.align === 'right' ? (blockW - w) / 2 : 0;
    let letters = null;
    if (t1) letters = t1.translate([alignX(w1), blockH / 2 - h1 / 2]);
    if (t2) { const l2 = t2.translate([alignX(w2), -blockH / 2 + h2 / 2]); letters = letters ? letters.add(l2) : l2; }
    let graphic = null;
    if (p.icon !== 'none') {
      if (p.icon === 'upload') {
        if (p.polys && p.polys.length) graphic = K.fit(K.polys(p.polys), p.iconSize, p.iconSize);
        else warn.push('Upload an image to use as the graphic.');
      } else graphic = drawIcon(K, p.icon, p.iconSize);
    }
    if (graphic) {
      const [gw, gh] = K.size2(graphic);
      const gx = p.iconPos === 'left' ? -blockW / 2 - 6 - gw / 2 : p.iconPos === 'right' ? blockW / 2 + 6 + gw / 2 : 0;
      const gy = p.iconPos === 'above' ? blockH / 2 + 6 + gh / 2 : 0;
      graphic = graphic.translate([gx, gy]);
    }
    let content = letters && graphic ? letters.add(graphic) : (letters || graphic);
    if (!content) return { parts: [], warn: ['Type some text or choose a graphic.'] };
    const cb = content.bounds();
    const cx = -(cb.min[0] + cb.max[0]) / 2, cy = -(cb.min[1] + cb.max[1]) / 2;
    content = content.translate([cx, cy]); if (letters) letters = letters.translate([cx, cy]); if (graphic) graphic = graphic.translate([cx, cy]);
    const [cw, ch] = K.size2(content);
    // ---- sign outline
    const extra = p.outline + (p.border > 0 ? p.border + p.borderGap + 2 : 0);
    let W = p.sizing === 'fixed' ? p.W : cw + 2 * (p.pad + extra), H = p.sizing === 'fixed' ? p.H : ch + 2 * (p.pad + extra);
    let base2;
    switch (p.shape) {
      case 'rect': base2 = K.rect(W, H); break;
      case 'oval': W *= 1.12; H *= 1.25; base2 = K.ellipse(W, H); break;
      case 'circle': { const d = p.sizing === 'fixed' ? Math.min(W, H) : Math.hypot(cw, ch) + 2 * (p.pad + extra); W = H = d; base2 = K.circle(d / 2, 128); break; }
      case 'hex': { const r = p.sizing === 'fixed' ? Math.min(W / 2, H / 2 / Math.cos(Math.PI / 6)) : Math.max(W / 2 / Math.cos(Math.PI / 6), H / 2) * 1.08; base2 = K.regular(6, r, 0); W = 2 * r; H = 2 * r * Math.cos(Math.PI / 6); break; }
      case 'octagon': { const r = Math.max(W, H) / 2 / Math.cos(Math.PI / 8); base2 = K.regular(8, r, 22.5).scale([W / (2 * r * Math.cos(Math.PI / 8)), H / (2 * r * Math.cos(Math.PI / 8))]); break; }
      case 'shield': H *= 1.25; base2 = K.shield(W, H).translate([0, -H * 0.08]); break;
      case 'arch': H += W * 0.25; base2 = K.arch(W, H).translate([0, -W * 0.06]); break;
      case 'banner': { const n = Math.min(H * 0.35, W * 0.1); W += 2 * n; base2 = K.poly([[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2 - n, 0], [W / 2, H / 2], [-W / 2, H / 2], [-W / 2 + n, 0]]); break; }
      case 'cloud': base2 = K.rrect(W, H, Math.min(W, H) / 2); break;
      case 'outline': base2 = content.offset(p.pad + extra, 'Round'); { const b = base2.bounds(); W = b.max[0] - b.min[0]; H = b.max[1] - b.min[1]; } break;
      default: base2 = K.rrect(W, H, p.radius);
    }
    if (p.sizing === 'fixed' && (cw > W - 2 * extra || ch > H - 2 * extra)) {           // shrink the content to fit a fixed sign
      const k = Math.min((W - 2 * extra - 4) / cw, (H - 2 * extra - 4) / ch);
      if (k > 0) { content = content.scale([k, k]); if (letters) letters = letters.scale([k, k]); if (graphic) graphic = graphic.scale([k, k]); warn.push('The text was scaled down to fit the fixed sign size.'); }
    }
    const T = p.baseT;
    let base = K.extrude(base2, T);
    // ---- mounting
    let stand = null;
    if (p.mount === 'holes' || p.mount === 'hang') {
      const y = p.mount === 'hang' ? H / 2 - Math.max(6, p.screwD * 1.5) : 0, x = p.mount === 'hang' ? W * 0.3 : W / 2 - Math.max(8, p.screwD * 2);
      for (const sx of [-1, 1]) {
        const hole = K.cyl(p.screwD / 2 + 0.2, T + 2).translate([sx * x, y, -1]);
        const csk = K.cyl(p.screwD / 2 + 0.2, Math.min(p.screwD, T - 0.6), 0, p.screwD + 0.2).translate([sx * x, y, T - Math.min(p.screwD, T - 0.6) + 0.01]);
        base = base.subtract(hole).subtract(p.mount === 'holes' ? csk : hole);
      }
      if (content.bounds().max[1] > y - p.screwD && p.mount === 'hang') warn.push('The hanging holes may sit close to the text: add space around the text or make the sign taller.');
    } else if (p.mount === 'keyhole') {
      if (T < 2.5) warn.push('Keyhole slots need a base of 2.5 mm or more; they were left out.');
      else for (const sx of [-1, 1]) {
        const x = sx * W * 0.3, head = p.screwD * 2.2, shank = p.screwD + 0.4, d = Math.min(T - 1, 2.4);
        const slot = K.union([K.cyl(head / 2, d * 0.55).translate([x, 0, -0.01]), K.box(shank, 10, d * 0.55).translate([x, -5, -0.01]),
          K.cyl(shank / 2, d).translate([x, 0, -0.01]), K.box(shank, 10, d).translate([x, -5, -0.01])]);
        base = base.subtract(slot);
      }
    } else if (p.mount === 'magnets') {
      if (T < p.magT + 0.8) warn.push(`The base is too thin for ${p.magT} mm magnets: make it at least ${(p.magT + 0.8).toFixed(1)} mm.`);
      else for (const sx of [-1, 1]) base = base.subtract(K.cyl(p.magD / 2, p.magT + 0.01).translate([sx * W * 0.3, 0, -0.01]));
    } else if (p.mount === 'stand') {
      // a foot block with a slot tilted back by the stand angle; the sign drops into the slot
      const len = Math.max(40, W * 0.45), sw = T + 0.4;
      const block = K.box(len, 26, 12);
      const slot = K.box(len + 2, sw, 40).rotate([-(90 - p.standA), 0, 0]).translate([0, -4, 3]);
      const foot = block.subtract(slot);
      stand = foot;
    }
    // ---- raised layers
    const zTop = T;
    const plateRim = (w) => { const inner = base2.offset(-p.borderGap, 'Round'); const inner2 = inner.offset(-w, 'Round'); return inner.isEmpty() ? null : inner.subtract(inner2); };
    let border2 = null;
    if (p.border > 0) {
      border2 = plateRim(p.border);
      if (p.double && border2) { const b2 = base2.offset(-(p.borderGap + p.border * 2), 'Round'); const b3 = b2.offset(-Math.max(0.8, p.border / 2), 'Round'); if (!b2.isEmpty()) border2 = border2.add(b2.subtract(b3)); }
    }
    const inlay = p.plan === 'multi' && p.textMode === 'inlay';
    const iconWithOutline = graphic && p.iconLayer === 'outline';
    const letterShape = iconWithOutline ? letters : content;
    let outline2 = p.outline > 0 ? content.offset(p.outline, 'Round') : (iconWithOutline ? graphic : null);
    if (outline2 && iconWithOutline && p.outline > 0) outline2 = outline2;             // outline already includes the graphic
    const oh = p.outline > 0 || iconWithOutline ? p.outlineH : 0;
    if (inlay) {
      // everything sits flush in the base: cut pockets, fill them with the coloured parts
      const d = Math.min(p.textH, T - 0.6);
      if (letterShape) { base = base.subtract(K.extrude(letterShape, d + 0.01).translate([0, 0, T - d])); parts.push({ name: 'letters', label: 'Letters', m: K.extrude(letterShape, d).translate([0, 0, T - d]), colorKey: 'colText', color: p.colText }); }
      if (outline2) { const ring = letterShape ? outline2.subtract(letterShape) : outline2; base = base.subtract(K.extrude(ring, d + 0.01).translate([0, 0, T - d])); parts.unshift({ name: 'outline', label: 'Outline', m: K.extrude(ring, d).translate([0, 0, T - d]), colorKey: 'colOutline', color: p.colOutline }); }
      if (border2) { base = base.subtract(K.extrude(border2, d + 0.01).translate([0, 0, T - d])); parts.unshift({ name: 'border', label: 'Border', m: K.extrude(border2, d).translate([0, 0, T - d]), colorKey: 'colBorder', color: p.colBorder }); }
    } else {
      const bKey = p.plan === 'stack' && outline2 ? 'colOutline' : 'colBorder';
      if (border2) parts.push({ name: 'border', label: 'Border', m: K.extrude(border2, p.borderH).translate([0, 0, zTop]), colorKey: bKey, color: p[bKey] });
      if (outline2) parts.push({ name: 'outline', label: 'Outline', m: K.extrude(outline2, oh).translate([0, 0, zTop]), colorKey: 'colOutline', color: p.colOutline });
      if (letterShape) parts.push({ name: 'letters', label: 'Letters', m: K.extrude(letterShape, p.textH).translate([0, 0, zTop + oh]), colorKey: 'colText', color: p.colText });
    }
    parts.unshift({ name: 'base', label: 'Base', m: base, colorKey: 'colBase', color: p.colBase });
    if (stand) parts.push({ name: 'stand', label: 'Stand', m: K.onBed(stand).translate([0, -H / 2 - 30, 0]), colorKey: 'colBase', color: p.colBase });
    // ---- colour plan
    const info = { facts: [`${Math.round(W)} × ${Math.round(H)} mm sign`], lines: [] };
    if (p.plan === 'stack') {
      const starts = [];
      if (border2) starts.push([zTop, 'border', outline2 ? p.colOutline : p.colBorder]);
      if (outline2) starts.push([zTop, 'outline', p.colOutline]);
      if (letterShape) starts.push([zTop + oh, 'letters', p.colText]);
      const byZ = new Map(); for (const [z, n, c] of starts) (byZ.get(z.toFixed(2)) || byZ.set(z.toFixed(2), []).get(z.toFixed(2))).push([n, c]);
      for (const [z, list] of [...byZ].sort((a, b) => a[0] - b[0])) {
        const cols = new Set(list.map(x => x[1].toLowerCase()));
        if (cols.size > 1) warn.push(`The ${list.map(x => x[0]).join(' and ')} start at the same height in different colours. With stacked colours they print in one colour; make them match, or use multi-material.`);
        info.lines.push(`Change filament on the first layer above Z = ${z} mm for the ${list.map(x => x[0]).join(' and ')}.`);
      }
      if (!info.lines.length) info.lines.push('Single colour: nothing to change.');
    } else info.lines.push('Each coloured layer is its own object in the 3MF. Assign a filament to each in your slicer.');
    info.lines.push('Print the base flat on the bed. 0.2 mm layers keep the colour changes crisp.');
    return { parts, warn, info };
  },
};

function drawIcon(K, kind, s) {
  if (kind === 'star') return K.star(5, s / 2, s / 2 * 0.45);
  if (kind === 'home') { const r = s / 2; return K.poly([[-r * 0.8, -r], [r * 0.8, -r], [r * 0.8, 0.1 * r], [r, 0.1 * r], [0, r], [-r, 0.1 * r], [-r * 0.8, 0.1 * r]]).subtract(K.rect(r * 0.4, r * 0.7).translate([0, -r * 0.65])); }
  if (kind === 'paw') { const r = s / 2; let p = K.ellipse(r * 1.1, r * 0.9).translate([0, -r * 0.35]); for (const [x, y] of [[-0.62, 0.3], [-0.22, 0.62], [0.22, 0.62], [0.62, 0.3]]) p = p.add(K.ellipse(r * 0.42, r * 0.52).translate([x * r, y * r])); return K.center2(p); }
  return icon(K, kind, s);
}
