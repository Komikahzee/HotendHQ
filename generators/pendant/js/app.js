import { PARAMS, SECTIONS, SHAPES, DEFAULTS, PRESETS, BAND_PALETTES, FILAMENT_SWATCHES } from './params.js';
import { buildField, fillShape, bandHeights, shapeHalf, imageTransform } from './field.js';
import { buildPendant, buildConnector, tubeMesh, mergeMeshes, optimizeMesh } from './assembly.js';
import { BAIL_TEMPLATES, drawTemplateIcon } from './bailTemplates.js';
import { Viewer } from './viewer.js';
import { toSTL, to3MFScene, toSTLZip, toOBJ, saveFiles } from './exporters.js';
import { buildSource, loadImageFromBlob, loadImageFromURL, estimateDepth, removeBackgroundAI, hasTransparency, hasSolidBackground } from './imaging.js';
import { buildMeshLabeled } from './mesher2.js';
import { SAMPLES } from './samples.js';
import { icon, hydrateIcons } from './icons.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SPEC = Object.fromEntries(PARAMS.map((s) => [s.key, s]));
const LS_KEY = 'hotendhq.v1';

// Designs always start as the bare emblem: no hanger, connector bail or chain until the user adds one.
const NO_HANGER = { bail: 'none', cbOn: false };
const state = {
  p: { ...DEFAULTS },
  img: null, imgId: 0, imgName: '', depth: null, depthFor: -1, aiMask: null, aiMaskFor: -1,
  cbImg: null, cbImgId: 0, cbImgName: '', C: null,
  adv: false, quality: 'balanced', designView: 'height',
  view: { layerLines: false, backlit: false, chain: false, wireframe: false, turntable: false, stage: 'standing' },
  open: { shape: true, image: true },
  F: null, M: null, previewRes: 0.2,
};

// Params are mutated in place so every control closure keeps a live reference.
function replaceParams(obj) { for (const k of Object.keys(state.p)) delete state.p[k]; Object.assign(state.p, obj); }

// ── Persistence ─────────────────────────────────────────────
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ p: state.p, adv: state.adv, view: state.view, open: state.open, quality: state.quality })); } catch { /* storage unavailable */ }
}
let _saveT = 0;
const saveLocalSoon = () => { clearTimeout(_saveT); _saveT = setTimeout(saveLocal, 400); };
function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!s) return false;
    // the design itself is not restored: every visit starts as a blank slate (Save / Open keep a project)
    state.adv = !!s.adv; state.quality = s.quality || 'balanced';
    Object.assign(state.view, s.view || {}); Object.assign(state.open, s.open || {});
    return true;
  } catch { return false; }
}

// ── History ─────────────────────────────────────────────────
const hist = { stack: [], idx: -1 };
function pushHistory() {
  const s = JSON.stringify(state.p);
  if (hist.stack[hist.idx] === s) return;
  hist.stack = hist.stack.slice(0, hist.idx + 1); hist.stack.push(s);
  if (hist.stack.length > 200) hist.stack.shift();
  hist.idx = hist.stack.length - 1; updateUndo(); saveLocalSoon();
}
function stepHistory(d) {
  const i = hist.idx + d; if (i < 0 || i >= hist.stack.length) return;
  hist.idx = i; replaceParams(JSON.parse(hist.stack[i])); syncAll(); scheduleRegen(); updateUndo(); saveLocalSoon();
}
function updateUndo() { $('#btnUndo').disabled = hist.idx <= 0; $('#btnRedo').disabled = hist.idx >= hist.stack.length - 1; }

// ── Toast & tooltip ─────────────────────────────────────────
let _toastT = 0;
// Triple-clicking the logo shows a small on-screen log (for diagnosing hosted builds where devtools aren't
// reachable). Silent until then.
let dbg = () => {};
document.querySelector('.brand small')?.addEventListener('click', (e) => { if (e.detail === 3 && !window._hqDbg) { window._hqDbg = 1; dbg = startDebug(); dbgState(); } });
function dbgState() {
  const m = document.getElementById('hqModal'), cs = m && getComputedStyle(m), r = m?.getBoundingClientRect();
  dbg('modal', !!m, m?.hidden, cs?.display, cs?.position, cs?.zIndex, r && `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, 'parent', m?.parentElement?.tagName + '#' + (m?.parentElement?.id || ''));
  dbg('body kids', [...document.body.children].map((c) => c.tagName + (c.id ? '#' + c.id : '')).join(' '));
  dbg('sheets', [...document.styleSheets].length, 'hqModal rule', [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r2) => r2.cssText.includes('hqModal')); } catch { return false; } }));
}
function startDebug() {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999;max-width:60vw;max-height:40vh;overflow:auto;margin:0;padding:8px;background:#000d;color:#9f9;font:11px/1.35 monospace;white-space:pre-wrap;pointer-events:none';
  document.body.appendChild(box);
  const log = (...a) => { box.textContent = (box.textContent + '\n' + a.join(' ')).split('\n').slice(-18).join('\n'); };
  const ce = console.error.bind(console); console.error = (...a) => { log('ERR', ...a.map(String)); ce(...a); };
  window.addEventListener('error', (e) => log('ONERROR', e.message, e.filename?.split('/').pop(), e.lineno));
  document.addEventListener('click', (e) => log('click', e.target.closest('[id]')?.id || e.target.tagName), true);
  return log;
}
// Unexpected errors are shown, not swallowed: the user learns something failed and what.
window.addEventListener('error', (e) => { if (e.message) toast('Something went wrong: ' + e.message, 6000); });
window.addEventListener('unhandledrejection', (e) => toast('Something went wrong: ' + (e.reason?.message || e.reason), 6000));
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('on'), ms); }
let _tipT = 0;
function showTip(el) {
  const tip = $('#tooltip');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let x = r.right + 8, y = r.top - 6;
  if (x + w > window.innerWidth - 8) { x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)); y = r.bottom + 8; }
  if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
}
document.addEventListener('mouseover', (e) => { if (!_tipT) showTip(e.target.closest('[data-tip]')); });
// Touch screens have no hover: tap a "?" to show its help for a few seconds.
document.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') return;
  const el = e.target.closest('.help[data-tip]');
  clearTimeout(_tipT); _tipT = 0;
  if (!el) { showTip(null); return; }
  showTip(el); _tipT = setTimeout(() => { _tipT = 0; showTip(null); }, 4000);
});

// ── Controls ────────────────────────────────────────────────
const rows = {};
const decimals = (step) => (step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3);

function setParam(key, v, commit = true) {
  const prev = state.p[key];
  state.p[key] = v;
  onParamChanged(key, prev);
  rows[key]?.sync();
  refreshVisibility();
  scheduleRegen();
  if (commit) pushHistory(); else saveLocalSoon();
}

const MODE_DEFAULTS = {
  lithophane: { base: 0.8, depth: 2.2, rimStyle: 'flat', rimWidth: 2.4, rimHeight: 2.4, material: 'translucent', color: '#f4f1ea', imgInset: 0, imgFade: 0.2, textClear: false, dome: 0 },
  raised: { base: 1.6, depth: 2 },
  engraved: { base: 1.4, depth: 1.4, rimHeight: 1.4 },
  stencil: { base: 1.4, depth: 1.6, smoothing: 0.08 },
};
function onParamChanged(key, prev) {
  const p = state.p;
  if (key === 'mode' && prev !== p.mode) {
    Object.assign(p, MODE_DEFAULTS[p.mode] || {});
    if (p.mode === 'lithophane') { setView('backlit', true); toast('Lithophane defaults applied · backlight on (Ctrl+Z to undo)'); }
    else if (prev === 'lithophane') { if (p.material === 'translucent') p.material = 'silk'; setView('backlit', false); }
    syncAll();
  }
  if (key === 'heightSource' && p.heightSource !== 'brightness') runDepth();
  if (key === 'bgMode') state.autoBg = false; // the user's own choice sticks
  if (key === 'bgMode' && p.bgMode === 'ai') runCutout();
  if (key === 'shape') ensureSubject();
  if (key === 'cbJoin' && p.cbJoin === 'peg' && (p.bail === 'tab' || p.bail === 'punched')) {
    // size the peg for a snug push fit through the pendant's hole and loop
    p.cbPegD = +(p.holeD - 0.3).toFixed(2);
    p.cbPegH = +((p.bail === 'tab' ? p.tabThick : p.base + p.depth) + 0.6).toFixed(2);
    rows.cbPegD?.sync(); rows.cbPegH?.sync();
    toast(`Peg sized to fit the ${p.holeD} mm pendant hole`);
  }
  if (key === 'material' || key === 'color' || key.startsWith('band') || key === 'colorMode' || key === 'layerH' || key === 'firstLayer') applyLook();
}

function helpIcon(spec) { return spec.help ? `<i class="help" data-tip="${spec.help.replace(/"/g, '&quot;')}">?</i>` : ''; }

