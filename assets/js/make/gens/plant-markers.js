/* Plant markers: one marker per line of text, laid out on the bed. */
import { R, S, B, X, C, F, D2R, clamp } from '../core.js?v=95f6f46afd';

const ICONS = [['none', 'None'], ['leaf', 'Leaf'], ['flower', 'Flower'], ['sun', 'Sun'], ['drop', 'Water drop'], ['heart', 'Heart'], ['sprout', 'Sprout']];

export default {
  id: 'plant-markers',
  title: 'Plant markers',
  usesBed: true,
  file: (s) => `plant-markers-${(s.names || 'markers').split('\n')[0]}`,
  modes: {
    markers: {
      label: 'Markers', title: 'Plant markers',
      blurb: 'Type one plant per line and get a full set, laid out ready to print. Add a second line after a | (e.g. Tomato | Cherry).',
      groups: [
        { title: 'Text', open: true, items: [
          X('names', 'Plants (one per line)', 'Basil\nTomato | Cherry\nMint\nRosemary', { multiline: true, rows: 5, max: 800, placeholder: 'Basil\nTomato | Cherry',
            hint: 'Up to 30 markers. Put a | before a smaller second line.' }),
          F('font', 'Font', 'fredoka'),
          R('textSize', 'Text size (capital height)', 3, 30, 0.5, 9, 'mm'),
          R('subSize', 'Second line size', 2, 20, 0.5, 5, 'mm'),
          R('spacing', 'Letter spacing', -0.1, 0.5, 0.01, 0.02, 'em'),
          B('upper', 'ALL CAPITALS', false),
          B('autofit', 'Shrink long names to fit', true, { hint: 'Otherwise long names make the label wider.' }),
          S('textStyle', 'Text style', [['raised', 'Raised (easy two-colour: swap filament)'], ['inlay', 'Inlaid flush (two-colour, needs AMS / MMU)'],
            ['engrave', 'Engraved'], ['cut', 'Cut through']], 'raised'),
          R('textH', 'Raised height / engrave depth', 0.2, 3, 0.1, 0.8, 'mm', { show: s => s.textStyle !== 'cut' }),
        ] },
        { title: 'Marker shape', open: true, items: [
          S('shape', 'Style', [['stake', 'Label on a pointed stake'], ['round', 'Rounded top on a stake'], ['arrow', 'Arrow flag'], ['t', 'T-sign (wide)'],
            ['leafy', 'Leaf-shaped label on a stake'], ['tag', 'Hanging tag (no stake)'], ['rim', 'Pot-rim clip']], 'stake'),
          R('labelW', 'Label width', 30, 200, 1, 70, 'mm'),
          R('labelH', 'Label height', 10, 100, 1, 24, 'mm', { hint: 'Grows automatically if a second line needs room.' }),
          R('thick', 'Thickness', 1.2, 6, 0.1, 2.4, 'mm'),
          R('radius', 'Corner radius', 0, 20, 0.5, 4, 'mm', { show: s => ['stake', 't', 'tag', 'arrow', 'rim'].includes(s.shape) }),
          R('border', 'Raised border', 0, 4, 0.1, 1.2, 'mm', { hint: '0 for no border. Printed in the text colour when the text is raised.' }),
          R('hole', 'Hanging hole Ø', 2, 10, 0.5, 4, 'mm', { show: s => s.shape === 'tag' }),
          R('rimGap', 'Pot rim thickness', 1, 12, 0.1, 3, 'mm', { show: s => s.shape === 'rim', hint: 'Measure the pot wall; the clip grips it.' }),
          R('rimDepth', 'Clip depth', 6, 40, 1, 15, 'mm', { show: s => s.shape === 'rim' }),
        ] },
        { title: 'Stake', open: true, show: s => !['tag', 'rim'].includes(s.shape), items: [
          R('stakeL', 'Stake length', 30, 250, 1, 90, 'mm'),
          R('stakeW', 'Stake width', 4, 30, 0.5, 10, 'mm'),
          R('tip', 'Point length', 4, 60, 1, 18, 'mm'),
          B('rib', 'Stiffening rib', true, { hint: 'A ridge down the stake so it pushes into soil without bending.' }),
        ] },
        { title: 'Icon', items: [
          S('icon', 'Icon', ICONS, 'leaf'),
          S('iconSide', 'Icon position', [['left', 'Left of the text'], ['right', 'Right of the text']], 'left', { show: s => s.icon !== 'none' }),
          R('iconSize', 'Icon size', 4, 40, 0.5, 12, 'mm', { show: s => s.icon !== 'none' }),
        ] },
        { title: 'Colours & layout', items: [
          C('colBase', 'Marker colour', '#3e9b4f'),
          C('colText', 'Text colour', '#f2f4f7'),
          R('gap', 'Gap between markers', 2, 20, 1, 5, 'mm'),
        ] },
      ],
      presets: [
        ['Herb garden', { names: 'Basil\nThyme\nMint\nParsley\nRosemary\nSage', shape: 'stake', labelW: 60 }],
        ['Veg patch', { names: 'Tomato | Cherry\nPepper | Sweet\nCarrot | Nantes\nLettuce | Cos', shape: 't', labelW: 80, textSize: 8 }],
        ['Pot clips', { names: 'Monstera\nPothos\nCalathea', shape: 'rim', stakeL: 60, labelW: 60, icon: 'leaf' }],
        ['Seed trays', { names: 'Tray 1\nTray 2\nTray 3\nTray 4', shape: 'stake', labelW: 40, labelH: 14, textSize: 6, stakeL: 50, stakeW: 6, tip: 10, icon: 'sprout' }],
        ['Gift tags', { names: 'For Mum\nFor Dad', shape: 'tag', icon: 'heart', font: 'pacifico', textStyle: 'raised' }],
      ],
    },
  },

  async build(K, p, ctx) {
    const warn = [], font = await ctx.font(p.font);
    const names = String(p.names || '').split('\n').map(t => t.trim()).filter(Boolean).slice(0, 30);
    if (!names.length) return { parts: [], warn: ['Type at least one plant name.'] };
    if (String(p.names).split('\n').filter(t => t.trim()).length > 30) warn.push('Only the first 30 markers are made.');
    const T = p.thick, bases = [], texts = [];
    for (const raw of names) {
      let [main, sub] = raw.split('|').map(t => (t || '').trim());
      if (p.upper) { main = main.toUpperCase(); sub = sub && sub.toUpperCase(); }
      const pad = Math.max(p.border, 0) + 2.5;
      const iconW = p.icon !== 'none' ? p.iconSize + 3 : 0;
      let W = p.labelW, H = Math.max(p.labelH, p.textSize + (sub ? p.subSize * 1.5 + 2 : 0) + 2 * pad);
      // text
      let t1 = K.text(font, main, { size: p.textSize, spacing: p.spacing });
      let t2 = sub ? K.text(font, sub, { size: p.subSize, spacing: p.spacing }) : null;
      const holeRoom = p.shape === 'tag' ? p.hole + 6 : 0;          // keep the hanging hole clear of the text
      let avail = W - 2 * pad - iconW - holeRoom - (p.shape === 'arrow' ? H * 0.35 : 0);
      if (t1) {
        let [w1] = K.size2(t1);
        if (w1 > avail) { if (p.autofit) { const k = avail / w1; t1 = t1.scale([k, k]); } else { W += w1 - avail; avail = w1; } }
      }
      if (t2) { const [w2] = K.size2(t2); if (w2 > avail) t2 = t2.scale([avail / w2, avail / w2]); }
      // label outline (centred on 0,0) and stake
      let label;
      if (p.shape === 'round' || p.shape === 'leafy') label = p.shape === 'round' ? K.arch(W, H) : leaf(K, W, H);
      else if (p.shape === 'arrow') label = K.poly([[-W / 2, -H / 2], [W / 2 - H * 0.35, -H / 2], [W / 2, 0], [W / 2 - H * 0.35, H / 2], [-W / 2, H / 2]]);
      else label = K.rrect(W, H, p.radius);
      let outline = label;
      const hasStake = !['tag', 'rim'].includes(p.shape);
      if (hasStake) {
        const sw = p.shape === 't' ? Math.min(p.stakeW, W * 0.3) : p.stakeW, sl = p.stakeL, tip = Math.min(p.tip, sl * 0.6);
        const x0 = p.shape === 'arrow' ? -W / 2 + sw / 2 + 4 : 0;
        const stake = K.poly([[x0 - sw / 2, -H / 2 + 0.5], [x0 + sw / 2, -H / 2 + 0.5], [x0 + sw / 2, -H / 2 - sl + tip], [x0, -H / 2 - sl], [x0 - sw / 2, -H / 2 - sl + tip]]);
        outline = outline.add(stake);
      }
      if (p.shape === 'tag') outline = outline.subtract(K.circle(p.hole / 2).translate([-W / 2 + p.hole / 2 + 4, 0]));
      if (p.shape === 'rim') {                    // a J-hook under the label grips the pot wall
        const g = p.rimGap, d = p.rimDepth, bw = 3.2;
        const hook = K.poly([[-bw - g / 2 - bw, -H / 2 + 0.5], [-g / 2 - bw + bw, -H / 2 + 0.5], [-g / 2, -H / 2 - d], [g / 2, -H / 2 - d],
          [g / 2, -H / 2 - 2], [g / 2 + bw, -H / 2 - 2], [g / 2 + bw, -H / 2 - d - bw], [-g / 2 - bw * 2, -H / 2 - d - bw]]);
        outline = outline.add(hook.translate([W / 4, 0]));
      }
      let base = K.extrude(outline, T);
      if (hasStake && p.rib) {
        const sw = p.shape === 't' ? Math.min(p.stakeW, W * 0.3) : p.stakeW, x0 = p.shape === 'arrow' ? -W / 2 + sw / 2 + 4 : 0;
        base = base.add(K.box(Math.max(1.2, sw * 0.22), p.stakeL - p.tip, Math.min(1.6, T)).translate([x0, -H / 2 - (p.stakeL - p.tip) / 2, T]));
      }
      // text + icon layout
      let face = null;
      const lineGap = sub ? p.subSize * 0.6 : 0, blockH = p.textSize + (t2 ? lineGap + p.subSize : 0);
      const tx = (p.icon !== 'none' ? (p.iconSide === 'left' ? iconW / 2 : -iconW / 2) : 0) - (p.shape === 'arrow' ? H * 0.175 : 0) + holeRoom / 2;
      if (t1) face = K.center2(t1).translate([tx, blockH / 2 - p.textSize / 2]);
      if (t2) face = (face ? face.add(K.center2(t2).translate([tx, -blockH / 2 + p.subSize / 2])) : K.center2(t2));
      if (p.icon !== 'none') {
        const ic = icon(K, p.icon, p.iconSize);
        const ix = (p.iconSide === 'left' ? -1 : 1) * ((t1 ? K.size2(t1)[0] : 0) / 2 + 3 + p.iconSize / 2) + tx;
        face = face ? face.add(ic.translate([ix, 0])) : ic;
      }
      if (face && p.shape === 'tag') face = face.subtract(K.circle(p.hole / 2 + 1.2).translate([-W / 2 + p.hole / 2 + 4, 0]));
      let rim = null;
      if (p.border > 0) { const inner = label.offset(-p.border, 'Round'); rim = inner.isEmpty() ? null : label.subtract(inner); }
      let top = null;
      if (face) {
        if (p.textStyle === 'raised') top = K.extrude(face, p.textH).translate([0, 0, T]);
        else if (p.textStyle === 'inlay') { const d = Math.min(p.textH, T - 0.6); base = base.subtract(K.extrude(face, d + 0.01).translate([0, 0, T - d])); top = K.extrude(face, d).translate([0, 0, T - d]); }
        else if (p.textStyle === 'engrave') base = base.subtract(K.extrude(face, Math.min(p.textH, T - 0.6) + 0.01).translate([0, 0, T - Math.min(p.textH, T - 0.6)]));
        else base = base.subtract(K.extrude(face, T + 2).translate([0, 0, -1]));
      }
      if (rim) { const r3 = K.extrude(rim, Math.max(p.textH, 0.6)).translate([0, 0, T]); if (p.textStyle === 'raised') top = top ? top.add(r3) : r3; else base = base.add(r3); }
      bases.push(base); texts.push(top);
    }
    // lay the markers out side by side on the bed, in rows
    const placed = [], placedT = [];
    let x = 0, y = 0, rowH = 0; const maxW = Math.max(60, p.bedX - 10);
    bases.forEach((b, i) => {
      const bb = K.bb(b);
      if (x > 0 && x + bb.w > maxW) { x = 0; y += rowH + p.gap; rowH = 0; }
      const dx = x - bb.min[0], dy = y - bb.min[1];
      placed.push(b.translate([dx, dy, 0])); if (texts[i]) placedT.push(texts[i].translate([dx, dy, 0]));
      x += bb.w + p.gap; rowH = Math.max(rowH, bb.d);
    });
    const parts = [{ name: 'markers', label: 'Markers', m: K.union(placed), colorKey: 'colBase', color: p.colBase }];
    if (placedT.length) parts.push({ name: 'text', label: p.textStyle === 'inlay' ? 'Inlaid text' : 'Raised text & border', m: K.union(placedT), colorKey: 'colText', color: p.colText });
    const info = { facts: [`${names.length} marker${names.length > 1 ? 's' : ''}`], lines: [] };
    if (p.textStyle === 'raised' && placedT.length) info.lines.push(`Two colours on one nozzle: add a filament change (pause / M600) on the first layer above Z = ${T.toFixed(2)} mm, where the letters start.`);
    if (p.textStyle === 'inlay') info.lines.push('Inlaid text is a separate object in the 3MF: give it a second colour in your slicer (AMS, MMU or tool changer).');
    info.lines.push('Print flat, text up. PETG or ASA last longest outdoors; PLA softens in hot sun.');
    return { parts, warn, info };
  },
};

