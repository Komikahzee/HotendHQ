/* ============================================================
   HOTEND HQ — Chain generator (UI + viewer)
   Geometry runs in chain-worker.js.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { meshToSTL, meshesTo3MF, zip } from './gridfinity-core.js?v=cd2b8dee8c';
import { PRINTERS, printerOptions, printerById, printerForBed, loadPrinter, savePrinter } from './printers.js?v=ff3522465e';
import { STYLES, DEFAULTS } from './chain-build.js?v=289509d433';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 1) => (+v).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const IN = 25.4;

/* ============================================================
   CONTROLS
   ============================================================ */
const R = (k, label, min, max, step, def, unit = 'mm', extra = {}) => ({ k, label, type: 'range', min, max, step, def, unit, ...extra });
const S = (k, label, options, def, extra = {}) => ({ k, label, type: 'select', options, def, ...extra });
const B = (k, label, def, extra = {}) => ({ k, label, type: 'toggle', def, ...extra });
const X = (k, label, def, extra = {}) => ({ k, label, type: 'text', def, ...extra });

const styleOptions = () => {
  const groups = {};
  for (const [k, s] of Object.entries(STYLES)) (groups[s.group] ||= []).push([k, s.name]);
  return groups;
};
const kindOf = (s) => (STYLES[s.style] || {}).kind;
const isRing = (s) => kindOf(s) === 'ring';
const LENGTHS = [['356', '14 in (choker)'], ['406', '16 in'], ['457', '18 in (most common)'], ['508', '20 in'], ['559', '22 in'], ['610', '24 in'], ['762', '30 in'], ['exact', 'Exact length…']];
const MYP = loadPrinter();          // the printer picked on any generator, remembered on this device

