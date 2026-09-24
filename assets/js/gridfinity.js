/* ============================================================
   HOTEND HQ — Gridfinity Generator (UI + viewer)
   Geometry runs in gridfinity-worker.js (Manifold WASM).
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fitDrawer, meshToSTL, meshesTo3MF, zip, SPEC } from './gridfinity-core.js?v=2';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 1) => (+v).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

/* ============================================================
   CONTROL SCHEMA
   ============================================================ */
const R = (k, label, min, max, step, def, unit = 'mm', extra = {}) => ({ k, label, type: 'range', min, max, step, def, unit, ...extra });
const S = (k, label, options, def, extra = {}) => ({ k, label, type: 'select', options, def, ...extra });
const B = (k, label, def, extra = {}) => ({ k, label, type: 'toggle', def, ...extra });
const X = (k, label, def, extra = {}) => ({ k, label, type: 'text', def, ...extra });

const sizeGroup = (defX, defY, defH, extra = []) => ({
  title: 'Size', open: true, items: [
    R('nx', 'Width', 0.5, 10, 0.5, defX, 'units', { hint: '1 unit = 42 mm. Half units allowed.' }),
    R('ny', 'Depth', 0.5, 10, 0.5, defY, 'units'),
    S('hMode', 'Height in', [['u', 'Gridfinity units (7 mm)'], ['mm', 'Exact millimetres']], 'u'),
    R('hUnits', 'Height', 1, 20, 1, defH, 'units', { show: s => s.hMode !== 'mm' }),
    R('hMM', 'Height', 8, 150, 0.5, defH * 7, 'mm', { show: s => s.hMode === 'mm' }),
    ...extra,
  ],
});
const holesGroup = (open = false) => ({
  title: 'Magnets & screws', open, items: [
    S('holes', 'Base holes', [['none', 'None'], ['magnet', 'Magnets'], ['screw', 'Screws'], ['both', 'Magnets + screws']], 'none',
      { show: s => !s.lite }),
    S('holeWhere', 'Put holes in', [['all', 'Every foot'], ['corners', 'Corner feet only']], 'all', { show: s => !s.lite && s.holes !== 'none' }),
    R('magD', 'Magnet hole Ø', 3, 12, 0.05, 6.5, 'mm', { show: s => !s.lite && /magnet|both/.test(s.holes), hint: '6.5 mm for standard 6 × 2 mm magnets.' }),
    R('magDepth', 'Magnet depth', 1, 4, 0.05, 2.4, 'mm', { show: s => !s.lite && /magnet|both/.test(s.holes) }),
    B('magRibs', 'Press-fit crush ribs (no glue)', false, { show: s => !s.lite && /magnet|both/.test(s.holes) }),
    R('magCover', 'Print-in cover', 0, 1, 0.1, 0, 'mm', { show: s => !s.lite && /magnet|both/.test(s.holes),
      hint: '0 = open pocket. Above 0 hides the magnet inside the foot: pause the print and drop them in.' }),
    R('screwD', 'Screw hole Ø', 2, 4, 0.05, 3, 'mm', { show: s => !s.lite && /screw|both/.test(s.holes) }),
    R('screwDepth', 'Screw depth', 3, 10, 0.5, 6, 'mm', { show: s => !s.lite && /screw|both/.test(s.holes) }),
  ],
});
const advGroup = () => ({
  title: 'Advanced', items: [
    R('clear', 'Clearance per side', 0.1, 0.5, 0.05, 0.25, 'mm', { hint: 'Spec is 0.25. Raise it if bins fit tight on your printer.' }),
    B('halfGrid', 'Half-grid feet (21 mm)', false, { hint: 'Lets bins sit on half-unit offsets in half-grid baseplates.' }),
  ],
});
const textItems = (key, sizeKey) => [
  X(key, 'Text', '', { max: 24, placeholder: 'e.g. M3 SCREWS' }),
  R(sizeKey, 'Text size (cap height)', 3, 25, 0.5, 8, 'mm', { show: s => !!s[key] }),
  S('textMode', 'Style', [['engrave', 'Engraved'], ['emboss', 'Raised']], 'engrave', { show: s => !!s[key] }),
  R('textDepth', 'Depth / height', 0.2, 1.6, 0.1, 0.6, 'mm', { show: s => !!s[key] }),
];

