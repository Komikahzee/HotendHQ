// Procedural sample artwork, authored as height maps (grey = height) rather than shaded pictures:
// planar facets, bevelled rings, true domes and flat terraces give crisp, symmetrical reliefs.

export const grey = (h) => { const v = Math.round(Math.min(1, Math.max(0, h)) * 255); return `rgb(${v},${v},${v})`; };
function mk(size = 1024) { const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'); return [cv, g]; }
export const polar = (r, a) => [r * Math.sin(a), -r * Math.cos(a)]; // angle 0 = up

// A flat plane through three points with heights h — an exact linear gradient, so facets stay planar.
export function facet(g, pts, hs) {
  const [[x1, y1], [x2, y2], [x3, y3]] = pts, [h1, h2, h3] = hs;
  const det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  if (Math.abs(det) < 1e-9) return;
  const a = ((h2 - h1) * (y3 - y1) - (h3 - h1) * (y2 - y1)) / det;
  const b = ((x2 - x1) * (h3 - h1) - (x3 - x1) * (h2 - h1)) / det;
  const gg = a * a + b * b;
  if (gg < 1e-14) g.fillStyle = g.strokeStyle = grey(h1);
  else {
    const t0 = -h1 / gg, t1 = (1 - h1) / gg;
    const gr = g.createLinearGradient(x1 + a * t0, y1 + b * t0, x1 + a * t1, y1 + b * t1);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff');
    g.fillStyle = g.strokeStyle = gr;
  }
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath();
  g.lineWidth = 1.2; g.lineJoin = 'round'; g.fill(); g.stroke(); // stroke closes anti-alias seams between facets
}
// Hemispherical dome (true circular cross-section), optionally elliptical and rotated.
export function dome(g, x, y, rx, ry, rot, h0, h1) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(rx, ry);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let i = 0; i <= 24; i++) { const t = i / 24; gr.addColorStop(t, grey(h0 + (h1 - h0) * Math.sqrt(1 - t * t))); }
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
}
// Ring with a flat top and 45°-style bevels on both sides.
function ring(g, r, w, h, flat = 0.4) {
  const r0 = r - w / 2, r1 = r + w / 2, gr = g.createRadialGradient(0, 0, r0, 0, 0, r1);
  const e = (1 - flat) / 2;
  gr.addColorStop(0, grey(0)); gr.addColorStop(e, grey(h)); gr.addColorStop(1 - e, grey(h)); gr.addColorStop(1, grey(0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r1, 0, Math.PI * 2); g.arc(0, 0, r0, 0, Math.PI * 2, true); g.fill();
}
// Star arm: two planar facets meeting on a sharp ridge from the centre to the tip.
export function arm(g, ang, len, halfAng, rBase, hc, ht, hs) {
  const T = polar(len, ang), W1 = polar(rBase, ang - halfAng), W2 = polar(rBase, ang + halfAng);
  facet(g, [[0, 0], T, W1], [hc, ht, hs]);
  facet(g, [[0, 0], T, W2], [hc, ht, hs]);
}

export function sampleCompass() {
  const [cv, g] = mk(); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024); g.translate(512, 512);
  ring(g, 452, 34, 0.55, 0.35);
  ring(g, 392, 12, 0.4, 0.2);
  for (let i = 0; i < 72; i++) {
    const major = i % 9 === 0, a = i * Math.PI / 36;
    g.save(); g.rotate(a); g.fillStyle = grey(major ? 0.42 : 0.3);
    g.fillRect(-(major ? 5 : 3), -432, major ? 10 : 6, major ? 36 : 18); g.restore();
  }
  for (let i = 0; i < 8; i++) arm(g, Math.PI / 8 + i * Math.PI / 4, 250, Math.PI / 8, 46, 0.72, 0.22, 0.06);
  for (let i = 0; i < 4; i++) arm(g, Math.PI / 4 + i * Math.PI / 2, 300, Math.PI / 4, 66, 0.85, 0.24, 0.08);
  for (let i = 0; i < 4; i++) arm(g, i * Math.PI / 2, 372, Math.PI / 4, 92, 1.0, 0.3, 0.1);
  dome(g, 0, 0, 34, 34, 0, 0.9, 1.0);
  return cv;
}