function makeRow(spec) {
  const p = state.p, row = document.createElement('div');
  row.className = 'row'; row.dataset.key = spec.key;
  let sync = () => {};
  const labelHTML = `<label class="resettable" data-reset="${spec.key}" title="Double-click to reset">${spec.label}${helpIcon(spec)}</label>`;
  switch (spec.type) {
    case 'range': {
      const dec = decimals(spec.step);
      row.innerHTML = `<div class="row-head">${labelHTML}<div class="num"><input type="number" step="${spec.step}" min="${spec.min}" max="${spec.max}"><span class="unit">${spec.unit}</span></div></div><input type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}">`;
      const num = $('input[type=number]', row), rng = $('input[type=range]', row);
      rng.addEventListener('input', () => setParam(spec.key, +rng.value, false));
      rng.addEventListener('change', () => pushHistory());
      num.addEventListener('change', () => { const v = parseFloat(num.value); setParam(spec.key, isNaN(v) ? spec.def : clamp(v, spec.min, spec.max)); });
      num.addEventListener('focus', () => num.select());
      sync = () => {
        const v = p[spec.key]; rng.value = v; if (document.activeElement !== num) num.value = (+v).toFixed(dec);
        rng.style.setProperty('--pct', ((v - spec.min) / (spec.max - spec.min) * 100) + '%');
      };
      break;
    }
    case 'select': {
      if (spec.seg) {
        row.innerHTML = `<div class="row-head">${labelHTML}</div><div class="segs">${spec.opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`;
        $$('.segs button', row).forEach((b) => b.addEventListener('click', () => setParam(spec.key, b.dataset.v)));
        sync = () => $$('.segs button', row).forEach((b) => b.classList.toggle('on', b.dataset.v === p[spec.key]));
      } else {
        row.innerHTML = `<div class="row-head">${labelHTML}</div><select class="sel">${spec.opts.map(([v, l]) => `<option value="${v}" ${spec.font ? `style="font-family:'${v}'"` : ''}>${l}</option>`).join('')}</select>`;
        const sel = $('select', row);
        sel.addEventListener('change', () => setParam(spec.key, sel.value));
        sync = () => { sel.value = p[spec.key]; if (spec.font) sel.style.fontFamily = `'${p[spec.key]}'`; };
      }
      break;
    }
    case 'toggle': {
      row.classList.add('toggle');
      row.innerHTML = `<div class="row-head">${labelHTML}<label class="switch"><input type="checkbox"><span></span></label></div>`;
      const cb = $('input', row);
      cb.addEventListener('change', () => setParam(spec.key, cb.checked));
      sync = () => { cb.checked = !!p[spec.key]; };
      break;
    }
    case 'text': {
      const tag = spec.multiline ? `<textarea class="txt" rows="2" placeholder="Optional"></textarea>` : `<input class="txt" type="text" placeholder="Optional" maxlength="60">`;
      row.innerHTML = `<div class="row-head">${labelHTML}</div>${tag}`;
      const inp = $('.txt', row);
      inp.addEventListener('input', () => setParam(spec.key, inp.value, false));
      inp.addEventListener('change', () => pushHistory());
      sync = () => { if (document.activeElement !== inp) inp.value = p[spec.key] || ''; };
      break;
    }
    case 'color': {
      row.innerHTML = `<div class="row-head">${labelHTML}</div><div class="colors"><input type="color"><div class="swatches">${FILAMENT_SWATCHES.map((c) => `<button class="sw" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div></div>`;
      const ci = $('input', row);
      ci.addEventListener('input', () => setParam(spec.key, ci.value, false));
      ci.addEventListener('change', () => pushHistory());
      $$('.sw', row).forEach((b) => b.addEventListener('click', () => setParam(spec.key, b.dataset.c)));
      sync = () => { ci.value = p[spec.key]; $$('.sw', row).forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === String(p[spec.key]).toLowerCase())); };
      break;
    }
    case 'shapes': {
      row.innerHTML = `<div class="shape-grid">${SHAPES.map(([v, l]) => `<button class="shape-tile" data-v="${v}"><canvas width="60" height="60"></canvas>${l}</button>`).join('')}</div>`;
      $$('.shape-tile', row).forEach((b) => {
        drawShapeIcon($('canvas', b), b.dataset.v, 'rgba(210,214,224,.85)');
        b.addEventListener('click', () => setParam('shape', b.dataset.v));
      });
      sync = () => $$('.shape-tile', row).forEach((b) => b.classList.toggle('on', b.dataset.v === p.shape));
      break;
    }
    case 'templates': {
      row.innerHTML = `<div class="row-head"><label>${spec.label}</label></div><div class="shape-grid tpl-grid">${BAIL_TEMPLATES.map(([v, l]) => `<button class="shape-tile" data-v="${v}"><canvas width="72" height="72"></canvas>${l}</button>`).join('')}</div>`;
      $$('.shape-tile', row).forEach((b) => {
        drawTemplateIcon($('canvas', b), b.dataset.v, '#e9c98f');
        b.addEventListener('click', () => {
          setParam('cbTemplate', b.dataset.v);
          if (b.dataset.v === 'custom' && !state.cbImg) $('#cbFile').click();
        });
      });
      sync = () => $$('.shape-tile', row).forEach((b) => b.classList.toggle('on', b.dataset.v === state.p.cbTemplate));
      break;
    }
    case 'cbimage': {
      row.innerHTML = `<div class="cb-img"><canvas width="112" height="112"></canvas><div class="cb-img-actions">
        <button class="tb-btn" data-a="up">${icon('upload')}<span>Upload image</span></button>
        <button class="tb-btn" data-a="pend">${icon('image')}<span>Use pendant image</span></button>
        <button class="link" data-a="clear">Remove</button><small>Logos, initials, symbols or photos. The outline follows your subject once the background is removed.</small></div></div>`;
      $('[data-a=up]', row).addEventListener('click', () => $('#cbFile').click());
      $('[data-a=pend]', row).addEventListener('click', () => { if (state.img) setConnectorImage(state.img, state.imgName); else toast('Load a pendant image first'); });
      $('[data-a=clear]', row).addEventListener('click', () => { state.cbImg = null; state.cbImgId++; sync(); scheduleRegen(); });
      sync = () => {
        const cv = $('canvas', row), g = cv.getContext('2d');
        g.clearRect(0, 0, cv.width, cv.height);
        if (state.cbImg) { const s = Math.min(cv.width / state.cbImg.width, cv.height / state.cbImg.height); g.drawImage(state.cbImg, (cv.width - state.cbImg.width * s) / 2, (cv.height - state.cbImg.height * s) / 2, state.cbImg.width * s, state.cbImg.height * s); }
        else { g.fillStyle = '#6a7080'; g.font = '500 12px Inter'; g.textAlign = 'center'; g.fillText('No image yet', cv.width / 2, cv.height / 2 + 4); }
      };
      break;
    }
    case 'bands': {
      row.innerHTML = `<div class="row-head"><label>Colour stack <i class="help" data-tip="Bottom to top. Each colour starts at the layer shown. Heights snap to your layer height.">?</i></label></div><div class="bands"></div><div class="pal">${BAND_PALETTES.map(([n, cols], i) => `<button data-i="${i}" data-tip="${n}">${cols.slice(0, 4).map((c) => `<span style="background:${c}"></span>`).join('')}</button>`).join('')}</div>`;
      $$('.pal button', row).forEach((b) => b.addEventListener('click', () => {
        BAND_PALETTES[+b.dataset.i][1].forEach((c, i) => { state.p['band' + i] = c; });
        applyLook(); sync(); draw2D(); pushHistory();
      }));
      sync = () => {
        const host = $('.bands', row), bh = bandHeights(p);
        host.innerHTML = bh.map((b, i) => `<div class="band"><input type="color" data-i="${i}" value="${p['band' + i]}"><span>Colour ${i + 1}</span><span class="bz">${i === 0 ? 'start' : `layer ${b.layer} · ${b.z.toFixed(2)} mm`}</span></div>`).reverse().join('');
        $$('input', host).forEach((ci) => {
          ci.addEventListener('input', () => { state.p['band' + ci.dataset.i] = ci.value; applyLook(); draw2D(); });
          ci.addEventListener('change', () => pushHistory());
        });
      };
      break;
    }
  }
  rows[spec.key] = { row, spec, sync };
  sync();
  return row;
}

function drawShapeIcon(cv, shape, color, extra = {}) {
  const g = cv.getContext('2d'), s = cv.width;
  g.clearRect(0, 0, s, s);
  const p = { ...DEFAULTS, ...extra, shape: shape === 'silhouette' ? 'circle' : shape };
  const [a0, b0] = [1, shape === 'bone' ? 0.55 : shape === 'roundrect' ? (extra.aspect ?? 0.8) : (extra.aspect ?? 1)];
  const k = s * 0.42 / Math.max(a0, b0);
  g.save(); g.translate(s / 2, s / 2); g.scale(k, -k); g.fillStyle = color;
  if (shape === 'silhouette') {
    g.beginPath(); g.ellipse(0, -0.25, 0.62, 0.5, 0, 0, 7); g.fill();
    for (const [x, y] of [[-0.72, 0.35], [-0.27, 0.72], [0.27, 0.72], [0.72, 0.35]]) { g.beginPath(); g.ellipse(x, y, 0.22, 0.28, 0, 0, 7); g.fill(); }
  } else fillShape(g, p, a0, b0);
  g.restore();
}

function buildControls() {
  const host = $('#controls'); host.innerHTML = '';
  for (const sec of SECTIONS) {
    const el = document.createElement('section');
    el.className = 'sec' + (state.open[sec.id] ? ' open' : ''); el.dataset.sec = sec.id;
    el.innerHTML = `<button class="sec-head"><span class="ic-wrap">${icon(sec.icon)}</span>${sec.title}<span class="badge" hidden></span>${icon('chev', 'ic chev')}</button><div class="sec-body"></div>`;
    $('.sec-head', el).addEventListener('click', () => { el.classList.toggle('open'); state.open[sec.id] = el.classList.contains('open'); saveLocalSoon(); });
    const body = $('.sec-body', el);
    for (const spec of PARAMS) if (spec.sec === sec.id && !spec.hidden) body.appendChild(makeRow(spec));
    const rs = document.createElement('button');
    rs.className = 'sec-reset'; rs.textContent = `Reset ${sec.title.toLowerCase()}`;
    rs.addEventListener('click', () => resetSection(sec));
    body.appendChild(rs);
    host.appendChild(el);
  }
  host.insertAdjacentHTML('beforeend', '<div class="search-empty" hidden>No settings match your search.</div>');
  host.addEventListener('dblclick', (e) => {
    const l = e.target.closest('[data-reset]'); if (!l) return;
    const spec = SPEC[l.dataset.reset]; if (spec && spec.def !== null) { setParam(spec.key, spec.def); toast(`${spec.label} reset`); }
  });
}

function resetSection(sec) {
  let n = 0;
  for (const spec of PARAMS) {
    if (spec.sec !== sec.id || spec.def === null || spec.def === undefined) continue;
    if (JSON.stringify(state.p[spec.key]) !== JSON.stringify(spec.def)) { state.p[spec.key] = structuredClone(spec.def); n++; }
  }
  if (!n) { toast(`${sec.title} is already at defaults`); return; }
  syncAll(); scheduleRegen(); pushHistory();
  toast(`${sec.title} reset to defaults (Ctrl+Z to undo)`);
}

function refreshVisibility() {
  const q = $('#search').value.trim().toLowerCase(), p = state.p, ctx = { hasImage: !!state.img };
  const secHits = {};
  for (const { row, spec } of Object.values(rows)) {
    let vis = (!spec.show || spec.show(p, ctx)) && (!spec.adv || state.adv || q);
    if (q) {
      const hay = `${spec.label} ${spec.help || ''} ${spec.key} ${(spec.opts || []).map((o) => o[1]).join(' ')}`.toLowerCase();
      vis = vis && hay.includes(q);
    }
    row.hidden = !vis;
    if (spec.def !== null && spec.type !== 'shapes') row.classList.toggle('changed', JSON.stringify(p[spec.key]) !== JSON.stringify(spec.def));
    if (vis) secHits[spec.sec] = (secHits[spec.sec] || 0) + 1;
  }
  let any = false;
  $$('.sec').forEach((el) => {
    const id = el.dataset.sec;
    el.hidden = !!q && !secHits[id];
    if (q && secHits[id]) { el.classList.add('open'); any = true; }
    else if (!q) el.classList.toggle('open', !!state.open[id]);
    const changed = PARAMS.filter((s) => s.sec === id && s.def !== null && !s.hidden && s.type !== 'shapes' && JSON.stringify(p[s.key]) !== JSON.stringify(s.def)).length;
    const bd = $('.badge', el); bd.hidden = !changed; bd.textContent = changed; bd.title = `${changed} changed from default`;
  });
  $('.search-empty').hidden = !q || any;
}

function syncAll() { Object.values(rows).forEach((r) => r.sync()); refreshVisibility(); syncViewButtons(); applyLook(); }

// ── Regeneration ────────────────────────────────────────────
const loadedFonts = new Set();
async function ensureFonts() {
  const p = state.p, need = [];
  if (p.textTop || p.textBottom || p.textCenter) need.push(p.font);
  if (p.backText) need.push(p.backFont);
  for (const f of need) {
    if (loadedFonts.has(f)) continue;
    try { await Promise.all([document.fonts.load(`700 100px "${f}"`), document.fonts.load(`400 100px "${f}"`)]); } catch { /* fall back silently */ }
    loadedFonts.add(f);
  }
}
// Interactive passes stay light; once you stop editing, a refine pass rebuilds at near-export detail.
const QUALITY = { fast: [200, 0], balanced: [300, 620], high: [420, 900] };
function previewRes(refine = false) {
  const p = state.p, [a, b] = shapeHalf(p);
  const span = 2 * Math.max(a, b) + (p.bail === 'tab' ? p.tabD : 0);
  const [live, fine] = QUALITY[state.quality] || QUALITY.balanced;
  return Math.max(0.05, span / (refine ? fine : live));
}
const CREASE = 0.7; // radians (~40°): steps and letter walls shade sharp, curved relief stays smooth
function currentSource() {
  if (!state.img) return null;
  const wantDepth = state.p.heightSource !== 'brightness' && state.depthFor === state.imgId;
  const ai = state.p.bgMode === 'ai' && state.aiMaskFor === state.imgId ? state.aiMask : null;
  return buildSource(state.img, wantDepth ? state.depth : null, state.p, state.imgId, ai);
}

let rq = false, running = false, again = false, busyT = 0, refineT = 0, gen = 0;
function scheduleRegen() {
  gen++; clearTimeout(refineT);
  if (running) { again = true; return; }
  if (rq) return; rq = true; requestAnimationFrame(runRegen);
}
async function runRegen() {
  rq = false; running = true;
  clearTimeout(busyT); busyT = setTimeout(() => setBusy(true, 'Forging…'), 140);
  try {
    await ensureFonts();
    state.previewRes = previewRes();
    const { F, M, C } = buildScene(state.previewRes);
    state.F = F; state.M = M; state.C = C;
    viewer.setMesh(M, F, { crease: CREASE });
    viewer.setConnector(C, { crease: CREASE });
    applyLook(); draw2D(); updateReport();
  } catch (e) { console.error(e); toast('Something went wrong: ' + e.message, 5000); }
  clearTimeout(busyT); setBusy(false);
  running = false;
  if (again) { again = false; scheduleRegen(); return; }
  if (QUALITY[state.quality]?.[1]) { const g = gen; refineT = setTimeout(() => refine(g), 450); }
}
async function refine(g) {
  if (g !== gen || running) return;
  setBusy(true, 'Refining detail…');
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); // let the badge paint
  if (g !== gen || running) { setBusy(false); return; }
  try {
    const res = previewRes(true);
    const { F, M, C } = buildScene(res, true);
    if (g !== gen) return;
    state.F = F; state.M = M; state.C = C; state.previewRes = res;
    viewer.setMesh(M, F, { crease: CREASE });
    viewer.setConnector(C, { crease: CREASE });
    draw2D(); updateReport();
  } catch (e) { console.error(e); }
  finally { setBusy(false); }
}
// Pendant (+ tube tunnels) and the optional connector bail, at a given resolution.
// simplify: collapse flat areas to their minimum triangulation (refine pass & export).
function buildScene(res, simplify = false) {
  const { F, M } = buildPendant(state.p, currentSource(), res, { simplify });
  const C = state.p.cbOn ? buildConnector(state.p, state.cbImg, state.cbImgId, Math.max(0.05, res * 0.7), { simplify }) : null;
  return { F, M, C };
}
function connectorColour() {
  const p = state.p;
  if (!p.cbMatch) return p.cbColor;
  return p.colorMode === 'bands' ? p['band' + (p.bandCount - 1)] : p.color;
}
function setBusy(on, text) { $('#busy').classList.toggle('on', on); if (text) $('#busyText').textContent = text; }

function lookObject() {
  const p = state.p;
  return {
    material: p.material, color: p.color, cbColor: connectorColour(), wireframe: state.view.wireframe,
    bands: p.colorMode === 'bands' ? bandHeights(p).map((b, i) => ({ z: b.z, color: p['band' + i] })) : null,
    layerLines: state.view.layerLines, layerH: p.layerH, firstLayer: p.firstLayer, backlit: state.view.backlit,
  };
}
function applyLook() { if (viewer) viewer.setLook(lookObject()); }

// An image outline needs a subject: if the image has no transparent background, remove it automatically
// rather than tracing the image rectangle.
function ensureSubject() {
  const p = state.p;
  if (p.shape !== 'silhouette' || !state.img || (p.bgMode !== 'none' && p.bgMode !== 'alpha') || hasTransparency(state.img)) return;
  p.bgMode = 'auto'; rows.bgMode?.sync();
  toast('Background removed so the outline follows your subject — for photos, try “AI cut-out”', 5000);
}

// ── AI subject cut-out ──────────────────────────────────────
async function runCutout() {
  if (!state.img || state.aiMaskFor === state.imgId) return;
  const badge = $('#aiBadge'), id = state.imgId;
  const status = (s) => { badge.hidden = !s; badge.innerHTML = `<span class="spin"></span>${s}`; };
  try {
    const m = await removeBackgroundAI(state.img, status);
    if (id !== state.imgId) return;
    state.aiMask = m; state.aiMaskFor = id;
    toast('AI cut-out ready ✦'); scheduleRegen();
  } catch (e) {
    console.error(e); badge.hidden = true;
    toast('AI cut-out could not load (' + (e.message || 'network') + '). Using smart auto instead.', 5000);
    setParam('bgMode', 'auto');
  }
}

// ── AI depth ────────────────────────────────────────────────
async function runDepth() {
  if (!state.img || state.depthFor === state.imgId) return;
  const badge = $('#aiBadge'), id = state.imgId;
  const status = (s) => { badge.hidden = !s; badge.innerHTML = `<span class="spin"></span>${s}`; };
  try {
    const d = await estimateDepth(state.img, status);
    if (id !== state.imgId) return;
    state.depth = d; state.depthFor = id;
    toast('AI depth ready ✦'); scheduleRegen();
  } catch (e) {
    console.error(e); badge.hidden = true;
    toast('AI depth could not load (' + (e.message || 'network') + '). Using brightness.', 5000);
    setParam('heightSource', 'brightness');
  }
}

// ── 2D design preview ───────────────────────────────────────
const design = $('#design');
let designK = 1;
function draw2D() {
  const F = state.F; if (!F) return;
  const wrap = $('#designWrap'), dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = wrap.clientWidth, ch = wrap.clientHeight;
  if (design.width !== Math.round(cw * dpr)) { design.width = Math.round(cw * dpr); design.height = Math.round(ch * dpr); }
  const g = design.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
  const { nx, ny, c, x0, y0, S, Z } = F;
  const Wmm = (nx - 1) * c, Hmm = (ny - 1) * c;
  designK = Math.min(cw / Wmm, ch / Hmm) * 0.96;
  const ox = cw / 2 + (x0 - c / 2) * designK, oy = ch / 2 - (y0 + (ny - 1) * c + c / 2) * designK;
  const img = new ImageData(nx, ny), d = img.data;
  const p = state.p;
  if (state.designView === 'height') {
    let zmin = Infinity, zmax = -Infinity;
    for (let k = 0; k < nx * ny; k++) if (S[k] < 0) { if (Z[k] < zmin) zmin = Z[k]; if (Z[k] > zmax) zmax = Z[k]; }
    const zr = Math.max(0.01, zmax - zmin), ex = 1.6 / (2 * c); // slope exaggeration for a readable hillshade
    const bands = p.colorMode === 'bands' ? bandHeights(p).map((b, i) => ({ z: b.z, col: hexRGB(p['band' + i]) })) : null;
    const base = hexRGB(p.material === 'glow' ? '#dfffe9' : p.color);
    const L = [-0.5, 0.6, 0.62], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i; if (S[k] >= 0) continue;
      const gx = (Z[k + 1] - Z[k - 1]) * ex, gy = (Z[k + nx] - Z[k - nx]) * ex;
      const nl = Math.hypot(gx, gy, 1), sh = Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) / nl);
      let col = base;
      if (bands) { col = bands[0].col; for (const b of bands) if (Z[k] > b.z + 0.01) col = b.col; }
      const hn = (Z[k] - zmin) / zr, lit = 0.28 + 0.9 * sh, amb = 0.75 + 0.25 * hn;
      const o = ((ny - 1 - j) * nx + i) * 4;
      d[o] = Math.min(255, col[0] * lit * amb + 18 * sh); d[o + 1] = Math.min(255, col[1] * lit * amb + 14 * sh); d[o + 2] = Math.min(255, col[2] * lit * amb + 10 * sh); d[o + 3] = 255;
    }
  } else {
    // Source view: the real image in colour, cut out by the background mask, with the pendant outline overlaid
    const src = currentSource();
    if (src && state.img) {
      const t = document.createElement('canvas'); t.width = src.width; t.height = src.height;
      const tg = t.getContext('2d'); tg.drawImage(state.img, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(src, 0, 0);
      const { s0 } = imageTransform(p, F.L, src.width, src.height);
      g.save(); g.translate(cw / 2, ch / 2); g.scale(designK, designK); g.translate(p.imgX, -p.imgY); g.rotate(p.imgRotate * Math.PI / 180);
      g.scale(s0 * (p.imgFlip ? -1 : 1), s0); g.drawImage(t, -src.width / 2, -src.height / 2); g.restore();
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, o = ((ny - 1 - j) * nx + i) * 4, edge = Math.abs(S[k]) < c * 0.8;
      if (edge) { d[o] = 255; d[o + 1] = 150; d[o + 2] = 60; d[o + 3] = 255; } else if (S[k] >= 0) d[o + 3] = 150; // dim outside, orange outline
    }
  }
  const tmp = document.createElement('canvas'); tmp.width = nx; tmp.height = ny; tmp.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(tmp, ox, oy, nx * c * designK, ny * c * designK);
  $('#dropHint').hidden = !!state.img;
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function setupDesignInteractions() {
  // One pointer drags the image; two pointers (touch) pinch-zoom and twist-rotate it.
  let drag = null, pinch = null, moved = false;
  const pts = new Map();
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), z: state.p.imgZoom, r: state.p.imgRotate };
  };
  design.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    design.setPointerCapture(e.pointerId); design.classList.add('dragging');
    if (pts.size === 2) { drag = null; pinch = pinchState(); }
    else if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, ix: state.p.imgX, iy: state.p.imgY };
  });
  design.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const now = pinchState();
      state.p.imgZoom = clamp(+(pinch.z * now.d / pinch.d).toFixed(3), 0.1, 5);
      const rot = pinch.r - (now.ang - pinch.ang) * 180 / Math.PI;
      state.p.imgRotate = clamp(+((rot + 540) % 360 - 180).toFixed(1), -180, 180);
      rows.imgZoom.sync(); rows.imgRotate.sync(); scheduleRegen(); moved = true;
    } else if (drag) {
      state.p.imgX = +(drag.ix + (e.clientX - drag.x) / designK).toFixed(2);
      state.p.imgY = +(drag.iy - (e.clientY - drag.y) / designK).toFixed(2);
      rows.imgX.sync(); rows.imgY.sync(); scheduleRegen(); moved = true;
    }
  });
  const end = (e) => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size === 1 && pinch) { // lifted one finger: continue as a drag from here
      pinch = null; const [q] = pts.values();
      drag = { x: q.x, y: q.y, ix: state.p.imgX, iy: state.p.imgY };
    } else if (!pts.size) {
      drag = pinch = null; design.classList.remove('dragging');
      if (moved) { pushHistory(); refreshVisibility(); } moved = false;
    }
  };
  design.addEventListener('pointerup', end); design.addEventListener('pointercancel', end);
  let wheelT = 0;
  design.addEventListener('wheel', (e) => {
    if (!state.img) return;
    e.preventDefault();
    const dlt = e.deltaY || e.deltaX;
    if (e.shiftKey) state.p.imgRotate = clamp(+((state.p.imgRotate + dlt * 0.05 + 540) % 360 - 180).toFixed(1), -180, 180);
    else state.p.imgZoom = clamp(+(state.p.imgZoom * Math.exp(-dlt * 0.0012)).toFixed(3), 0.1, 5);
    rows.imgRotate.sync(); rows.imgZoom.sync(); scheduleRegen();
    clearTimeout(wheelT); wheelT = setTimeout(() => { pushHistory(); refreshVisibility(); }, 350);
  }, { passive: false });
  $$('.dc-tabs button').forEach((b) => b.addEventListener('click', () => {
    state.designView = b.dataset.dv; $$('.dc-tabs button').forEach((x) => x.classList.toggle('on', x === b)); draw2D();
  }));
  $('#btnFitImg').addEventListener('click', () => { Object.assign(state.p, { imgX: 0, imgY: 0, imgZoom: 1, imgRotate: 0 }); syncAll(); scheduleRegen(); pushHistory(); });
  $('#btnReplace').addEventListener('click', () => $('#fileInput').click());
  $('#btnClearImg').addEventListener('click', () => { state.img = null; state.imgId++; scheduleRegen(); refreshVisibility(); });
  $('#dropHint').addEventListener('click', (e) => { if (!e.target.closest('.chip')) $('#fileInput').click(); });
  $('#sampleChips').innerHTML = Object.entries(SAMPLES).map(([k, [n]]) => `<button class="chip" data-s="${k}">${n}</button>`).join('');
  $$('#sampleChips .chip').forEach((b) => b.addEventListener('click', () => useSample(b.dataset.s)));
}

// ── Images & files ──────────────────────────────────────────
function setImage(cv, name, resetTransform = true) {
  state.img = cv; state.imgId++; state.imgName = name || 'image'; state.depth = null; state.depthFor = -1; state.aiMask = null; state.aiMaskFor = -1;
  if (resetTransform) Object.assign(state.p, { imgX: 0, imgY: 0, imgZoom: 1, imgRotate: 0, imgFlip: false });
  ensureSubject();
  syncAll(); scheduleRegen(); pushHistory();
  if (state.p.heightSource !== 'brightness') runDepth();
  if (state.p.bgMode === 'ai') runCutout();
}
function setConnectorImage(cv, name) {
  state.cbImg = cv; state.cbImgId++; state.cbImgName = name || 'bail';
  state.p.cbTemplate = 'custom'; state.p.cbOn = true;
  syncAll(); scheduleRegen(); pushHistory(); toast('Connector image loaded');
}
function useSample(key) { const [name, fn] = SAMPLES[key]; setImage(fn(), name); }

async function handleFile(file) {
  if (!file) return;
  try {
    if (/json|hotendhq|emberforge/i.test(file.type + file.name)) return loadProject(JSON.parse(await file.text()));
    if (!file.type.startsWith('image/')) throw new Error('Unsupported file type');
    const cv = await loadImageFromBlob(file);
    // a logo or drawing on a plain background: drop the background instead of modelling it as a raised plate
    // (only when we'd otherwise use the image as is; switched back for the next image if it has no plain background)
    if (state.autoBg && state.p.bgMode === 'auto') state.p.bgMode = 'alpha';
    const plainBg = state.p.bgMode === 'alpha' && hasSolidBackground(cv);
    state.autoBg = plainBg;
    if (plainBg) state.p.bgMode = 'auto';
    setImage(cv, file.name.replace(/\.[^.]+$/, ''));
    toast(plainBg ? `Loaded ${file.name}. Its plain background was removed; to keep it, set Background removal to None.` : `Loaded ${file.name}`, plainBg ? 5000 : 2600);
  } catch (e) { toast(e.message, 4000); }
}
function setupFiles() {
  const fi = $('#fileInput');
  fi.addEventListener('change', () => { handleFile(fi.files[0]); fi.value = ''; });
  $('#btnOpen').addEventListener('click', () => fi.click());
  const wrap = $('#designWrap');
  window.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drop'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) wrap.classList.remove('drop'); });
  window.addEventListener('drop', (e) => { e.preventDefault(); wrap.classList.remove('drop'); handleFile(e.dataTransfer.files[0]); });
  window.addEventListener('paste', (e) => {
    if (e.target.closest('input, textarea')) return;
    const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (it) handleFile(it.getAsFile());
  });
  $('#btnSave').addEventListener('click', saveProject);
  const cf = $('#cbFile');
  cf.addEventListener('change', async () => {
    const file = cf.files[0]; cf.value = '';
    if (!file) return;
    try { setConnectorImage(await loadImageFromBlob(file), file.name.replace(/\.[^.]+$/, '')); } catch (e) { toast(e.message, 4000); }
  });
}
function slug() {
  const p = state.p, t = (p.textTop || p.textCenter || state.imgName || 'pendant').toLowerCase();
  return (t.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'pendant');
}
function saveProject() {
  const data = { app: 'hotendhq', version: 1, p: state.p, view: state.view, imgName: state.imgName, image: state.img ? state.img.toDataURL('image/png') : null,
    cbImage: state.cbImg ? state.cbImg.toDataURL('image/png') : null, cbImgName: state.cbImgName };
  saveFiles([[new Blob([JSON.stringify(data)], { type: 'application/json' }), `${slug()}.hotendhq.json`]], slug())
    .then((how) => toast(how === 'declined' ? 'Save cancelled' : 'Project saved'), (e) => toast(e.message, 4000));
}
async function loadProject(data) {
  if (data.app !== 'hotendhq' && data.app !== 'emberforge') throw new Error('Not a HotendHq project'); // older projects still open
  replaceParams({ ...DEFAULTS, ...data.p }); Object.assign(state.view, data.view || {});
  if (data.cbImage) { state.cbImg = await loadImageFromURL(data.cbImage); state.cbImgId++; state.cbImgName = data.cbImgName || 'bail'; }
  if (data.image) setImage(await loadImageFromURL(data.image), data.imgName, false);
  else { state.img = null; state.imgId++; }
  syncAll(); scheduleRegen(); pushHistory(); toast('Project opened');
}

// ── Viewport controls ───────────────────────────────────────
function setView(key, val) {
  state.view[key] = val;
  if (key === 'stage') viewer.setDisplay({ view: val });
  else if (key === 'chain') viewer.setDisplay({ chain: val });
  else if (key === 'turntable') viewer.setDisplay({ turntable: val });
  else applyLook();
  syncViewButtons(); saveLocalSoon();
}
function syncViewButtons() {
  $$('.vp-bottom .tog[data-t]').forEach((b) => b.classList.toggle('on', !!state.view[b.dataset.t]));
  $$('#stageBtns button').forEach((b) => b.classList.toggle('on', b.dataset.s === state.view.stage));
}
function setupViewport() {
  $$('#viewBtns button').forEach((b) => b.addEventListener('click', () => viewer.setView(b.dataset.v)));
  $$('#stageBtns button').forEach((b) => b.addEventListener('click', () => setView('stage', b.dataset.s)));
  $$('.vp-bottom .tog[data-t]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.t, !state.view[b.dataset.t])));
  $('#btnSnap').addEventListener('click', () => {
    viewer.snapshot(2).toBlob((bl) => saveFiles([[bl, `${slug()}-render.png`]], slug())
      .then((how) => toast(how === 'declined' ? 'Save cancelled' : 'Studio render saved'), (e) => toast(e.message, 4000)), 'image/png');
  });
  const q = $('#quality'); q.value = state.quality;
  q.addEventListener('change', () => { state.quality = q.value; saveLocalSoon(); scheduleRegen(); });
}

// ── Report ──────────────────────────────────────────────────
function checks() {
  const p = state.p, M = state.M, out = [];
  const add = (lvl, msg, fix) => out.push({ lvl, msg, fix });
  const W = M.bbox.max[0] - M.bbox.min[0], H = M.bbox.max[1] - M.bbox.min[1];
  if (Math.max(W, H) > 250) add('err', `<b>Too large</b> — ${Math.max(W, H).toFixed(0)} mm exceeds a 256 mm bed.`);
  add('ok', '<b>No supports needed</b> — face-up heightfield, flat back.');
  const F = state.F;
  if (p.backing) {
    const k = Math.max(2, Math.ceil((p.backThick - p.firstLayer) / p.layerH - 1e-6) + 2), z = p.firstLayer + (k - 2) * p.layerH;
    const off = Math.abs(z - p.backThick) > 0.01;
    add(off ? 'warn' : 'ok', `<b>Background layer</b> — ${p.backThick.toFixed(2)} mm plate, ${p.backOffset.toFixed(1)} mm beyond the outline. For two colours, swap filament at <b>layer ${k}</b> (Z ${z.toFixed(2)} mm)${off ? ' — the plate isn’t a whole number of layers; ' + z.toFixed(2) + ' mm would be exact' : ''}.`,
      off ? ['Snap to layers', () => setParam('backThick', +z.toFixed(2))] : null);
  }
  if (F?.imgKind?.kind === 'graphic') add('ok', `<b>Graphic detected</b> — ${F.imgKind.levels} flat levels with crisp vertical walls. Switch Image type to Photo for a sculpted look.`);
  add('ok', `<b>Watertight${F?.islands > 1 ? '' : ', single-piece'} mesh</b> — ${state.M.triCount.toLocaleString()} triangles; flat areas collapsed to the minimum.`);
  if (F?.islands > 1) add('err', `<b>${F.islands} separate pieces</b> — they would print loose.`,
    p.shape !== 'silhouette' ? null
      : p.silStyle === 'outline' && p.silInner ? ['Outer only', () => setParam('silInner', false)]
        : ['Join them', () => setParam('silMargin', +(p.silMargin + 1.5).toFixed(1))]);
  if (p.shape === 'silhouette' && F?.trace && F.trace.maskCoverage > 0.97)
    add('err', '<b>Outline is just the image rectangle</b> — the background hasn’t been removed.', ['Remove background', () => setParam('bgMode', 'auto')]);
  if (p.shape === 'silhouette' && p.silStyle === 'outline' && p.silLineW < 1.2) add('warn', `<b>Outline ${p.silLineW} mm wide</b> — under 3 nozzle widths; fragile.`, ['Set 1.8 mm', () => setParam('silLineW', 1.8)]);
  if (p.mode === 'lithophane') {
    if (p.base < 0.6) add('warn', `<b>Thinnest point ${p.base} mm</b> — light areas may print with gaps.`, ['Set 0.8 mm', () => setParam('base', 0.8)]);
  } else if (p.base < 1.0) add('warn', `<b>Base ${p.base} mm</b> is fragile for a pendant.`, ['Set 1.4 mm', () => setParam('base', 1.4)]);
  const rl = p.depth / p.layerH;
  if (rl < 6 && p.imageOn !== false && state.img) add('warn', `<b>Relief is only ${rl.toFixed(0)} layers</b> tall at ${p.layerH} mm — detail will look stepped.`, [`Deepen`, () => setParam('depth', +(p.layerH * 10).toFixed(2))]);
  if (p.bail === 'tab') {
    const wall = (p.tabD - p.holeD) / 2;
    if (wall < 1.6) add('warn', `<b>Loop wall ${wall.toFixed(1)} mm</b> — may snap. Aim for ≥ 2 mm.`, ['Widen loop', () => setParam('tabD', +(p.holeD + 4).toFixed(1))]);
    if (p.tabThick < 2) add('warn', `<b>Loop only ${p.tabThick} mm thick</b> — weak across layer lines.`, ['Set 2.6 mm', () => setParam('tabThick', 2.6)]);
  }
  if ((p.bail === 'punched' || p.bail === 'cord') && p.holeInset - p.holeD / 2 < 1.6) add('warn', `<b>${(p.holeInset - p.holeD / 2).toFixed(1)} mm above the hole</b> — likely to tear.`, ['Move inward', () => setParam('holeInset', +(p.holeD / 2 + 2.2).toFixed(1))]);
  if ((p.bail === 'tab' || p.bail === 'punched') && p.holeD < 2.4) add('warn', `<b>Hole ${p.holeD} mm</b> — tight for jump rings; holes print ~0.2 mm small.`, ['Set 3.2 mm', () => setParam('holeD', 3.2)]);
  if (p.textTop || p.textBottom || p.textCenter) {
    const clip = state.F?.textClip || 0;
    if (clip > 0.02) add('err', `<b>${Math.round(clip * 100)}% of the lettering</b> runs off the outline and won't print.`, ['Shrink & tuck in', () => { state.p.textInset = +(state.p.textInset + 1).toFixed(2); rows.textInset.sync(); setParam('textSize', +Math.max(2, state.p.textSize * 0.82).toFixed(1)); }]);
    if (p.textSize < 3 && (p.textTop || p.textBottom)) add('warn', `<b>Arc text ${p.textSize} mm</b> — below ~3 mm letters blur with a 0.4 mm nozzle.`, ['Set 3.6 mm', () => setParam('textSize', 3.6)]);
    if (p.textHeight / p.layerH < 3) add('warn', `<b>Text only ${(p.textHeight / p.layerH).toFixed(1)} layers</b> — hard to read.`, ['4 layers', () => setParam('textHeight', +(p.layerH * 4).toFixed(2))]);
  }
  if (p.rimStyle !== 'none' && p.rimWidth < 1.2) add('warn', `<b>Rim ${p.rimWidth} mm</b> — narrower than 3 extrusion lines.`, ['Set 1.6 mm', () => setParam('rimWidth', 1.6)]);
  if (p.backText && p.backDepth > p.base - 0.6) add('warn', `<b>Back engraving ${p.backDepth} mm</b> nearly cuts through the ${p.base} mm base.`, ['Reduce', () => setParam('backDepth', Math.max(0.2, +(p.base - 0.8).toFixed(2)))]);
  if (p.pocket && p.pocketDepth > p.base - 0.6) add('err', `<b>Pocket ${p.pocketDepth} mm</b> leaves under 0.6 mm of base.`, ['Thicken base', () => setParam('base', +(p.pocketDepth + 1).toFixed(2))]);
  if (p.shape === 'silhouette' && p.bgMode === 'none') add('warn', '<b>Image outline</b> needs background removal to find the subject.', ['Auto remove', () => setParam('bgMode', 'auto')]);
  if (p.colorMode === 'bands' && p.posterize >= 2) {
    const step = p.depth / (p.posterize - 1), r = step / p.layerH;
    if (Math.abs(r - Math.round(r)) > 0.05) add('warn', `<b>Terrace step ${step.toFixed(2)} mm</b> isn't a whole number of ${p.layerH} mm layers — colours will bleed.`, ['Align', () => setParam('depth', +(Math.max(1, Math.round(r)) * p.layerH * (p.posterize - 1)).toFixed(2))]);
    const bl = (p.base - p.firstLayer) / p.layerH;
    if (Math.abs(bl - Math.round(bl)) > 0.05) add('warn', `<b>Base ${p.base} mm</b> doesn't end on a layer boundary.`, ['Align', () => setParam('base', +(p.firstLayer + Math.round(bl) * p.layerH).toFixed(2))]);
  }
  if (p.heightSource !== 'brightness' && !state.img) add('warn', '<b>AI depth</b> needs an image.');
  if (p.bail === 'tube') {
    if (p.tubeHoleD < 2.4) add('warn', `<b>Chain channel ${p.tubeHoleD} mm</b> — most chains need ≥ 2.5 mm (holes print ~0.2 mm small).`, ['Set 3 mm', () => setParam('tubeHoleD', 3)]);
    if (p.tubeWall < 1.1) add('warn', `<b>Tube wall ${p.tubeWall} mm</b> — under 3 perimeters; may crack.`, ['Set 1.3 mm', () => setParam('tubeWall', 1.3)]);
    else add('ok', '<b>Tube bail</b> — teardrop channel roof prints without supports.');
  }
  if (p.cbOn) {
    const needsHole = p.cbJoin === 'ring' || p.cbJoin === 'loop' || p.cbJoin === 'peg';
    if (needsHole && !(p.bail === 'tab' || p.bail === 'punched' || p.bail === 'cord')) add('warn', `<b>Connector joins with a ${p.cbJoin === 'peg' ? 'peg' : 'jump ring'}</b> but the pendant has no loop or hole.`, ['Add a loop', () => setParam('bail', 'tab')]);
    if (p.cbJoin === 'peg' && (p.bail === 'tab' || p.bail === 'punched') && p.cbPegD > p.holeD - 0.15) add('warn', `<b>Peg ${p.cbPegD} mm</b> won't fit the ${p.holeD} mm pendant hole.`, ['Fit peg', () => setParam('cbPegD', +(p.holeD - 0.3).toFixed(2))]);
    if (p.cbChainD < 2.4) add('warn', `<b>Connector chain hole ${p.cbChainD} mm</b> — tight for most chains.`, ['Set 3 mm', () => setParam('cbChainD', 3)]);
    if (p.cbWall < 1.1) add('warn', `<b>Connector wall ${p.cbWall} mm</b> — thin for a load-bearing part.`, ['Set 1.3 mm', () => setParam('cbWall', 1.3)]);
    if (p.cbTemplate === 'custom' && !state.cbImg) add('warn', '<b>Connector</b> — upload an image for the custom design.', ['Upload', () => $('#cbFile').click()]);
    if (state.C) add('ok', '<b>Connector bail</b> — prints flat beside the pendant, no supports.');
  }
  return out.sort((a, b) => ({ err: 0, warn: 1, ok: 2 }[a.lvl] - { err: 0, warn: 1, ok: 2 }[b.lvl]));
}

function updateReport() {
  const p = state.p, M = state.M;
  const W = M.bbox.max[0] - M.bbox.min[0], H = M.bbox.max[1] - M.bbox.min[1], T = M.bbox.max[2] - M.bbox.min[2];
  const vol = M.volume + (state.C ? state.C.M.volume : 0); // includes the connector bail
  const cm3 = vol / 1000, grams = cm3 * p.density, metres = vol / (Math.PI * 0.875 * 0.875) / 1000;
  const layers = Math.ceil((T - p.firstLayer) / p.layerH) + 1;
  $('#stats').innerHTML = `
    <div class="stat wide"><div class="k">Footprint</div><div class="v">${W.toFixed(1)} × ${H.toFixed(1)} <small>mm</small></div></div>
    <div class="stat"><div class="k">Thickness</div><div class="v">${T.toFixed(2)} <small>mm</small></div></div>
    <div class="stat"><div class="k">Layers</div><div class="v">${layers} <small>@ ${p.layerH}</small></div></div>
    <div class="stat"><div class="k">Filament${state.C ? ' + bail' : ''}</div><div class="v">${grams.toFixed(1)} <small>g</small></div></div>
    <div class="stat"><div class="k">Length</div><div class="v">${metres.toFixed(2)} <small>m</small></div></div>
    <div class="stat"><div class="k">Triangles</div><div class="v">${fmtK(M.triCount + (state.C ? state.C.M.triCount : 0))}</div></div>`;
  const cs = checks(), ul = $('#checks');
  ul.innerHTML = cs.map((c, i) => `<li class="${c.lvl}"><span class="dot"></span><span>${c.msg}</span>${c.fix ? `<button class="fix" data-i="${i}">${c.fix[0]}</button>` : ''}</li>`).join('');
  $$('.fix', ul).forEach((b) => b.addEventListener('click', () => { cs[+b.dataset.i].fix[1](); toast('Fixed ✓'); }));

  const bands = p.colorMode === 'bands' ? bandHeights(p) : null;
  $('#swapSec').hidden = !bands;
  if (bands) {
    $('#swaps').innerHTML = bands.map((b, i) => `<li><span class="c" style="background:${p['band' + i]}"></span>${i === 0 ? 'Start with' : `Layer <b>${b.layer}</b> → `} colour ${i + 1}<span class="z">${i === 0 ? '' : 'Z ' + b.z.toFixed(2)}</span></li>`).join('');
  }
  const tips = ['Print face-up on a textured or smooth PEI plate — no supports or brim needed.', 'Use 3–4 walls so the bail and rim print as solid perimeters.'];
  if (p.mode === 'lithophane') tips.push('Lithophane: 100% infill, 0.12 mm layers, white or natural PLA.', 'Slow outer walls (≤ 40 mm/s) for smooth tonal gradients.');
  else tips.push('0.08–0.12 mm layers (or variable layer height) bring out relief detail.', p.material === 'silk' ? 'Silk PLA: print ~5 °C hotter and slower for maximum shine.' : 'Silk PLA hides layer lines and looks like cast metal.');
  if (p.rimStyle === 'flat' || p.rimStyle === 'stepped') tips.push('Enable ironing on top surfaces for a mirror-smooth rim.');
  if (bands) tips.push('Insert a colour change (M600 / pause) at each listed layer in your slicer.');
  if (p.backText) tips.push('Back engraving prints as bridges on layer 2–3 — keep bridge speed moderate.');
  if (p.bail === 'tube' || (p.cbOn && p.cbChannel === 'tube')) tips.push('Tube bails: print with 3+ walls; the 45° teardrop roof needs no supports.');
  if (p.cbOn && p.cbJoin === 'peg') tips.push('Snap peg: test-fit first — sand lightly if tight, add a drop of CA glue if loose.');
  if (p.cbOn && p.cbJoin === 'glue') tips.push('Glue pad: scuff both faces, then use CA or 2-part epoxy and clamp for a few minutes.');
  if (p.cbOn && (p.cbJoin === 'ring' || p.cbJoin === 'loop')) tips.push('Link the connector to the pendant with a 5–6 mm metal jump ring (0.8–1 mm wire).');
  if (p.pocket) tips.push(`Add a pause at Z ${p.pocketDepth.toFixed(2)} mm to drop the magnet in — or glue it later.`);
  $('#tips').innerHTML = tips.map((t) => `<li>${t}</li>`).join('');
}
const fmtK = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + 'M' : n > 1e3 ? (n / 1e3).toFixed(0) + 'k' : Math.round(n) + '');