const GROUPS = [
  { title: 'Chain style', open: true, items: [
    S('style', 'Style', null, 'oval', { grouped: true }),
    S('shape', 'Link shape', [['heart', 'Heart'], ['star', 'Star'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon']], 'heart', { show: s => s.style === 'shaped' }),
    X('name', 'Name', 'MAYA', { show: s => s.style === 'name', max: 16, placeholder: 'e.g. MAYA', hint: 'Up to 16 letters or numbers.' }),
    R('letterH', 'Letter / shape height', 5, 20, 0.5, 9, 'mm', { show: s => s.style === 'name' || s.style === 'custom' }),
    R('plateT', 'Letter / shape thickness', 1, 3, 0.1, 1.6, 'mm', { show: s => s.style === 'name' || s.style === 'custom' }),
    X('pattern', 'Pattern', 'long, short, short, rolo', { show: s => s.style === 'pattern', max: 120, placeholder: 'long, short x2, rolo',
      hint: 'Words: long, short, oval, round, rolo, clip. Add x2, x3 to repeat. The pattern repeats along the chain.' }),
    { k: 'upload', type: 'upload', show: s => s.style === 'custom' },
  ] },
  { title: '1. Sizing', open: true, items: [
    S('lengthSel', 'Length', LENGTHS, '457'),
    R('lengthMM', 'Exact length', 40, 1200, 1, 457, 'mm', { show: s => s.lengthSel === 'exact' }),
    R('wire', 'Wire thickness', 0.6, 4, 0.05, 1.5, 'mm'),
    R('linkL', 'Link length', 3, 30, 0.1, 10, 'mm', { labelFn: s => kindOf(s) === 'bike' ? 'Link length (pitch)' : kindOf(s) === 'snake' ? 'Segment length' : 'Link length', show: s => s.style !== 'rolo' && s.style !== 'box' && kindOf(s) !== 'kit' && kindOf(s) !== 'ball' }),
    R('linkW', 'Link width', 3, 24, 0.1, 6, 'mm', { labelFn: s => kindOf(s) === 'ball' ? 'Bead diameter' : s.style === 'rolo' || s.style === 'box' ? 'Link size' : kindOf(s) === 'bike' ? 'Plate height' : 'Link width', show: s => kindOf(s) !== 'kit' }),
    S('profile', 'Wire profile', [['round', 'Round'], ['square', 'Square'], ['flat', 'Flat'], ['faceted', 'Faceted (diamond-cut)']], 'round',
      { show: s => isRing(s) && !STYLES[s.style].profile }),
  ] },
  { title: '2. Printer fit', open: true, items: [
    S('nozzle', 'Nozzle', [['0.2', '0.2 mm (fine detail)'], ['0.4', '0.4 mm (standard)'], ['0.6', '0.6 mm (chunky)']], '0.4',
      { hint: 'Sets the thinnest wire and smallest gap that will print.' }),
    S('bed', 'Your printer', null, MYP.id, { printers: true, hint: 'The chain folds back and forth to fit your bed, and splits into parts if it has to.' }),
    R('bedX', 'Bed X', 100, 600, 1, MYP.id === 'custom' ? MYP.x : 256, 'mm', { show: s => s.bed === 'custom' }),
    R('bedY', 'Bed Y', 100, 600, 1, MYP.id === 'custom' ? MYP.y : 256, 'mm', { show: s => s.bed === 'custom' }),
    R('clearance', 'Gap between links', 0.15, 0.8, 0.01, 0.35, 'mm', { hint: 'Too tight and links fuse; too loose and the chain rattles.' }),
    { k: 'strip', type: 'button', label: 'Download test strip', hint: 'Three short chains at your gap and 0.1 mm either side, labelled.' },
  ] },
  { title: '3. Ends and fit', items: [
    S('ends', 'Chain ends', [['loops', 'Plain end loops (add any clasp)'], ['toggle', 'Built-in toggle clasp'], ['endless', 'Endless loop (no clasp, slips over your head)'], ['none', 'Open (no end links)']], 'loops',
      { show: s => isRing(s), hint: 'Endless prints as one closed loop, ready to wear. Use 24 in or longer so it fits over your head.' }),
    B('extender', 'Extender tail (2 in of smaller links)', false, { show: s => isRing(s) && s.ends !== 'toggle' && s.ends !== 'endless', hint: 'Lets a clasp hook in anywhere for adjustable length.' }),
    B('jumpRings', 'Include jump rings', true, { hint: 'Two open rings sized to the chain, for a pendant or clasp. Split chains get extra rings to join the parts.' }),
  ] },
  { title: '4. Looks', items: [
    R('graduated', 'Graduated (bigger toward the middle)', 0, 100, 5, 0, '%', { show: s => isRing(s) && s.style !== 'name' && s.style !== 'custom' }),
    B('twoTone', 'Two-tone (alternate colors)', false, { hint: 'Exported as two color objects in the 3MF for AMS and multi-material printers.' }),
    S('stations', 'Station beads', [['0', 'None'], ['3', 'Every 3 cm'], ['5', 'Every 5 cm'], ['8', 'Every 8 cm']], '0', { show: s => isRing(s) && s.style !== 'name' && s.style !== 'custom' }),
    R('beadD', 'Bead size', 4, 14, 0.5, 7, 'mm', { show: s => isRing(s) && s.stations !== '0' && s.style !== 'name' && s.style !== 'custom' }),
  ] },
  { title: '5. Cost & weight', items: [
    S('material', 'Material', [['petg', 'PETG'], ['silk', 'Silk PLA'], ['pla', 'PLA'], ['tpu', 'TPU'], ['abs', 'ABS'], ['asa', 'ASA']], 'petg'),
    R('pricePerKg', 'Filament price', 5, 80, 1, 20, '$/kg'),
  ] },
];
const COLORS = [['silver', 'Silk silver', 0xc9ced6, 0.75, 0.28], ['gold', 'Silk gold', 0xe0b04a, 0.8, 0.26], ['black', 'Black', 0x24282e, 0.2, 0.45],
  ['white', 'White', 0xeef0f2, 0.05, 0.55], ['flame', 'Flame orange', 0xf3662e, 0.15, 0.4]];

const PRESETS = [
  ['Delicate pendant chain', { style: 'trace', wire: 1.2, linkL: 9, linkW: 4.4, lengthSel: '457', color: 'silver' }],
  ['Everyday', { style: 'oval', lengthSel: '508', color: 'silver' }],
  ['Chunky streetwear', { style: 'cuban', wire: 2.4, linkL: 9.5, linkW: 8, lengthSel: '559', color: 'gold' }],
  ['Cosplay', { style: 'curb', wire: 2.6, linkL: 14, linkW: 9, lengthSel: '610', color: 'black', material: 'petg' }],
  ['Keychain', { style: 'rolo', wire: 2, linkL: 8, linkW: 8, lengthSel: 'exact', lengthMM: 100, color: 'flame', ends: 'loops' }],
];

/* ============================================================
   STATE
   ============================================================ */
const allItems = GROUPS.flatMap(g => g.items).filter(c => c.k && c.type !== 'upload' && c.type !== 'button');
const defaults = () => { const d = { color: 'silver', color2: 'flame' }; for (const c of allItems) d[c.k] = c.def; Object.assign(d, styleDims('oval')); return d; };
function styleDims(style) { const d = (STYLES[style] || {}).d || {}; return { linkL: d.linkL ?? 10, linkW: d.linkW ?? 6, wire: d.wire ?? 1.5 }; }
let state = defaults();
let polys = null;           // traced custom shape

function readHash() {
  const h = location.hash.replace(/^#/, ''); if (!h) return;
  const q = new URLSearchParams(h), st = q.get('style');
  const d = { ...defaults(), ...(STYLES[st] ? { style: st, ...styleDims(st) } : {}) };
  for (const [k, v] of q) {
    if (!(k in d)) continue;
    d[k] = typeof d[k] === 'number' ? +v : typeof d[k] === 'boolean' ? v === '1' : v;
  }
  if (d.bed !== 'custom' && !printerById(d.bed)) {          // old links carried a bed size like 256x256
    const p = printerForBed(d.bed) || { id: MYP.id };
    d.bed = p.id; if (p.id === 'custom') { d.bedX = p.x; d.bedY = p.y; }
  }
  state = d;
}
function shareURL() {
  const d = { ...defaults(), ...styleDims(state.style) }, q = new URLSearchParams();
  for (const k of Object.keys(d)) if (state[k] !== d[k] || k === 'style') q.set(k, typeof state[k] === 'boolean' ? (state[k] ? '1' : '0') : state[k]);
  return location.origin + location.pathname + (q.toString() ? '#' + q : '');
}
function params() {
  const pr = printerById(state.bed);
  const [bx, by] = pr ? [pr.x, pr.y] : [state.bedX, state.bedY];
  const len = state.lengthSel === 'exact' ? state.lengthMM : +state.lengthSel;
  const p = {
    style: state.style, shape: state.shape, name: state.name, letterH: state.letterH, plateT: state.plateT, pattern: state.pattern,
    lengthMM: len, wire: state.wire, linkL: state.linkL, linkW: state.linkW, profile: state.profile,
    nozzle: +state.nozzle, bedX: bx, bedY: by, clearance: state.clearance,
    ends: state.ends, extender: state.extender && state.ends !== 'toggle' && state.ends !== 'endless', jumpRings: state.jumpRings,
    graduated: state.graduated, twoTone: state.twoTone, stations: +state.stations, beadD: state.beadD,
    material: state.material, pricePerKg: state.pricePerKg,
  };
  if (state.style === 'rolo' || state.style === 'box') p.linkL = p.linkW;
  return p;
}

/* ============================================================
   UI
   ============================================================ */
const ctlEl = $('#ch-controls');
let uid = 0;
function ctlHTML(c) {
  const id = 'ch-' + c.k + '-' + (++uid), v = state[c.k];
  const lab = c.labelFn ? c.labelFn(state) : c.label;
  const hint = c.hint ? `<p class="hint" id="${id}-h">${esc(c.hint)}</p>` : '';
  const desc = c.hint ? ` aria-describedby="${id}-h"` : '';
  if (c.type === 'range') return `<div class="gf-row" data-k="${c.k}">
      <div class="gf-lab"><label for="${id}">${esc(lab)}</label>
        <span class="gf-num"><input type="number" id="${id}" inputmode="decimal" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}"${desc}>
        ${c.unit ? `<span class="gf-unit">${c.unit}</span>` : ''}</span></div>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" aria-label="${esc(lab)}" tabindex="-1">${hint}</div>`;
  if (c.type === 'select') {
    let opts;
    if (c.printers) opts = printerOptions(v);
    else if (c.grouped) opts = Object.entries(styleOptions()).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(([ov, ol]) => `<option value="${ov}"${ov === v ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</optgroup>`).join('');
    else opts = c.options.map(([ov, ol]) => `<option value="${ov}"${ov === v ? ' selected' : ''}>${esc(ol)}</option>`).join('');
    return `<div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label><select id="${id}"${desc}>${opts}</select>${hint}</div>`;
  }
  if (c.type === 'toggle') return `<div class="gf-row" data-k="${c.k}"><label class="gf-tog" for="${id}">
      <input type="checkbox" id="${id}" role="switch"${v ? ' checked' : ''}${desc}><span class="gf-sw" aria-hidden="true"></span><span>${esc(lab)}</span></label>${hint}</div>`;
  if (c.type === 'text') return `<div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label>
      <input type="text" id="${id}" value="${esc(v || '')}" maxlength="${c.max || 60}" placeholder="${esc(c.placeholder || '')}" autocomplete="off" spellcheck="false"${desc}>${hint}</div>`;
  if (c.type === 'button') return `<div class="gf-row" data-k="${c.k}"><button type="button" class="btn btn-ghost btn-sm" id="ch-strip">${esc(c.label)}</button>${hint}</div>`;
  if (c.type === 'upload') return `<div class="gf-row ch-upload" data-k="upload">
      <label class="ch-drop" id="ch-drop"><input type="file" id="ch-file" accept=".svg,image/png,image/jpeg,image/webp,image/svg+xml">
        <strong>Upload a shape</strong><br>SVG, PNG or JPG. Dark areas become the link.</label>
      <div class="ch-trace hidden" id="ch-trace"><canvas id="ch-trace-cv" width="84" height="84" aria-label="Traced shape preview"></canvas>
        <div style="flex:1"><div class="gf-lab"><label for="ch-thr">Threshold</label><span class="gf-unit" id="ch-thr-v">50%</span></div>
          <input type="range" id="ch-thr" min="5" max="95" step="1" value="50">
          <label class="gf-tog" for="ch-inv" style="margin-top:4px"><input type="checkbox" id="ch-inv" role="switch"><span class="gf-sw" aria-hidden="true"></span><span>Invert</span></label></div></div>
      <p class="hint">Shapes are traced on your device and never uploaded. Custom shapes can't travel in a share link.</p></div>`;
  return '';
}
function render() {
  ctlEl.innerHTML = GROUPS.map(g => `<details class="gf-group"${g.open ? ' open' : ''}>
      <summary><span>${esc(g.title)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
      <div class="gf-body">${g.items.map(ctlHTML).join('')}</div></details>`).join('');
  for (const c of allItems) { const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`); if (row) bind(row, c); }
  $('#ch-strip').addEventListener('click', downloadStrip);
  bindUpload();
  visibility();
}
function bind(row, c) {
  if (c.type === 'range') {
    const num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
    const set = (v, from) => { v = Math.min(c.max, Math.max(c.min, +v)); if (!isFinite(v)) return; state[c.k] = v; if (from !== num) num.value = fmt(v, 3); if (from !== rng) rng.value = v; changed(c); };
    rng.addEventListener('input', () => set(rng.value, rng));
    num.addEventListener('change', () => set(num.value === '' ? c.def : num.value, num));
  } else if (c.type === 'select') {
    const el = row.querySelector('select'); el.addEventListener('change', () => { state[c.k] = el.value; changed(c); });
  } else if (c.type === 'toggle') {
    const el = row.querySelector('input'); el.addEventListener('change', () => { state[c.k] = el.checked; changed(c); });
  } else if (c.type === 'text') {
    const el = row.querySelector('input'); el.addEventListener('input', () => { state[c.k] = el.value; changed(c); });
  }
}
function changed(c) {
  $('#ch-presets').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
  if (c.k === 'style') { Object.assign(state, styleDims(state.style)); render(); }
  else { visibility(); relabel(); }
  if (c.k === 'bed' || ((c.k === 'bedX' || c.k === 'bedY') && state.bed === 'custom'))   // remember the printer for every generator
    savePrinter({ id: state.bed, x: state.bedX, y: state.bedY, z: (printerById(state.bed) || MYP).z || 250 });
  requestBuild();
}
function visibility() {
  for (const c of GROUPS.flatMap(g => g.items)) {
    const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`);
    if (row && c.show) row.classList.toggle('hidden', !c.show(state));
  }
}
function relabel() {
  for (const c of allItems) if (c.labelFn) { const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`); if (row) row.querySelector('label').textContent = c.labelFn(state); }
}
function renderPresets() {
  const el = $('#ch-presets');
  el.innerHTML = `<span class="gf-pre-lab">Start from</span>` + PRESETS.map((p, i) => `<button type="button" class="chip" data-i="${i}">${esc(p[0])}</button>`).join('')
    + `<button type="button" class="chip" id="ch-surprise">Surprise me</button>`;
  el.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
    const pr = PRESETS[+b.dataset.i][1];
    state = { ...defaults(), ...styleDims(pr.style), ...pr };
    render(); swatches(); requestBuild(true);
    el.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('#ch-surprise').addEventListener('click', surprise);
}
function surprise() {
  const pool = Object.entries(STYLES).filter(([k, s]) => (s.group === 'Easy' || s.group === 'Medium') && s.kind === 'ring' && !s.customPlate && !s.letters && k !== 'pattern').map(([k]) => k);
  const style = pool[Math.floor(Math.random() * pool.length)];
  const d = styleDims(style), j = (v, f) => +(v * (1 + (Math.random() * 2 - 1) * f)).toFixed(1);
  state = {
    ...defaults(), style, linkL: j(d.linkL, 0.18), linkW: j(d.linkW, 0.12), wire: Math.max(1.2, j(d.wire, 0.12)),
    color: COLORS[Math.floor(Math.random() * COLORS.length)][0], color2: COLORS[Math.floor(Math.random() * COLORS.length)][0],
    twoTone: Math.random() < 0.3, graduated: Math.random() < 0.2 ? 40 : 0,
    lengthSel: ['406', '457', '508', '559'][Math.floor(Math.random() * 4)],
    shape: ['heart', 'star', 'diamond', 'hexagon'][Math.floor(Math.random() * 4)],
  };
  if (state.color2 === state.color) state.color2 = state.color === 'flame' ? 'silver' : 'flame';
  render(); swatches(); requestBuild(true);
}
function swatches() {
  const el = $('#ch-swatches');
  el.innerHTML = COLORS.map(([k, n, hex]) => `<button type="button" class="ch-swatch" data-c="${k}" aria-label="${esc(n)}" title="${esc(n)}${state.twoTone ? ' (Shift-click: second color)' : ''}"
      aria-pressed="${state.color === k || (state.twoTone && state.color2 === k)}" style="background:#${hex.toString(16).padStart(6, '0')}"></button>`).join('');
  el.querySelectorAll('.ch-swatch').forEach(b => b.addEventListener('click', (e) => {
    if (state.twoTone && (e.shiftKey || state.color === b.dataset.c)) state.color2 = b.dataset.c; else state.color = b.dataset.c;
    swatches(); paint();
  }));
}

/* ---------- custom shape upload: trace to polygons on-device ---------- */
let traceSrc = null;
function bindUpload() {
  const f = $('#ch-file'); if (!f) return;
  const drop = $('#ch-drop');
  f.addEventListener('change', () => f.files[0] && loadShape(f.files[0]));
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files[0]) loadShape(e.dataTransfer.files[0]); });
  const thr = $('#ch-thr'), inv = $('#ch-inv');
  thr.addEventListener('input', () => { $('#ch-thr-v').textContent = thr.value + '%'; retrace(); });
  inv.addEventListener('change', retrace);
  if (traceSrc) { $('#ch-trace').classList.remove('hidden'); retrace(); }
}
async function loadShape(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Could not read that file')); img.src = url; })
    .catch(e => { setStatus(e.message, 'bad'); });
  URL.revokeObjectURL(url);
  if (!img.naturalWidth && !img.width) return;
  traceSrc = img;
  $('#ch-trace').classList.remove('hidden');
  retrace();
}
function retrace() {
  if (!traceSrc) return;
  const N = 200, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
  const w = traceSrc.naturalWidth || traceSrc.width || N, h = traceSrc.naturalHeight || traceSrc.height || N, k = (N - 8) / Math.max(w, h);
  g.drawImage(traceSrc, (N - w * k) / 2, (N - h * k) / 2, w * k, h * k);
  const d = g.getImageData(0, 0, N, N).data, thr = +$('#ch-thr').value / 100 * 255, inv = $('#ch-inv').checked;
  const on = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) { const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; on[i] = (l < thr) !== inv ? 1 : 0; }
  // preview
  const pv = $('#ch-trace-cv').getContext('2d'), im = pv.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = on[i] ? 20 : 255; im.data[i * 4] = on[i] ? 243 : v; im.data[i * 4 + 1] = on[i] ? 102 : v; im.data[i * 4 + 2] = on[i] ? 46 : v; im.data[i * 4 + 3] = 255; }
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; tmp.getContext('2d').putImageData(im, 0, 0);
  pv.clearRect(0, 0, 84, 84); pv.drawImage(tmp, 0, 0, 84, 84);
  polys = traceContours(on, N);
  if (!polys.length) { setStatus('Nothing to trace: try another threshold or Invert.', 'bad'); return; }
  requestBuild(true);
}
/** marching squares → closed loops (y up), simplified */
function traceContours(on, N) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? on[y * N + x] : 0);
  const segs = new Map(), key = (x, y) => (x + 2) * 8192 + (y + 2);
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); (segs.get(k) || segs.set(k, []).get(k)).push([bx, by]); };
  // edges between on/off pixels, oriented with "on" to the left
  for (let y = -1; y < N; y++) for (let x = -1; x < N; x++) {
    const a = at(x, y), b = at(x + 1, y), c = at(x, y + 1);
    if (a !== b) { if (a) add(x + 1, y + 1, x + 1, y); else add(x + 1, y, x + 1, y + 1); }
    if (a !== c) { if (a) add(x, y + 1, x + 1, y + 1); else add(x + 1, y + 1, x, y + 1); }
  }
  const loops = [];
  for (const [k0, list] of segs) {
    while (list.length) {
      const start = [Math.floor(k0 / 8192) - 2, (k0 % 8192) - 2], loop = [start];
      let cur = list.pop();
      for (let guard = 0; guard < 100000; guard++) {
        loop.push(cur);
        if (cur[0] === start[0] && cur[1] === start[1]) break;
        const nx = segs.get(key(cur[0], cur[1]));
        if (!nx || !nx.length) break;
        cur = nx.pop();
      }
      if (loop.length > 8) loops.push(loop);
    }
  }
  const rdp = (pts, eps) => {
    if (pts.length < 4) return pts;
    let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l;
      if (d > dmax) { dmax = d; idx = i; }
    }
    return dmax > eps ? rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps)) : [a, b];
  };
  // a closed loop starts and ends on the same point, so split it at the point farthest from the start first
  const simplify = (l) => {
    let far = 1, dm = 0;
    for (let i = 1; i < l.length - 1; i++) { const d = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]); if (d > dm) { dm = d; far = i; } }
    return rdp(l.slice(0, far + 1), 0.7).slice(0, -1).concat(rdp(l.slice(far), 0.7)).slice(0, -1);
  };
  return loops.map(l => simplify(l).map(([x, y]) => [x, N - y])).filter(l => l.length >= 3 && Math.abs(area(l)) > 12);
}
const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

/* ============================================================
   VIEWER (instanced)
   ============================================================ */
const stage = $('#ch-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', '3D preview of the chain on the printer bed. Drag to rotate, pinch or scroll to zoom.');
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x04122b, 0.5));
const key = new THREE.DirectionalLight(0xffe0c0, 1.1); key.position.set(160, 260, 200); scene.add(key);
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 8000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);   // Z-up → Y-up
let meshes = [], bedObj = null, current = null, partIdx = 0, lastFitKey = '';
const mats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
function paint() {
  const set = (m, k) => { const c = COLORS.find(x => x[0] === k) || COLORS[0]; m.color.setHex(c[2]); m.metalness = c[3]; m.roughness = c[4]; };
  set(mats[0], state.color); set(mats[1], state.twoTone ? state.color2 : state.color);
}
function drawBed(bx, by) {
  if (bedObj) { world.remove(bedObj); bedObj.traverse(o => o.geometry && o.geometry.dispose()); }
  bedObj = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(bx, by), new THREE.MeshBasicMaterial({ color: 0x01142e, transparent: true, opacity: 0.55 }));
  plane.position.z = -0.05; bedObj.add(plane);
  const pts = [], step = 20;
  for (let x = -bx / 2; x <= bx / 2 + 0.01; x += step) pts.push(x, -by / 2, 0, x, by / 2, 0);
  for (let y = -by / 2; y <= by / 2 + 0.01; y += step) pts.push(-bx / 2, y, 0, bx / 2, y, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  bedObj.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1182c9, transparent: true, opacity: 0.28 })));
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-bx / 2, -by / 2, 0), new THREE.Vector3(bx / 2, -by / 2, 0), new THREE.Vector3(bx / 2, by / 2, 0), new THREE.Vector3(-bx / 2, by / 2, 0)]),
    new THREE.LineBasicMaterial({ color: 0x2fa0e0, transparent: true, opacity: 0.7 }));
  bedObj.add(edge);
  world.add(bedObj);
}
const geoCache = new Map();
function showPart() {
  for (const m of meshes) world.remove(m);
  meshes = [];
  if (!current || !current.parts.length) return;
  const part = current.parts[Math.min(partIdx, current.parts.length - 1)];
  const byKey = new Map();
  for (const inst of part.instances) { const k = inst.body + '|' + (inst.color || 0); (byKey.get(k) || byKey.set(k, []).get(k)).push(inst); }
  const box = new THREE.Box3(), tmp = new THREE.Box3(), M = new THREE.Matrix4();
  for (const [k, list] of byKey) {
    const [bk, col] = k.split('|');
    const b = current.bodyMap.get(bk); if (!b) continue;
    let g = geoCache.get(bk);
    if (!g) {
      g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(b.pos, 3)); g.setIndex(new THREE.BufferAttribute(b.idx, 1));
      if (/^(letter|custom|tag|toggleBar|kit):/.test(bk)) g = toCreasedNormals(g, Math.PI / 5);   // flat faces + sharp edges on plates
      else g.computeVertexNormals();
      g.computeBoundingBox(); geoCache.set(bk, g);
    }
    const im = new THREE.InstancedMesh(g, mats[+col] || mats[0], list.length);
    list.forEach((inst, i) => {
      const m = inst.m;
      M.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);
      im.setMatrixAt(i, M);
      tmp.copy(g.boundingBox).applyMatrix4(M); box.union(tmp);
    });
    im.instanceMatrix.needsUpdate = true;
    world.add(im); meshes.push(im);
  }
  const p = params();
  drawBed(p.bedX, p.bedY);
  // frame the chain itself (never tighter than 40% of the bed), and only re-frame when its size changes a lot
  const sz = new THREE.Vector3(); if (!box.isEmpty()) box.getSize(sz);
  const span = Math.min(Math.max(sz.x, sz.y, 0.4 * Math.max(p.bedX, p.bedY)), Math.max(p.bedX, p.bedY));
  const fk = [p.bedX, p.bedY, partIdx, Math.round(Math.log2(span) * 3)].join();
  if (fk !== lastFitKey) { lastFitKey = fk; frame(span); }
}
function frame(span) {
  const r = span * 0.55 + 6, d = r / Math.sin(camera.fov * Math.PI / 360) * 0.95;
  controls.target.set(0, 0, 0);
  camera.position.set(0, d * 0.78, d * 0.62);
  camera.near = d / 200; camera.far = d * 20; camera.updateProjectionMatrix();
}
function resize() { const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
$('#ch-fit').addEventListener('click', () => { lastFitKey = ''; showPart(); });
const fsBtn = $('#ch-full'), fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.hidden = true;
fsBtn.addEventListener('click', () => { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage); });

/* ============================================================
   WORKER
   ============================================================ */
let worker = null, builds = 0, busy = false, pending = false, reqId = 0;
const handlers = new Map();
function getWorker() {
  if (worker && builds > 25 && !busy) { worker.terminate(); worker = null; }
  if (!worker) {
    builds = 0;
    worker = new Worker(new URL('./chain-worker.js?v=f143cb4d9c', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const h = handlers.get(e.data.id); if (h) { handlers.delete(e.data.id); h(e.data); } };
    // a crashed worker (out of memory on a phone, a failed download) must never leave the page stuck:
    // answer every waiting build with an error and start a fresh worker next time
    worker.onerror = (e) => { console.error(e); e.preventDefault?.(); resetWorker('The chain engine stopped unexpectedly.'); };
  }
  return worker;
}
function resetWorker(msg) {
  if (worker) { worker.terminate(); worker = null; }
  busy = false;
  for (const [id, h] of [...handlers]) { handlers.delete(id); h({ ok: false, error: msg, retry: true }); }
}
function run(kind, p, attempt = 0) {
  return new Promise((resolve) => {
    const id = ++reqId; busy = true; builds++;
    // watchdog: a build that hangs is restarted once on a fresh worker
    const dog = setTimeout(() => { const h = handlers.get(id); if (h) resetWorker('This chain took too long to build.'); }, 60000);
    handlers.set(id, (d) => {
      clearTimeout(dog); busy = false;
      if (!d.ok && d.retry && attempt === 0) run(kind, p, 1).then(resolve);   // one automatic retry
      else resolve(d);
    });
    getWorker().postMessage({ id, kind, params: p, polys: p.style === 'custom' ? polys : null });
  });
}
const statusEl = $('#ch-status');
function setStatus(msg, kind = '') { statusEl.textContent = msg; statusEl.dataset.kind = kind; }
let debounceT = 0, first = true;
function requestBuild(now = false) { clearTimeout(debounceT); debounceT = setTimeout(build, now ? 0 : 180); }
async function build() {
  if (busy) { pending = true; return; }
  stage.classList.add('is-busy');
  setStatus(first ? 'Loading the chain engine…' : 'Solving link spacing…');
  const d = await run('chain', params());
  first = false;
  stage.classList.remove('is-busy');
  if (!d.ok) setStatus('Could not build this chain: ' + d.error + ' Change a setting, or reload the page, to try again.', 'bad');
  else {
    current = { ...d, bodyMap: new Map(d.bodies.map(b => [b.key, b])) };
    for (const k of [...geoCache.keys()]) if (!current.bodyMap.has(k)) { geoCache.get(k).dispose(); geoCache.delete(k); }
    partIdx = Math.min(partIdx, Math.max(0, d.parts.length - 1));
    showParts(); showPart(); showInfo();
  }
  if (pending) { pending = false; requestBuild(true); }
}
function showParts() {
  const el = $('#ch-parts');
  const multi = current.parts.length > 1;
  el.classList.toggle('hidden', !multi);
  el.innerHTML = multi ? current.parts.map((p, i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${i === partIdx}">${esc(p.label)}</button>`).join('') : '';
  el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { partIdx = +b.dataset.i; showParts(); showPart(); }));
  $('#ch-stl-label').textContent = multi ? 'Download all (.zip)' : 'Download STL';
}
function showInfo() {
  const s = current.stats || {}, p = params();
  const len = s.lengthMM || 0;
  $('#ch-readout').innerHTML = `${fmt(len / IN, 1)} in · ${fmt(len, 0)} mm<br>≈ ${fmt(s.grams, s.grams < 10 ? 1 : 0)} g ${esc(({ petg: 'PETG', silk: 'silk PLA', pla: 'PLA', tpu: 'TPU', abs: 'ABS', asa: 'ASA' })[p.material] || '')}`;
  const hrs = s.minutes / 60;
  $('#ch-readout').innerHTML += `<span class="ch-ro-extra"><br>$${(s.cost || 0).toFixed(2)} · ${hrs >= 1 ? `≈ ${fmt(hrs, 1)} h` : `≈ ${fmt(s.minutes, 0)} min`}</span>`;
  $('#ch-stats').innerHTML = [
    ['Links', fmt(s.links, 0)], ['Length', `${fmt(len / IN, 1)} in`], ['Weight', `${fmt(s.grams, 1)} g`],
    ['Filament', `$${(s.cost || 0).toFixed(2)}`], ['Print time', hrs >= 1 ? `≈ ${fmt(hrs, 1)} h` : `≈ ${fmt(s.minutes, 0)} min`],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const nChain = current.parts.filter(q => q.name !== 'jump-rings').length;
  setStatus(`${fmt(s.links, 0)} links · ${nChain > 1 ? nChain + ' parts · ' : ''}built in ${current.ms} ms`, 'ok');
  const w = current.warn || [];
  $('#ch-warn').innerHTML = w.filter(x => !/^Hand-assembled/.test(x)).map(x => `<li>${esc(x)}</li>`).join('');
  $('#ch-warn').classList.toggle('hidden', !$('#ch-warn').innerHTML);
  const kit = w.find(x => /^Hand-assembled/.test(x));
  $('#ch-kit').innerHTML = kit ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg><p>${esc(kit)}</p>` : '';
  $('#ch-kit').classList.toggle('hidden', !kit);
}

/* ============================================================
   EXPORT
   ============================================================ */
function partMeshes(part, split) {
  // one merged mesh per color (split) or one mesh for everything
  const groups = new Map();
  for (const inst of part.instances) {
    const gk = split ? (inst.color || 0) : 0;
    (groups.get(gk) || groups.set(gk, []).get(gk)).push(inst);
  }
  const out = [];
  for (const [gk, list] of groups) {
    let nv = 0, nt = 0;
    for (const i of list) { const b = current.bodyMap.get(i.body); nv += b.pos.length; nt += b.idx.length; }
    const pos = new Float32Array(nv), idx = new Uint32Array(nt);
    let vo = 0, io = 0;
    for (const i of list) {
      const b = current.bodyMap.get(i.body), m = i.m, base = vo / 3;
      for (let k = 0; k < b.pos.length; k += 3) {
        const x = b.pos[k], y = b.pos[k + 1], z = b.pos[k + 2];
        pos[vo++] = m[0] * x + m[1] * y + m[2] * z + m[3]; pos[vo++] = m[4] * x + m[5] * y + m[6] * z + m[7]; pos[vo++] = m[8] * x + m[9] * y + m[10] * z + m[11];
      }
      for (let k = 0; k < b.idx.length; k++) idx[io++] = b.idx[k] + base;
    }
    out.push({ color: gk, pos, idx });
  }
  return out;
}
function save(data, name, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const baseName = () => `hotendhq-${state.style}-chain-${fmt(params().lengthMM / IN, 1)}in`;
$('#ch-stl').addEventListener('click', () => {
  if (!current || !current.parts.length) return;
  if (current.parts.length === 1) {
    const m = partMeshes(current.parts[0], false)[0];
    save(meshToSTL(m.pos, m.idx, baseName()), baseName() + '.stl');
  } else {
    const files = current.parts.map(pt => { const m = partMeshes(pt, false)[0]; return { name: `${baseName()}-${pt.name}.stl`, data: meshToSTL(m.pos, m.idx, pt.name) }; });
    save(zip(files), baseName() + '.zip', 'application/zip');
  }
  window.HHQ?.toast('Downloaded. Slice it flat, no supports.');
});
$('#ch-3mf').addEventListener('click', () => {
  if (!current || !current.parts.length) return;
  const objs = [];
  for (const pt of current.parts) for (const m of partMeshes(pt, state.twoTone)) objs.push({ name: `${pt.name}${state.twoTone ? (m.color ? '-color2' : '-color1') : ''}`, pos: m.pos, idx: m.idx });
  save(meshesTo3MF(objs), baseName() + '.3mf', 'model/3mf');
  window.HHQ?.toast(state.twoTone ? '3MF downloaded: assign the two color objects in your slicer.' : '3MF downloaded.');
});
$('#ch-link').addEventListener('click', async () => {
  history.replaceState(null, '', shareURL());
  try { await navigator.clipboard.writeText(shareURL()); window.HHQ?.toast(state.style === 'custom' ? 'Link copied (your uploaded shape stays on this device).' : 'Link copied. It rebuilds this exact chain.'); }
  catch { window.HHQ?.toast('Could not copy. Check clipboard permissions.', 'warn'); }
});
async function downloadStrip() {
  if (busy) { setStatus('Busy, try again in a moment.'); return; }
  setStatus('Building the test strip…'); stage.classList.add('is-busy');
  const d = await run('strip', params());
  stage.classList.remove('is-busy');
  if (!d.ok || !d.parts.length) { setStatus('Could not build a test strip for this style.', 'bad'); return; }
  const prev = current; current = { ...d, bodyMap: new Map(d.bodies.map(b => [b.key, b])) };
  const m = partMeshes(d.parts[0], false)[0];
  save(meshToSTL(m.pos, m.idx, 'clearance test strip'), `hotendhq-${state.style}-test-strip.stl`);
  current = prev; setStatus(`Test strip downloaded: gaps ${d.gaps.join(', ')} mm, labelled.`, 'ok');
}

/* ============================================================
   STYLE TABLE (content for search engines and humans)
   ============================================================ */
const LOOK = {
  cable: 'Basic round links, each turned 90°', oval: 'Longer oval links', trace: 'Long, thin, delicate ovals', longshort: 'Alternating long and short links',
  rolo: 'Fat, round, thick-wire links', paperclip: 'Long rounded rectangles', flatclip: 'Paperclip links pressed flat', mariner: 'Ovals with a bar across the middle',
  ladder: 'Two parallel rails joined by rungs', shaped: 'Hearts, stars, diamonds, hexagons', name: 'Each letter of a name is its own link',
  custom: 'Your own SVG or image as the link', curb: 'Twisted links that lie flat and nest', dcurb: 'Tighter curb with flat faceted faces',
  cuban: 'Thick, heavy, tight curb', figaro: '1 long + 3 short curb links', pattern: 'Any repeat you choose', box: 'Square box-shaped links',
  ball: 'Beads joined by short bars', bike: 'Mechanical side-plate links with pins', rope: 'Links spiraled to look twisted',
  snake: 'Hinged segments that fake a smooth snake chain', herringbone: 'Flat overlapping scales on hinges',
  kitbyz: 'Woven rings you close by hand', singapore: 'Twisted links you close by hand', wheat: 'Folded ovals you stack by hand',
};
$('#ch-style-table').innerHTML = Object.entries(STYLES).map(([k, s]) => `<tr><td><a href="#style=${k}" data-style="${k}">${esc(s.name)}</a></td><td>${esc(LOOK[k] || '')}</td><td>${esc(s.group === 'Hand-assembled' ? 'Printed open, closed by hand' : 'In place, ' + s.group.toLowerCase())}</td></tr>`).join('');
$('#ch-style-table').addEventListener('click', e => {
  const a = e.target.closest('[data-style]'); if (!a) return;
  e.preventDefault(); state = { ...defaults(), ...styleDims(a.dataset.style), style: a.dataset.style };
  render(); swatches(); requestBuild(true); document.querySelector('.gf').scrollIntoView({ behavior: 'smooth' });
});

/* ============================================================ */
readHash();
if (!STYLES[state.style]) state.style = 'oval';
paint(); renderPresets(); render(); swatches(); resize(); requestBuild(true);
