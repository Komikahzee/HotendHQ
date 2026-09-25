/* Lettering: name tracing templates, letter stamps and calligraphy guide rulers. */
import { R, S, B, X, C, F, D2R } from '../core.js?v=95f6f46afd';
import { addBridges } from './stencils.js?v=8343b3afa5';

export default {
  id: 'lettering', title: 'Lettering & calligraphy', usesBed: false, usesNozzle: true,
  file: (s) => s.mode === 'guide' ? `calligraphy-guide-${s.xh}mm-${s.slant}deg` : `${s.mode}-${(s.text || 'text').split('\n')[0]}`,
  modes: {
    trace: {
      label: 'Tracing template', title: 'Tracing template', icon: '<path d="M4 18l4-12 4 12M5.5 14h5"/><path d="M14 8c2-2 6-1 5 3-1 3-5 4-5 7"/>',
      blurb: 'Practise a name or word: trace inside cut-out letters, follow a groove with a stylus, or trace raised letters with a finger.',
      groups: [
        { title: 'Text', open: true, items: [
          X('text', 'Text', 'Emma', { multiline: true, rows: 2, max: 120 }),
          F('font', 'Font', 'dancing'),
          R('size', 'Letter size (capital height)', 10, 120, 0.5, 40, 'mm'),
          R('spacing', 'Letter spacing', -0.1, 0.6, 0.01, 0.04, 'em'),
        ] },
        { title: 'Template', open: true, items: [
          S('style', 'Style', [['cut', 'Cut-out letters (trace inside with a pencil)'], ['groove', 'Grooved outline (follow with a stylus)'], ['raised', 'Raised letters (trace with a finger)']], 'cut'),
          R('groove', 'Groove width', 0.8, 4, 0.1, 1.6, 'mm', { show: s => s.style === 'groove' }),
          R('bridgeW', 'Bridge width', 0.8, 5, 0.1, 1.6, 'mm', { show: s => s.style === 'cut', hint: 'Holds the middles of letters like o, a, e and B in place.' }),
          B('lines', 'Engrave writing lines', true, { hint: 'Baseline and x-height lines to line the letters up.' }),
          R('margin', 'Margin', 4, 40, 0.5, 10, 'mm'),
          R('thick', 'Thickness', 0.8, 5, 0.1, 1.6, 'mm'),
          R('radius', 'Corner radius', 0, 20, 0.5, 5, 'mm'),
          B('hole', 'Hanging hole', false),
          C('colPlate', 'Colour', '#1ea39a'), C('colText', 'Raised letter colour', '#f2f4f7', { show: s => s.style === 'raised' }),
        ] },
      ],
      presets: [['Name (script)', { text: 'Emma', font: 'dancing', style: 'cut' }], ['Print letters', { text: 'abc', font: 'fredoka', size: 50, style: 'raised' }],
        ['Calligraphy word', { text: 'Thank you', font: 'greatvibes', size: 30, style: 'groove' }]],
      test: [{ style: 'groove' }, { style: 'raised' }],
    },
    stamp: {
      label: 'Letter stamp', title: 'Letter stamp', icon: '<rect x="5" y="3" width="14" height="6" rx="3"/><path d="M12 9v5"/><rect x="4" y="14" width="16" height="6" rx="1"/>',
      blurb: 'A rubber-stamp style stamp: the letters are mirrored for you, so the print reads the right way round.',
      groups: [
        { title: 'Text', open: true, items: [
          X('text', 'Text', 'Handmade\nby Sam', { multiline: true, rows: 2, max: 80 }),
          F('font', 'Font', 'pacifico'),
          R('size', 'Letter size', 4, 60, 0.5, 10, 'mm'),
          R('spacing', 'Letter spacing', -0.1, 0.5, 0.01, 0.02, 'em'),
          R('relief', 'Letter height', 0.6, 4, 0.1, 1.6, 'mm', { hint: 'Deeper letters stay clear of ink on the base.' }),
        ] },
        { title: 'Stamp', open: true, items: [
          S('shape', 'Stamp shape', [['rrect', 'Rounded rectangle'], ['circle', 'Circle'], ['oval', 'Oval']], 'rrect'),
          R('pad', 'Space around the text', 1, 20, 0.5, 4, 'mm'),
          B('border', 'Border ring', true),
          R('baseT', 'Base thickness', 2, 10, 0.5, 4, 'mm'),
          S('handle', 'Handle', [['knob', 'Round knob'], ['block', 'Block handle'], ['none', 'None (mount it on a block)']], 'knob'),
          R('handleH', 'Handle height', 10, 50, 1, 25, 'mm', { show: s => s.handle !== 'none' }),
          B('mark', 'Preview text on the top', true, { hint: 'The text reads normally on top, so you know which way up to stamp.' }),
          C('colBase', 'Colour', '#f3662e'),
        ] },
      ],
      presets: [['Maker\'s mark', { text: 'Handmade\nby Sam', font: 'pacifico' }], ['Round logo', { text: 'SAM & CO', shape: 'circle', font: 'bebas', size: 12 }], ['Big letter', { text: 'A', size: 40, font: 'slab', handle: 'block' }]],
      test: [{ handle: 'block' }],
    },
    guide: {
      label: 'Calligraphy guide', title: 'Calligraphy guide ruler', icon: '<path d="M3 6h18M3 10h18M3 14h18M3 18h18"/><path d="M8 4l-3 16M14 4l-3 16"/>',
      blurb: 'Lay it on paper and draw through the slots: baseline, x-height, ascender and descender lines, plus slant lines at your angle.',
      groups: [
        { title: 'Letter proportions', open: true, items: [
          S('by', 'Size by', [['mm', 'x-height in mm'], ['nib', 'Nib widths']], 'mm'),
          R('xh', 'x-height', 2, 30, 0.5, 7, 'mm', { show: s => s.by === 'mm' }),
          R('nib', 'Nib width', 0.5, 6, 0.1, 2, 'mm', { show: s => s.by === 'nib' }),
          R('nibs', 'x-height in nib widths', 3, 8, 0.5, 5, '', { show: s => s.by === 'nib', hint: 'Italic is about 5, foundational hand about 4.' }),
          R('asc', 'Ascender', 0.5, 2, 0.05, 1, '× x-height'),
          R('desc', 'Descender', 0.5, 2, 0.05, 1, '× x-height'),
          B('cap', 'Capital line', false),
          R('capR', 'Capital height', 0.5, 2, 0.05, 0.7, '× x-height', { show: s => s.cap }),
          B('slantOn', 'Slant lines', true),
          R('slant', 'Slant angle', 40, 89, 1, 55, '°', { show: s => s.slantOn, labelFn: s => `Slant angle (${90 - s.slant}° from upright)`,
            hint: 'Measured from the baseline: copperplate 55°, Spencerian 52°, italic about 83°.' }),
          R('slantGap', 'Slant line spacing', 4, 30, 0.5, 10, 'mm', { show: s => s.slantOn }),
        ] },
        { title: 'Ruler', open: true, items: [
          R('rows', 'Rows of writing', 1, 6, 1, 2, ''),
          R('rowGap', 'Gap between rows', 0, 20, 0.5, 4, 'mm'),
          R('width', 'Ruler length', 60, 300, 5, 180, 'mm'),
          R('slot', 'Slot width', 0.5, 2, 0.05, 0.9, 'mm', { hint: 'A little wider than your pencil lead.' }),
          R('thick', 'Thickness', 1, 4, 0.1, 1.6, 'mm'),
          B('ladder', 'Nib ladder in the margin', true, { hint: 'Engraved squares showing the height in nib widths.' }),
          B('labels', 'Engrave the settings on the ruler', true),
          C('colPlate', 'Colour', '#f5c542'),
        ] },
      ],
      presets: [['Copperplate', { by: 'mm', xh: 5, asc: 2, desc: 2, slant: 55 }], ['Italic', { by: 'nib', nib: 2, nibs: 5, asc: 1, desc: 1, slant: 83 }], ['Foundational', { by: 'nib', nib: 3, nibs: 4, slantOn: false }], ['Modern brush', { by: 'mm', xh: 12, asc: 1, desc: 1, slant: 70 }]],
      test: [{ by: 'nib' }, { cap: true }],
    },
  },

  async build(K, p, ctx) {
    const warn = [], info = { facts: [], lines: [] };
    if (p.mode === 'guide') return guide(K, p, ctx, warn, info);
    const font = await ctx.font(p.font);
    let text = K.text(font, p.text, { size: p.size, spacing: p.spacing, mirror: p.mode === 'stamp' });
    if (!text) return { parts: [], warn: ['Type some text.'] };
    text = K.center2(text);
    const [tw, th] = K.size2(text);
    if (p.mode === 'stamp') {
      let W = tw + 2 * p.pad + (p.border ? 3 : 0), H = th + 2 * p.pad + (p.border ? 3 : 0), face;
      if (p.shape === 'circle') { W = H = Math.hypot(tw, th) + 2 * p.pad + (p.border ? 3 : 0); face = K.circle(W / 2, 96); }
      else if (p.shape === 'oval') { W *= 1.2; H *= 1.3; face = K.ellipse(W, H); }
      else face = K.rrect(W, H, 3);
      const T = p.baseT;
      // stamp printed face-down? no: printed face-up (letters on top), handle printed separately on its own
      let m = K.extrude(face, T);
      let relief = text;
      if (p.border) { const ring = face.offset(-0.8, 'Round').subtract(face.offset(-2, 'Round')); relief = relief.add(ring); }
      m = m.add(K.extrude(relief, p.relief).translate([0, 0, T]));
      const parts = [{ name: 'stamp', label: 'Stamp', m, colorKey: 'colBase', color: p.colBase }];
      if (p.handle !== 'none') {
        let h;
        if (p.handle === 'knob') {
          const r = Math.min(W, H) * 0.32, hh = p.handleH;
          h = K.revolve(K.poly([[0, 0], [r * 0.8, 0], [r * 0.55, hh * 0.55], [r, hh * 0.8], [r * 0.9, hh * 0.95], [r * 0.6, hh], [0, hh]]), 64);
        } else h = K.softSlab(K.rrect(Math.max(10, W * 0.5), Math.max(10, H * 0.7), 3), p.handleH, 1.5);
        // a peg on the handle plugs into a socket in the back of the stamp
        const peg = K.cyl(3, 4, 32);
        h = h.add(peg.translate([0, 0, -4]));
        h = K.onBed(h, false);
        if (p.mark) {
          const top = K.center2(K.text(font, p.text, { size: 10, spacing: p.spacing })), [a, b] = K.size2(top);
          const hb = K.bb(h), k = Math.min((hb.w - 4) / a, (hb.d - 4) / b) * 0.9;
          if (k > 0) h = h.subtract(K.extrude(top.scale([k, k]), 0.61).translate([0, 0, hb.h - 0.6]));
        }
        m = m.subtract(K.cyl(3.15, 4.2, 32).translate([0, 0, -0.01]));      // socket underneath
        parts[0].m = m;
        const off = Math.max(W, H) / 2 + 30;
        parts.push({ name: 'handle', label: 'Handle', m: h.translate([off, 0, 0]), colorKey: 'colBase', color: p.colBase });
        info.lines.push('Print both parts as shown, then glue the handle\'s peg into the socket on the back of the stamp.');
      }
      if (p.relief < 1) warn.push('Letters under 1 mm deep can pick up ink from the base. 1.5 mm or more stamps cleaner.');
      info.facts.push(`${Math.round(W)} × ${Math.round(H)} mm`);
      info.lines.push('Print letters up, with 0.12 mm layers for crisp edges. TPU gives a softer, rubber-like stamp face.');
      return { parts, warn, info };
    }
    // tracing template
    const W = tw + 2 * p.margin, H = th + 2 * p.margin, T = p.thick;
    let plate = K.rrect(W, H, p.radius);
    if (p.hole) plate = plate.subtract(K.circle(3).translate([-W / 2 + 6, H / 2 - 6]));
    const parts = [];
    let m;
    if (p.style === 'cut') {
      const r = addBridges(K, text, { bridgeW: p.bridgeW, bridgeDir: 'v' });
      m = K.extrude(plate.subtract(r.cs), T);
      if (r.n) info.facts.push(`${r.n} bridge${r.n > 1 ? 's' : ''}`);
    } else if (p.style === 'groove') {
      const ring = text.offset(p.groove / 2, 'Round').subtract(text.offset(-p.groove / 2, 'Round'));
      m = K.extrude(plate, T).subtract(K.extrude(ring, Math.max(0.4, T - 0.6) + 0.01).translate([0, 0, T - Math.max(0.4, T - 0.6)]));
    } else {
      m = K.extrude(plate, T);
      parts.push({ name: 'letters', label: 'Raised letters', m: K.extrude(text, 1.6).translate([0, 0, T]), colorKey: 'colText', color: p.colText });
    }
    if (p.lines) {
      // baseline and x-height guides, engraved 0.4 mm, from the font's metrics
      const s = p.size / font.cap, lines = String(p.text).split('\n').length, lh = 1.25 * 1.35 * p.size;   // K.text's line spacing
      const ob = K.text(font, p.text, { size: p.size, spacing: p.spacing }).bounds(), mid = (ob.min[1] + ob.max[1]) / 2;
      const g = [];
      for (let i = 0; i < lines; i++) {
        const base = -i * lh - mid;
        for (const y of [base, base + font.xh * s]) g.push(K.rect(W - 2 * Math.min(6, p.margin / 2), 0.5).translate([0, y]));
      }
      m = m.subtract(K.extrude(K.CS.union(g), 0.41).translate([0, 0, T - 0.4]));
    }
    parts.unshift({ name: 'template', label: 'Template', m, colorKey: 'colPlate', color: p.colPlate });
    info.facts.push(`${Math.round(W)} × ${Math.round(H)} mm`);
    info.lines.push(p.style === 'cut' ? 'Hold the template flat and trace inside each letter with a sharp pencil.' : p.style === 'groove' ? 'Run a ball stylus or dry pen along the groove; great for learning letter shapes and for embossing paper or clay.' : 'Children trace the raised letters with a finger to learn the shape and the stroke direction.');
    return { parts, warn, info };
  },
};

