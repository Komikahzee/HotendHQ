/* ============================================================
   HOTEND HQ — printer list shared by every generator
   Printable volume in mm (X × Y bed, Z height), from each maker's
   published specs. Where a machine's usable area depends on the
   mode (Bambu H2D dual nozzle), the smaller everyday figure is used.
   The choice is remembered on this device for all generators.
   ============================================================ */
export const PRINTERS = [
  // Bambu Lab
  { id: 'bambu-a1mini', brand: 'Bambu Lab', name: 'A1 mini', x: 180, y: 180, z: 180 },
  { id: 'bambu-a1', brand: 'Bambu Lab', name: 'A1', x: 256, y: 256, z: 256 },
  { id: 'bambu-p1s', brand: 'Bambu Lab', name: 'P1S / P1P', x: 256, y: 256, z: 256 },
  { id: 'bambu-p2s', brand: 'Bambu Lab', name: 'P2S', x: 256, y: 256, z: 256 },
  { id: 'bambu-x1c', brand: 'Bambu Lab', name: 'X1 Carbon / X1E', x: 256, y: 256, z: 256 },
  { id: 'bambu-h2d', brand: 'Bambu Lab', name: 'H2D (dual nozzle)', x: 300, y: 320, z: 325 },
  { id: 'bambu-h2s', brand: 'Bambu Lab', name: 'H2S', x: 340, y: 320, z: 340 },
  { id: 'bambu-h2c', brand: 'Bambu Lab', name: 'H2C', x: 330, y: 320, z: 325 },
  // Prusa
  { id: 'prusa-mini', brand: 'Prusa', name: 'MINI+', x: 180, y: 180, z: 180 },
  { id: 'prusa-mk3', brand: 'Prusa', name: 'MK3S+', x: 250, y: 210, z: 210 },
  { id: 'prusa-mk4', brand: 'Prusa', name: 'MK4 / MK4S', x: 250, y: 210, z: 220 },
  { id: 'prusa-core1', brand: 'Prusa', name: 'CORE One', x: 250, y: 220, z: 270 },
  { id: 'prusa-xl', brand: 'Prusa', name: 'XL', x: 360, y: 360, z: 360 },
  // Creality
  { id: 'cr-ender3v3se', brand: 'Creality', name: 'Ender-3 V3 SE', x: 220, y: 220, z: 250 },
  { id: 'cr-ender3v3ke', brand: 'Creality', name: 'Ender-3 V3 KE', x: 220, y: 220, z: 240 },
  { id: 'cr-ender3v3', brand: 'Creality', name: 'Ender-3 V3', x: 220, y: 220, z: 250 },
  { id: 'cr-ender3', brand: 'Creality', name: 'Ender-3 / V2 / S1', x: 220, y: 220, z: 250 },
  { id: 'cr-k1', brand: 'Creality', name: 'K1 / K1C', x: 220, y: 220, z: 250 },
  { id: 'cr-k1max', brand: 'Creality', name: 'K1 Max', x: 300, y: 300, z: 300 },
  { id: 'cr-k2', brand: 'Creality', name: 'K2', x: 260, y: 260, z: 260 },
  { id: 'cr-k2pro', brand: 'Creality', name: 'K2 Pro', x: 300, y: 300, z: 300 },
  { id: 'cr-k2plus', brand: 'Creality', name: 'K2 Plus', x: 350, y: 350, z: 350 },
  // Elegoo
  { id: 'el-n4', brand: 'Elegoo', name: 'Neptune 4 / 4 Pro', x: 225, y: 225, z: 265 },
  { id: 'el-n4plus', brand: 'Elegoo', name: 'Neptune 4 Plus', x: 320, y: 320, z: 385 },
  { id: 'el-n4max', brand: 'Elegoo', name: 'Neptune 4 Max', x: 420, y: 420, z: 480 },
  { id: 'el-cc', brand: 'Elegoo', name: 'Centauri Carbon', x: 256, y: 256, z: 256 },
  { id: 'el-cc2', brand: 'Elegoo', name: 'Centauri Carbon 2', x: 256, y: 256, z: 256 },
  // Anycubic
  { id: 'ac-kobra2neo', brand: 'Anycubic', name: 'Kobra 2 Neo', x: 220, y: 220, z: 250 },
  { id: 'ac-kobra3', brand: 'Anycubic', name: 'Kobra 3', x: 250, y: 250, z: 260 },
  { id: 'ac-kobras1', brand: 'Anycubic', name: 'Kobra S1', x: 250, y: 250, z: 250 },
  { id: 'ac-kobra3max', brand: 'Anycubic', name: 'Kobra 3 Max', x: 420, y: 420, z: 500 },
  // Sovol
  { id: 'sv-sv06', brand: 'Sovol', name: 'SV06', x: 220, y: 220, z: 250 },
  { id: 'sv-sv06plus', brand: 'Sovol', name: 'SV06 Plus', x: 300, y: 300, z: 340 },
  { id: 'sv-sv08', brand: 'Sovol', name: 'SV08', x: 350, y: 350, z: 345 },
  // QIDI
  { id: 'qd-q1pro', brand: 'QIDI', name: 'Q1 Pro', x: 245, y: 245, z: 240 },
  { id: 'qd-q2', brand: 'QIDI', name: 'Q2', x: 270, y: 270, z: 256 },
  { id: 'qd-plus4', brand: 'QIDI', name: 'Plus4', x: 305, y: 305, z: 280 },
  // Others
  { id: 'ff-ad5m', brand: 'Flashforge', name: 'Adventurer 5M / 5M Pro', x: 220, y: 220, z: 220 },
  { id: 'ak-m5', brand: 'AnkerMake', name: 'M5 / M5C', x: 235, y: 235, z: 250 },
  { id: 'vo-02', brand: 'Voron', name: 'V0.2', x: 120, y: 120, z: 120 },
  { id: 'vo-250', brand: 'Voron', name: '2.4 / Trident 250', x: 250, y: 250, z: 250 },
  { id: 'vo-300', brand: 'Voron', name: '2.4 / Trident 300', x: 300, y: 300, z: 300 },
  { id: 'vo-350', brand: 'Voron', name: '2.4 / Trident 350', x: 350, y: 350, z: 350 },
];
export const DEFAULT_PRINTER = 'bambu-p1s';
const byId = new Map(PRINTERS.map(p => [p.id, p]));