const MODES = {
  bin: {
    label: 'Bin', icon: '<path d="M4 8l2 12h12l2-12"/><path d="M3 8h18M9 8v12M15 8v12"/>',
    title: 'Storage bin',
    blurb: 'The workhorse. Size it, split it into compartments, add scoops, label tabs and magnets.',
    groups: [
      sizeGroup(2, 1, 3),
      { title: 'Compartments', open: true, items: [
        R('divX', 'Dividers across', 0, 9, 1, 0, '', { hint: 'Walls running front-to-back.' }),
        R('divY', 'Dividers front-to-back', 0, 9, 1, 0, '', { hint: 'Walls running side-to-side.' }),
        X('ratiosX', 'Uneven widths (optional)', '', { show: s => s.divX > 0, placeholder: 'e.g. 1,2,1', hint: 'One number per compartment, left to right.' }),
        X('ratiosY', 'Uneven depths (optional)', '', { show: s => s.divY > 0, placeholder: 'e.g. 2,1', hint: 'Front to back.' }),
        R('divT', 'Divider thickness', 0.8, 3, 0.05, 1.2, 'mm', { show: s => s.divX > 0 || s.divY > 0 }),
        R('divLower', 'Lower dividers by', 0, 40, 0.5, 0, 'mm', { show: s => s.divX > 0 || s.divY > 0, hint: 'Shorter dividers make small parts easier to grab.' }),
      ] },
      { title: 'Scoops & labels', open: true, items: [
        R('scoop', 'Finger scoop', 0, 100, 5, 0, '%', { hint: 'Curved front floor so parts slide out.' }),
        S('tab', 'Label tab', [['none', 'None'], ['full', 'Full width'], ['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], 'none'),
        R('tabLen', 'Tab length', 20, 100, 5, 50, '%', { show: s => /left|center|right/.test(s.tab) }),
        R('tabDepth', 'Tab depth', 6, 20, 0.5, 13, 'mm', { show: s => s.tab !== 'none', hint: '13 mm fits a 12 mm label tape.' }),
        X('labels', 'Label text', '', { show: s => s.tab !== 'none', placeholder: 'M3|M4|M5', max: 200,
          hint: 'Printed into the tabs. Separate compartments with |, back row first, left to right.' }),
        S('textMode', 'Text style', [['engrave', 'Engraved'], ['emboss', 'Raised']], 'engrave', { show: s => s.tab !== 'none' && !!s.labels }),
        R('textDepth', 'Text depth / height', 0.2, 1.6, 0.1, 0.6, 'mm', { show: s => s.tab !== 'none' && !!s.labels }),
      ] },
      { title: 'Walls & floor', items: [
        R('wall', 'Wall thickness', 0.8, 3, 0.05, 1.2, 'mm', { hint: '1.2 mm = 3 lines with a 0.4 mm nozzle.' }),
        R('floor', 'Floor thickness', 0.7, 6, 0.05, 1.2, 'mm', { show: s => !s.lite }),
        B('lip', 'Stacking lip', true, { hint: 'Lets bins stack on top of each other.' }),
        B('lite', 'Lite base (hollow feet)', false, { hint: 'Saves filament and time; no magnets or screws.' }),
      ] },
      holesGroup(), advGroup(),
    ],
    presets: [
      ['Small parts', { nx: 1, ny: 1, hUnits: 3, scoop: 100, tab: 'full' }],
      ['Screw sorter', { nx: 3, ny: 2, hUnits: 3, divX: 2, divY: 1, scoop: 80, tab: 'full', labels: 'M3|M4|M5|NUTS|WASHERS|MISC' }],
      ['Deep bin', { nx: 2, ny: 2, hUnits: 9, scoop: 40 }],
      ['Magnetic', { nx: 2, ny: 1, hUnits: 3, holes: 'magnet', magRibs: true }],
      ['Lite & fast', { nx: 2, ny: 2, hUnits: 3, lite: true, wall: 0.95 }],
    ],
    build: s => ({ kind: 'bin', params: binParams(s) }),
    file: s => `gridfinity-bin-${fmt(s.nx)}x${fmt(s.ny)}x${s.hMode === 'mm' ? fmt(s.hMM) + 'mm' : s.hUnits}`,
  },

  holder: {
    label: 'Tool holder', icon: '<rect x="3" y="9" width="18" height="11" rx="2"/><circle cx="8" cy="14.5" r="1.8"/><circle cx="16" cy="14.5" r="1.8"/><path d="M8 3v9.7M16 5v7.7"/>',
    title: 'Tool holder insert',
    blurb: 'A solid bin with pockets cut to fit — hex bits, batteries, pens, drill bits, SD cards.',
    groups: [
      sizeGroup(2, 1, 4),
      { title: 'Pockets', open: true, items: [
        S('cut', 'Pocket shape', [['circle', 'Round'], ['hex', 'Hexagon'], ['rect', 'Rectangle'], ['slot', 'Slot (rounded ends)']], 'hex'),
        R('cutA', 'Size', 1, 80, 0.05, 6.35, 'mm', { labelFn: s => s.cut === 'circle' ? 'Diameter' : s.cut === 'hex' ? 'Across flats' : 'Width',
          hint: 'Measure your part; clearance is added below.' }),
        R('cutB', 'Length', 1, 150, 0.5, 20, 'mm', { show: s => /rect|slot/.test(s.cut) }),
        B('cutRot', 'Rotate 90°', false, { show: s => /rect|slot/.test(s.cut) }),
        R('cutDepth', 'Depth', 1, 120, 0.5, 10, 'mm'),
        R('cutClear', 'Clearance', 0, 1, 0.05, 0.2, 'mm', { hint: 'Added all round. 0.15–0.3 mm for a snug fit.' }),
        R('cutCham', 'Top chamfer', 0, 2, 0.1, 0.6, 'mm', { hint: 'Makes parts easy to drop in.' }),
      ] },
      { title: 'Layout', open: true, items: [
        S('cutLayout', 'Arrangement', [['auto', 'Fit as many as possible'], ['manual', 'Set rows & columns']], 'auto'),
        R('cutGap', 'Gap between pockets', 0.8, 20, 0.1, 2.5, 'mm', { show: s => s.cutLayout !== 'manual' }),
        B('cutStagger', 'Staggered rows (tighter packing)', true, { show: s => s.cutLayout !== 'manual' }),
        R('cutCols', 'Columns', 1, 30, 1, 3, '', { show: s => s.cutLayout === 'manual' }),
        R('cutRows', 'Rows', 1, 30, 1, 2, '', { show: s => s.cutLayout === 'manual' }),
        R('cutMargin', 'Edge margin', 1.5, 15, 0.5, 3, 'mm'),
      ] },
      { title: 'Top text', items: textItems('topText', 'topTextSize') },
      { title: 'Top & base', items: [
        B('lip', 'Stacking lip', false, { hint: 'Usually off for holders so tools sit proud.' }),
      ] },
      holesGroup(), advGroup(),
    ],
    presets: [
      ['¼″ hex bits', { nx: 2, ny: 1, hUnits: 4, cut: 'hex', cutA: 6.35, cutDepth: 10, cutClear: 0.15, cutStagger: true, cutGap: 2.5 }],
      ['AA batteries', { nx: 2, ny: 2, hUnits: 6, cut: 'circle', cutA: 14.5, cutDepth: 30, cutStagger: false, cutGap: 1.6 }],
      ['AAA batteries', { nx: 2, ny: 1, hUnits: 6, cut: 'circle', cutA: 10.5, cutDepth: 30, cutGap: 1.6 }],
      ['Pens & markers', { nx: 2, ny: 1, hUnits: 7, cut: 'circle', cutA: 11, cutDepth: 38, cutGap: 2.5 }],
      ['SD cards', { nx: 2, ny: 1, hUnits: 4, cut: 'rect', cutA: 2.4, cutB: 24.5, cutDepth: 20, cutStagger: false, cutGap: 3, cutClear: 0.2 }],
    ],
    build: s => ({ kind: 'bin', params: { ...binParams(s), solid: true } }),
    file: s => `gridfinity-holder-${s.cut}-${fmt(s.nx)}x${fmt(s.ny)}`,
  },

  lid: {
    label: 'Lid', icon: '<path d="M3 10h18v3H3z"/><path d="M5 13v5M19 13v5M9 7h6"/>',
    title: 'Lid',
    blurb: 'Sits in a bin’s stacking lip to keep dust out. Add a stacking lip on top and bins stack on the lid.',
    groups: [
      { title: 'Size', open: true, items: [
        R('nx', 'Width', 0.5, 10, 0.5, 2, 'units', { hint: 'Match the bin it covers.' }),
        R('ny', 'Depth', 0.5, 10, 0.5, 2, 'units'),
        R('lidT', 'Top plate thickness', 1.2, 8, 0.1, 2.2, 'mm'),
        B('lip', 'Stacking lip on top', false, { hint: 'Another bin can then stack on this lid.' }),
      ] },
      { title: 'Top text', open: true, items: textItems('topText', 'topTextSize') },
      holesGroup(), advGroup(),
    ],
    presets: [
      ['Flat lid', { nx: 2, ny: 2, lidT: 2.2, topText: '', lip: false }],
      ['Labelled', { nx: 2, ny: 2, lidT: 2.2, topText: 'SCREWS', textMode: 'emboss' }],
      ['Stackable', { nx: 2, ny: 2, lidT: 2.2, lip: true }],
    ],
    build: s => ({ kind: 'bin', params: { ...binParams({ ...s, hMode: 'mm', hMM: SPEC.footH + s.lidT }), solid: true, floor: 0.2 } }),
    file: s => `gridfinity-lid-${fmt(s.nx)}x${fmt(s.ny)}`,
  },

  plate: {
    label: 'Baseplate', icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    title: 'Baseplate',
    blurb: 'The grid everything clicks into. Pick a style; add padding to fill a drawer exactly.',
    groups: [
      { title: 'Size', open: true, items: [
        R('nx', 'Width', 1, 12, 0.5, 3, 'units', { hint: 'Too big for your bed? Use the Drawer fitter tab — it splits plates for you.' }),
        R('ny', 'Depth', 1, 12, 0.5, 3, 'units'),
        B('halfGrid', 'Half-grid (21 mm cells)', false),
      ] },
      { title: 'Style', open: true, items: plateStyleItems() },
      { title: 'Padding (fill a drawer)', items: [
        R('padL', 'Left', 0, 40, 0.1, 0, 'mm'), R('padR', 'Right', 0, 40, 0.1, 0, 'mm'),
        R('padF', 'Front', 0, 40, 0.1, 0, 'mm'), R('padB', 'Back', 0, 40, 0.1, 0, 'mm'),
        R('cornerR', 'Outer corner radius', 0.5, 20, 0.5, 4, 'mm'),
      ] },
    ],
    presets: [
      ['Minimal', { style: 'min' }], ['Magnetic', { style: 'mag' }], ['Weighted', { style: 'weight' }],
      ['Light & magnetic', { style: 'skel' }], ['Screw-down', { style: 'screw' }],
    ],
    build: s => ({ kind: 'baseplate', params: plateParams(s) }),
    file: s => `gridfinity-baseplate-${fmt(s.nx)}x${fmt(s.ny)}-${s.style}`,
  },

  drawer: {
    label: 'Drawer fitter', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 12h18M10 15.5h4"/>',
    title: 'Drawer fitter',
    blurb: 'Enter your drawer and your printer bed. We fill the drawer edge to edge and split the baseplate into pieces that fit your bed.',
    groups: [
      { title: 'Your drawer (inside)', open: true, items: [
        R('W', 'Width', 50, 1200, 0.5, 400, 'mm'), R('D', 'Depth', 50, 1200, 0.5, 300, 'mm'),
        R('H', 'Height', 10, 400, 0.5, 70, 'mm', { hint: 'Used to tell you the tallest bin that fits.' }),
        R('tol', 'Fit tolerance', 0, 5, 0.1, 1, 'mm', { hint: 'Total gap left so the plate drops in easily.' }),
        B('half', 'Use half units to fill gaps', true),
        S('align', 'Padding', [['center', 'Centre the grid'], ['fl', 'Grid to front-left']], 'center'),
      ] },
      { title: 'Your printer', open: true, items: [
        S('bed', 'Bed', [['180', 'Bambu A1 mini / 180 mm'], ['220', 'Ender 3 / 220 mm'], ['250x210', 'Prusa MK4 / 250 × 210'],
          ['256', 'Bambu X1 · P1 · A1 / 256 mm'], ['300', 'Ender 5 Plus class / 300+ mm'], ['360', 'Prusa XL / 360 mm'], ['custom', 'Custom…']], '256'),
        R('bedX', 'Bed X', 100, 600, 1, 256, 'mm', { show: s => s.bed === 'custom' }),
        R('bedY', 'Bed Y', 100, 600, 1, 256, 'mm', { show: s => s.bed === 'custom' }),
      ] },
      { title: 'Baseplate style', open: true, items: [...plateStyleItems(),
        B('clips', 'Connector clips between pieces', true, { hint: 'Bow-tie clips lock pieces together. Needs a 3.2 mm floor (set automatically).' })] },
    ],
    presets: [],
    file: () => 'gridfinity-drawer',
  },
};

function plateStyleItems() {
  return [
    S('style', 'Style', [['min', 'Minimal (open frame, least filament)'], ['mag', 'Magnetic'], ['weight', 'Weighted (magnets + weight pockets)'],
      ['skel', 'Skeleton (magnets, light)'], ['screw', 'Screw-down (mount to drawer)'], ['custom', 'Custom…']], 'mag'),
    R('floor', 'Floor thickness', 0, 8, 0.1, 0, 'mm', { show: s => s.style === 'custom', hint: '0 = open frame.' }),
    B('magnets', 'Magnet pockets', false, { show: s => s.style === 'custom' }),
    R('magD', 'Magnet hole Ø', 3, 12, 0.05, 6.5, 'mm', { show: s => plateHas(s).magnets }),
    R('magDepth', 'Magnet depth', 1, 4, 0.05, 2.4, 'mm', { show: s => plateHas(s).magnets }),
    B('magRibs', 'Press-fit crush ribs', false, { show: s => plateHas(s).magnets }),
    B('pushOut', 'Push-out holes under magnets', true, { show: s => plateHas(s).magnets, hint: 'Poke a magnet back out with a hex key.' }),
    B('weighted', 'Weight pockets underneath', false, { show: s => s.style === 'custom' }),
    B('skeleton', 'Skeleton cut-outs (saves filament)', false, { show: s => s.style === 'custom' }),
    S('mount', 'Mounting screw holes', [['none', 'None'], ['corners', 'Corner cells'], ['all', 'Every cell']], 'none',
      { show: s => s.style === 'custom' || s.style === 'screw' }),
  ];
}
const magFloor = (s) => +((s.magDepth ?? 2.4) + (s.pushOut ? 1 : 0.4)).toFixed(2);
function plateHas(s) {
  switch (s.style) {
    case 'min': return { floor: 0 };
    case 'mag': return { floor: magFloor(s), magnets: true };
    case 'weight': return { floor: 6.4, magnets: true, weighted: true };
    case 'skel': return { floor: magFloor(s), magnets: true, skeleton: true };
    case 'screw': return { floor: 2.4, mount: s.mount === 'none' ? 'corners' : s.mount };
    default: return { floor: s.floor, magnets: s.magnets, weighted: s.weighted, skeleton: s.skeleton, mount: s.mount };
  }
}
function plateParams(s) {
  const h = plateHas(s);
  return {
    nx: s.nx, ny: s.ny, halfGrid: !!s.halfGrid, padL: s.padL || 0, padR: s.padR || 0, padF: s.padF || 0, padB: s.padB || 0,
    cornerR: s.cornerR ?? 4, floor: h.floor || 0, magnets: !!h.magnets, weighted: !!h.weighted, skeleton: !!h.skeleton,
    mount: h.mount || 'none', magD: s.magD, magDepth: s.magDepth, magRibs: !!s.magRibs, pushOut: !!s.pushOut,
  };
}
function binParams(s) {
  return {
    nx: s.nx, ny: s.ny, hUnits: s.hUnits, hMM: s.hMode === 'mm' ? s.hMM : 0, clear: s.clear, halfGrid: !!s.halfGrid,
    wall: s.wall, floor: s.floor, lip: !!s.lip, lite: !!s.lite,
    divX: s.divX | 0, divY: s.divY | 0, ratiosX: s.ratiosX, ratiosY: s.ratiosY, divT: s.divT, divLower: s.divLower,
    scoop: (s.scoop || 0) / 100, tab: s.tab || 'none', tabDepth: s.tabDepth, tabLen: s.tabLen, labels: s.labels,
    textMode: s.textMode, textDepth: s.textDepth,
    holes: s.lite ? 'none' : (s.holes || 'none'), holeWhere: s.holeWhere, magD: s.magD, magDepth: s.magDepth,
    magRibs: !!s.magRibs, magCover: s.magCover || 0, screwD: s.screwD, screwDepth: s.screwDepth,
    cut: s.cut || 'none', cutA: s.cutA, cutB: s.cutB, cutDepth: s.cutDepth, cutClear: s.cutClear, cutGap: s.cutGap,
    cutMargin: s.cutMargin, cutLayout: s.cutLayout, cutCols: s.cutCols, cutRows: s.cutRows, cutStagger: !!s.cutStagger,
    cutRot: !!s.cutRot, cutCham: s.cutCham, topText: s.topText, topTextSize: s.topTextSize,
  };
}

/* ============================================================
   STATE
   ============================================================ */
const defaultsOf = (mode) => {
  const d = {};
  for (const g of MODES[mode].groups) for (const c of g.items) if (!(c.k in d)) d[c.k] = c.def;
  return d;
};
let mode = 'bin';
const states = {};
const stateOf = (m) => (states[m] ??= defaultsOf(m));

function readHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  const q = new URLSearchParams(h), m = q.get('m');
  if (!MODES[m]) return;
  mode = m;
  const d = defaultsOf(m), s = { ...d };
  for (const [k, v] of q) {
    if (!(k in d)) continue;
    s[k] = typeof d[k] === 'number' ? +v : typeof d[k] === 'boolean' ? v === '1' : v;
  }
  states[m] = s;
}
function shareURL() {
  const s = stateOf(mode), d = defaultsOf(mode), q = new URLSearchParams({ m: mode });
  for (const k of Object.keys(d)) if (s[k] !== d[k]) q.set(k, typeof s[k] === 'boolean' ? (s[k] ? '1' : '0') : s[k]);
  return location.origin + location.pathname + '#' + q;
}

/* ============================================================
   UI
   ============================================================ */
const tabsEl = $('#gf-tabs'), ctlEl = $('#gf-controls'), presetsEl = $('#gf-presets');
let uid = 0;

function renderTabs() {
  tabsEl.innerHTML = Object.entries(MODES).map(([k, m]) =>
    `<button type="button" aria-pressed="${k === mode}" data-m="${k}">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m.icon}</svg>
       <span>${m.label}</span></button>`).join('');
  tabsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.m === mode) return;
    mode = b.dataset.m; renderAll(); requestBuild(true);
  }));
}

