/* ============================================================
   HOTEND HQ — SVG Tracer page
   UI only: image loading, settings, the compare/zoom view and
   downloads. The tracing itself runs in worker.js.
   ============================================================ */
import { zipSync, strToU8 } from '../../vendor/fflate/fflate.js?v=a3a0a0275d';

const $ = (id) => document.getElementById(id);
const stage = $('st-stage'), art = $('st-art'), origImg = $('st-orig'), out = $('st-out');
const statusEl = $('st-status'), readout = $('st-readout');

/* ---------------- settings ---------------- */
const MERGE = [26, 22, 19, 16, 14, 12, 10, 8.5, 7, 5.5, 4];             // colour detail 0..10 -> merge ΔE
const SPECK = ['auto', 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40];   // speck side in original-image px (area = side²)
const speckText = (v) => v ? `${SPECK[v]}×${SPECK[v]} px` : 'auto';
const DEFAULTS = { mode: 'color', auto: true, merge: 5, count: 8, thrAuto: true, thr: 50, invert: false, smooth: 5, corners: 5,
  speck: 0, nobg: false, nobgBw: true, layout: 'stacked', quality: 'high', denoise: 'auto',
  flat: false, flatLevel: 0, detail: 2, gradients: true, layerMode: 'colour' };
const FLAT = ['auto', 1, 2, 3];
const flatText = (v) => ['Auto', 'Light', 'Medium', 'Strong'][v];
const DETAIL_TEXT = { 1: 'Low (smallest file)', 2: 'Medium', 3: 'High', 4: 'Pixel-exact', 5: 'Identical' };
const S = { ...DEFAULTS, palette: null, hidden: new Set(), recolor: {}, objects: [], restHidden: false };

let img = null;           // { rgba, w, h, name, url }
let last = null;          // last trace result
let view = { z: 1, fitZ: 1, tx: 0, ty: 0, split: 0.5, mode: 'split' };

/* ---------------- worker ---------------- */
const worker = new Worker(new URL('./worker.js?v=4737870a4d', import.meta.url), { type: 'module' });
const STAGE = { colours: 'Finding the colours…', regions: 'Finding every edge…', shading: 'Fitting the shading…', curves: 'Fitting the curves…' };
let reqId = 0, busy = false, queued = false, timer = 0;
const waiting = new Map();     // id -> purpose
worker.onmessage = (e) => {
  const m = e.data;
  const purpose = waiting.get(m.id);
  if (m.type === 'progress') {
    if (purpose === 'view') {
      const exact = S.mode === 'detail' && S.detail >= 4;
      const slow = exact && img && img.w * img.h > 3e6 && matchMedia('(pointer:coarse)').matches ? ' Big image: on a phone this can take a few minutes.' : '';
      status((exact && m.pass ? `Matching every pixel, pass ${m.pass + 1}…` : STAGE[m.stage] || 'Working…') + slow);
    }
    return;
  }
  if (m.type === 'loaded') return;
  waiting.delete(m.id);
  busy = false;
  if (m.type === 'error') { stage.classList.remove('is-busy'); status('Something went wrong: ' + m.message, 'bad'); }
  else if (purpose === 'layers') saveLayers(m);
  else if (m.type === 'done') show(m);
  if (queued) { queued = false; run(); } else if (!waiting.size && !painting) stage.classList.remove('is-busy');
};
worker.onerror = () => { busy = false; stage.classList.remove('is-busy'); status('The tracer could not start in this browser.', 'bad'); };

function prepOpts() {
  const bw = S.mode === 'bw';
  if (S.mode === 'detail') return { mode: 'detail', quality: S.quality, detail: S.detail, gradients: S.gradients };
  return {
    flat: bw || !S.flat ? 0 : FLAT[S.flatLevel],
    mode: S.mode, quality: S.quality, denoise: S.denoise, detail: S.speck ? SPECK[S.speck] ** 2 : 'auto',
    colors: bw ? null : (S.auto ? 0 : S.count), merge: bw ? null : MERGE[Math.max(5, S.merge)], fewer: bw || !S.auto ? 0 : Math.max(0, 5 - S.merge), palette: bw ? null : S.palette,
    threshold: bw ? (S.thrAuto ? 'auto' : S.thr) : null, invert: bw ? S.invert : null,
  };
}
function vecOpts() {
  return { smooth: S.smooth, corners: S.corners, cutout: S.layout === 'cutout',
    removeBg: S.mode === 'bw' ? S.nobgBw : S.nobg, hidden: S.mode === 'bw' ? [] : [...S.hidden], recolor: S.mode === 'bw' ? {} : S.recolor,
    ...layerOpts() };
}
function schedule(delay = 120) { clearTimeout(timer); timer = setTimeout(run, delay); }
function run() {
  if (!img) return;
  if (busy) { queued = true; return; }
  busy = true;
  stage.classList.add('is-busy');
  const id = ++reqId; waiting.set(id, 'view');
  worker.postMessage({ type: 'trace', id, prep: prepOpts(), vec: vecOpts() });
}