export function sampleSunburst() {
  const [cv, g] = mk(); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024); g.translate(512, 512);
  ring(g, 462, 26, 0.5, 0.3);
  const N = 32;
  for (let i = 0; i < N; i++) {
    const a = i * Math.PI * 2 / N, long = i % 2 === 0, half = Math.PI / N * 0.92;
    const tip = polar(long ? 430 : 350, a), M = polar(128, a), W1 = polar(128, a - half), W2 = polar(128, a + half);
    facet(g, [M, tip, W1], [0.6, 0.12, 0.04]);
    facet(g, [M, tip, W2], [0.6, 0.12, 0.04]);
  }
  ring(g, 126, 22, 0.75, 0.3);
  dome(g, 0, 0, 112, 112, 0, 0.45, 1.0);
  return cv;
}

export function samplePeaks() {
  const [cv, g] = mk();
  g.fillStyle = grey(0); g.fillRect(0, 0, 1024, 1024);
  const range = (base, peaks, h) => {
    g.fillStyle = grey(h); g.beginPath(); g.moveTo(0, 1024); g.lineTo(0, base);
    for (const [x, y] of peaks) g.lineTo(x, y);
    g.lineTo(1024, base); g.lineTo(1024, 1024); g.closePath(); g.fill();
  };
  g.fillStyle = grey(1); g.beginPath(); g.arc(512, 300, 128, 0, Math.PI * 2); g.fill();
  g.fillStyle = grey(0.66);
  for (const [x, y, r] of [[200, 170, 9], [824, 170, 9], [300, 90, 6], [724, 90, 6], [120, 300, 6], [904, 300, 6], [400, 210, 5], [624, 210, 5]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  range(640, [[120, 470], [250, 560], [370, 420], [512, 560], [654, 420], [774, 560], [904, 470]], 0.33);
  range(760, [[90, 640], [230, 700], [380, 560], [512, 660], [644, 560], [794, 700], [934, 640]], 0.66);
  range(880, [[140, 790], [290, 840], [512, 720], [734, 840], [884, 790]], 1.0);
  return cv;
}

export function samplePaw() {
  const [cv, g] = mk(); g.translate(512, 540);
  dome(g, 0, 120, 230, 190, 0, 0.35, 1.0);
  for (const [x, y, rx, ry, r] of [[-265, -120, 92, 124, -0.35], [-100, -275, 98, 132, -0.1], [100, -275, 98, 132, 0.1], [265, -120, 92, 124, 0.35]]) dome(g, x, y, rx, ry, r, 0.35, 1.0);
  return cv;
}

// Badge seal: outer & inner rings with a flat lettering band between them, faceted star at the centre.
export function sampleSeal() {
  const [cv, g] = mk(); g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024); g.translate(512, 512);
  g.fillStyle = grey(0.1); g.beginPath(); g.arc(0, 0, 470, 0, Math.PI * 2); g.fill();          // lettering band
  ring(g, 482, 34, 0.62, 0.35);
  ring(g, 300, 24, 0.62, 0.35);
  dome(g, 0, 0, 290, 290, 0, 0.12, 0.3);                                                          // field inside the seal
  for (let i = 0; i < 5; i++) arm(g, i * Math.PI * 2 / 5, 250, Math.PI / 5, 100, 1, 0.34, 0.24);
  for (const s of [-1, 1]) { g.save(); g.translate(s * 385, 0); for (let i = 0; i < 5; i++) arm(g, i * Math.PI * 2 / 5, 30, Math.PI / 5, 12, 0.5, 0.3, 0.26); g.restore(); }
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; dome(g, 262 * Math.sin(a), -262 * Math.cos(a), 8, 8, 0, 0.3, 0.46); }
  return cv;
}

export const SAMPLES = {
  compass: ['Compass rose', sampleCompass], sunburst: ['Sunburst', sampleSunburst],
  peaks: ['Terraced peaks', samplePeaks], paw: ['Paw print', samplePaw], seal: ['Badge seal', sampleSeal],
};