function renderPresets() {
  const m = MODES[mode];
  presetsEl.classList.toggle('hidden', !m.presets.length);
  presetsEl.innerHTML = m.presets.length ? `<span class="gf-pre-lab">Start from</span>` + m.presets.map((p, i) =>
    `<button type="button" class="chip" data-i="${i}">${esc(p[0])}</button>`).join('') : '';
  presetsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    states[mode] = { ...defaultsOf(mode), ...m.presets[+b.dataset.i][1] };
    renderControls(); requestBuild(true);
    presetsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  }));
}

function ctlHTML(c, s) {
  const id = 'gf-' + c.k + '-' + (++uid);
  const lab = c.labelFn ? c.labelFn(s) : c.label;
  const hint = c.hint ? `<p class="hint" id="${id}-h">${esc(c.hint)}</p>` : '';
  const desc = c.hint ? ` aria-describedby="${id}-h"` : '';
  const v = s[c.k];
  if (c.type === 'range') return `
    <div class="gf-row" data-k="${c.k}">
      <div class="gf-lab"><label for="${id}">${esc(lab)}</label>
        <span class="gf-num"><input type="number" id="${id}" inputmode="decimal" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}"${desc}>
        ${c.unit ? `<span class="gf-unit">${c.unit}</span>` : ''}</span></div>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" aria-label="${esc(lab)}" tabindex="-1">
      ${hint}</div>`;
  if (c.type === 'select') return `
    <div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label>
      <select id="${id}"${desc}>${c.options.map(([ov, ol]) => `<option value="${ov}"${ov === v ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>${hint}</div>`;
  if (c.type === 'toggle') return `
    <div class="gf-row" data-k="${c.k}"><label class="gf-tog" for="${id}">
      <input type="checkbox" id="${id}" role="switch"${v ? ' checked' : ''}${desc}><span class="gf-sw" aria-hidden="true"></span>
      <span>${esc(lab)}</span></label>${hint}</div>`;
  return `
    <div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label>
      <input type="text" id="${id}" value="${esc(v || '')}" maxlength="${c.max || 60}" placeholder="${esc(c.placeholder || '')}" autocomplete="off" spellcheck="false"${desc}>${hint}</div>`;
}

function renderControls() {
  const m = MODES[mode], s = stateOf(mode);
  $('#gf-title').textContent = m.title;
  $('#gf-blurb').textContent = m.blurb;
  ctlEl.innerHTML = m.groups.map((g, gi) => `
    <details class="gf-group" ${g.open ? 'open' : ''}>
      <summary><span>${esc(g.title)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="gf-body">${g.items.map(c => ctlHTML(c, s)).join('')}</div>
    </details>`).join('');
  const all = m.groups.flatMap(g => g.items);
  for (const c of all) {
    const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`);
    if (!row || row.dataset.bound) continue;
    // a key can appear in only one visible row per mode; bind every row with that key
    ctlEl.querySelectorAll(`.gf-row[data-k="${c.k}"]`).forEach(r => bind(r, c));
  }
  applyVisibility();
}