/* ---------------- image in ---------------- */
const MAX_SIDE = 4096, MAX_PX = 16e6;
async function decode(blob) {
  let src;
  try { src = await createImageBitmap(blob); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = URL.createObjectURL(blob); });
  }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0), Math.sqrt(MAX_PX / (w0 * h0)));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  return { rgba: g.getImageData(0, 0, w, h).data, w, h, scaled: k < 1, w0, h0, canvas: c };
}
async function loadBlob(blob, name) {
  if (!blob || !/^image\//.test(blob.type || 'image/')) { status('That file is not an image.', 'bad'); return; }
  status('Opening the image…');
  let d;
  try { d = await decode(blob); } catch { status('This image could not be opened. Try a PNG or JPG.', 'bad'); return; }
  setImage(d, name || 'image', URL.createObjectURL(blob));
}
function setImage(d, name, url) {
  if (img && img.url && img.url.startsWith('blob:')) URL.revokeObjectURL(img.url);
  img = { rgba: d.rgba, w: d.w, h: d.h, name: name.replace(/\.[a-z0-9]+$/i, '') || 'image', url };
  origImg.src = url;
  $('st-drop-main').textContent = name;
  $('st-drop-sub').textContent = `${d.w} × ${d.h} px${d.scaled ? ` (reduced from ${d.w0} × ${d.h0})` : ''} · choose another`;
  stage.classList.remove('is-empty');
  last = null; showSvg();
  S.palette = null; S.hidden.clear(); S.recolor = {};
  S.objects = []; S.restHidden = false; objSel = -1; objCount = 0; samFor = null; renderLayers();
  layoutPhone();
  setButtons(false);
  fit();
  const copy = new Uint8ClampedArray(d.rgba);
  worker.postMessage({ type: 'load', id: ++reqId, rgba: copy.buffer, w: d.w, h: d.h }, [copy.buffer]);
  run();
}

$('st-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadBlob(f, f.name); e.target.value = ''; });
for (const el of [$('st-drop'), stage]) {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault(); el.classList.remove('is-over');
    const f = [...(e.dataTransfer.files || [])].find(f => /^image\//.test(f.type));
    if (f) loadBlob(f, f.name); else status('Drop an image file (PNG, JPG or WebP).', 'bad');
  });
}
window.addEventListener('paste', (e) => {
  const it = [...(e.clipboardData?.items || [])].find(i => /^image\//.test(i.type));
  if (it) { e.preventDefault(); loadBlob(it.getAsFile(), 'pasted image'); }
});

/* sample: an emblem drawn from SVG, so there is no binary file to ship */
const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="900" height="900">
<rect width="600" height="600" fill="#f4efe4"/><circle cx="300" cy="300" r="270" fill="#1d2a44"/>
<circle cx="300" cy="300" r="250" fill="none" stroke="#d9a441" stroke-width="10"/>
<circle cx="300" cy="300" r="232" fill="none" stroke="#d9a441" stroke-width="3" stroke-dasharray="8 6"/>
<path d="M300 110 L345 215 L460 225 L372 300 L400 412 L300 352 L200 412 L228 300 L140 225 L255 215 Z" fill="#c8402f" stroke="#f4efe4" stroke-width="6" stroke-linejoin="round"/>
<path d="M150 430 Q300 520 450 430 L470 470 Q300 570 130 470 Z" fill="#d9a441"/>
<text x="300" y="492" font-family="Georgia,serif" font-size="34" font-weight="bold" text-anchor="middle" fill="#1d2a44">HOTEND HQ</text>
<g fill="#4fa37a"><ellipse cx="170" cy="300" rx="40" ry="14" transform="rotate(-50 170 300)"/><ellipse cx="430" cy="300" rx="40" ry="14" transform="rotate(50 430 300)"/>
<ellipse cx="185" cy="355" rx="34" ry="11" transform="rotate(-25 185 355)"/><ellipse cx="415" cy="355" rx="34" ry="11" transform="rotate(25 415 355)"/></g>
<circle cx="300" cy="285" r="34" fill="#f4efe4"/><circle cx="300" cy="285" r="20" fill="#1d2a44"/>
<text x="300" y="175" font-family="Arial,sans-serif" font-size="18" text-anchor="middle" fill="#f4efe4">EST. 2026</text></svg>`;
async function loadLogoSample() {
  const blob = new Blob([SAMPLE], { type: 'image/svg+xml' });
  const i = new Image(); i.src = URL.createObjectURL(blob);
  await i.decode();
  const c = document.createElement('canvas'); c.width = 900; c.height = 900;
  c.getContext('2d').drawImage(i, 0, 0, 900, 900);
  URL.revokeObjectURL(i.src);
  if (S.mode === 'detail') { S.mode = 'color'; syncUI(); }
  c.toBlob((b) => loadBlob(b, 'sample-emblem.png'), 'image/png');
}
$('st-sample').addEventListener('click', loadLogoSample);

/* detailed sample: Dead Radio, traced in Detailed mode */
async function loadPhotoSample() {
  status('Opening the sample…');
  try {
    const r = await fetch('/assets/img/svg-tracer/dead-radio.jpg');
    if (!r.ok) throw new Error();
    if (S.mode !== 'detail') { S.mode = 'detail'; syncUI(); }
    loadBlob(await r.blob(), 'dead-radio.jpg');
  } catch { status('The sample could not be loaded.', 'bad'); }
}
$('st-sample-photo').addEventListener('click', loadPhotoSample);
document.querySelectorAll('#st-empty [data-sample]').forEach(b => b.addEventListener('click', () => (b.dataset.sample === 'logo' ? loadLogoSample : loadPhotoSample)()));
$('st-show-try').addEventListener('click', () => { $('st-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); loadPhotoSample(); });

/* ---------------- result ---------------- */
function show(m) {
  last = m; painting = false;
  showSvg();
  renderPalette(m);
  if (S.mode === 'bw' && m.threshold != null) {
    if (S.thrAuto) $('st-thr').value = Math.round(m.threshold);
    $('st-thr-out').textContent = S.thrAuto ? `auto (${Math.round(m.threshold)})` : S.thr;
  }
  const kb = m.bytes / 1024, size = kb < 1000 ? kb.toFixed(kb < 10 ? 1 : 0) + ' KB' : (kb / 1024).toFixed(1) + ' MB';
  if (m.objMap) m.objMap = new Uint8Array(m.objMap);
  drawOverlay();
  const nLay = m.objLayers ? ` · ${m.objLayers.length} layer${m.objLayers.length === 1 ? '' : 's'}` : '';
  if (S.mode === 'detail') readout.textContent = `${m.paths.toLocaleString()} shapes · ${m.gradients.toLocaleString()} gradients${nLay} · ${size}`;
  else {
    const nCol = S.mode === 'bw' ? 1 : m.palette.length - S.hidden.size - (S.nobg && m.bg >= 0 && !S.hidden.has(m.bg) ? 1 : 0);
    readout.textContent = `${nCol} colour${nCol === 1 ? '' : 's'}${nLay} · ${m.paths} shapes · ${size}`;
  }
  setButtons(true);
  applyView();
  if (m.bytes > 2e6 && !m.preview) { status('Drawing the SVG…'); painting = true; stage.classList.add('is-busy'); }
  const done = () => { if (last !== m) return; painting = false; status(`Traced in ${(m.ms / 1000).toFixed(1)} s: ${readout.textContent}.`, 'ok'); if (!busy) stage.classList.remove('is-busy'); };
  drawing.then(done);
}
/* The SVG is shown as an image, not as page markup: the browser then draws it once and reuses the picture while
   you pan and zoom, instead of laying out every path (a detailed trace has up to a million) on each move.
   Outlines needs real markup to restyle the paths, so only that view puts it in the page. */
let outUrl = '', outMode = '';
// a big Detailed result is first shown as the worker's painted preview (it looks the same at normal size);
// the real SVG is drawn once you zoom in far enough to see curves. Pixel-exact results sit on the pixel grid,
// so their preview is what the SVG shows at any zoom.
const wantSvg = () => !last.preview || (!last.exact && view.z > view.fitZ * 2);
function showSvg() {
  if (last && last.preview && wantSvg()) last.full = true;
  const mode = !last ? '' : view.mode === 'lines' ? 'lines' : last.preview && !last.full ? 'preview' : 'img';
  if (mode === outMode && out.dataset.trace === String(last && last.id)) return;
  if (outUrl) { URL.revokeObjectURL(outUrl); outUrl = ''; }
  outMode = mode; out.dataset.trace = String(last && last.id);
  if (!mode) { out.textContent = ''; drawing = Promise.resolve(); return; }
  if (mode === 'lines') { out.innerHTML = last.svg; drawing = Promise.resolve(); return; }
  if (mode === 'preview') {
    const c = document.createElement('canvas'), p = last.preview;
    c.width = p.w; c.height = p.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
    out.replaceChildren(c); drawing = Promise.resolve(); return;
  }
  if (last.preview) { status('Drawing the full SVG…'); painting = true; stage.classList.add('is-busy'); }
  const url = outUrl = URL.createObjectURL(new Blob([last.svg], { type: 'image/svg+xml' }));
  const im = new Image(); im.alt = ''; im.draggable = false; im.src = url;
  // the old picture stays up until the new one is drawn, so there is never a blank frame
  const m = last;
  const put = () => {
    if (outUrl === url) out.replaceChildren(im);
    if (m.preview && last === m) { painting = false; if (!busy) stage.classList.remove('is-busy'); status(`Traced in ${(m.ms / 1000).toFixed(1)} s: ${readout.textContent}.`, 'ok'); }
  };
  drawing = im.decode().then(put, put);
}
let drawing = Promise.resolve(), painting = false;
function setButtons(on) {
  for (const id of ['st-dl', 'st-zip', 'st-copy']) $(id).disabled = !on;
  if (S.mode === 'detail' && !(last && last.objLayers)) $('st-zip').disabled = true;
}
function status(t, kind) { statusEl.textContent = t; if (kind) statusEl.dataset.kind = kind; else delete statusEl.dataset.kind; }

/* ---------------- palette ---------------- */
const ICON = {
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
function renderPalette(m) {
  const box = $('st-pal');
  if (S.mode !== 'color') return;
  box.innerHTML = '';
  m.palette.forEach((p, i) => {
    const hex = S.recolor[i] || p.hex;
    const off = S.hidden.has(i) || (S.nobg && i === m.bg);
    const el = document.createElement('div');
    el.className = 'st-sw' + (off ? ' is-off' : '');
    el.innerHTML = `<label class="st-chip" style="background:${hex}" title="Change this colour (${hex})"><input type="color" value="${hex}" aria-label="Change colour ${hex}"></label>
      <span class="st-sw-pct" title="${hex}: ${pct(p.weight)} of the image">${hex.slice(1).toUpperCase()}<br>${i === m.bg ? '<span class="st-sw-bg">bg · </span>' : ''}${pct(p.weight)}</span>
      <button type="button" class="st-sw-btn" data-act="hide" aria-label="${off ? 'Show' : 'Hide'} this colour" title="${off ? 'Show' : 'Hide'} this colour">${off ? ICON.eyeOff : ICON.eye}</button>
      <button type="button" class="st-sw-btn" data-act="del" aria-label="Remove this colour" title="Remove: its areas go to the colours around them">${ICON.x}</button>`;
    const inp = el.querySelector('input');
    inp.addEventListener('input', () => { el.querySelector('.st-chip').style.background = inp.value; });
    inp.addEventListener('change', () => { S.recolor[i] = inp.value; schedule(0); });
    el.querySelector('[data-act=hide]').addEventListener('click', () => {
      if (S.nobg && i === m.bg) { S.nobg = false; $('st-nobg').checked = false; }
      else if (S.hidden.has(i)) S.hidden.delete(i); else S.hidden.add(i);
      schedule(0);
    });
    el.querySelector('[data-act=del]').addEventListener('click', () => removeColour(i));
    box.appendChild(el);
  });
  $('st-pal-reset').classList.toggle('hidden', !S.palette && !Object.keys(S.recolor).length && !S.hidden.size);
}
const pct = (w) => w >= 0.1 ? Math.round(w * 100) + '%' : w >= 0.001 ? (w * 100).toFixed(1) + '%' : '<0.1%';

function removeColour(i) {
  if (!last || last.palette.length <= 2) { status('A trace needs at least two colours.', 'bad'); return; }
  const hexes = last.palette.map(p => p.hex);
  S.palette = hexes.filter((_, k) => k !== i);
  const remap = (k) => (k > i ? k - 1 : k);
  S.hidden = new Set([...S.hidden].filter(k => k !== i).map(remap));
  const rc = {}; for (const [k, v] of Object.entries(S.recolor)) if (+k !== i) rc[remap(+k)] = v;
  S.recolor = rc;
  schedule(0);
}
function addColour(hex) {
  if (!last) return;
  const hexes = S.palette || last.palette.map(p => p.hex);
  if (hexes.includes(hex)) { status('That colour is already in the palette.'); return; }
  S.palette = [...hexes, hex];
  status(`Added ${hex}. Tracing again…`);
  schedule(0);
}
function resetColours() { S.palette = null; S.hidden.clear(); S.recolor = {}; schedule(0); }
$('st-pal-reset').addEventListener('click', resetColours);

/* ---------------- controls ---------------- */
const bindRange = (id, key, fmt = (v) => v, after) => {
  const el = $(id), o = $(id + '-out');
  el.addEventListener('input', () => { S[key] = +el.value; o.textContent = fmt(S[key]); after && after(); schedule(); });
};
bindRange('st-merge', 'merge', (v) => v === 5 ? 'Normal' : v < 5 ? `Fewer (${v})` : `More (${v})`, () => { S.palette = null; S.hidden.clear(); S.recolor = {}; });
bindRange('st-count', 'count', (v) => v, () => { S.palette = null; S.hidden.clear(); S.recolor = {}; });
bindRange('st-smooth', 'smooth');
bindRange('st-corners', 'corners');
bindRange('st-speck', 'speck', speckText);
bindRange('st-flat-level', 'flatLevel', flatText, () => { S.palette = null; S.hidden.clear(); S.recolor = {}; });
bindRange('st-detail', 'detail', (v) => DETAIL_TEXT[v], () => syncUI());
bindRange('st-thr', 'thr', (v) => v, () => { S.thrAuto = false; $('st-thr-auto').checked = false; });
const bindTog = (id, key, after) => $(id).addEventListener('change', (e) => { S[key] = e.target.checked; after && after(); schedule(0); });
bindTog('st-auto', 'auto', () => { S.palette = null; S.hidden.clear(); S.recolor = {}; syncUI(); });
bindTog('st-thr-auto', 'thrAuto', () => syncUI());
bindTog('st-invert', 'invert');
bindTog('st-flat', 'flat', () => { S.palette = null; S.hidden.clear(); S.recolor = {}; syncUI(); });
bindTog('st-grad', 'gradients');
$('st-nobg').addEventListener('change', (e) => { if (S.mode === 'bw') S.nobgBw = e.target.checked; else S.nobg = e.target.checked; schedule(0); });
for (const [id, key] of [['st-layout', 'layout'], ['st-quality', 'quality'], ['st-denoise', 'denoise']])
  $(id).addEventListener('change', (e) => { S[key] = e.target.value; schedule(0); });
document.querySelectorAll('.st-tabs button').forEach(b => b.addEventListener('click', () => {
  if (S.mode === b.dataset.mode) return;
  S.mode = b.dataset.mode; syncUI(); schedule(0);
}));
$('st-reset').addEventListener('click', () => { Object.assign(S, DEFAULTS, { palette: null, hidden: new Set(), recolor: {}, objects: [], restHidden: false }); objSel = -1; setObjPick(false); renderLayers(); syncUI(); schedule(0); });

function syncUI() {
  document.querySelectorAll('.st-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  document.querySelectorAll('[data-for]').forEach(d => d.classList.toggle('hidden', !d.dataset.for.split(' ').includes(S.mode)));
  $('st-flat').checked = S.flat;
  $('st-flat-row').classList.toggle('hidden', !S.flat);
  $('st-flat-level').value = S.flatLevel; $('st-flat-level-out').textContent = flatText(S.flatLevel);
  $('st-detail').value = S.detail; $('st-detail-out').textContent = DETAIL_TEXT[S.detail];
  $('st-grad').checked = S.gradients;
  $('st-grad-row').classList.toggle('hidden', S.detail >= 4);
  // Pixel-exact levels keep the pixel outline itself, so smoothness and corners don't apply
  $('st-shapes').classList.toggle('hidden', S.mode === 'detail' && S.detail >= 4);
  $('st-detail-hint').textContent = S.detail >= 4
    ? 'Drawn on the image\'s own pixel grid and refined until it matches the original pixel for pixel at 100 %. Big files, and big images can take a minute.'
    : 'High keeps the finest texture but makes a much bigger file.';
  if (last) setButtons(true);
  $('st-auto').checked = S.auto;
  $('st-merge-row').classList.toggle('hidden', !S.auto);
  $('st-count-row').classList.toggle('hidden', S.auto);
  $('st-merge').value = S.merge; $('st-merge-out').textContent = S.merge === 5 ? 'Normal' : S.merge < 5 ? `Fewer (${S.merge})` : `More (${S.merge})`;
  $('st-count').value = S.count; $('st-count-out').textContent = S.count;
  $('st-smooth').value = S.smooth; $('st-smooth-out').textContent = S.smooth;
  $('st-corners').value = S.corners; $('st-corners-out').textContent = S.corners;
  $('st-speck').value = S.speck; $('st-speck-out').textContent = speckText(S.speck);
  $('st-thr-auto').checked = S.thrAuto; $('st-invert').checked = S.invert;
  if (!S.thrAuto) { $('st-thr').value = S.thr; $('st-thr-out').textContent = S.thr; }
  $('st-nobg').checked = S.mode === 'bw' ? S.nobgBw : S.nobg;
  $('st-nobg-hint').textContent = S.mode === 'bw' ? 'Leaves the white out, so only the black shapes are in the SVG.' : 'Leaves the background colour out, so the SVG is transparent there.';
  $('st-layout').value = S.layout; $('st-quality').value = S.quality; $('st-denoise').value = S.denoise;
  if (S.mode !== 'color') $('st-pick').setAttribute('aria-pressed', 'false');
  document.querySelectorAll('[data-layers]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layers === S.layerMode)));
  $('st-obj').classList.toggle('hidden', S.layerMode !== 'object');
  $('st-lay-hint').textContent = S.layerMode === 'object'
    ? 'Tap anything in the image and it becomes its own layer. Tap inside a layer again to lift out a smaller part, like one letter of a sign.'
    : S.mode === 'color' ? 'Every colour is its own layer. Hide or remove colours in the list above.'
    : S.mode === 'bw' ? 'One colour, one layer. Switch to By object to split it up.' : 'Switch to By object to split the trace into layers.';
  if (S.layerMode !== 'object') setObjPick(false);
  syncTabs();
}

/* ---------------- pick a missing colour ---------------- */
let picking = false;
$('st-pick').addEventListener('click', () => {
  if (!img) { status('Open an image first.'); return; }
  picking = !picking;
  $('st-pick').setAttribute('aria-pressed', String(picking));
  stage.classList.toggle('is-picking', picking);
  if (picking) { setView('orig'); status('Click the colour you want to add on the image.'); }
});
function pickAt(cx, cy) {
  const r = stage.getBoundingClientRect();
  const x = Math.floor((cx - r.left - view.tx) / view.z), y = Math.floor((cy - r.top - view.ty) / view.z);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  // the most common colour in a small square: a click near an edge still gets the real colour
  const counts = new Map();
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const xx = Math.min(img.w - 1, Math.max(0, x + dx)), yy = Math.min(img.h - 1, Math.max(0, y + dy)), i = (yy * img.w + xx) * 4;
    const k = ((img.rgba[i] >> 3) << 10) | ((img.rgba[i + 1] >> 3) << 5) | (img.rgba[i + 2] >> 3);
    const e = counts.get(k) || [0, 0, 0, 0]; e[0] += img.rgba[i]; e[1] += img.rgba[i + 1]; e[2] += img.rgba[i + 2]; e[3]++; counts.set(k, e);
  }
  const best = [...counts.values()].sort((a, b) => b[3] - a[3])[0];
  const hex = '#' + [0, 1, 2].map(c => Math.round(best[c] / best[3]).toString(16).padStart(2, '0')).join('');
  picking = false; $('st-pick').setAttribute('aria-pressed', 'false'); stage.classList.remove('is-picking');
  setView('split');
  addColour(hex);
}

/* ---------------- view: zoom, pan, compare ---------------- */
function fit() {
  if (!img) return;
  const r = stage.getBoundingClientRect();
  const z = Math.min((r.width - 24) / img.w, (r.height - 56) / img.h);
  view.z = view.fitZ = Math.max(0.02, z);
  view.tx = (r.width - img.w * view.z) / 2; view.ty = (r.height - 40 - img.h * view.z) / 2 + 4;
  applyView();
}
function applyView() {
  if (!img) return;
  art.style.width = img.w + 'px'; art.style.height = img.h + 'px';
  art.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.z})`;
  art.classList.toggle('is-pixels', view.z >= 3);
  stage.dataset.view = view.mode;
  showSvg();
  const r = stage.getBoundingClientRect();
  const sx = view.split * r.width;
  $('st-split').style.left = sx + 'px';
  const f = Math.max(0, Math.min(1, (sx - view.tx) / (img.w * view.z)));
  // compare: original on the left of the line, SVG on the right (each clipped, so transparent parts of the SVG
  // show the background rather than the original underneath)
  out.style.clipPath = view.mode === 'split' ? `inset(0 0 0 ${(f * 100).toFixed(3)}%)` : 'none';
  origImg.style.clipPath = view.mode === 'split' ? `inset(0 ${(100 - f * 100).toFixed(3)}% 0 0)` : 'none';
}
function zoomAt(k, cx, cy) {
  const z = Math.max(0.02, Math.min(64, view.z * k));
  const r = stage.getBoundingClientRect();
  const px = cx - r.left, py = cy - r.top;
  view.tx = px - (px - view.tx) * (z / view.z); view.ty = py - (py - view.ty) * (z / view.z); view.z = z;
  applyView();
}
function setView(mode) {
  view.mode = mode;
  document.querySelectorAll('#st-view button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
  applyView();
}
document.querySelectorAll('#st-view button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
const centre = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
$('st-zin').addEventListener('click', () => zoomAt(1.5, ...centre()));
$('st-zout').addEventListener('click', () => zoomAt(1 / 1.5, ...centre()));
$('st-fit').addEventListener('click', fit);
$('st-bg').addEventListener('click', () => { const o = ['check', 'white', 'dark']; stage.dataset.bg = o[(o.indexOf(stage.dataset.bg) + 1) % o.length]; });
$('st-full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else (stage.requestFullscreen || stage.webkitRequestFullscreen)?.call(stage);
});
document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));
if (!stage.requestFullscreen && !stage.webkitRequestFullscreen) $('st-full').hidden = true;
new ResizeObserver(() => { if (img) fit(); }).observe(stage);

