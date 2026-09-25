/* ============================================================
   HOTEND HQ — model generator page (controls, preview, downloads)
   One script for every generator in /assets/js/make/gens/.
   The page says which one with <body data-gen="…">.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { meshToSTL, meshesTo3MF, zip } from '../gridfinity-core.js?v=cd2b8dee8c';
import { printerOptions, printerById, loadPrinter, savePrinter, volumeOf, fits } from '../printers.js?v=ff3522465e';
import { FONTS, PALETTE } from './core.js?v=95f6f46afd';
import { GENERATORS } from './gens/index.js?v=ed7df2d1d7';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 1) => (+v).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
const GEN_ID = document.body.dataset.gen, GEN = GENERATORS[GEN_ID];
if (!GEN) throw new Error('No generator ' + GEN_ID);
const MODES = GEN.modes;
const MODE_KEYS = Object.keys(MODES);

/* ============================================================ STATE */
const itemsOf = (m) => MODES[m].groups.flatMap(g => g.items).filter(c => c.k);
const defaultsOf = (m) => { const d = {}; for (const c of itemsOf(m)) if (!(c.k in d)) d[c.k] = c.def; return d; };
let mode = MODE_KEYS[0];
const states = {};
const stateOf = (m) => (states[m] ??= defaultsOf(m));
const uploads = {};                        // traced image polygons per mode (not in links)

const MATERIALS = { pla: ['PLA', 1.24], petg: ['PETG', 1.27], abs: ['ABS', 1.04], asa: ['ASA', 1.07], tpu: ['TPU', 1.21], pacf: ['PA-CF (nylon CF)', 1.2] };
const SKEY = 'hhq-make-setup';
const SET = (() => {
  let g = {}; try { g = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch {}
  return { nozzle: ['0.2', '0.4', '0.6', '0.8'].includes(g.nozzle) ? g.nozzle : '0.4', material: MATERIALS[g.material] ? g.material : 'pla', printer: loadPrinter() };
})();
const saveSet = () => { try { localStorage.setItem(SKEY, JSON.stringify({ nozzle: SET.nozzle, material: SET.material })); } catch {} savePrinter(SET.printer); };
const vol = () => volumeOf(SET.printer);

const LKEY = 'hhq-make-' + GEN_ID;
function remember() { clearTimeout(remember.t); remember.t = setTimeout(() => { try { localStorage.setItem(LKEY, JSON.stringify({ mode, states })); } catch {} }, 400); }
function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(LKEY) || 'null');
    if (!v || !MODES[v.mode]) return;
    for (const [m, st] of Object.entries(v.states || {})) if (MODES[m]) states[m] = { ...defaultsOf(m), ...st };
    mode = v.mode;
  } catch {}
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const m = q.get('m') && MODES[q.get('m')] ? q.get('m') : MODE_KEYS[0];
  mode = m;
  const d = defaultsOf(m), s = { ...d };
  for (const [k, v] of q) if (k in d) s[k] = typeof d[k] === 'number' ? +v : typeof d[k] === 'boolean' ? v === '1' : v;
  states[m] = s;
}
function shareURL() {
  const s = stateOf(mode), d = defaultsOf(mode), q = new URLSearchParams();
  if (MODE_KEYS.length > 1) q.set('m', mode);
  for (const k of Object.keys(d)) if (s[k] !== d[k] && typeof s[k] !== 'object') q.set(k, typeof s[k] === 'boolean' ? (s[k] ? '1' : '0') : s[k]);
  return location.origin + location.pathname + (q.toString() ? '#' + q : '');
}
function params() {
  const v = vol();
  return { ...stateOf(mode), mode, nozzle: +SET.nozzle, bedX: v.x, bedY: v.y, bedZ: v.z, polys: uploads[mode] || null };
}