function swapText() {
  const p = state.p, bands = bandHeights(p);
  return [`HotendHq colour-swap guide — ${slug()}`, `Layer height ${p.layerH} mm, first layer ${p.firstLayer} mm`, '',
    ...bands.map((b, i) => (i === 0 ? `Start: colour 1 (${p.band0})` : `Layer ${b.layer} (Z ${b.z.toFixed(2)} mm): change to colour ${i + 1} (${p['band' + i]})`))].join('\n');
}
$('#copySwaps').addEventListener('click', async () => { try { await navigator.clipboard.writeText(swapText()); toast('Swap list copied'); } catch { toast('Clipboard unavailable'); } });

// ── Modals ──────────────────────────────────────────────────
function openModal(html, onMount, { sm = false } = {}) {
  $('.hq-dialog').classList.toggle('sm', sm);
  $('#hqModalBody').innerHTML = html; $('#hqModal').hidden = false; hydrateIcons($('#hqModalBody'));
  { const m = $('#hqModal'), cs = getComputedStyle(m), r = m.getBoundingClientRect(); dbg('openModal', m.hidden, cs.display, cs.visibility, cs.opacity, cs.zIndex, Math.round(r.width) + 'x' + Math.round(r.height), m.parentElement?.tagName); }
  onMount?.($('#hqModalBody'));
}
function closeModal() { $('#hqModal').hidden = true; }
$('#hqModal').addEventListener('mousedown', (e) => { if (e.target.id === 'hqModal') closeModal(); });