stage.addEventListener('wheel', (e) => { if (!img) return; e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
stage.addEventListener('dblclick', (e) => { if (img && !e.target.closest('button')) fit(); });
const ptrs = new Map();
let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (!img || e.target.closest('button, .gf-tools, .st-view')) return;
  stage.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (e.target.closest('.st-split-handle')) { drag = { kind: 'split' }; return; }
  if (ptrs.size === 1) drag = { kind: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: 0 };
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    drag = { kind: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: view.z, tx: view.tx, ty: view.ty, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
  }
});
stage.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !drag) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (drag.kind === 'split') {
    const r = stage.getBoundingClientRect();
    view.split = Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)); applyView();
  } else if (drag.kind === 'pan') {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 3) stage.classList.add('is-panning');
    view.tx = drag.tx + dx; view.ty = drag.ty + dy; applyView();
  } else if (drag.kind === 'pinch' && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    const r = stage.getBoundingClientRect();
    const z = Math.max(0.02, Math.min(64, drag.z * d / drag.d));
    const px = drag.cx - r.left, py = drag.cy - r.top;
    view.z = z;
    view.tx = px - (px - drag.tx) * (z / drag.z) + (cx - drag.cx);
    view.ty = py - (py - drag.ty) * (z / drag.z) + (cy - drag.cy);
    applyView();
  }
});
const endPtr = (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (drag && drag.kind === 'pan' && drag.moved <= 3 && picking && e.type === 'pointerup') pickAt(e.clientX, e.clientY);
  else if (drag && drag.kind === 'pan' && drag.moved <= 3 && objPick && e.type === 'pointerup') tapObject(e.clientX, e.clientY);
  stage.classList.remove('is-panning');
  drag = null;
  if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { kind: 'pan', x: p[0], y: p[1], tx: view.tx, ty: view.ty, moved: 9 }; }
};
stage.addEventListener('pointerup', endPtr);
stage.addEventListener('pointercancel', endPtr);