function bind(row, c) {
  row.dataset.bound = 1;
  const s = () => stateOf(mode);
  if (c.type === 'range') {
    const num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
    const set = (v, from) => {
      v = Math.min(c.max, Math.max(c.min, +v));
      if (!isFinite(v)) return;
      s()[c.k] = v;
      if (from !== num) num.value = fmt(v, 3);
      if (from !== rng) rng.value = v;
      changed(c);
    };
    rng.addEventListener('input', () => set(rng.value, rng));
    num.addEventListener('change', () => set(num.value === '' ? c.def : num.value, num));
    num.addEventListener('input', () => { if (num.value !== '' && isFinite(+num.value) && +num.value >= c.min && +num.value <= c.max) set(num.value, num); });
  } else if (c.type === 'select') {
    const el = row.querySelector('select');
    el.addEventListener('change', () => { s()[c.k] = el.value; changed(c); });
  } else if (c.type === 'toggle') {
    const el = row.querySelector('input');
    el.addEventListener('change', () => { s()[c.k] = el.checked; changed(c); });
  } else {
    const el = row.querySelector('input');
    el.addEventListener('input', () => { s()[c.k] = el.value; changed(c); });
  }
}

function changed(c) {
  presetsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
  if (c.k === 'cut' || c.k === 'hMode') refreshLabels();
  if (c.k === 'hMode') syncHeight();
  applyVisibility();
  if (mode === 'drawer') { if (c.k === 'bed') syncBed(); drawerChanged(); }
  else requestBuild();
}
function syncHeight() {
  const s = stateOf(mode);
  if (s.hMode === 'mm') s.hMM = s.hUnits * SPEC.unitH; else s.hUnits = Math.max(1, Math.round(s.hMM / SPEC.unitH));
  for (const k of ['hMM', 'hUnits']) {
    const row = ctlEl.querySelector(`.gf-row[data-k="${k}"]`);
    if (row) { row.querySelector('input[type=number]').value = s[k]; row.querySelector('input[type=range]').value = s[k]; }
  }
}
function syncBed() {
  const s = stateOf('drawer');
  if (s.bed !== 'custom') { const [x, y] = s.bed.split('x').map(Number); s.bedX = x; s.bedY = y || x; }
}
function refreshLabels() {
  const s = stateOf(mode);
  for (const g of MODES[mode].groups) for (const c of g.items) if (c.labelFn) {
    const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`);
    if (row) { const t = c.labelFn(s); row.querySelector('label').textContent = t; row.querySelector('input[type=range]').setAttribute('aria-label', t); }
  }
}
function applyVisibility() {
  const s = stateOf(mode);
  for (const g of MODES[mode].groups) for (const c of g.items) {
    const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`);
    if (row && c.show) row.classList.toggle('hidden', !c.show(s));
  }
}