/* ============================================================ CONTROLS */
const tabsEl = $('#mk-tabs'), ctlEl = $('#mk-controls'), presetsEl = $('#mk-presets');
let uid = 0;
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function renderTabs() {
  tabsEl.classList.toggle('hidden', MODE_KEYS.length < 2);
  tabsEl.style.setProperty('--n', Math.min(MODE_KEYS.length, 5));
  tabsEl.innerHTML = MODE_KEYS.map(k => `<button type="button" aria-pressed="${k === mode}" data-m="${k}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MODES[k].icon || '<rect x="4" y="4" width="16" height="16" rx="3"/>'}</svg>
    <span>${esc(MODES[k].label)}</span></button>`).join('');
  tabsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.m === mode) return; mode = b.dataset.m; renderAll(); remember(); requestBuild(true);
  }));
}
function renderPresets() {
  const list = MODES[mode].presets || [];
  presetsEl.classList.toggle('hidden', !list.length);
  presetsEl.innerHTML = list.length ? `<span class="gf-pre-lab">Start from</span>` + list.map((p, i) => `<button type="button" class="chip" data-i="${i}">${esc(p[0])}</button>`).join('') : '';
  presetsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    states[mode] = { ...defaultsOf(mode), ...list[+b.dataset.i][1] };
    renderControls(); remember(); requestBuild(true);
    presetsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
}
function colorOptions(v) {
  const names = Object.entries(PALETTE);
  const known = names.some(([, hex]) => hex === v);
  return names.map(([n, hex]) => `<option value="${hex}"${hex === v ? ' selected' : ''}>${n[0].toUpperCase() + n.slice(1)}</option>`).join('')
    + (known ? '' : `<option value="${esc(v)}" selected>Custom</option>`);
}
function ctlHTML(c, s) {
  const id = 'mk-' + c.k + '-' + (++uid);
  const lab = c.labelFn ? c.labelFn(s) : c.label;
  const hint = c.hint ? `<p class="hint" id="${id}-h">${esc(c.hint)}</p>` : '';
  const desc = c.hint ? ` aria-describedby="${id}-h"` : '';
  const v = s[c.k];
  switch (c.type) {
    case 'range': return `<div class="gf-row" data-k="${c.k}">
      <div class="gf-lab"><label for="${id}">${esc(lab)}</label>
        <span class="gf-num"><input type="number" id="${id}" inputmode="decimal" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}"${desc}>${c.unit ? `<span class="gf-unit">${c.unit}</span>` : ''}</span></div>
      <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" aria-label="${esc(lab)}" tabindex="-1">${hint}</div>`;
    case 'select': return `<div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label>
      <select id="${id}"${desc}>${c.options.map(o => o[2] === 'group' ? '' : `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>${hint}</div>`;
    case 'font': return `<div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label>
      <select id="${id}"${desc}>${FONTS.filter(f => !c.only || c.only.includes(f[0])).map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>${hint}</div>`;
    case 'color': return `<div class="gf-row mk-color" data-k="${c.k}"><label for="${id}">${esc(lab)}</label>
      <span class="mk-colrow"><span class="mk-dot" style="background:${esc(v)}"></span><select id="${id}"${desc}>${colorOptions(v)}</select>
      <input type="color" value="${esc(v)}" aria-label="Custom colour for ${esc(lab)}"></span>${hint}</div>`;
    case 'toggle': return `<div class="gf-row" data-k="${c.k}"><label class="gf-tog" for="${id}">
      <input type="checkbox" id="${id}" role="switch"${v ? ' checked' : ''}${desc}><span class="gf-sw" aria-hidden="true"></span><span>${esc(lab)}</span></label>${hint}</div>`;
    case 'text': return c.multiline
      ? `<div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label><textarea id="${id}" rows="${c.rows || 3}" maxlength="${c.max || 400}" placeholder="${esc(c.placeholder || '')}" spellcheck="false"${desc}>${esc(v)}</textarea>${hint}</div>`
      : `<div class="gf-row" data-k="${c.k}"><label for="${id}">${esc(lab)}</label><input type="text" id="${id}" value="${esc(v)}" maxlength="${c.max || 60}" placeholder="${esc(c.placeholder || '')}" autocomplete="off" spellcheck="false"${desc}>${hint}</div>`;
    case 'upload': return `<div class="gf-row mk-upload" data-k="${c.k}">
      <label class="ch-drop"><input type="file" accept=".svg,image/png,image/jpeg,image/webp,image/svg+xml"><strong>${esc(lab)}</strong><br>SVG, PNG or JPG. Dark areas become the shape.</label>
      <div class="ch-trace hidden"><canvas width="84" height="84" aria-label="Traced shape preview"></canvas>
        <div style="flex:1"><div class="gf-lab"><label>Threshold</label><span class="gf-unit mk-thv">50%</span></div>
          <input type="range" class="mk-thr" min="5" max="95" step="1" value="50" aria-label="Threshold">
          <label class="gf-tog" style="margin-top:4px"><input type="checkbox" class="mk-inv" role="switch"><span class="gf-sw" aria-hidden="true"></span><span>Invert</span></label></div></div>${hint}</div>`;
  }
  return '';
}
const openGroups = {};
function setupHTML() {
  const p = SET.printer, v = vol();
  return `<details class="gf-group gf-setup" data-g="setup"${openGroups[mode + ':setup'] ? ' open' : ''}>
    <summary><span>Your printer &amp; filament <small class="gf-sum" id="mk-sum">${esc(v.label === 'your printer' ? `Custom ${v.x} × ${v.y}` : v.label)} · ${SET.nozzle} mm · ${MATERIALS[SET.material][0]}</small></span>${CHEV}</summary>
    <div class="gf-body">
      <div class="gf-row"><label for="mk-pr">Printer</label><select id="mk-pr">${printerOptions(p.id)}</select>
        <p class="hint">Remembered on this device for every Hotend HQ generator. We check the model fits.</p></div>
      <div class="gf-row gf-xyz${p.id === 'custom' ? '' : ' hidden'}" id="mk-xyz">${['x', 'y', 'z'].map(k => `<label>${k.toUpperCase()}<span class="gf-num"><input type="number" data-ax="${k}" min="50" max="1000" step="1" value="${p[k]}" inputmode="numeric"><span class="gf-unit">mm</span></span></label>`).join('')}</div>
      <div class="gf-row gf-2col">
        <div><label for="mk-nz">Nozzle</label><select id="mk-nz">${['0.2', '0.4', '0.6', '0.8'].map(n => `<option value="${n}"${n === SET.nozzle ? ' selected' : ''}>${n} mm</option>`).join('')}</select></div>
        <div><label for="mk-mat">Filament</label><select id="mk-mat">${Object.entries(MATERIALS).map(([k, [l]]) => `<option value="${k}"${k === SET.material ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
    </div></details>`;
}
function bindSetup() {
  const after = (rebuild) => { saveSet(); const v = vol(); $('#mk-sum').textContent = `${v.label === 'your printer' ? `Custom ${v.x} × ${v.y}` : v.label} · ${SET.nozzle} mm · ${MATERIALS[SET.material][0]}`; if (rebuild) requestBuild(true); else if (current) showInfo(); };
  $('#mk-pr').addEventListener('change', e => {
    const p = printerById(e.target.value);
    SET.printer = p ? { id: p.id, x: p.x, y: p.y, z: p.z } : { ...SET.printer, id: 'custom' };
    $('#mk-xyz').classList.toggle('hidden', !!p);
    if (p) $('#mk-xyz').querySelectorAll('[data-ax]').forEach(i => { i.value = p[i.dataset.ax]; });
    after(!!GEN.usesBed); drawBed();
  });
  $('#mk-xyz').querySelectorAll('[data-ax]').forEach(i => i.addEventListener('change', () => { SET.printer[i.dataset.ax] = Math.max(50, Math.min(1000, +i.value || 256)); i.value = SET.printer[i.dataset.ax]; after(!!GEN.usesBed); drawBed(); }));
  $('#mk-nz').addEventListener('change', e => { SET.nozzle = e.target.value; after(!!GEN.usesNozzle); });
  $('#mk-mat').addEventListener('change', e => { SET.material = e.target.value; after(false); });
}
function renderControls() {
  const m = MODES[mode], s = stateOf(mode);
  $('#mk-title').textContent = m.title || GEN.title;
  $('#mk-blurb').textContent = m.blurb || '';
  const isOpen = (g, gi) => openGroups[mode + ':' + gi] ?? !!g.open;
  ctlEl.innerHTML = `<div class="gf-ctlbar"><button type="button" class="gf-link" data-act="open">Expand all</button><span aria-hidden="true">·</span><button type="button" class="gf-link" data-act="close">Collapse all</button></div>`
    + setupHTML() + m.groups.map((g, gi) => `
    <details class="gf-group" data-g="${gi}"${isOpen(g, gi) ? ' open' : ''}>
      <summary><span>${esc(g.title)} <small class="gf-changed">changed</small></span>${CHEV}</summary>
      <div class="gf-body">${g.items.map(c => ctlHTML(c, s)).join('')}
        <button type="button" class="gf-link gf-greset" data-reset="${gi}">Reset ${esc(g.title.toLowerCase())}</button></div>
    </details>`).join('');
  bindSetup();
  ctlEl.querySelectorAll('.gf-group').forEach(el => el.addEventListener('toggle', () => { openGroups[mode + ':' + el.dataset.g] = el.open; }));
  ctlEl.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => ctlEl.querySelectorAll('.gf-group').forEach(el => { el.open = b.dataset.act === 'open'; })));
  ctlEl.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
    const g = m.groups[+b.dataset.reset], d = defaultsOf(mode), st = stateOf(mode);
    for (const c of g.items) if (c.k) st[c.k] = d[c.k];
    if (g.items.some(c => c.type === 'upload')) delete uploads[mode];
    openGroups[mode + ':' + b.dataset.reset] = true;
    renderControls(); remember(); requestBuild(true);
  }));
  for (const c of itemsOf(mode)) ctlEl.querySelectorAll(`.gf-row[data-k="${c.k}"]`).forEach(r => bind(r, c));
  applyVisibility(); markChanged();
}
function bind(row, c) {
  const s = () => stateOf(mode);
  if (c.type === 'range') {
    const num = row.querySelector('input[type=number]'), rng = row.querySelector('input[type=range]');
    const set = (v, from) => { v = Math.min(c.max, Math.max(c.min, +v)); if (!isFinite(v)) return; s()[c.k] = v; if (from !== num) num.value = fmt(v, 3); if (from !== rng) rng.value = v; changed(c); };
    rng.addEventListener('input', () => set(rng.value, rng));
    num.addEventListener('change', () => set(num.value === '' ? c.def : num.value, num));
    num.addEventListener('input', () => { if (num.value !== '' && isFinite(+num.value) && +num.value >= c.min && +num.value <= c.max) set(num.value, num); });
  } else if (c.type === 'select' || c.type === 'font') {
    const el = row.querySelector('select'); el.addEventListener('change', () => { s()[c.k] = el.value; changed(c); });
  } else if (c.type === 'color') {
    const sel = row.querySelector('select'), pick = row.querySelector('input[type=color]'), dot = row.querySelector('.mk-dot');
    const set = (v) => { s()[c.k] = v; dot.style.background = v; pick.value = v; recolor(); remember(); markChanged(); };
    sel.addEventListener('change', () => set(sel.value));
    pick.addEventListener('input', () => { set(pick.value); if (![...sel.options].some(o => o.value === pick.value)) { sel.insertAdjacentHTML('beforeend', `<option value="${pick.value}">Custom</option>`); } sel.value = pick.value; });
  } else if (c.type === 'toggle') {
    const el = row.querySelector('input'); el.addEventListener('change', () => { s()[c.k] = el.checked; changed(c); });
  } else if (c.type === 'text') {
    const el = row.querySelector('input,textarea'); el.addEventListener('input', () => { s()[c.k] = el.value; changed(c); });
  } else if (c.type === 'upload') bindUpload(row, c);
}
function changed(c) {
  presetsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
  applyVisibility(); relabel(); markChanged(); remember(); requestBuild();
}
function applyVisibility() {
  const s = stateOf(mode);
  for (const c of itemsOf(mode)) if (c.show) ctlEl.querySelectorAll(`.gf-row[data-k="${c.k}"]`).forEach(r => r.classList.toggle('hidden', !c.show(s)));
  MODES[mode].groups.forEach((g, gi) => { if (g.show) ctlEl.querySelector(`.gf-group[data-g="${gi}"]`)?.classList.toggle('hidden', !g.show(s)); });
}
function relabel() {
  const s = stateOf(mode);
  for (const c of itemsOf(mode)) if (c.labelFn) { const row = ctlEl.querySelector(`.gf-row[data-k="${c.k}"]`); if (row) row.querySelector('label').textContent = c.labelFn(s); }
}
function markChanged() {
  const s = stateOf(mode), d = defaultsOf(mode);
  MODES[mode].groups.forEach((g, gi) => ctlEl.querySelector(`.gf-group[data-g="${gi}"]`)?.classList.toggle('is-changed',
    g.items.some(c => c.k && (!c.show || c.show(s)) && (c.type === 'upload' ? !!uploads[mode] : s[c.k] !== d[c.k]))));
}