function leaf(K, W, H) {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, x = -W / 2 + W * t, y = H / 2 * Math.sin(Math.PI * t) ** 0.8; pts.push([x, y]); }
  for (let i = 39; i > 0; i--) { const t = i / 40, x = -W / 2 + W * t, y = -H / 2 * Math.sin(Math.PI * t) ** 0.8; pts.push([x, y]); }
  return K.poly(pts);
}
export function icon(K, kind, s) {
  const r = s / 2;
  switch (kind) {
    case 'leaf': { const l = leaf(K, s, s * 0.55).rotate(35); return l.subtract(K.rect(s * 0.9, Math.max(0.5, s * 0.06)).rotate(35)); }
    case 'flower': { let f = K.circle(r * 0.32); for (let i = 0; i < 6; i++) { const a = i * 60 * D2R; f = f.add(K.ellipse(r * 0.95, r * 0.5).translate([r * 0.5, 0]).rotate(i * 60)); } return f.subtract(K.circle(r * 0.18)); }
    case 'sun': { let f = K.circle(r * 0.5); for (let i = 0; i < 8; i++) f = f.add(K.poly([[r * 0.58, -r * 0.12], [r, 0], [r * 0.58, r * 0.12]]).rotate(i * 45)); return f; }
    case 'drop': { const pts = []; for (let i = 0; i <= 40; i++) { const t = -Math.PI / 2 + Math.PI * 2 * i / 40; pts.push([r * 0.7 * Math.cos(t) * (1 - Math.sin(t)) * 0.9, r * 0.8 * Math.sin(t)]); } return K.center2(K.poly(pts).rotate(180)); }
    case 'heart': return K.heart(s);
    case 'sprout': { const stem = K.rect(Math.max(0.8, s * 0.1), s * 0.55).translate([0, -r * 0.45]); const l1 = leaf(K, s * 0.55, s * 0.28).rotate(25).translate([s * 0.22, 0]); const l2 = leaf(K, s * 0.55, s * 0.28).rotate(-25).translate([-s * 0.22, 0]); return stem.add(l1).add(l2); }
  }
  return K.circle(r);
}