function renderAll() {
  renderTabs(); renderPresets(); renderControls();
  const isDrawer = mode === 'drawer';
  $('#gf-drawer').classList.toggle('hidden', !isDrawer);
  $('#gf-actions').classList.toggle('hidden', isDrawer);
  $('#gf-dactions').classList.toggle('hidden', !isDrawer);
  if (isDrawer) { syncBed(); drawerChanged(); }
}

/* ============================================================
   VIEWER
   ============================================================ */
const stage = $('#gf-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label', '3D preview of the generated model. Drag to rotate, pinch or scroll to zoom.');
renderer.domElement.setAttribute('role', 'img');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 8000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x04122b, 1.1));
const key = new THREE.DirectionalLight(0xffd3a0, 1.6); key.position.set(160, 260, 200); scene.add(key);
const rim = new THREE.DirectionalLight(0x2fa0e0, 1.0); rim.position.set(-220, 120, -180); scene.add(rim);
const material = new THREE.MeshStandardMaterial({ color: 0xf3662e, metalness: 0.2, roughness: 0.48, flatShading: true });
let meshObj = null, gridObj = null, lastFit = '';

function gridFor(w, d) {
  if (gridObj) { scene.remove(gridObj); gridObj.geometry.dispose(); }
  const P = SPEC.pitch, nx = Math.ceil(w / P / 2 + 2) * 2, ny = Math.ceil(d / P / 2 + 2) * 2;
  const pts = [];
  for (let i = -nx / 2; i <= nx / 2; i++) pts.push(i * P, 0, -ny / 2 * P, i * P, 0, ny / 2 * P);
  for (let j = -ny / 2; j <= ny / 2; j++) pts.push(-nx / 2 * P, 0, j * P, nx / 2 * P, 0, j * P);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  gridObj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1182c9, transparent: true, opacity: 0.35 }));
  // offset so whole-unit models sit on the grid cells
  gridObj.position.set((Math.round(w / P) % 2) ? P / 2 : 0, -0.05, (Math.round(d / P) % 2) ? P / 2 : 0);
  scene.add(gridObj);
}