/* ---------- image upload → polygons (traced on this device, never uploaded) ---------- */
function bindUpload(row, c) {
  const file = row.querySelector('input[type=file]'), trace = row.querySelector('.ch-trace'), thr = row.querySelector('.mk-thr'), inv = row.querySelector('.mk-inv'), cv = row.querySelector('canvas');
  let img = row._img || null;
  const retrace = () => {
    if (!img) return;
    const N = 220, c2 = document.createElement('canvas'); c2.width = c2.height = N;
    const g = c2.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
    const w = img.naturalWidth || img.width || N, h = img.naturalHeight || img.height || N, k = (N - 8) / Math.max(w, h);
    g.drawImage(img, (N - w * k) / 2, (N - h * k) / 2, w * k, h * k);
    const d = g.getImageData(0, 0, N, N).data, t = +thr.value / 100 * 255, on = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) { const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; on[i] = ((l < t) !== inv.checked) && d[i * 4 + 3] > 20 ? 1 : 0; }
    const pv = cv.getContext('2d'), im = pv.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { im.data[i * 4] = on[i] ? 243 : 255; im.data[i * 4 + 1] = on[i] ? 102 : 255; im.data[i * 4 + 2] = on[i] ? 46 : 255; im.data[i * 4 + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = N; tmp.getContext('2d').putImageData(im, 0, 0);
    pv.clearRect(0, 0, 84, 84); pv.drawImage(tmp, 0, 0, 84, 84);
    const polys = traceContours(on, N);
    uploads[mode] = polys.length ? polys : null;
    if (!polys.length) setStatus('Nothing to trace: try another threshold or Invert.', 'bad');
    else { markChanged(); requestBuild(true); }
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    const url = URL.createObjectURL(f); const im = new Image();
    await new Promise(res => { im.onload = res; im.onerror = res; im.src = url; });
    URL.revokeObjectURL(url);
    if (!im.naturalWidth && !im.width) { setStatus('Could not read that file.', 'bad'); return; }
    img = row._img = im; trace.classList.remove('hidden'); retrace();
  });
  thr.addEventListener('input', () => { row.querySelector('.mk-thv').textContent = thr.value + '%'; retrace(); });
  inv.addEventListener('change', retrace);
}
function traceContours(on, N) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? on[y * N + x] : 0);
  const segs = new Map(), key = (x, y) => (x + 2) * 8192 + (y + 2);
  const add = (ax, ay, bx, by) => { const k = key(ax, ay); (segs.get(k) || segs.set(k, []).get(k)).push([bx, by]); };
  for (let y = -1; y < N; y++) for (let x = -1; x < N; x++) {
    const a = at(x, y), b = at(x + 1, y), c = at(x, y + 1);
    if (a !== b) { if (a) add(x + 1, y + 1, x + 1, y); else add(x + 1, y, x + 1, y + 1); }
    if (a !== c) { if (a) add(x, y + 1, x + 1, y + 1); else add(x + 1, y + 1, x, y + 1); }
  }
  const loops = [];
  for (const [k0, list] of segs) while (list.length) {
    const start = [Math.floor(k0 / 8192) - 2, (k0 % 8192) - 2], loop = [start];
    let cur = list.pop();
    for (let g = 0; g < 200000; g++) { loop.push(cur); if (cur[0] === start[0] && cur[1] === start[1]) break; const nx = segs.get(key(cur[0], cur[1])); if (!nx || !nx.length) break; cur = nx.pop(); }
    if (loop.length > 8) loops.push(loop);
  }
  const rdp = (pts, eps) => {
    if (pts.length < 4) return pts;
    let dm = 0, ix = 0; const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const p = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l; if (d > dm) { dm = d; ix = i; } }
    return dm > eps ? rdp(pts.slice(0, ix + 1), eps).slice(0, -1).concat(rdp(pts.slice(ix), eps)) : [a, b];
  };
  const simplify = (l) => { let far = 1, dm = 0; for (let i = 1; i < l.length - 1; i++) { const d = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]); if (d > dm) { dm = d; far = i; } } return rdp(l.slice(0, far + 1), 0.6).slice(0, -1).concat(rdp(l.slice(far), 0.6)).slice(0, -1); };
  const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  return loops.map(l => simplify(l).map(([x, y]) => [x / N, (N - y) / N])).filter(l => l.length >= 3 && Math.abs(area(l)) > 12 / N / N);
}