// Lit relief thumbnail of a preset (quick low-res field build with its sample art).
const _sampleCache = {};
function sampleCanvas(key) { return (_sampleCache[key] ||= SAMPLES[key][1]()); }
function presetThumb(pr, cv) {
  const p = { ...DEFAULTS, ...pr.p, ...NO_HANGER }, [a, b] = shapeHalf(p);
  const src = pr.sample && p.imageOn !== false ? buildSource(sampleCanvas(pr.sample), null, p, 'thumb-' + pr.sample + p.bgMode) : null;
  const F = buildField(p, src, Math.max(0.12, (2 * Math.max(a, b) + 10) / 110));
  const { nx, ny, S, Z } = F, img = new ImageData(nx, ny), d = img.data;
  const bands = p.colorMode === 'bands' ? bandHeights(p).map((bh, i) => ({ z: bh.z, col: hexRGB(p['band' + i]) })) : null;
  const base = hexRGB(p.material === 'glow' ? '#dfffe9' : p.color), ex = 1.4 / (2 * F.c);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i; if (S[k] >= 0) continue;
    const gx = (Z[k + 1] - Z[k - 1]) * ex, gy = (Z[k + nx] - Z[k - nx]) * ex, sh = Math.max(0, (0.5 * gx - 0.6 * gy + 0.62) / Math.hypot(gx, gy, 1) / 0.99);
    let col = base; if (bands) { col = bands[0].col; for (const bb of bands) if (Z[k] > bb.z + 0.01) col = bb.col; }
    const lit = 0.3 + 0.85 * sh, spec = p.material === 'metal' || p.material === 'silk' ? Math.pow(sh, 18) * 90 : 0, o = ((ny - 1 - j) * nx + i) * 4;
    d[o] = Math.min(255, col[0] * lit + spec); d[o + 1] = Math.min(255, col[1] * lit + spec); d[o + 2] = Math.min(255, col[2] * lit + spec); d[o + 3] = 255;
  }
  const t = document.createElement('canvas'); t.width = nx; t.height = ny; t.getContext('2d').putImageData(img, 0, 0);
  const g = cv.getContext('2d'), s = Math.min(cv.width / nx, cv.height / ny) * 0.98;
  g.clearRect(0, 0, cv.width, cv.height); g.imageSmoothingQuality = 'high';
  g.drawImage(t, (cv.width - nx * s) / 2, (cv.height - ny * s) / 2, nx * s, ny * s);
}

