import { Viewer, trianglesOf } from './viewer.js';
import { ENGINES, preprocess, generate, ping } from './engines.js';
import { toSTL, to3MF, download } from './export.js';

const $ = (id) => document.getElementById(id);
const viewer = new Viewer($('view'));
const S = {
  photo: null, photoName: 'model', engine: 'trellis2', res: '1536', texture: 2048, base: 'plinth', vox: 320,
  color: '#c9c4bc', cands: [], sel: -1, print: null, busy: false, token: '',
};

// ---------- small UI helpers ----------
function log(msg, cls) {
  const d = document.createElement('div'); if (cls) d.className = cls;
  d.textContent = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}  ${msg}`;
  $('log').prepend(d);
}
function busy(text, pct) {
  if (text === false) { $('busy').hidden = true; return; }
  $('busy').hidden = false; $('busyText').textContent = text;
  $('busyBar').style.width = (pct == null ? 0 : Math.max(0, Math.min(100, pct))) + '%';
}
function pills(id, key, after) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    for (const x of $(id).children) x.classList.toggle('on', x === b);
    S[key] = b.dataset.v; after?.();
  });
}
function bindRange(id, fmt) {
  const el = $(id), out = $(id + 'Out'), f = () => { if (out) out.textContent = fmt ? fmt(+el.value) : el.value; };
  el.addEventListener('input', f); f();
}
const num = (id) => +$(id).value;
function gpu(state, text) { $('gpu').className = 'gpu ' + (state || ''); $('gpuText').textContent = text; }
function refresh() {
  const hasTok = /^hf_\w{20,}$/.test(S.token);
  $('btnGen').disabled = S.busy || !S.photo || !hasTok;
  $('btnPrep').disabled = S.busy || !S.photo;
  $('btnFix').disabled = S.busy || S.sel < 0;
  for (const id of ['dlSTL', 'dl3MF']) $(id).disabled = S.busy || !S.print;
  $('dlGLB').disabled = S.busy || S.sel < 0;
  $('vPrint').disabled = !S.print;
  if (!S.busy) gpu(hasTok ? (S.online === 'Spaces unreachable' ? 'bad' : 'ok') : '', hasTok ? (S.online || 'Token ready · ZeroGPU') : (S.token ? 'That doesn’t look like an HF token' : 'No token yet'));
}

// ---------- image ----------
async function setPhoto(blob, name) {
  S.photo = blob; S.photoName = (name || 'model').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40) || 'model';
  const img = $('photo'); img.src = URL.createObjectURL(blob); img.hidden = false; $('dropText').hidden = true;
  refresh();
}
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) setPhoto(f, f.name); });
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const f = [...e.dataTransfer.files].find((x) => /^image\//.test(x.type)); if (f) setPhoto(f, f.name);
  const g = [...e.dataTransfer.files].find((x) => /\.glb$/i.test(x.name)); if (g) openGLB(g);
});
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type)); if (f) setPhoto(f, 'pasted'); });

// In-browser cut-out (IS-Net, the same model the Pendant Studio ships), cropped square around the subject.
$('btnPrep').addEventListener('click', async () => {
  S.busy = true; refresh();
  try {
    busy('Loading the cut-out model', 5);
    const { removeBackgroundAI } = await import('/generators/pendant/js/ai.js');
    const img = await createImageBitmap(S.photo);
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
    const matte = await removeBackgroundAI(cv, (m) => m && busy(m, 50));
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
    for (let i = 0; i < matte.length; i++) {
      const a = matte[i]; id.data[i * 4 + 3] = Math.round(a * 255);
      if (a > 0.5) { const x = i % cv.width, y = (i / cv.width) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0) throw new Error('No subject found in the picture.');
    ctx.putImageData(id, 0, 0);
    const side = Math.round(Math.max(x1 - x0, y1 - y0) * 1.12), out = document.createElement('canvas');
    out.width = out.height = Math.min(2048, Math.max(1024, side));
    const k = out.width / side, oc = out.getContext('2d');
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(cv, x0, y0, x1 - x0, y1 - y0, (out.width - (x1 - x0) * k) / 2, (out.height - (y1 - y0) * k) / 2, (x1 - x0) * k, (y1 - y0) * k);
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    await setPhoto(blob, S.photoName);
    log('Subject cut out and centred.', 'o');
  } catch (e) { log(e.message, 'e'); }
  busy(false); S.busy = false; refresh();
});

// ---------- engine + settings ----------
$('engines').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of $('engines').children) x.classList.toggle('on', x === b);
  S.engine = b.dataset.e;
});
pills('res', 'res'); pills('tex', 'texture');
pills('base', 'base', () => { document.querySelectorAll('.plinth-only').forEach((el) => { el.hidden = S.base !== 'plinth'; }); document.querySelectorAll('.cut-only').forEach((el) => { el.hidden = S.base === 'none'; }); });
pills('vox', 'vox', () => { $('voxOut').textContent = S.vox; });
bindRange('seeds'); bindRange('shapeSteps'); bindRange('ssSteps'); bindRange('shapeGuid', (v) => v.toFixed(1));
bindRange('faces', (v) => Math.round(v / 1000) + 'k');
bindRange('height', (v) => v + ' mm'); bindRange('plinthH', (v) => v + ' mm'); bindRange('plinthS', (v) => v + '%');
bindRange('cut', (v) => v + ' mm'); bindRange('seal', (v) => v.toFixed(1) + ' mm'); bindRange('wall', (v) => v.toFixed(1) + ' mm'); bindRange('smooth');
$('hollow').addEventListener('change', () => { document.querySelector('.hollow-only').hidden = !$('hollow').checked; });
$('sw').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  for (const x of $('sw').children) x.classList.toggle('on', x === b);
  S.color = getComputedStyle(b).getPropertyValue('--c').trim();
  viewer.clay.color.set(S.color);
});

// token: memory only, unless "remember" is ticked
try { const t = localStorage.getItem('hhq-meshlab-token'); if (t) { S.token = t; $('token').value = t; $('remember').checked = true; } } catch { /* storage blocked */ }
$('token').addEventListener('input', () => { S.token = $('token').value.trim(); saveTok(); refresh(); checkSpaces(); });
let checked = '';
async function checkSpaces() {
  if (!/^hf_\w{20,}$/.test(S.token) || checked === S.token) return;
  checked = S.token; S.online = '';
  const ok = [];
  for (const e of ['trellis2', 'pixal3d']) { try { await ping(e, S.token); ok.push(ENGINES[e].name); } catch (err) { log(`${ENGINES[e].name}: ${err.message}`, 'e'); } }
  S.online = ok.length ? `${ok.join(' + ')} online` : 'Spaces unreachable';
  refresh();
}
$('remember').addEventListener('change', saveTok);
function saveTok() { try { if ($('remember').checked && S.token) localStorage.setItem('hhq-meshlab-token', S.token); else localStorage.removeItem('hhq-meshlab-token'); } catch { /* storage blocked */ } }

// ---------- candidates ----------
function renderCands() {
  const box = $('cands'); box.innerHTML = '';
  S.cands.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'c' + (i === S.sel ? ' on' : '') + (c.status !== 'ready' ? ' wait' : '') + (c.status === 'failed' ? ' fail' : '');
    if (c.thumb) d.style.backgroundImage = `url(${c.thumb})`;
    d.innerHTML = `<em>${c.label}</em>` + (c.status === 'ready' ? '' : `<span>${c.note || ''}</span>`);
    if (c.status === 'ready') d.addEventListener('click', () => select(i));
    box.appendChild(d);
  });
}
async function addCandidate(c, glb) {
  c.glb = glb; c.status = 'ready';
  const i = S.cands.indexOf(c);
  await select(i);
  c.thumb = viewer.snapshot(); renderCands();
}
async function select(i) {
  S.sel = i; S.print = null; const c = S.cands[i];
  $('ph').hidden = true;
  c.gltf = await viewer.showGLB(c.glb);
  c.tris = c.tris || trianglesOf(c.gltf).indices.length / 3;
  setMode('raw');
  $('vb').innerHTML = `<span>${c.label}</span><span>${c.tris.toLocaleString()} triangles · raw AI mesh</span>`;
  $('checks').innerHTML = ''; renderCands(); refresh();
}

$('btnGen').addEventListener('click', async () => {
  const engines = S.engine === 'both' ? ['trellis2', 'pixal3d'] : [S.engine];
  const n = num('seeds');
  const jobs = [];
  for (const e of engines) for (let k = 0; k < n; k++) {
    const seed = $('seedRand').checked ? Math.floor(Math.random() * 2147483647) : num('seed') + k;
    const c = { engine: e, seed, label: `${ENGINES[e].name} · seed ${seed}`, status: 'queued', note: 'Queued' };
    S.cands.push(c); jobs.push(c);
  }
  renderCands();
  S.busy = true; refresh();
  const prepped = {};
  for (const c of jobs) {
    const t0 = performance.now();
    c.status = 'running'; c.note = 'Cutting out…'; renderCands();
    gpu('warn', `${ENGINES[c.engine].name} running`);
    busy(`${ENGINES[c.engine].name}: cutting out the subject`, 5);
    try {
      prepped[c.engine] ||= await preprocess(c.engine, S.photo, S.token);
      const tick = setInterval(() => { const s = (performance.now() - t0) / 1000; busy(`${c.label}: ${c.note} (${Math.round(s)} s)`, Math.min(95, s / 1.6)); }, 500);
      try {
        const out = await generate(c.engine, prepped[c.engine], {
          seed: c.seed, resolution: S.res, shapeSteps: num('shapeSteps'), ssSteps: num('ssSteps'), texSteps: 12,
          shapeGuidance: num('shapeGuid'), faces: num('faces'), texture: +S.texture,
        }, S.token, (st) => { c.note = st; renderCands(); });
        await addCandidate(c, out.glb);
        log(`${c.label} done in ${Math.round((performance.now() - t0) / 1000)} s`, 'o');
      } finally { clearInterval(tick); }
    } catch (e) {
      c.status = 'failed'; c.note = e.message; renderCands(); log(`${c.label}: ${e.message}`, 'e');
      if (/GPU time|token/i.test(e.message)) { gpu('bad', /token/i.test(e.message) ? 'Token rejected' : 'Out of GPU time today'); for (const r of jobs) if (r.status === 'queued') { r.status = 'failed'; r.note = 'Skipped'; } renderCands(); break; }
    }
  }
  busy(false); S.busy = false; refresh();
});

async function openGLB(file) {
  const c = { engine: 'file', seed: 0, label: file.name.replace(/\.glb$/i, '').slice(0, 28), status: 'running' };
  S.cands.push(c); renderCands();
  try { await addCandidate(c, file); log(`Opened ${file.name}`, 'o'); } catch (e) { c.status = 'failed'; c.note = 'Could not read that file'; renderCands(); log(e.message, 'e'); }
}
$('glbFile').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openGLB(f); e.target.value = ''; });

// ---------- print prep ----------
let worker = null;
$('btnFix').addEventListener('click', () => {
  const c = S.cands[S.sel]; if (!c?.gltf) return;
  const { positions, indices } = trianglesOf(c.gltf);
  const opt = {
    heightMM: num('height'), res: +S.vox, sealMM: num('seal'), base: S.base, cutMM: num('cut'), plinthH: num('plinthH'),
    plinthScale: num('plinthS') / 100, hollow: $('hollow').checked, wallMM: num('wall'), drainMM: 6, smooth: num('smooth'),
    snap: $('snap').checked, keepLargest: $('largest').checked, rotX: num('rotX'), rotY: num('rotY'), rotZ: num('rotZ'),
  };
  worker?.terminate();
  worker = new Worker(new URL('./prep-worker.js', import.meta.url));
  S.busy = true; refresh(); busy('Starting', 0);
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { busy(m.msg, m.pct); return; }
    busy(false); S.busy = false;
    if (m.type === 'error') { log(m.msg, 'e'); refresh(); return; }
    S.print = { positions: m.positions, indices: m.indices, stats: m.stats, name: `${S.photoName}-${c.engine}-${c.seed}` };
    showPrint(); checks(m.stats); refresh();
    log(`Print-ready in ${(m.stats.ms / 1000).toFixed(1)} s`, 'o');
  };
  worker.onerror = (e) => { busy(false); S.busy = false; log(e.message || 'Print prep crashed (out of memory? try Draft detail).', 'e'); refresh(); };
  worker.postMessage({ positions, indices, opt }, [positions.buffer, indices.buffer]);
});
function showPrint() {
  const p = S.print; viewer.showPrint(p.positions, p.indices, S.color); setMode('print');
  const [x, y, z] = p.stats.size;
  $('vb').innerHTML = `<span>${x.toFixed(1)} × ${y.toFixed(1)} × ${z.toFixed(1)} mm</span><span>${p.stats.triangles.toLocaleString()} triangles · print-ready</span>`;
}
function checks(s) {
  const row = (ok, title, sub) => `<div class="ck"><span class="s ${ok === true ? '' : ok === 'w' ? 'w' : 'x'}">${ok === true ? '✓' : '!'}</span><div><b>${title}</b><small>${sub}</small></div></div>`;
  const solid = s.openEdges === 0 && s.nonManifold === 0;
  $('checks').innerHTML = [
    row(solid || 'x', solid ? 'One watertight, manifold solid' : 'Mesh has problems', `${s.openEdges} open edges · ${s.nonManifold} non-manifold edges`),
    row(true, 'Loose pieces removed', `${s.piecesFound.toLocaleString()} raw pieces merged into 1 · ${s.pinches.toLocaleString()} pinch points fixed`),
    row(s.snapped > 0.3 || 'w', 'AI detail kept', `${Math.round(s.snapped * 100)}% of the surface sits exactly on the AI mesh · ${s.voxel.toFixed(2)} mm grid`),
    row(true, `${s.size[0].toFixed(0)} × ${s.size[1].toFixed(0)} × ${s.size[2].toFixed(0)} mm`, `${s.triangles.toLocaleString()} triangles · flat on the bed`),
    row(s.chambers > 1 ? 'w' : true, `${s.volume.toFixed(0)} cm³ · ~${Math.round(s.grams)} g PLA solid`, s.chambers ? `${s.chambers} hollow chamber${s.chambers > 1 ? 's (only one drains)' : ''}` : 'Slicer infill sets the real weight'),
  ].join('');
}

// ---------- viewer controls + export ----------
function setMode(m) { $('vRaw').classList.toggle('on', m === 'raw'); $('vPrint').classList.toggle('on', m === 'print'); }
$('vRaw').addEventListener('click', async () => { const c = S.cands[S.sel]; if (!c) return; await viewer.showGLB(c.glb); setMode('raw'); });
$('vPrint').addEventListener('click', () => { if (S.print) showPrint(); });
$('vClay').addEventListener('click', () => { const on = !$('vClay').classList.contains('on'); $('vClay').classList.toggle('on', on); viewer.setClay(on); });
$('vWire').addEventListener('click', () => { const on = !$('vWire').classList.contains('on'); $('vWire').classList.toggle('on', on); viewer.setWire(on); });
$('vSpin').addEventListener('click', () => { const on = !viewer.controls.autoRotate; viewer.controls.autoRotate = on; $('vSpin').classList.toggle('on', on); });
$('dlSTL').addEventListener('click', () => download(toSTL(S.print.positions, S.print.indices, S.print.name), S.print.name + '.stl'));
$('dl3MF').addEventListener('click', () => download(to3MF(S.print.positions, S.print.indices, S.print.name, S.color), S.print.name + '.3mf'));
$('dlGLB').addEventListener('click', () => { const c = S.cands[S.sel]; if (c) download(c.glb, `${S.photoName}-${c.engine}-${c.seed}.glb`); });

refresh(); checkSpaces();
window.__meshlab = { S, viewer, openGLB, setPhoto, ping }; // handy in the console