function renderAll() { renderTabs(); renderPresets(); renderControls(); }

/* ============================================================ VIEWER */
const stage = $('#mk-stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.prepend(renderer.domElement);
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', '3D preview of the model. Drag to rotate, pinch or scroll to zoom.');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 8000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x0a1a33, 1.15));
const key = new THREE.DirectionalLight(0xfff0dd, 1.5); key.position.set(160, 260, 200); scene.add(key);
const rim = new THREE.DirectionalLight(0x2fa0e0, 0.8); rim.position.set(-220, 120, -180); scene.add(rim);
const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);   // Z-up models, Y-up viewer
let meshes = [], bedObj = null, current = null, lastFit = '';
function drawBed() {
  if (bedObj) { world.remove(bedObj); bedObj.traverse(o => o.geometry && o.geometry.dispose()); }
  const v = vol(), g = new THREE.Group(), pts = [], step = 10;
  for (let x = -v.x / 2; x <= v.x / 2 + 1e-6; x += step) pts.push(x, -v.y / 2, 0, x, v.y / 2, 0);
  for (let y = -v.y / 2; y <= v.y / 2 + 1e-6; y += step) pts.push(-v.x / 2, y, 0, v.x / 2, y, 0);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x1182c9, transparent: true, opacity: 0.22 })));
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute([-v.x / 2, -v.y / 2, 0, v.x / 2, -v.y / 2, 0, v.x / 2, -v.y / 2, 0, v.x / 2, v.y / 2, 0, v.x / 2, v.y / 2, 0, -v.x / 2, v.y / 2, 0, -v.x / 2, v.y / 2, 0, -v.x / 2, -v.y / 2, 0], 3));
  g.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x2fa0e0, transparent: true, opacity: 0.6 })));
  g.position.z = -0.05; bedObj = g; world.add(g);
}
function colorOf(p) { const s = stateOf(mode); return (p.colorKey && s[p.colorKey]) || p.color || '#f3662e'; }
function showParts() {
  for (const m of meshes) { world.remove(m); m.geometry.dispose(); m.material.dispose(); }
  meshes = [];
  const box = new THREE.Box3();
  // centre the whole set on the bed
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of current.parts) { x0 = Math.min(x0, p.min[0]); y0 = Math.min(y0, p.min[1]); x1 = Math.max(x1, p.max[0]); y1 = Math.max(y1, p.max[1]); }
  const ox = -(x0 + x1) / 2, oy = -(y0 + y1) / 2;
  current.parts.forEach((p, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3)); g.setIndex(new THREE.BufferAttribute(p.idx, 1));
    const ng = g.toNonIndexed(); ng.computeVertexNormals(); g.dispose();
    const mat = new THREE.MeshStandardMaterial({ color: colorOf(current.meta[i]), metalness: 0.08, roughness: 0.55 });
    const mesh = new THREE.Mesh(ng, mat); mesh.position.set(ox, oy, 0); mesh.visible = !hidden.has(p.name);
    world.add(mesh); meshes.push(mesh);
    ng.computeBoundingBox(); const b = ng.boundingBox.clone(); b.min.x += ox; b.max.x += ox; b.min.y += oy; b.max.y += oy; box.union(b);
  });
  const size = new THREE.Vector3(); box.getSize(size);
  const fk = [mode, Math.round(Math.log2(Math.max(size.x, size.y, size.z, 1)) * 4)].join();
  if (fk !== lastFit) { lastFit = fk; frame(size); }
}
function frame(size) {
  const r = Math.max(size.x, size.y, size.z * 1.3) * 0.62 + 6, d = r / Math.sin(camera.fov * Math.PI / 360);
  controls.target.set(0, size.z / 2, 0);
  camera.position.set(d * 0.35, d * 0.68 + size.z / 2, d * 0.72);
  camera.near = d / 200; camera.far = d * 30; camera.updateProjectionMatrix();
}
function recolor() { if (!current) return; meshes.forEach((m, i) => m.material.color.set(colorOf(current.meta[i]))); renderLegend(); }
const hidden = new Set();
function renderLegend() {
  const el = $('#mk-parts'); if (!current) return;
  const many = current.parts.length > 1;
  el.classList.toggle('hidden', !many);
  el.innerHTML = many ? current.parts.map((p, i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="${!hidden.has(p.name)}"><span class="mk-dot" style="background:${esc(colorOf(current.meta[i]))}"></span>${esc(p.label)}</button>`).join('') : '';
  el.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    const p = current.parts[+b.dataset.i]; if (hidden.has(p.name)) hidden.delete(p.name); else hidden.add(p.name);
    meshes[+b.dataset.i].visible = !hidden.has(p.name); b.setAttribute('aria-pressed', String(!hidden.has(p.name)));
  }));
}
function resize() { const r = stage.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(stage);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
$('#mk-fit').addEventListener('click', () => { lastFit = ''; if (current) showParts(); });
const fsBtn = $('#mk-full'), fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) fsBtn.hidden = true;
fsBtn.addEventListener('click', () => { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage); });

/* ============================================================ WORKER */
let worker = null, builds = 0, busy = false, pending = false, reqId = 0, debounceT = 0, first = true;
const handlers = new Map();
function getWorker() {
  if (worker && builds > 10 && !busy) { worker.terminate(); worker = null; }
  if (!worker) {
    builds = 0;
    worker = new Worker(new URL('./worker.js?v=36a583e023', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const h = handlers.get(e.data.id); if (h) { handlers.delete(e.data.id); h(e.data); } };
    worker.onerror = (e) => { console.error(e); e.preventDefault?.(); resetWorker('The model engine stopped unexpectedly.'); };
  }
  return worker;
}
function resetWorker(msg) {
  if (worker) { worker.terminate(); worker = null; }
  busy = false;
  for (const [id, h] of [...handlers]) { handlers.delete(id); h({ ok: false, error: msg, retry: true }); }
}
function run(p, attempt = 0) {
  return new Promise((resolve) => {
    const id = ++reqId; busy = true; builds++;
    const dog = setTimeout(() => { if (handlers.has(id)) resetWorker('This model took too long to build.'); }, 60000);
    handlers.set(id, (d) => { clearTimeout(dog); busy = false; if (!d.ok && d.retry && attempt === 0) run(p, 1).then(resolve); else resolve(d); });
    getWorker().postMessage({ id, gen: GEN_ID, params: p });
  });
}
const statusEl = $('#mk-status'), warnEl = $('#mk-warn'), readEl = $('#mk-readout'), infoEl = $('#mk-info');
function setStatus(msg, kind = '') { statusEl.textContent = msg; statusEl.dataset.kind = kind; }
function requestBuild(now = false) { clearTimeout(debounceT); debounceT = setTimeout(build, now ? 0 : 160); }
async function build() {
  if (busy) { pending = true; return; }
  stage.classList.add('is-busy');
  setStatus(first ? 'Loading the model engine…' : 'Building…');
  const p = params(), m = mode;
  const d = await run(p);
  first = false;
  stage.classList.remove('is-busy');
  if (!d.ok) { setStatus('Could not build this: ' + d.error + ' Change a setting to try again.', 'bad'); }
  else if (m === mode) {
    const meta = d.parts.map(pt => ({ color: pt.color, colorKey: pt.colorKey }));
    current = { ...d, meta, file: (MODES[mode].file || GEN.file || (() => GEN_ID))({ ...stateOf(mode), mode }) };
    showParts(); renderLegend(); showInfo();
  }
  if (pending) { pending = false; requestBuild(true); }
}
function showInfo() {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, cm3 = 0;
  for (const p of current.parts) { x0 = Math.min(x0, p.min[0]); y0 = Math.min(y0, p.min[1]); z0 = Math.min(z0, p.min[2]); x1 = Math.max(x1, p.max[0]); y1 = Math.max(y1, p.max[1]); z1 = Math.max(z1, p.max[2]); cm3 += p.volume / 1000; }
  const W = x1 - x0, D = y1 - y0, H = z1 - z0, [mat, dens] = MATERIALS[SET.material], g = cm3 * dens;
  const inch = (v) => fmt(v / 25.4, 2);
  readEl.innerHTML = `${fmt(W, 1)} × ${fmt(D, 1)} × ${fmt(H, 1)} mm<br><span class="gf-in">${inch(W)} × ${inch(D)} × ${inch(H)} in</span><br>≈ ${fmt(g, g < 10 ? 1 : 0)} g ${esc(mat)} (solid)`;
  const v = vol(), f = fits(v, W, D, H), pname = v.label === 'your printer' ? 'printer' : v.label;
  // the whole layout may be too big while every part fits on its own: then they print on separate plates
  const each = !f.ok && current.parts.length > 1 && current.parts.every(p => fits(v, p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]).ok);
  const facts = [...(current.info.facts || [])];
  facts.push(f.ok ? `fits your ${pname}` : each ? `each part fits your ${pname}` : 'too big for your printer');
  setStatus(facts.join(' · '), f.ok || each ? 'ok' : 'bad');
  const notes = [...(current.warn || [])];
  if (each) notes.unshift(`All the parts together are bigger than your ${v.label} bed (${v.x} × ${v.y} mm), so print them one or two at a time. The 3MF keeps every part as its own object.`);
  else if (!f.ok) notes.unshift(!f.flat ? `Too big for the bed of your ${v.label} (${v.x} × ${v.y} mm). Make it smaller${current.parts.length > 1 ? ' or print the parts separately' : ''}.` : `Too tall for your ${v.label} (${v.z} mm).`);
  warnEl.innerHTML = notes.map(w => `<li>${esc(w)}</li>`).join('');
  warnEl.classList.toggle('hidden', !notes.length);
  const lines = current.info.lines || [];
  infoEl.innerHTML = lines.map(l => `<li>${esc(l)}</li>`).join('');
  infoEl.parentElement.classList.toggle('hidden', !lines.length);
}

/* ============================================================ DOWNLOADS */
function save(data, name, type = 'application/octet-stream') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const safe = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'model';
$('#mk-stl').addEventListener('click', () => {
  if (!current) return;
  const base = 'hotendhq-' + safe(current.file);
  if (current.parts.length === 1) { const p = current.parts[0]; save(meshToSTL(p.pos, p.idx, base), base + '.stl'); }
  else save(zip(current.parts.map(p => ({ name: `${base}-${safe(p.name)}.stl`, data: meshToSTL(p.pos, p.idx, p.name) }))), base + '.zip', 'application/zip');
  window.HHQ?.toast(current.parts.length > 1 ? 'Zip downloaded: one STL per part, already lined up.' : 'STL downloaded.');
});
$('#mk-3mf').addEventListener('click', () => {
  if (!current) return;
  const base = 'hotendhq-' + safe(current.file);
  save(meshesTo3MF(current.parts.map(p => ({ name: p.label, pos: p.pos, idx: p.idx }))), base + '.3mf', 'model/3mf');
  window.HHQ?.toast(current.parts.length > 1 ? '3MF downloaded: each part is its own object, so you can give each a colour.' : '3MF downloaded.');
});
$('#mk-link').addEventListener('click', async () => {
  history.replaceState(null, '', shareURL());
  try { await navigator.clipboard.writeText(shareURL()); window.HHQ?.toast('Link copied. It rebuilds this exact design.'); }
  catch { window.HHQ?.toast('Could not copy. Check clipboard permissions.', 'warn'); }
});
$('#mk-reset').addEventListener('click', () => {
  states[mode] = defaultsOf(mode); delete uploads[mode]; history.replaceState(null, '', location.pathname);
  renderControls(); renderPresets(); remember(); requestBuild(true);
});

/* ============================================================ BOOT */
if (location.hash.length > 1) readHash(); else restore();
renderAll(); drawBed(); resize(); requestBuild(true);