const PRESET_CATS = [['all', 'All'], ['jewelry', 'Jewellery'], ['badges', 'Badges & tags'], ['signs', 'Signs & fun'], ['photo', 'Photo & light'], ['multi', 'Multi-colour']];
function openPresets() {
  openModal(`<div class="m-head"><div><h2>Preset gallery</h2><p>Start from a proven design — every setting stays editable.</p></div><button class="mini" data-close>${icon('x')}</button></div>
    <div class="m-body"><div class="pcats">${PRESET_CATS.map(([k, l], i) => `<button data-c="${k}" class="${i ? '' : 'on'}">${l}</button>`).join('')}</div>
    <div class="preset-grid">${PRESETS.map((pr) => `<button class="preset" data-id="${pr.id}" data-cat="${pr.cat || 'jewelry'}"><canvas width="112" height="112"></canvas><div><b>${pr.name}</b><span>${pr.desc}</span></div></button>`).join('')}</div></div>`, (root) => {
    const tiles = $$('.preset', root);
    tiles.forEach((b) => {
      const pr = PRESETS.find((x) => x.id === b.dataset.id);
      drawShapeIcon($('canvas', b), pr.p.shape || 'circle', pr.p.color || DEFAULTS.color, pr.p); // instant placeholder
      b.addEventListener('click', () => applyPreset(pr));
    });
    // then replace placeholders with rendered reliefs, one per frame so the dialog stays responsive
    let i = 0;
    const next = () => { if (i >= tiles.length || $('#hqModal').hidden) return; const b = tiles[i++]; try { presetThumb(PRESETS.find((x) => x.id === b.dataset.id), $('canvas', b)); } catch (e) { console.warn(e); } setTimeout(next, 0); };
    ensureFonts().then(() => setTimeout(next, 30));
    $$('.pcats button', root).forEach((c) => c.addEventListener('click', () => {
      $$('.pcats button', root).forEach((x) => x.classList.toggle('on', x === c));
      tiles.forEach((t) => { t.hidden = c.dataset.c !== 'all' && t.dataset.cat !== c.dataset.c && !(c.dataset.c === 'multi' && PRESETS.find((x) => x.id === t.dataset.id).p.colorMode === 'bands'); });
    }));
    $('[data-close]', root).addEventListener('click', closeModal);
  });
}
function applyPreset(pr) {
  const keep = { imgX: state.p.imgX, imgY: state.p.imgY, imgZoom: state.p.imgZoom, imgRotate: state.p.imgRotate, heightSource: state.p.heightSource };
  const loadSample = pr.sample && (pr.forceSample || !state.img);
  replaceParams({ ...DEFAULTS, ...(state.img && !loadSample ? keep : {}), ...pr.p, ...NO_HANGER });
  state.view.backlit = !!pr.view?.backlit;
  closeModal();
  if (loadSample) setImage(SAMPLES[pr.sample][1](), SAMPLES[pr.sample][0], false); // keep the preset's own image placement
  else { ensureSubject(); syncAll(); scheduleRegen(); pushHistory(); }
  viewer.setView('iso');
  toast(`${pr.name} applied`);
}
const FORMATS = [
  ['stl', 'STL', 'universal'], ['3mf', '3MF', 'compact, modern'], ['obj', 'OBJ', 'for editing'],
  ['3mfmc', '3MF multi-colour', 'AMS / MMU / toolchanger', true], ['stlzip', 'STL per colour', '.zip, any slicer', true],
];
function openExport() {
  const p = state.p, multi = p.colorMode === 'bands';
  if (!multi && FORMATS.find((f) => f[0] === p.exportFormat)?.[3]) p.exportFormat = 'stl';
  p.bandSlots = p.bandSlots?.length === 6 ? [...p.bandSlots] : [1, 2, 3, 4, 5, 6]; // own copy, never shared with DEFAULTS
  const fmtB = ([f, t, s, mc]) => `<button data-f="${f}" class="${p.exportFormat === f ? 'on' : ''}" ${mc && !multi ? 'disabled data-tip="Set Colouring to “Colour swap layers” (Filament & Colors) to split the model by colour."' : ''}><b>${t}</b><span>${s}</span></button>`;
  const bands = multi ? bandHeights(p) : [];
  openModal(`<div class="m-head"><div><h2>Export for printing</h2><p>Full-resolution, watertight mesh — ready for Bambu Studio, OrcaSlicer, PrusaSlicer or Cura.</p></div><button class="mini" data-close>${icon('x')}</button></div>
    <div class="m-body"><div class="ex-grid">
      <div class="ex-block"><h4>Format</h4><div class="fmt">${FORMATS.map(fmtB).join('')}</div>
        <div id="exSlots" ${multi ? '' : 'hidden'}>
          <h4 style="margin-top:16px">Filament slots</h4>
          <div class="slots">${bands.map((b, i) => `<div class="slot"><span class="c" style="background:${p['band' + i]}"></span><span>Colour ${i + 1}<small>${i === 0 ? 'base' : `from Z ${b.z.toFixed(2)}`}</small></span>
            <select class="sel" data-i="${i}">${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => `<option value="${s}" ${p.bandSlots[i] === s ? 'selected' : ''}>Slot ${s}</option>`).join('')}</select></div>`).join('')}</div>
        </div>
        <h4 style="margin-top:16px">File name</h4><input class="txt" id="exName" value="${slug()}">
      </div>
      <div class="ex-block"><h4>Mesh detail</h4>
        <div class="row-head"><label>Resolution</label><div class="num"><input type="number" id="exResN" step="0.01" min="0.04" max="0.3"><span class="unit">mm</span></div></div>
        <input type="range" id="exRes" min="0.04" max="0.3" step="0.01">
        <div class="row-head" style="margin-top:12px"><label>Surface accuracy <i class="help" data-tip="How far curved surfaces may deviate from the exact shape while removing triangles. Flat areas and straight edges are always exact. 0.01 mm is 40× finer than a 0.4 mm nozzle.">?</i></label></div>
        <div class="segs" id="exTol">${[[0, 'Exact'], [0.005, '0.005'], [0.01, '0.01 mm'], [0.02, '0.02'], [0.05, '0.05']].map(([v, l]) => `<button data-v="${v}" class="${p.meshTol === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="est" id="exEst"></div>
        <div class="est" id="exFmtNote"></div>
        ${p.cbOn ? '<label class="chk"><input type="checkbox" id="exBail" checked> Include the connector bail (placed beside the pendant)</label>' : ''}
        <label class="chk"><input type="checkbox" id="exPng" checked> Save a studio render (.png)</label>
        ${multi ? '<label class="chk"><input type="checkbox" id="exSwap"> Save single-nozzle colour-swap guide (.txt)</label>' : ''}
      </div></div>
      <div class="progress" id="exProg" hidden><div></div></div>
    </div>
    <div class="m-foot"><button class="tb-btn" data-close>Cancel</button><button class="tb-btn primary" id="exGo">${icon('download')}<span>Export</span></button></div>`, (root) => {
    const r = $('#exRes', root), n = $('#exResN', root);
    const NOTES = {
      stl: 'One solid body. Use the colour-swap layer list for single-nozzle colour changes.',
      '3mf': 'One solid body in the modern, compressed 3MF format.',
      obj: 'Plain mesh for Blender, ZBrush and other editors.',
      '3mfmc': 'One object made of stacked coloured parts. Bambu Studio & OrcaSlicer pick up the filament slots; other slicers show each part so you can assign extruders.',
      stlzip: 'One aligned STL per colour. Import all together and choose “load as a single object with multiple parts”.',
    };
    const upd = () => {
      r.value = p.exportRes; n.value = p.exportRes.toFixed(2);
      r.style.setProperty('--pct', ((p.exportRes - 0.04) / 0.26 * 100) + '%');
      // flat areas collapse to their outline, so detail scales well below the square of the resolution;
      // curved-surface decimation removes roughly another 60–80 % at 0.01 mm
      const tolF = p.meshTol >= 0.05 ? 0.12 : p.meshTol >= 0.02 ? 0.2 : p.meshTol >= 0.01 ? 0.32 : p.meshTol > 0 ? 0.45 : 1;
      const tris = (state.M?.triCount || 60000) * (state.previewRes / p.exportRes) ** 1.4 * tolF * (p.exportFormat === '3mfmc' || p.exportFormat === 'stlzip' ? 1.5 : 1);
      const bytes = { stl: 50, stlzip: 30, obj: 30 }[p.exportFormat] || 14;
      $('#exEst', root).innerHTML = `≈ ${fmtK(tris)} triangles · ~${(tris * bytes / 1e6).toFixed(1)} MB. ${p.exportRes <= 0.06 ? 'Maximum detail.' : p.exportRes <= 0.1 ? 'Recommended — finer than a 0.4 mm nozzle can resolve.' : 'Lighter file; fine detail softened.'}`;
      $('#exFmtNote', root).textContent = NOTES[p.exportFormat] || '';
    };
    r.addEventListener('input', () => { p.exportRes = +r.value; upd(); });
    n.addEventListener('change', () => { p.exportRes = clamp(+n.value || 0.08, 0.04, 0.3); upd(); });
    $$('.fmt button', root).forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      p.exportFormat = b.dataset.f; $$('.fmt button', root).forEach((x) => x.classList.toggle('on', x === b)); upd();
    }));
    $$('.slot select', root).forEach((s) => s.addEventListener('change', () => { p.bandSlots[+s.dataset.i] = +s.value; saveLocalSoon(); }));
    $$('#exTol button', root).forEach((b) => b.addEventListener('click', () => { p.meshTol = +b.dataset.v; $$('#exTol button', root).forEach((x) => x.classList.toggle('on', x === b)); upd(); saveLocalSoon(); }));
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
    $('#exGo', root).addEventListener('click', () => doExport(root));
    upd();
  });
}

// One crisp, watertight solid per colour: the model sliced exactly at each filament-change height, with true
// vertical walls and flat seams where colours meet. Tube bails join the top colour.
function colourParts(F) {
  const p = state.p, zs = bandHeights(p).map((b) => b.z), parts = [];
  for (let k = 0; k < zs.length; k++) {
    const lo = k ? zs[k] : -Infinity, hi = k + 1 < zs.length ? zs[k + 1] : Infinity;
    if (hi - lo < 1e-6) continue; // two changes snapped to the same layer
    const raw = buildMeshLabeled(F, { lo, hi });
    if (!raw.triCount) continue;
    parts.push({ mesh: optimizeMesh(raw, p.meshTol), color: p['band' + k], name: `Colour ${k + 1}`, slot: p.bandSlots?.[k] || k + 1, band: k });
  }
  if (F.tubes.length && parts.length) { const top = parts[parts.length - 1]; top.mesh = mergeMeshes([top.mesh, ...F.tubes.map(tubeMesh)]); }
  return parts;
}
// The connector bail as a single-colour printed object (filament slot follows its colour).
function connectorPart(C) {
  const p = state.p, color = connectorColour();
  let slot = 1;
  if (p.colorMode === 'bands') { const i = [...Array(p.bandCount).keys()].reverse().find((k) => p['band' + k] === color); slot = p.bandSlots?.[i ?? p.bandCount - 1] || (i ?? 0) + 1; }
  return { mesh: C.M, color, name: 'Connector bail', slot };
}

async function doExport(root) {
  const p = state.p, prog = $('#exProg', root), bar = $('div', prog), go = $('#exGo', root);
  const name = ($('#exName', root).value || 'pendant').replace(/[^\w\-. ]+/g, '_');
  const withBail = p.cbOn && ($('#exBail', root)?.checked ?? true);
  prog.hidden = false; go.disabled = true;
  const step = (pct) => new Promise((r) => { bar.style.width = pct + '%'; setTimeout(r, 30); });
  try {
    await step(10); await ensureFonts();
    const F = buildField(p, currentSource(), p.exportRes);
    const C = withBail ? buildConnector(p, state.cbImg, state.cbImgId, p.exportRes, { simplify: true, tol: p.meshTol }) : null;
    await step(40);
    const fmt = p.exportFormat, meta = { description: 'Pendant generated with HotendHq' };
    let blob, ext = fmt, tris = 0, extra = '';
    const files = [];
    if (fmt === '3mfmc' || fmt === 'stlzip') {
      const parts = colourParts(F);
      await step(75);
      tris = parts.reduce((s, pt) => s + pt.mesh.triCount, 0);
      extra = ` · ${parts.length} colour parts`;
      if (fmt === '3mfmc') {
        const objects = [{ name, parts }];
        if (C) objects.push({ name: `${name} bail`, parts: [connectorPart(C)] });
        blob = to3MFScene(objects, name, meta); ext = '3mf';
      } else { blob = await toSTLZip(parts, name, C ? [{ mesh: C.M, name: 'connector-bail' }] : []); ext = 'zip'; }
    } else {
      const M = buildPendant(p, currentSource(), p.exportRes, { simplify: true, tol: p.meshTol }).M;
      await step(75);
      tris = M.triCount;
      if (fmt === '3mf') {
        const objects = [{ name, parts: [{ mesh: M, color: p.color, name, slot: 1 }] }];
        if (C) objects.push({ name: `${name} bail`, parts: [{ mesh: C.M, color: connectorColour(), name: 'Connector bail', slot: 1 }] });
        blob = to3MFScene(objects, name, meta);
      } else {
        blob = fmt === 'obj' ? toOBJ(M, name) : toSTL(M, name);
        if (C) files.push([fmt === 'obj' ? toOBJ(C.M, `${name}-bail`) : toSTL(C.M, `${name}-bail`), `${name}-bail.${fmt}`]);
      }
    }
    if (C) { tris += C.M.triCount; extra += ' + connector bail'; }
    await step(95);
    files.unshift([blob, `${name}.${ext}`]);
    if ($('#exPng', root)?.checked) files.push([await new Promise((r) => viewer.snapshot(2).toBlob(r, 'image/png')), `${name}-render.png`]);
    if ($('#exSwap', root)?.checked) files.push([new Blob([swapText()], { type: 'text/plain' }), `${name}-colour-swaps.txt`]);
    await step(100);
    const how = await saveFiles(files, name);
    saveLocalSoon(); closeModal();
    if (how === 'declined') toast('Export cancelled — nothing was saved', 3500);
    else {
      const zipped = how === 'saved' && (files.length > 1 || !['zip', 'png', 'json', 'txt'].includes(ext));
      toast(`Exported ${name}.${ext}${zipped ? ` in ${name}.zip` : ''} · ${fmtK(tris)} triangles${extra}`, 3500);
    }
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, 5000); go.disabled = false; }
}
// ── Keyboard ────────────────────────────────────────────────
function setupKeys() {
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { if (typing && e.target.type !== 'range') return; e.preventDefault(); stepHistory(e.shiftKey ? 1 : -1); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); stepHistory(1); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); openExport(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#fileInput').click(); return; }
    if (e.key === 'Escape') { if (!$('#hqModal').hidden) closeModal(); else if (document.activeElement === $('#search')) { $('#search').value = ''; refreshVisibility(); $('#search').blur(); } return; }
    if (typing || mod) return;
    const k = e.key.toLowerCase();
    if (k === '/') { e.preventDefault(); $('#search').focus(); }
    else if ('12345'.includes(k) && k) viewer.setView(['front', 'iso', 'side', 'back', 'top'][+k - 1]);
    else if (k === 'f') viewer.setView('iso');
    else if (k === 'l') setView('layerLines', !state.view.layerLines);
    else if (k === 'b') setView('backlit', !state.view.backlit);
    else if (k === 'w') setView('wireframe', !state.view.wireframe);
    else if (k === 't') setView('turntable', !state.view.turntable);
  });
}

// ── Boot ────────────────────────────────────────────────────
hydrateIcons();
loadLocal(); // interface preferences only
state.view.chain = false; // every visit starts as a blank slate: plain shape, no image, text, rim, hanger or chain
const viewer = new Viewer($('#three'));
viewer.state.view = state.view.stage; viewer.state.chain = state.view.chain; viewer.controls.autoRotate = state.view.turntable;
buildControls();
setupDesignInteractions(); setupFiles(); setupViewport(); setupKeys();
$('#search').addEventListener('input', () => { $('#searchM').value = $('#search').value; refreshVisibility(); });
$('#searchM').addEventListener('input', () => { $('#search').value = $('#searchM').value; refreshVisibility(); });
function setAdv(on) {
  state.adv = on; $$('#modeSwitch button').forEach((x) => x.classList.toggle('on', (x.dataset.m === 'adv') === on)); refreshVisibility(); saveLocalSoon();
}
$$('#modeSwitch button').forEach((b) => b.addEventListener('click', () => setAdv(b.dataset.m === 'adv')));
$$('#modeSwitch button').forEach((x) => x.classList.toggle('on', (x.dataset.m === 'adv') === state.adv));
$('#btnUndo').addEventListener('click', () => stepHistory(-1));
$('#btnRedo').addEventListener('click', () => stepHistory(1));
function confirmResetAll() {
  openModal(`<div class="m-head"><div><h2>Reset all settings?</h2><p>Every setting goes back to its default. Your image stays loaded, and Undo (Ctrl+Z) brings your settings back.</p></div><button class="mini" data-close>${icon('x')}</button></div>
    <div class="m-foot"><button class="tb-btn" data-close>Cancel</button><button class="tb-btn primary" id="resetGo">${icon('reset')}<span>Reset everything</span></button></div>`, (root) => {
    $$('[data-close]', root).forEach((b) => b.addEventListener('click', closeModal));
    $('#resetGo', root).addEventListener('click', () => {
      closeModal(); replaceParams(structuredClone(DEFAULTS)); syncAll(); scheduleRegen(); pushHistory();
      toast('All settings reset to defaults (Ctrl+Z to undo)');
    });
  }, { sm: true });
}
$('#btnReset').addEventListener('click', confirmResetAll);
// Mobile: Design / Print report tabs and the overflow menu.
$$('#mtabs button').forEach((b) => b.addEventListener('click', () => {
  $('#app').dataset.mt = b.dataset.mt; $$('#mtabs button').forEach((x) => x.classList.toggle('on', x === b));
}));
$('#btnMore').addEventListener('click', () => {
  openModal(`<div class="m-head"><div><h2>Menu</h2></div><button class="mini" data-close>${icon('x')}</button></div>
    <div class="m-body sheet-actions">
      <button class="tb-btn" data-a="open">${icon('open')}<span>Open image or project</span></button>
      <button class="tb-btn" data-a="save">${icon('save')}<span>Save project</span></button>
      <button class="tb-btn" data-a="redo">${icon('redo')}<span>Redo</span></button>
      <button class="tb-btn" data-a="adv">${icon('sparkle')}<span>${state.adv ? 'Show simple settings only' : 'Show advanced settings'}</span></button>
      <button class="tb-btn" data-a="reset">${icon('reset')}<span>Reset all settings</span></button>
      <a class="tb-btn" href="/generators">${icon('back')}<span>All generators</span></a>
      <a class="tb-btn" href="/">${icon('home')}<span>Hotend HQ home</span></a>
      <a class="tb-btn coffee" href="https://buymeacoffee.com/hotendhq" target="_blank" rel="noopener noreferrer">${icon('coffee')}<span>Buy me a coffee</span></a>
    </div>`, (root) => {
    $('[data-close]', root).addEventListener('click', closeModal);
    $$('[data-a]', root).forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'reset') { confirmResetAll(); return; }
      closeModal();
      if (a === 'open') $('#btnOpen').click();
      else if (a === 'save') $('#btnSave').click();
      else if (a === 'redo') stepHistory(1);
      else if (a === 'adv') { setAdv(!state.adv); toast(state.adv ? 'Advanced settings shown' : 'Simple mode'); }
    }));
  }, { sm: true });
});
$('#btnPresets').addEventListener('click', openPresets);
$('#btnExport').addEventListener('click', openExport);
new ResizeObserver(() => draw2D()).observe($('#designWrap'));
syncAll();
pushHistory();
scheduleRegen(); // the plain shape, ready for an image
window.hotendhq = { state, viewer, setParam, handleFile }; // handy for debugging in the console