function showMesh(pos, idx, info) {
  if (meshObj) { scene.remove(meshObj); meshObj.geometry.dispose(); }
  const g = new THREE.BufferGeometry();
  // copy: rotating for display must not touch the data we export
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.rotateX(-Math.PI / 2);            // Z-up (printer) → Y-up (three)
  g.computeVertexNormals();
  meshObj = new THREE.Mesh(g, material); scene.add(meshObj);
  g.computeBoundingBox();
  const bb = g.boundingBox, size = new THREE.Vector3(); bb.getSize(size);
  const fitKey = [mode, Math.round(size.x / 10), Math.round(size.z / 10), Math.round(size.y / 10)].join();
  gridFor(size.x, size.z);
  if (fitKey !== lastFit) {           // only reframe when the size class changes
    lastFit = fitKey;
    const r = Math.max(size.x, size.y * 1.4, size.z) * 0.5 + 10;
    const dist = r / Math.sin(camera.fov * Math.PI / 360) * 1.08;
    const c = new THREE.Vector3(); bb.getCenter(c);
    controls.target.copy(c);
    camera.position.set(c.x + dist * 0.5, c.y + dist * 0.62, c.z + dist * 0.62);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  }
}
/* view tools: re-frame and full screen */
$('#gf-fit').addEventListener('click', () => { lastFit = ''; if (current) showMesh(current.pos, current.idx, current.info); });
const fsBtn = $('#gf-full');
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.hidden = true;
fsBtn.addEventListener('click', () => {
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
});
const fsSync = () => { const on = !!fsEl(); fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen'); fsBtn.title = on ? 'Exit full screen' : 'Full screen'; };
document.addEventListener('fullscreenchange', fsSync); document.addEventListener('webkitfullscreenchange', fsSync);

function resize() {
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

/* ============================================================
   WORKER
   ============================================================ */
let worker = null, builds = 0, busy = false, pending = null, reqId = 0;
const handlers = new Map();
function getWorker() {
  if (worker && builds > 30 && !busy) { worker.terminate(); worker = null; }   // free WASM memory now and then
  if (!worker) {
    builds = 0;
    worker = new Worker(new URL('./gridfinity-worker.js?v=2', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const h = handlers.get(e.data.id); if (h) h(e.data); };
    worker.onerror = (e) => { setStatus('The geometry engine failed to load. Try reloading the page.', 'bad'); console.error(e); busy = false; };
  }
  return worker;
}
function run(jobs, onPart) {
  return new Promise((resolve, reject) => {
    const id = ++reqId; busy = true; builds++;
    const parts = [];
    handlers.set(id, (d) => {
      if (d.error) { handlers.delete(id); busy = false; reject(new Error(d.error)); return; }
      if (d.done) { handlers.delete(id); busy = false; resolve(parts); return; }
      parts.push(d); onPart?.(d);
    });
    getWorker().postMessage({ id, jobs });
  });
}

const statusEl = $('#gf-status'), warnEl = $('#gf-warn'), readEl = $('#gf-readout');
function setStatus(msg, kind = '') { statusEl.textContent = msg; statusEl.dataset.kind = kind; }
let current = null, debounceT = 0, firstBuild = true;

function requestBuild(now = false) {
  clearTimeout(debounceT);
  debounceT = setTimeout(doBuild, now ? 0 : 140);
}
async function doBuild() {
  if (mode === 'drawer') return;
  const m = MODES[mode], s = stateOf(mode), job = { ...m.build(s), name: m.file(s) };
  if (busy) { pending = true; return; }
  const buildMode = mode;
  stage.classList.add('is-busy');
  setStatus(firstBuild ? 'Loading geometry engine…' : 'Building…');
  try {
    const [part] = await run([job]);
    firstBuild = false;
    if (buildMode === mode) {
      current = { ...part, file: m.file(s) };
      showMesh(part.pos, part.idx, part.info);
      showInfo(part);
    }
  } catch (err) {
    setStatus('Could not build this combination: ' + err.message, 'bad');
  } finally {
    stage.classList.remove('is-busy');
    if (pending) { pending = false; requestBuild(true); }
  }
}

const DENSITY = 1.24;   // PLA g/cm³
function showInfo(p) {
  const i = p.info, grams = p.volume / 1000 * DENSITY;
  readEl.innerHTML = `${fmt(i.W, 1)} × ${fmt(i.D, 1)} × ${fmt(i.H, 2)} mm<br>≈ ${fmt(grams, grams < 10 ? 1 : 0)} g PLA`;
  const facts = [];
  if (i.compartments > 1) facts.push(`${i.compartments} compartments`);
  if (i.cutCount) facts.push(`${i.cutCount} pockets`);
  if (i.cells) facts.push(`${i.cells} cells`);
  if (i.floor != null && mode === 'plate') facts.push(`${fmt(i.floor, 2)} mm floor`);
  if (i.bodyH && mode === 'bin') facts.push(`Floor at ${fmt(i.floorZ, 2)} mm`);
  setStatus(facts.join(' · ') || 'Ready', 'ok');
  const notes = [...p.warn];
  if (i.pauseZ) notes.unshift(`Print-in magnets: add a pause at Z = ${fmt(i.pauseZ, 2)} mm (the first layer above that height), drop the magnets in, resume.`);
  warnEl.innerHTML = notes.map(w => `<li>${esc(w)}</li>`).join('');
  warnEl.classList.toggle('hidden', !notes.length);
}

/* ============================================================
   DOWNLOADS
   ============================================================ */
function save(data, name, type = 'application/octet-stream') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$('#gf-stl').addEventListener('click', () => {
  if (!current) return;
  save(meshToSTL(current.pos, current.idx, current.file), current.file + '.stl');
  window.HHQ?.toast('STL downloaded. Slice it and go.');
});
$('#gf-3mf').addEventListener('click', () => {
  if (!current) return;
  save(meshesTo3MF([{ name: current.file, pos: current.pos, idx: current.idx }]), current.file + '.3mf', 'model/3mf');
  window.HHQ?.toast('3MF downloaded.');
});
async function copyLink() {
  try { await navigator.clipboard.writeText(shareURL()); window.HHQ?.toast('Link copied. It rebuilds this exact design.'); }
  catch { window.HHQ?.toast('Could not copy. Check clipboard permissions.', 'warn'); }
  history.replaceState(null, '', shareURL());
}
$('#gf-link').addEventListener('click', copyLink);
$('#gf-dlink').addEventListener('click', copyLink);
$('#gf-reset').addEventListener('click', () => {
  states[mode] = defaultsOf(mode); history.replaceState(null, '', location.pathname);
  renderControls(); renderPresets(); requestBuild(true);
});

/* ============================================================
   DRAWER FITTER
   ============================================================ */
let plan = null, planParts = null, selPiece = 0;
function drawerChanged() {
  const s = stateOf('drawer');
  const plateFloor = plateParams({ ...s, nx: 1, ny: 1 }).floor;
  plan = fitDrawer({ W: s.W, D: s.D, H: s.H, bedX: s.bedX, bedY: s.bedY, tol: s.tol, half: !!s.half,
    align: s.align === 'center' ? 'center' : 'fl', plateFloor: Math.max(plateFloor, s.clips ? 3.2 : 0) });
  planParts = null;
  renderPlan();
  selPiece = Math.min(selPiece, Math.max(0, plan.pieces.length - 1));
  clearTimeout(debounceT);
  debounceT = setTimeout(() => previewPiece(selPiece), 200);
}
function pieceJob(pc) {
  const s = stateOf('drawer');
  return { kind: 'baseplate', name: `gridfinity-drawer-${pc.id}`,
    params: { ...plateParams({ ...s, nx: pc.nx, ny: pc.ny, padL: pc.padL, padR: pc.padR, padF: pc.padF, padB: pc.padB, cornerR: 4 }),
      joinL: pc.joinL, joinR: pc.joinR, joinF: pc.joinF, joinB: pc.joinB, clips: !!s.clips } };
}
function renderPlan() {
  const el = $('#gf-plan'), s = stateOf('drawer');
  if (!plan.pieces.length) {
    el.innerHTML = `<div class="note note--warn"><p>That drawer is smaller than one Gridfinity unit (42 mm) after tolerance, or a single cell won't fit your bed.</p></div>`;
    $('#gf-dzip').disabled = true; $('#gf-d3mf').disabled = true; return;
  }
  $('#gf-dzip').disabled = false; $('#gf-d3mf').disabled = false;
  const P = SPEC.pitch, W = s.W - s.tol, D = s.D - s.tol;
  const sc = 100 / Math.max(W, D);
  const pw = (pc) => pc.nx * P + pc.padL + pc.padR, pd = (pc) => pc.ny * P + pc.padF + pc.padB;
  const xs = [0], ys = [0];
  plan.pieces.filter(pc => pc.j === 0).forEach(pc => xs.push(xs[xs.length - 1] + pw(pc)));
  plan.pieces.filter(pc => pc.i === 0).forEach(pc => ys.push(ys[ys.length - 1] + pd(pc)));
  const vw = W * sc, vh = D * sc;
  let svg = `<svg viewBox="-2 -2 ${vw + 4} ${vh + 8}" role="img" aria-label="Drawer layout: ${plan.pieces.length} baseplate pieces">`;
  svg += `<rect x="0" y="0" width="${vw}" height="${vh}" rx="1.5" class="gp-drawer"/>`;
  for (const pc of plan.pieces) {
    const x = xs[pc.i] * sc, yTop = vh - (ys[pc.j] + pd(pc)) * sc, w = pw(pc) * sc, h = pd(pc) * sc;
    const gx0 = x + pc.padL * sc, gy0 = yTop + pc.padB * sc;
    svg += `<g class="gp-piece${plan.pieces.indexOf(pc) === selPiece ? ' is-sel' : ''}" data-p="${plan.pieces.indexOf(pc)}" tabindex="0" role="button" aria-label="Preview piece ${pc.id}">`;
    svg += `<rect x="${x + 0.15}" y="${yTop + 0.15}" width="${w - 0.3}" height="${h - 0.3}" rx="1" class="gp-body"/>`;
    for (let cx = 0; cx < pc.nx - 1e-6; cx += 1) for (let cy = 0; cy < pc.ny - 1e-6; cy += 1) {
      const cw = Math.min(1, pc.nx - cx), ch = Math.min(1, pc.ny - cy);
      svg += `<rect x="${gx0 + cx * P * sc + 0.5}" y="${gy0 + (pc.ny - cy - ch) * P * sc + 0.5}" width="${cw * P * sc - 1}" height="${ch * P * sc - 1}" rx="0.8" class="gp-cell"/>`;
    }
    svg += `<text x="${x + w / 2}" y="${yTop + h / 2}" class="gp-id">${pc.id}</text></g>`;
  }
  svg += `<text x="${vw / 2}" y="${vh + 4}" class="gp-front">▼ FRONT OF DRAWER</text></svg>`;
  const clipsN = s.clips ? plan.pieces.reduce((a, pc) => a + (pc.joinR ? Math.ceil(pc.ny) : 0) + (pc.joinB ? Math.ceil(pc.nx) : 0), 0) : 0;
  el.innerHTML = `
    <div class="gf-plan-svg">${svg}</div>
    <dl class="gf-facts">
      <div><dt>Grid</dt><dd>${fmt(plan.ux)} × ${fmt(plan.uy)} units</dd></div>
      <div><dt>Pieces</dt><dd>${plan.pieces.length} (${plan.cols} × ${plan.rows})${plan.rotated ? ' · rotate on bed' : ''}</dd></div>
      <div><dt>Padding L / R</dt><dd>${fmt(plan.padL, 1)} / ${fmt(plan.padR, 1)} mm</dd></div>
      <div><dt>Padding F / B</dt><dd>${fmt(plan.padF, 1)} / ${fmt(plan.padB, 1)} mm</dd></div>
      <div><dt>Tallest bin</dt><dd>${plan.maxBinUnits} units with lip · ${plan.maxBinUnitsNoLip} without</dd></div>
      ${clipsN ? `<div><dt>Clips</dt><dd>${clipsN} to print</dd></div>` : ''}
    </dl>
    <p class="hint">Tap a piece to preview it. The zip includes every piece, the clips, and a layout sheet.</p>`;
  el.querySelectorAll('.gp-piece').forEach(g => {
    const go = () => { selPiece = +g.dataset.p; el.querySelectorAll('.gp-piece').forEach(x => x.classList.toggle('is-sel', x === g)); previewPiece(selPiece); };
    g.addEventListener('click', go);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}
async function previewPiece(i) {
  if (mode !== 'drawer' || !plan?.pieces[i]) return;
  if (busy) { setTimeout(() => previewPiece(i), 150); return; }
  stage.classList.add('is-busy'); setStatus(firstBuild ? 'Loading geometry engine…' : `Building piece ${plan.pieces[i].id}…`);
  try {
    const [part] = await run([pieceJob(plan.pieces[i])]);
    firstBuild = false;
    if (mode === 'drawer') { current = { ...part, file: part.name }; showMesh(part.pos, part.idx, part.info); showInfo(part);
      setStatus(`Piece ${plan.pieces[i].id} · ${fmt(part.info.W, 1)} × ${fmt(part.info.D, 1)} mm`, 'ok'); }
  } catch (err) { setStatus('Could not build: ' + err.message, 'bad'); }
  finally { stage.classList.remove('is-busy'); }
}
async function buildAllPieces() {
  if (planParts) return planParts;
  const s = stateOf('drawer');
  const jobs = plan.pieces.map(pieceJob);
  const clipsN = s.clips ? plan.pieces.reduce((a, pc) => a + (pc.joinR ? Math.ceil(pc.ny) : 0) + (pc.joinB ? Math.ceil(pc.nx) : 0), 0) : 0;
  if (clipsN) jobs.push({ kind: 'clip', name: `gridfinity-clips-x${clipsN}`, params: { count: clipsN } });
  stage.classList.add('is-busy');
  try {
    planParts = await run(jobs, (d) => setStatus(`Building ${d.n + 1} of ${d.total}…`));
    return planParts;
  } finally { stage.classList.remove('is-busy'); }
}
function layoutSheet() {
  const s = stateOf('drawer');
  return [
    'HOTEND HQ - GRIDFINITY DRAWER LAYOUT', `Made with ${location.origin}${location.pathname}`, '',
    `Drawer: ${s.W} x ${s.D} x ${s.H} mm (tolerance ${s.tol} mm)`, `Bed: ${s.bedX} x ${s.bedY} mm`,
    `Grid: ${plan.ux} x ${plan.uy} units, ${plan.cols} x ${plan.rows} pieces`,
    `Padding: left ${fmt(plan.padL, 2)}, right ${fmt(plan.padR, 2)}, front ${fmt(plan.padF, 2)}, back ${fmt(plan.padB, 2)} mm`, '',
    'Pieces (A = front row, 1 = left column):',
    ...plan.pieces.map(pc => `  ${pc.id}: ${pc.nx} x ${pc.ny} units`), '',
    `Tallest bin that fits: ${plan.maxBinUnits} units with stacking lip, ${plan.maxBinUnitsNoLip} without.`,
    s.clips ? 'Clips: press one into each bow-tie pocket on the underside where pieces meet.' : '',
    '', `Rebuild this design: ${shareURL()}`,
  ].join('\n');
}
$('#gf-dzip').addEventListener('click', async () => {
  try {
    const parts = await buildAllPieces();
    const files = parts.map(p => ({ name: p.name + '.stl', data: meshToSTL(p.pos, p.idx, p.name) }));
    files.push({ name: 'LAYOUT.txt', data: new TextEncoder().encode(layoutSheet()) });
    save(zip(files), 'gridfinity-drawer.zip', 'application/zip');
    setStatus(`${parts.length} files ready`, 'ok'); window.HHQ?.toast('Zip downloaded.');
  } catch (e) { setStatus('Could not build: ' + e.message, 'bad'); }
});
$('#gf-d3mf').addEventListener('click', async () => {
  try {
    const parts = await buildAllPieces();
    save(meshesTo3MF(parts.map(p => ({ name: p.name, pos: p.pos, idx: p.idx }))), 'gridfinity-drawer.3mf', 'model/3mf');
    setStatus(`${parts.length} objects in one 3MF`, 'ok'); window.HHQ?.toast('3MF downloaded.');
  } catch (e) { setStatus('Could not build: ' + e.message, 'bad'); }
});

/* ============================================================
   BOOT
   ============================================================ */
readHash();
renderAll();
resize();
if (mode !== 'drawer') requestBuild(true);