export const printerById = (id) => byId.get(id) || null;
export const printerLabel = (p) => (p ? `${p.brand} ${p.name}` : 'Custom printer');

/** Old share links stored a bed as "256x256" or "180": find a printer with that bed, or null. */
export function printerForBed(v) {
  const m = String(v || '').match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return null;
  const x = +m[1], y = +(m[2] || m[1]);
  return PRINTERS.find(p => p.x === x && p.y === y) || { id: 'custom', x, y, z: 250 };
}

/** <option>/<optgroup> markup for a printer select; `value` is the selected id. */
export function printerOptions(value) {
  const groups = [];
  for (const p of PRINTERS) {
    let g = groups.find(q => q.brand === p.brand);
    if (!g) groups.push(g = { brand: p.brand, items: [] });
    g.items.push(p);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return groups.map(g => `<optgroup label="${esc(g.brand)}">${g.items.map(p =>
    `<option value="${p.id}"${p.id === value ? ' selected' : ''}>${esc(p.brand + ' ' + p.name)} (${p.x} × ${p.y} mm)</option>`).join('')}</optgroup>`).join('')
    + `<option value="custom"${value === 'custom' ? ' selected' : ''}>Custom size…</option>`;
}

/* ---------- remembered on this device, shared by every generator ---------- */
const KEY = 'hhq-printer';
export function loadPrinter() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && (v.id === 'custom' || byId.has(v.id))) return { id: v.id, x: +v.x || 256, y: +v.y || 256, z: +v.z || 256 };
  } catch { /* storage blocked: fall through */ }
  const p = byId.get(DEFAULT_PRINTER);
  return { id: p.id, x: p.x, y: p.y, z: p.z };
}
export function savePrinter(sel) {
  try { localStorage.setItem(KEY, JSON.stringify(sel)); } catch { /* private mode: fine */ }
}
/** Resolve a selection {id, x, y, z} to the volume in use. */
export function volumeOf(sel) {
  const p = byId.get(sel.id);
  return p ? { x: p.x, y: p.y, z: p.z, label: printerLabel(p) } : { x: +sel.x, y: +sel.y, z: +sel.z, label: 'your printer' };
}
/** Does a W × D × H box fit? Either way round on the bed. */
export function fits(vol, w, d, h) {
  const flat = (w <= vol.x + 1e-6 && d <= vol.y + 1e-6) || (w <= vol.y + 1e-6 && d <= vol.x + 1e-6);
  return { flat, tall: h <= vol.z + 1e-6, ok: flat && h <= vol.z + 1e-6 };
}