/* ---------------- downloads ---------------- */
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$('st-dl').addEventListener('click', () => { if (last) save(new Blob([last.svg], { type: 'image/svg+xml' }), `${img.name}.svg`); });
$('st-copy').addEventListener('click', async () => {
  if (!last) return;
  try { await navigator.clipboard.writeText(last.svg); window.HHQ?.toast?.('SVG code copied'); status('SVG code copied to the clipboard.', 'ok'); }
  catch { status('Your browser blocked copying. Use Download SVG instead.', 'bad'); }
});
$('st-zip').addEventListener('click', () => {
  if (!last) return;
  if (last.objLayers) { saveObjectLayers(last); return; }
  status('Making one SVG per colour…');
  const id = ++reqId; waiting.set(id, 'layers');
  busy = true; stage.classList.add('is-busy');
  worker.postMessage({ type: 'trace', id, prep: prepOpts(), vec: { ...vecOpts(), cutout: true } });
});
function saveLayers(m) {
  const files = {};
  m.layers.forEach((l, n) => {
    const body = l.d.map(d => `<path fill-rule="evenodd" d="${d}"/>`).join('\n');
    files[`${img.name}-${String(n + 1).padStart(2, '0')}-${l.hex.slice(1)}.svg`] =
      strToU8(`<svg xmlns="http://www.w3.org/2000/svg" width="${img.w}" height="${img.h}" viewBox="0 0 ${img.w} ${img.h}">\n<g fill="${l.hex}">\n${body}\n</g>\n</svg>\n`);
  });
  files[`${img.name}-all.svg`] = strToU8(last.svg);
  save(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }), `${img.name}-layers.zip`);
  status(`Saved ${m.layers.length} colour layer${m.layers.length === 1 ? '' : 's'} as a ZIP.`, 'ok');
}