async function guide(K, p, ctx, warn, info) {
  const xh = p.by === 'nib' ? p.nib * p.nibs : p.xh;
  const up = xh * p.asc, down = xh * p.desc, rowH = xh + up + down;
  const margin = 12, left = p.ladder ? 16 : 8, W = p.width;
  const H = p.rows * rowH + (p.rows - 1) * p.rowGap + 2 * margin + (p.labels ? 6 : 0);
  let plate = K.rrect(W, H, 4);
  const slots = [], y0 = H / 2 - margin;
  const x0 = -W / 2 + left, x1 = W / 2 - 8, sw = p.slot;
  const rowsY = [];
  for (let r = 0; r < p.rows; r++) {
    const top = y0 - r * (rowH + p.rowGap);          // ascender line
    const lines = [top, top - up, top - up - xh, top - rowH];  // ascender, x-height, baseline, descender
    if (p.cap) lines.push(top - up - xh + xh * p.capR);
    for (const y of lines) slots.push(K.rect(x1 - x0, sw).translate([(x0 + x1) / 2, y]));
    rowsY.push(lines);
  }
  // slant slots between neighbouring lines, stopping 1.5 mm short so the ruler stays in one piece
  if (p.slantOn) {
    const a = p.slant * D2R, dx = 1 / Math.tan(a);
    for (const lines of rowsY) {
      const ys = [...lines].sort((a2, b) => b - a2);
      for (let i = 0; i + 1 < ys.length; i++) {
        const ya = ys[i] - 1.6, yb = ys[i + 1] + 1.6;
        if (ya - yb < 1.5) continue;
        for (let x = x0 + 4; x < x1 - 4; x += p.slantGap) {
          const xa = x + (ya - ys[ys.length - 1]) * dx, xb = x + (yb - ys[ys.length - 1]) * dx;
          if (Math.max(xa, xb) > x1 - 2 || Math.min(xa, xb) < x0 + 2) continue;
          slots.push(K.poly([[xa - sw / 2, ya], [xa + sw / 2, ya], [xb + sw / 2, yb], [xb - sw / 2, yb]]));
        }
      }
    }
  }
  let m = K.extrude(plate.subtract(K.CS.union(slots)), p.thick);
  // engraved extras
  const eng = [];
  if (p.ladder) {
    const nib = p.by === 'nib' ? p.nib : xh / 5;
    const n = Math.round(xh / nib);
    const baseY = rowsY[0][2];
    for (let i = 0; i < n; i++) eng.push(K.rect(nib, nib).translate([-W / 2 + 5 + (i % 2) * nib, baseY + nib * (i + 0.5)]));
  }
  if (p.labels) {
    const font = await ctx.font('mono');
    const label = `x ${+xh.toFixed(1)} mm  asc ${p.asc}  desc ${p.desc}${p.slantOn ? `  ${p.slant}°` : ''}`;
    const t = K.text(font, label, { size: 3 });
    if (t) { const c = K.center2(t); const [lw] = K.size2(c); eng.push((lw > W - 20 ? c.scale([(W - 20) / lw, (W - 20) / lw]) : c).translate([0, -H / 2 + 4.5])); }
  }
  if (eng.length) m = m.subtract(K.extrude(K.CS.union(eng), 0.51).translate([0, 0, p.thick - 0.5]));
  if (sw < 2 * p.nozzle * 0.9) warn.push(`Slots narrower than about ${(p.nozzle * 1.8).toFixed(2)} mm may close up with a ${p.nozzle} mm nozzle.`);
  info.facts.push(`x-height ${+xh.toFixed(2)} mm`, `${p.rows} row${p.rows > 1 ? 's' : ''}`);
  info.lines.push('Lay the ruler on your paper and draw along every slot with a sharp 0.5 mm pencil, then slide it down for the next rows.');
  info.lines.push('Print flat with 0.2 mm layers. Make sure "detect thin walls" or Arachne is on so the narrow slots come out clean.');
  return { parts: [{ name: 'guide', label: 'Guide ruler', m, colorKey: 'colPlate', color: p.colPlate }], warn, info };
}
