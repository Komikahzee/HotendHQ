/* ============================================================
   HOTEND HQ — SVG tracer: object layers
   Turns the objects picked on the image into a layer number for every pixel of the trace.
   An object is either a mask from the object finder (sam-worker.js) or a single shape: the
   connected area of one colour under the tap, bridging thin gaps such as tile grout.
   The finder's mask is soft and coarse, so it is snapped to the trace: a shape that lies
   mostly inside the mask joins the layer whole, one mostly outside stays out, and only a
   shape that really straddles the mask's edge (one colour running behind two objects) is cut.
   Later objects win, so a letter picked after its sign comes out of the sign's layer.
   ============================================================ */
import { TRANSPARENT } from './prep.js?v=469c7cc377';

const IN = 0.8, OUT = 0.2;          // share of a shape inside the mask that takes it whole / leaves it out

// connected areas of one label (4-connected, the same split the vectorizer uses)
export function components(lbl, W, H) {
  const n = W * H, comp = new Int32Array(n).fill(-1), area = [], stack = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    if (comp[p] >= 0) continue;
    const id = area.length, l = lbl[p];
    let sp = 0, a = 0; stack[sp++] = p; comp[p] = id;
    while (sp) {
      const i = stack[--sp]; a++;
      const x = i % W;
      if (x > 0 && comp[i - 1] < 0 && lbl[i - 1] === l) { comp[i - 1] = id; stack[sp++] = i - 1; }
      if (x < W - 1 && comp[i + 1] < 0 && lbl[i + 1] === l) { comp[i + 1] = id; stack[sp++] = i + 1; }
      if (i >= W && comp[i - W] < 0 && lbl[i - W] === l) { comp[i - W] = id; stack[sp++] = i - W; }
      if (i < n - W && comp[i + W] < 0 && lbl[i + W] === l) { comp[i + W] = id; stack[sp++] = i + W; }
    }
    area.push(a);
  }
  return { comp, area };
}

// the finder's mask (0..255, mw × mh over the whole image) sampled at work pixel i, bilinear
function sampler(o, W, H) {
  const { w: mw, h: mh, data } = o, kx = mw / W, ky = mh / H;
  return (i) => {
    const x = Math.min(mw - 1, Math.max(0, ((i % W) + 0.5) * kx - 0.5)), y = Math.min(mh - 1, Math.max(0, (((i / W) | 0) + 0.5) * ky - 0.5));
    const x0 = x | 0, y0 = y | 0, x1 = Math.min(mw - 1, x0 + 1), y1 = Math.min(mh - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const a = data[y0 * mw + x0] * (1 - fx) + data[y0 * mw + x1] * fx, b = data[y1 * mw + x0] * (1 - fx) + data[y1 * mw + x1] * fx;
    return a * (1 - fy) + b * fy;
  };
}

// one colour's connected area around the seed, stepping over gaps up to r px wide of other colours
// (inside: optional test that keeps the search within the object the shape belongs to, so a colour that
// runs all over the image, like a dark outline, never floods past it)
export function shapeAt(lbl, W, H, seed, r, inside) {
  const n = W * H, L = lbl[seed], out = new Uint8Array(n);
  if (L === TRANSPARENT) return out;
  // pixels within r of label L (square neighbourhood, separable)
  let near = new Uint8Array(n);
  for (let i = 0; i < n; i++) near[i] = lbl[i] === L && (!inside || inside(i)) ? 1 : 0;
  if (r > 0) {
    const tmp = new Uint8Array(n);
    for (let y = 0; y < H; y++) {
      let last = -1e9;
      const row = y * W;
      for (let x = 0; x < W; x++) { if (near[row + x]) last = x; if (x - last <= r) tmp[row + x] = 1; }
      last = 1e9;
      for (let x = W - 1; x >= 0; x--) { if (near[row + x]) last = x; if (last - x <= r) tmp[row + x] = 1; }
    }
    const tmp2 = new Uint8Array(n);
    for (let x = 0; x < W; x++) {
      let last = -1e9;
      for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) tmp2[y * W + x] = 1; }
      last = 1e9;
      for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) tmp2[y * W + x] = 1; }
    }
    near = tmp2;
  }
  const stack = new Int32Array(n), seen = new Uint8Array(n);
  let sp = 0; stack[sp++] = seed; seen[seed] = 1;
  while (sp) {
    const i = stack[--sp];
    if (lbl[i] === L) out[i] = 1;
    const x = i % W;
    if (x > 0 && !seen[i - 1] && near[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
    if (x < W - 1 && !seen[i + 1] && near[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
    if (i >= W && !seen[i - W] && near[i - W]) { seen[i - W] = 1; stack[sp++] = i - W; }
    if (i < n - W && !seen[i + W] && near[i + W]) { seen[i + W] = 1; stack[sp++] = i + W; }
  }
  return out;
}

/**
 * Layer number (0 = everything else, k = objs[k - 1]) for every work pixel.
 * lbl: the trace's labels (colours, or Detailed mode's regions), W × H work px of a w × h image.
 * objs: [{ kind: 'mask', w, h, data } | { kind: 'shape', x, y (image px), within: the whole object's mask }]
 * o: { s (work px per image px), regions (true: lbl holds small regions, so each joins whole by majority) }
 */
export function objectMap(lbl, W, H, w, h, objs, o = {}) {
  const n = W * H, map = new Uint8Array(n);
  if (!objs || !objs.length) return map;
  let cc = null;
  const comps = () => (cc ||= components(lbl, W, H));
  objs.forEach((ob, k) => {
    const id = k + 1;
    if (ob.kind === 'shape') {
      if (o.regions) return;
      const x = Math.min(W - 1, Math.max(0, Math.floor(ob.x * W / w))), y = Math.min(H - 1, Math.max(0, Math.floor(ob.y * H / h)));
      const within = ob.within && sampler(ob.within, W, H);
      const m = shapeAt(lbl, W, H, y * W + x, Math.max(2, Math.round(3 * (o.s || 1))), within && ((i) => within(i) > 64));
      for (let i = 0; i < n; i++) if (m[i]) map[i] = id;
      return;
    }
    const at = sampler(ob, W, H), { comp, area } = comps();
    const inside = new Uint8Array(n), cnt = new Float64Array(area.length);
    let total = 0;
    for (let i = 0; i < n; i++) if (at(i) > 127) { inside[i] = 1; cnt[comp[i]]++; total++; }
    // a shape that only grazes the mask's soft edge stays out; one colour that runs from the object out into
    // the rest of the image (a dark jacket into a dark night) is cut along the mask
    const graze = Math.max(4, total * 0.002);
    for (let i = 0; i < n; i++) {
      if (lbl[i] === TRANSPARENT && !o.regions) continue;
      const c = comp[i], f = cnt[c] / area[c];
      if (o.regions ? f >= 0.5 : (f >= IN || (inside[i] && (f > OUT || cnt[c] > graze)))) map[i] = id;
    }
  });
  return map;
}

// how many work pixels each layer holds (index 0 = everything else)
export function layerAreas(map, count) {
  const a = new Array(count + 1).fill(0);
  for (let i = 0; i < map.length; i++) a[map[i]]++;
  return a;
}