/* ---------------- object layers ----------------
   Tap an object and the object finder (sam-worker.js) outlines it; the tracer then cuts the trace into
   one layer per object. Each tap keeps the finder's sizes for that spot (one shape, part, object, whole),
   so a layer can be made smaller or bigger afterwards without tapping again. */
let objPick = false, objSel = -1, objCount = 0, hoverLayer = -1;
let sam = null, samReq = 0, samFor = null, samReady = null;
const samWait = new Map();
const SAM_SIDE = 1024;
const LAYER_HUES = [24, 200, 140, 280, 50, 330, 170, 0, 230, 95];
const layerColour = (k) => `hsl(${LAYER_HUES[k % LAYER_HUES.length]} 95% 55%)`;

function samCall(msg, transfer) {
  return new Promise((res, rej) => { const id = ++samReq; samWait.set(id, { res, rej }); sam.postMessage({ ...msg, id }, transfer || []); });
}
function startSam() {
  if (sam) return;
  sam = new Worker(new URL('./sam-worker.js?v=c6efbc96b0', import.meta.url), { type: 'module' });
  sam.onmessage = (e) => {
    const m = e.data, w = samWait.get(m.id);
    if (m.type === 'progress') { status(m.text); return; }
    if (!w) return;
    samWait.delete(m.id);
    if (m.type === 'error') w.rej(new Error(m.message)); else w.res(m);
  };
  sam.onerror = () => { for (const w of samWait.values()) w.rej(new Error('The object finder could not start in this browser.')); samWait.clear(); sam = null; samReady = null; };
}
// the image as the finder sees it: long side 1024 px
function samSize() { const k = SAM_SIDE / Math.max(img.w, img.h); return { k, w: Math.round(img.w * k), h: Math.round(img.h * k) }; }
function ensureEmbed() {
  if (samFor === img && samReady) return samReady;
  startSam();
  samFor = img;
  const { w, h } = samSize();
  const src = document.createElement('canvas'); src.width = img.w; src.height = img.h;
  src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.w, img.h), 0, 0);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const forImg = img;
  samReady = samCall({ type: 'embed', rgba: px.buffer, w, h }, [px.buffer]).catch((e) => { if (samFor === forImg) { samReady = null; samFor = null; } throw e; });
  return samReady;
}

function setObjPick(on) {
  objPick = !!on && !!img;
  $('st-obj-pick').setAttribute('aria-pressed', String(objPick));
  $('st-obj-pick').querySelector('span').textContent = objPick ? 'Done picking' : 'Tap objects to lift them out';
  stage.classList.toggle('is-objpick', objPick);
  if (objPick) {
    if (picking) $('st-pick').click();
    if (view.mode === 'split' || view.mode === 'orig') setView('result');
    status('Tap anything in the image to make it a layer.');
    ensureEmbed().then(() => { if (objPick) status('Ready: tap anything in the image to make it a layer.'); }, (e) => status('The object finder could not load: ' + e.message, 'bad'));
  }
  drawOverlay();
}
$('st-obj-pick').addEventListener('click', () => { if (!img) { status('Open an image first.'); return; } setObjPick(!objPick); });
document.querySelectorAll('[data-layers]').forEach(b => b.addEventListener('click', () => {
  if (S.layerMode === b.dataset.layers) return;
  S.layerMode = b.dataset.layers; syncUI(); renderLayers(); schedule(0);
  if (S.layerMode === 'object' && img && !S.objects.length) setObjPick(true);
}));

const LEVEL_NAMES = { 1: ['Whole'], 2: ['Part', 'Whole'], 3: ['Part', 'Object', 'Whole'] };
function levelName(L) {
  const lv = L.levels[L.li];
  if (lv === 'shape') return 'Shape';
  const masks = L.levels.filter(v => v !== 'shape');
  return LEVEL_NAMES[masks.length][masks.indexOf(lv)];
}
const maskOf = (L, c) => L.masks.slice(c * L.mw * L.mh, (c + 1) * L.mw * L.mh);
function layerOpts() {
  if (S.layerMode !== 'object' || !S.objects.length) return {};
  const objects = S.objects.map((L) => {
    // Detailed mode has no flat colours to follow, so a single shape falls back to the finder's smallest part
    const lv = L.levels[L.li] === 'shape' && S.mode === 'detail' ? (L.levels[1] ?? L.biggest) : L.levels[L.li];
    if (lv === 'shape') return { kind: 'shape', x: L.x, y: L.y, within: { w: L.mw, h: L.mh, data: maskOf(L, L.biggest) } };
    return { kind: 'mask', w: L.mw, h: L.mh, data: maskOf(L, lv) };
  });
  const layerHidden = S.objects.map((L, i) => L.hidden ? i + 1 : -1).filter(k => k > 0);
  if (S.restHidden) layerHidden.push(0);
  return { objects, layerNames: S.objects.map(L => L.name), layerHidden };
}
// the layer under an image point, from the last trace
function layerAt(x, y) {
  if (!last || !last.objMap || !last.work) return 0;
  const [W, H] = last.work;
  return last.objMap[Math.min(H - 1, Math.floor(y * H / img.h)) * W + Math.min(W - 1, Math.floor(x * W / img.w))] || 0;
}
function overlap(a, b) {
  let i = 0, u = 0;
  for (let p = 0; p < a.length; p++) { const A = a[p] > 127, B = b[p] > 127; if (A && B) i++; if (A || B) u++; }
  return u ? i / u : 0;
}
async function tapObject(cx, cy) {
  const r = stage.getBoundingClientRect();
  const x = (cx - r.left - view.tx) / view.z, y = (cy - r.top - view.ty) / view.z;
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const forImg = img;
  status('Finding that object…');
  stage.classList.add('is-busy');
  try {
    await ensureEmbed();
    const { k } = samSize();
    const m = await samCall({ type: 'pick', x: x * k, y: y * k });
    if (img !== forImg) return;
    const masks = new Uint8Array(m.masks), n = m.w * m.h;
    // the finder's three sizes for this spot, smallest first, without near-duplicates
    const lv = [];
    for (const c of [1, 2, 3].filter(c => m.area[c] > 0).sort((a, b) => m.area[a] - m.area[b]))
      if (!lv.length || m.area[c] > m.area[lv[lv.length - 1]] * 1.12) lv.push(c);
    if (!lv.length) { status('Nothing found there. Try tapping right on the object.'); return; }
    const best = [1, 2, 3].reduce((a, c) => m.iou[c] > m.iou[a] ? c : a, 1);
    const levels = (S.mode !== 'detail' ? ['shape'] : []).concat(lv);
    let li = levels.indexOf(lv.reduce((a, c) => Math.abs(m.area[c] - m.area[best]) < Math.abs(m.area[a] - m.area[best]) ? c : a, lv[0]));
    // tapping inside a layer you already have means the part of it under your finger: in flat colours that is
    // the one shape you tapped (a letter of a sign, the eye of a face), whole; in Detailed mode the finder's next size down
    const under = layerAt(x, y);
    if (under > 0) {
      const U = S.objects[under - 1];
      if (U.levels[U.li] === 'shape') { objSel = under - 1; renderLayers(); drawOverlay(); status('That is already its own layer. Use + on it to take more.'); return; }
      if (levels[0] === 'shape') li = 0;
      else {
        const Um = maskOf(U, U.levels[U.li]);
        while (li > 0 && overlap(masks.subarray(levels[li] * n, (levels[li] + 1) * n), Um) > 0.8) li--;
      }
    }
    const L = { name: `Object ${++objCount}`, x, y, mw: m.w, mh: m.h, masks, levels, li, biggest: lv[lv.length - 1], hidden: false };
    S.objects.push(L); objSel = S.objects.length - 1;
    renderLayers();
    status(`Lifted out as ${L.name}. Tracing the layers…`);
    schedule(0);
  } catch (e) {
    status('The object finder could not run: ' + e.message, 'bad');
  } finally { if (!busy) stage.classList.remove('is-busy'); }
}

function renderLayers() {
  const box = $('st-lays');
  if (!S.objects.length) {
    box.innerHTML = '<p class="hint">No layers yet. Your layers show up here, with everything you have not picked in its own layer.</p>';
    drawOverlay(); return;
  }
  box.innerHTML = '';
  hoverLayer = -1;                 // the rows are rebuilt, so the one under the pointer never reports leaving
  const row = (k) => {
    const L = k ? S.objects[k - 1] : null, off = k ? L.hidden : S.restHidden;
    const el = document.createElement('div');
    el.className = 'st-ly' + (k ? '' : ' st-ly-rest') + (off ? ' is-off' : '') + (k && objSel === k - 1 ? ' is-sel' : '');
    el.innerHTML = `<span class="st-ly-dot" style="background:${k ? layerColour(k - 1) : 'transparent'}"></span>
      <input class="st-ly-name" value="${k ? L.name.replace(/"/g, '&quot;') : 'Everything else'}" aria-label="Layer name" ${k ? '' : 'readonly tabindex="-1"'}>
      ${k ? `<button type="button" class="st-sw-btn" data-act="down" aria-label="Smaller" title="Smaller"${L.li === 0 ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12"/></svg></button>
      <span class="st-ly-size" title="How much of the object this layer takes">${levelName(L)}</span>
      <button type="button" class="st-sw-btn" data-act="up" aria-label="Bigger" title="Bigger"${L.li === L.levels.length - 1 ? ' disabled' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg></button>` : ''}
      <button type="button" class="st-sw-btn" data-act="hide" aria-label="${off ? 'Show' : 'Hide'} this layer" title="${off ? 'Show' : 'Hide'}: hidden layers are left out of the SVG">${off ? ICON.eyeOff : ICON.eye}</button>
      ${k ? `<button type="button" class="st-sw-btn" data-act="del" aria-label="Remove this layer" title="Remove: its shapes go back into Everything else">${ICON.x}</button>` : ''}`;
    const nm = el.querySelector('.st-ly-name');
    if (k) {
      nm.addEventListener('focus', () => { objSel = k - 1; box.querySelectorAll('.st-ly').forEach(r => r.classList.remove('is-sel')); el.classList.add('is-sel'); drawOverlay(); });
      nm.addEventListener('change', () => { L.name = nm.value.trim() || `Object ${k}`; schedule(0); });
      nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') nm.blur(); });
      el.querySelector('[data-act=down]').addEventListener('click', () => { if (L.li > 0) { L.li--; objSel = k - 1; renderLayers(); schedule(0); } });
      el.querySelector('[data-act=up]').addEventListener('click', () => { if (L.li < L.levels.length - 1) { L.li++; objSel = k - 1; renderLayers(); schedule(0); } });
      el.querySelector('[data-act=del]').addEventListener('click', () => {
        S.objects.splice(k - 1, 1); objSel = Math.min(objSel, S.objects.length - 1);
        renderLayers(); schedule(0);
      });
    }
    el.querySelector('[data-act=hide]').addEventListener('click', () => { if (k) L.hidden = !L.hidden; else S.restHidden = !S.restHidden; renderLayers(); schedule(0); });
    el.addEventListener('pointerenter', () => { hoverLayer = k; drawOverlay(); });
    box.appendChild(el);
  };
  for (let k = 1; k <= S.objects.length; k++) row(k);
  row(0);
}
// tint each layer on the image while you pick, so you can see what went where
function drawOverlay() {
  const cv = $('st-lay');
  const on = S.layerMode === 'object' && last && last.objMap && last.work && S.objects.length && (objPick || hoverLayer >= 0);
  stage.classList.toggle('show-layers', !!on);
  if (!on) return;
  const [W, H] = last.work, map = last.objMap;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const g = cv.getContext('2d'), id = g.createImageData(W, H), d = id.data;
  const rgb = S.objects.map((_, i) => { g.fillStyle = layerColour(i); const h = g.fillStyle; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; });
  const focus = hoverLayer >= 0 ? hoverLayer : objSel + 1;
  for (let i = 0, n = W * H; i < n; i++) {
    const k = map[i];
    if (!k) { if (hoverLayer === 0) { d[i * 4] = 255; d[i * 4 + 1] = 160; d[i * 4 + 2] = 40; d[i * 4 + 3] = 110; } continue; }
    const c = rgb[k - 1]; if (!c || S.objects[k - 1].hidden) continue;
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = k === focus ? 150 : hoverLayer >= 0 ? 0 : 85;
  }
  g.putImageData(id, 0, 0);
}

$('st-lays').addEventListener('pointerleave', () => { if (hoverLayer >= 0) { hoverLayer = -1; drawOverlay(); } });

function saveObjectLayers(m) {
  const files = {}, slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer';
  m.objLayers.forEach((l, n) => { files[`${img.name}-${String(n + 1).padStart(2, '0')}-${slug(l.name)}.svg`] = strToU8(l.svg); });
  files[`${img.name}-all.svg`] = strToU8(m.svg);
  save(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }), `${img.name}-layers.zip`);
  status(`Saved ${m.objLayers.length} layer${m.objLayers.length === 1 ? '' : 's'} as a ZIP.`, 'ok');
}

renderLayers();

/* ---------------- phone layout ----------------
   On a phone the picture stays pinned at the top, its view switch and tools sit in a strip right under it,
   and the settings are tabs (only one group at a time, so nothing needs a long scroll). Once an image is
   open the site header scrolls away, which gives the picture the whole top of the screen. */
const phone = matchMedia('(max-width:900px)');
const viewBox = document.querySelector('.st-page .gf-view'), panel = $('st-panel');
const MAIN_TAB = { color: 'Colours', bw: 'B&W', detail: 'Detail' };
function layoutPhone() {
  const strip = $('st-strip'), tools = document.querySelector('.st-page .gf-tools'), vw = $('st-view');
  if (phone.matches) {
    if (tools.parentNode !== strip) strip.append(vw, tools);
    if (!panel.dataset.ptab) panel.dataset.ptab = 'main';
    panel.querySelectorAll('details').forEach(d => { d.open = true; });
  } else {
    if (tools.parentNode !== stage) { stage.insertBefore(tools, readout); stage.insertBefore(vw, readout); }
    delete panel.dataset.ptab;
  }
  document.body.classList.toggle('st-editing', phone.matches && !!img);
  placeTabs();
}
function placeTabs() {
  if (!phone.matches) return;
  const top = parseFloat(getComputedStyle(viewBox).top) || 0;
  panel.style.setProperty('--st-tabs-top', Math.round(top + viewBox.offsetHeight) + 'px');
}
function syncTabs() {
  panel.querySelector('[data-ptab=main]').textContent = MAIN_TAB[S.mode];
  panel.querySelectorAll('.st-ptabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ptab === (panel.dataset.ptab || 'main'))));
}
panel.querySelectorAll('.st-ptabs button').forEach(b => b.addEventListener('click', () => {
  panel.dataset.ptab = b.dataset.ptab; syncTabs();
  // keep the tab bar where it is: if the page had scrolled past the top of the settings, go back to it
  const y = panel.getBoundingClientRect().top + scrollY - (parseFloat(panel.style.getPropertyValue('--st-tabs-top')) || 0);
  if (scrollY > y) scrollTo({ top: y });
}));
phone.addEventListener('change', layoutPhone);
new ResizeObserver(placeTabs).observe(viewBox);
layoutPhone();

syncUI();
