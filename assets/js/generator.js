/* ============================================================
   HOTEND HQ — parametric model generator
   Builds printable geometry from sliders, previews it live, and
   exports a binary STL. All geometry is generated procedurally:
   extruded profiles with holes, plus primitives, merged into one
   watertight-enough mesh for slicing.
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------------- geometry helpers ---------------- */
const CURVE = 6;

/** Rounded rectangle centred on the origin. */
function roundedRect(w, d, r) {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
  const s = new THREE.Shape(), x = w / 2, y = d / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);  if (r) s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);   if (r) s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);  if (r) s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r); if (r) s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
function rectPath(w, d, r, cx = 0, cy = 0) {
  const s = roundedRect(w, d, r);
  const p = new THREE.Path(s.getPoints(CURVE * 4).map(pt => pt.clone().add(new THREE.Vector2(cx, cy))));
  return p;
}
/* Circles are emitted as an explicit 48-gon CIRCUMSCRIBING the nominal radius,
   so the polygon's narrowest measurement equals the diameter asked for rather
   than sitting 3-4% under it. (An arc left to ExtrudeGeometry's curveSegments
   is tessellated as a 12-gon inscribed in the circle — a Ø4.5 hole would come
   out 4.35 mm across the flats.) */
const HOLE_SEGS = 48;
function circlePath(rad, cx = 0, cy = 0) {
  const r = rad / Math.cos(Math.PI / HOLE_SEGS);
  const pts = [];
  for (let i = 0; i < HOLE_SEGS; i++) {
    const a = (i / HOLE_SEGS) * Math.PI * 2;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  pts.push(pts[0].clone());
  return new THREE.Path(pts);
}
/** Extrude a shape along +Z, then place it in world space. */
function solid(shape, depth, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: CURVE });
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g;
}
function cyl(rTop, rBot, h, x = 0, y = 0, z = 0, seg = 48) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg); g.translate(x, y, z); return g;
}
function tri(a, b, c, depth, opts) {
  const s = new THREE.Shape();
  s.moveTo(a[0], a[1]); s.lineTo(b[0], b[1]); s.lineTo(c[0], c[1]); s.closePath();
  return solid(s, depth, opts);
}

/* ============================================================
   MODELS
   Each returns { parts:[geometry], notes:[string] }
   Y is up in the preview; every model is built sitting on Y = 0
   the way it would sit on the build plate.
   ============================================================ */
const MODELS = {

/* ---------------- 1. BOX / ENCLOSURE ---------------- */
box: {
  label:'Storage box', icon:'cube',
  blurb:'A box with the wall thickness, corner radius, dividers, lid and mounting ears you actually want.',
  params:[
    {k:'w',   l:'Width',           min:20, max:250, step:1,   v:90,  u:'mm'},
    {k:'d',   l:'Depth',           min:20, max:250, step:1,   v:60,  u:'mm'},
    {k:'h',   l:'Height',          min:10, max:200, step:1,   v:40,  u:'mm'},
    {k:'wall',l:'Wall thickness',  min:0.8,max:5,   step:0.2, v:2,   u:'mm'},
    {k:'base',l:'Base thickness',  min:0.8,max:6,   step:0.2, v:2.4, u:'mm'},
    {k:'r',   l:'Corner radius',   min:0,  max:25,  step:0.5, v:4,   u:'mm'},
    {k:'dx',  l:'Dividers across', min:0,  max:6,   step:1,   v:0,   u:''},
    {k:'dy',  l:'Dividers deep',   min:0,  max:6,   step:1,   v:0,   u:''}
  ],
  toggles:[
    {k:'lid',  l:'Include a snap-on lid', v:false},
    {k:'ears', l:'Screw-down mounting ears', v:false}
  ],
  build(p){
    const parts = [], notes = [];
    const inW = p.w - 2*p.wall, inD = p.d - 2*p.wall;
    // walls: outer profile with the cavity as a hole
    const outer = roundedRect(p.w, p.d, p.r);
    outer.holes.push(rectPath(inW, inD, Math.max(0, p.r - p.wall)));
    parts.push(solid(outer, p.h - p.base, { rx:-Math.PI/2, y:p.base }));
    // base
    parts.push(solid(roundedRect(p.w, p.d, p.r), p.base, { rx:-Math.PI/2, y:0 }));
    // dividers
    const dh = p.h - p.base;
    for (let i = 1; i <= p.dx; i++)
      parts.push(box(p.wall, dh, inD, -p.w/2 + (p.w*i)/(p.dx+1), p.base + dh/2, 0));
    for (let i = 1; i <= p.dy; i++)
      parts.push(box(inW, dh, p.wall, 0, p.base + dh/2, -p.d/2 + (p.d*i)/(p.dy+1)));
    if (p.dx || p.dy) notes.push(`${(p.dx+1)*(p.dy+1)} compartments`);
    // mounting ears: tabs with screw holes on both short sides
    if (p.ears){
      const earL = 16, earW = Math.min(p.d * 0.6, 26), hole = 4.5;
      [-1, 1].forEach(sx => {
        const ear = roundedRect(earL, earW, 4);
        ear.holes.push(circlePath(hole/2, sx * 2, 0));
        parts.push(solid(ear, p.base, { rx:-Math.PI/2, x:sx * (p.w/2 + earL/2 - 2), y:0 }));
      });
      notes.push('Mounting ears take M4 screws');
    }
    // lid, laid out beside the box so both print in one job
    if (p.lid){
      const gap = 0.25, lipH = 4;
      const lidX = p.w + 8;
      parts.push(solid(roundedRect(p.w, p.d, p.r), p.base, { rx:-Math.PI/2, x:lidX, y:0 }));
      const lip = roundedRect(inW - gap*2, inD - gap*2, Math.max(0, p.r - p.wall));
      lip.holes.push(rectPath(inW - gap*2 - p.wall*2, inD - gap*2 - p.wall*2,
        Math.max(0, p.r - p.wall*2)));
      parts.push(solid(lip, lipH, { rx:-Math.PI/2, x:lidX, y:p.base }));
      notes.push(`Lid included, ${gap.toFixed(2)} mm clearance per side`);
    }
    notes.push(`Interior ${inW.toFixed(1)} × ${inD.toFixed(1)} × ${(p.h-p.base).toFixed(1)} mm`);
    return { parts, notes };
  }
},

/* ---------------- 2. SPOOL HOLDER ---------------- */
spool: {
  label:'Spool holder', icon:'filament',
  blurb:'Wall-mounted spool arm with a tapered hub. Set it to the bore of the spools you actually own.',
  params:[
    {k:'bore', l:'Spool bore Ø',     min:15, max:90, step:1,   v:52,  u:'mm'},
    {k:'arm',  l:'Hub length',       min:30, max:140,step:1,   v:80,  u:'mm'},
    {k:'plateW',l:'Plate width',     min:40, max:160,step:1,   v:80,  u:'mm'},
    {k:'plateH',l:'Plate height',    min:40, max:200,step:1,   v:90,  u:'mm'},
    {k:'plateT',l:'Plate thickness', min:2,  max:12, step:0.5, v:5,   u:'mm'},
    {k:'screw',l:'Screw hole Ø',     min:2,  max:10, step:0.5, v:4.5, u:'mm'},
    {k:'clear',l:'Bore clearance',   min:0,  max:3,  step:0.1, v:0.6, u:'mm'}
  ],
  toggles:[
    {k:'gusset', l:'Support gusset (much stronger)', v:true},
    {k:'flange', l:'End flange to stop the spool walking off', v:true}
  ],
  build(p){
    const parts = [], notes = [];
    const rHub = (p.bore - p.clear*2) / 2;
    // back plate, standing vertically, holes for screws
    const plate = roundedRect(p.plateW, p.plateH, 5);
    const inset = Math.max(9, p.screw*2);
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy]) =>
      plate.holes.push(circlePath(p.screw/2,
        sx*(p.plateW/2 - inset), sy*(p.plateH/2 - inset))));
    parts.push(solid(plate, p.plateT, { y:p.plateH/2, z:-p.plateT }));
    // hub: a tube, not a slug — far less filament and it prints without support.
    // Extruded along +Z straight out of the plate.
    const wallT = Math.min(4, Math.max(2, rHub * 0.18));
    const tube = new THREE.Shape();
    tube.absarc(0, 0, rHub, 0, Math.PI*2, false);
    tube.holes.push(circlePath(Math.max(1.5, rHub - wallT)));
    parts.push(solid(tube, p.arm, { y:p.plateH/2 }));
    // chamfered lead-in ring so the spool slides on easily
    parts.push(cyl(rHub - 1.2, rHub, 2.5)
      .rotateX(Math.PI/2).translate(0, p.plateH/2, p.arm - 1.25));
    if (p.flange){
      parts.push(cyl(rHub + 7, rHub + 7, 3)
        .rotateX(Math.PI/2).translate(0, p.plateH/2, p.arm + 1.5));
      notes.push('End flange keeps the spool from walking off');
    }
    if (p.gusset){
      const reach = Math.min(p.arm * 0.6, p.plateH/2 - 4);
      const drop  = Math.min(p.plateH/2 - 6, reach * 1.2);
      const gw = 6;
      // triangle in the vertical plane under the hub: shape x -> +Z, shape y -> +Y
      parts.push(tri([0,0], [reach,0], [0,-drop], gw)
        .rotateY(-Math.PI/2).translate(gw/2, p.plateH/2, 0));
      notes.push('Gusset adds a large amount of cantilever stiffness');
    }
    notes.push(`Fits a ${p.bore} mm bore with ${p.clear} mm clearance per side`);
    notes.push(`Hollow hub, ${wallT.toFixed(1)} mm wall`);
    notes.push('Print plate-down; no supports needed');
    return { parts, notes };
  }
},

/* ---------------- 3. L BRACKET ---------------- */
bracket: {
  label:'Wall bracket', icon:'wrench',
  blurb:'A proper L-bracket: two plates, counterbored screw holes and an optional gusset.',
  params:[
    {k:'a',    l:'Vertical leg',   min:20, max:160, step:1,   v:60, u:'mm'},
    {k:'b',    l:'Horizontal leg', min:20, max:160, step:1,   v:60, u:'mm'},
    {k:'w',    l:'Width',          min:10, max:120, step:1,   v:30, u:'mm'},
    {k:'t',    l:'Thickness',      min:2,  max:14,  step:0.5, v:5,  u:'mm'},
    {k:'screw',l:'Screw hole Ø',   min:2,  max:12,  step:0.5, v:4.5,u:'mm'},
    {k:'holes',l:'Holes per leg',  min:1,  max:4,   step:1,   v:2,  u:''}
  ],
  toggles:[{k:'gusset', l:'Triangular gusset', v:true}],
  build(p){
    const parts = [], notes = [];
    const holePlate = (len, wid) => {
      const s = roundedRect(len, wid, Math.min(5, wid/2 - 0.5));
      const margin = Math.max(p.screw + 3, 8);
      for (let i = 0; i < p.holes; i++){
        const x = p.holes === 1 ? 0
          : -len/2 + margin + i * ((len - margin*2) / (p.holes - 1));
        s.holes.push(circlePath(p.screw/2, x, 0));
      }
      return s;
    };
    // horizontal leg: lies flat, length along +X, width along Z, thickness Y 0..t
    parts.push(solid(holePlate(p.b, p.w), p.t, { rx:-Math.PI/2, x:p.b/2, y:0 }));
    // vertical leg: stands at x = 0, length along +Y, width along Z, thickness X 0..t
    {
      const g = new THREE.ExtrudeGeometry(holePlate(p.a, p.w),
        { depth:p.t, bevelEnabled:false, curveSegments:CURVE });
      g.rotateZ(Math.PI/2); g.rotateY(Math.PI/2); g.translate(0, p.a/2, 0);
      parts.push(g);
    }
    if (p.gusset){
      const g = Math.min(p.a, p.b) * 0.62;
      const gw = Math.min(Math.max(3, p.t), p.w);
      // triangle in the X-Y plane filling the inner corner, centred across the width
      parts.push(tri([p.t,p.t], [g,p.t], [p.t,g], gw).translate(0, 0, -gw/2));
      notes.push('Gusset roughly triples load capacity at the corner');
    }
    notes.push('Print standing on the horizontal leg — the corner is self-supporting');
    notes.push(`${p.holes} hole${p.holes>1?'s':''} per leg for M${Math.round(p.screw-0.5)} hardware`);
    return { parts, notes };
  }
},

/* ---------------- 4. HONEYCOMB / GRID TRAY ---------------- */
tray: {
  label:'Grid organiser', icon:'calc',
  blurb:'Drawer tray with a cell grid. Set the cell size to whatever you are actually storing.',
  params:[
    {k:'cols', l:'Columns',        min:1,  max:12,  step:1,   v:4,  u:''},
    {k:'rows', l:'Rows',           min:1,  max:12,  step:1,   v:3,  u:''},
    {k:'cell', l:'Cell size',      min:10, max:80,  step:1,   v:28, u:'mm'},
    {k:'h',    l:'Cell depth',     min:5,  max:90,  step:1,   v:28, u:'mm'},
    {k:'wall', l:'Wall thickness', min:0.8,max:4,   step:0.2, v:1.6,u:'mm'},
    {k:'base', l:'Base thickness', min:0.8,max:5,   step:0.2, v:1.6,u:'mm'},
    {k:'r',    l:'Cell radius',    min:0,  max:12,  step:0.5, v:2,  u:'mm'}
  ],
  toggles:[
    {k:'skirt', l:'Outer skirt wall (a tray, not just dividers)', v:true},
    {k:'feet',  l:'Stacking feet', v:false}
  ],
  build(p){
    const parts = [], notes = [];
    const pitch = p.cell + p.wall;
    const W = p.cols * pitch + p.wall, D = p.rows * pitch + p.wall;
    // one extruded slab with a hole per cell = all the walls at once
    const outer = roundedRect(W, D, p.skirt ? p.r + p.wall : p.r);
    for (let c = 0; c < p.cols; c++)
      for (let r = 0; r < p.rows; r++){
        const cx = -W/2 + p.wall + pitch*c + p.cell/2;
        const cy = -D/2 + p.wall + pitch*r + p.cell/2;
        outer.holes.push(rectPath(p.cell, p.cell, p.r, cx, cy));
      }
    parts.push(solid(outer, p.h, { rx:-Math.PI/2, y:p.base }));
    parts.push(solid(roundedRect(W, D, p.r + p.wall), p.base, { rx:-Math.PI/2, y:0 }));
    if (p.feet){
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy]) =>
        parts.push(cyl(3, 3.4, 3, sx*(W/2 - 7), -1.5, sy*(D/2 - 7))));
      notes.push('Feet let trays stack without sliding');
    }
    notes.push(`${p.cols*p.rows} cells of ${p.cell} × ${p.cell} × ${p.h} mm`);
    notes.push(`Overall footprint ${W.toFixed(1)} × ${D.toFixed(1)} mm`);
    if (W > 250 || D > 250) notes.push('Warning: larger than a 250 mm bed');
    return { parts, notes };
  }
},

/* ---------------- 5. CABLE CLIP ---------------- */
clip: {
  label:'Cable clip', icon:'bolt',
  blurb:'Screw-down C-clip. Set it to the bundle you are routing and print a dozen.',
  params:[
    {k:'dia',  l:'Cable / bundle Ø', min:2,  max:40, step:0.5, v:8,   u:'mm'},
    {k:'w',    l:'Clip width',       min:4,  max:40, step:1,   v:10,  u:'mm'},
    {k:'t',    l:'Wall thickness',   min:1,  max:6,  step:0.2, v:2.2, u:'mm'},
    {k:'open', l:'Opening angle',    min:30, max:170,step:5,   v:90,  u:'°'},
    {k:'screw',l:'Screw hole Ø',     min:2,  max:8,  step:0.5, v:4,   u:'mm'},
    {k:'foot', l:'Foot length',      min:8,  max:50, step:1,   v:18,  u:'mm'},
    {k:'count',l:'Clips in the set', min:1,  max:8,  step:1,   v:3,   u:''}
  ],
  toggles:[{k:'chamfer', l:'Flared lead-in lips', v:true}],
  build(p){
    const parts = [], notes = [];
    const rIn = p.dia/2, rOut = rIn + p.t;
    const half = THREE.MathUtils.degToRad(p.open) / 2;
    const footT = Math.max(2, p.t);

    const footLen = rOut*2 + p.foot;
    const pitch = footLen + 6;
    const cy = footT + rOut;                     // centre height of the ring
    for (let n = 0; n < p.count; n++){
      const ox = (n - (p.count-1)/2) * pitch;
      // foot plate: flat on the bed, screw hole out at the free end
      const foot = roundedRect(footLen, p.w, Math.min(3, p.w/2 - 0.5));
      foot.holes.push(circlePath(p.screw/2, footLen/2 - Math.max(p.screw, 4) * 1.1, 0));
      parts.push(solid(foot, footT, { rx:-Math.PI/2, x:ox + footLen/2 - rOut, y:0 }));
      // C ring, gap centred straight up so the cable presses in from above
      const sh = new THREE.Shape();
      const a0 = Math.PI/2 + half, a1 = Math.PI/2 + 2*Math.PI - half;
      sh.absarc(0, 0, rOut, a0, a1, false);
      sh.absarc(0, 0, rIn,  a1, a0, true);
      sh.closePath();
      parts.push(solid(sh, p.w, { x:ox, y:cy, z:-p.w/2 }));
      // blend the ring into the foot so the joint is not a tangent line
      parts.push(box(rOut*1.5, footT + p.t, p.w, ox, (footT + p.t)/2, 0));
      if (p.chamfer){
        [a0, a1].forEach(a =>
          parts.push(cyl(p.t*0.62, p.t*0.62, p.w)
            .rotateX(Math.PI/2)
            .translate(ox + Math.cos(a)*(rIn + p.t/2), cy + Math.sin(a)*(rIn + p.t/2), 0)));
      }
    }
    notes.push(`${p.count} clip${p.count>1?'s':''} for ${p.dia} mm cable`);
    notes.push(`Mouth ${(2*rIn*Math.sin(half)).toFixed(1)} mm wide — the cable presses in from above`);
    notes.push('Print as laid out; no supports');
    return { parts, notes };
  }
}
};

/* ============================================================
   VIEWER
   ============================================================ */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0x9fd4ff, 0x04122b, 1.15));
const key = new THREE.DirectionalLight(0xffd3a0, 1.5); key.position.set(120, 220, 160); scene.add(key);
const rim = new THREE.DirectionalLight(0x3aa0ff, 0.9);  rim.position.set(-160, 90, -140); scene.add(rim);

const grid = new THREE.GridHelper(400, 40, 0x1b6bb0, 0x0d3358);
grid.material.transparent = true; grid.material.opacity = 0.55; scene.add(grid);

const material = new THREE.MeshStandardMaterial({
  color:0xf3662e, metalness:0.25, roughness:0.42, flatShading:false });
let mesh = null, currentGeo = null;

function resize(){
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

(function loop(){ requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

/* Material volume in mm³.

   These models are a set of closed shells that interpenetrate — there is no
   boolean union step — so simply summing signed tetrahedron volumes counts
   overlapping material twice (up to ~36% high on the cable clip). Instead we
   do what a slicer does: cast a grid of rays through the mesh along +Z and
   count depth, so a region inside two shells at once is still counted once.
   ~0.5% of the true volume at this grid density, and a few milliseconds. */
function volumeOf(geo, targetRays = 20000){
  const pos = geo.getAttribute('position');
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const spanX = bb.max.x - bb.min.x, spanY = bb.max.y - bb.min.y;
  if (spanX <= 0 || spanY <= 0) return 0;

  // square-ish grid of rays covering the XY footprint
  const step = Math.sqrt((spanX * spanY) / targetRays);
  const nx = Math.max(2, Math.ceil(spanX / step));
  const ny = Math.max(2, Math.ceil(spanY / step));
  const dx = spanX / nx, dy = spanY / ny;
  const x0 = bb.min.x, y0 = bb.min.y;
  // Each ray is jittered inside its own cell. A rigid grid lines up with the
  // model's own pitch (wall spacing, hole spacing) and biases the result;
  // stratified jitter removes that and leaves only ordinary sampling noise.
  const jx = (i, j) => { const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return 0.15 + 0.7 * (h - Math.floor(h)); };
  const jy = (i, j) => { const h = Math.sin(i * 39.3467 + j * 11.1357) * 24634.6345; return 0.15 + 0.7 * (h - Math.floor(h)); };

  const cells = new Array(nx * ny);
  const arr = pos.array;

  for (let t = 0; t < pos.count; t += 3){
    const i = t * 3;
    const ax = arr[i],   ay = arr[i+1],   az = arr[i+2];
    const bx = arr[i+3], by = arr[i+4],   bz = arr[i+5];
    const cx = arr[i+6], cy = arr[i+7],   cz = arr[i+8];

    // facet orientation along +Z: <0 enters the solid, >0 leaves it
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (nz === 0) continue;                       // edge-on, contributes nothing
    const enter = nz < 0 ? 1 : -1;

    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
    // conservative cell range — the jitter can push a ray either way inside its cell
    let i0 = Math.floor((minX - x0) / dx) - 1, i1 = Math.ceil((maxX - x0) / dx);
    let j0 = Math.floor((minY - y0) / dy) - 1, j1 = Math.ceil((maxY - y0) / dy);
    if (i0 < 0) i0 = 0; if (i1 >= nx) i1 = nx - 1;
    if (j0 < 0) j0 = 0; if (j1 >= ny) j1 = ny - 1;

    const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay;
    const den = v0x * v1y - v1x * v0y;
    if (den === 0) continue;

    for (let gi = i0; gi <= i1; gi++){
      for (let gj = j0; gj <= j1; gj++){
        const px = x0 + (gi + jx(gi, gj)) * dx;
        const py = y0 + (gj + jy(gi, gj)) * dy;
        if (px < minX || px > maxX || py < minY || py > maxY) continue;
        const p0x = px - ax, p0y = py - ay;
        const u = (p0x * v1y - v1x * p0y) / den;
        if (u < 0 || u > 1) continue;
        const v = (v0x * p0y - p0x * v0y) / den;
        if (v < 0 || u + v > 1) continue;
        const z = az + u * (bz - az) + v * (cz - az);
        const k = gj * nx + gi;
        (cells[k] || (cells[k] = [])).push(z, enter);
      }
    }
  }

  let length = 0;
  for (let k = 0; k < cells.length; k++){
    const c = cells[k];
    if (!c || c.length < 4) continue;
    const n = c.length / 2;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((p, q) => c[p*2] - c[q*2]);
    let depth = 0, last = 0;
    for (let i = 0; i < n; i++){
      const z = c[idx[i]*2], e = c[idx[i]*2 + 1];
      if (depth > 0) length += z - last;
      depth += e;
      if (depth < 0) depth = 0;
      last = z;
    }
  }
  return length * dx * dy;
}

/* ============================================================
   UI
   ============================================================ */
/* A page for one model sets <body data-model="…">; the picker is then hidden. */
const LOCK = MODELS[document.body.dataset.model] ? document.body.dataset.model : null;
let modelKey = LOCK || new URLSearchParams(location.search).get('m') || 'box';
if (!MODELS[modelKey]) modelKey = 'box';
let state = {};

const $ = s => document.querySelector(s);

function paramsUI(){
  const m = MODELS[modelKey];
  state = {};
  m.params.forEach(p => state[p.k] = p.v);
  (m.toggles||[]).forEach(t => state[t.k] = t.v);

  // a shared link can carry a full configuration
  const q = new URLSearchParams(location.search);
  for (const k of Object.keys(state)) {
    if (!q.has(k)) continue;
    const raw = q.get(k);
    state[k] = (typeof state[k] === 'boolean') ? raw === '1' : parseFloat(raw);
    if (Number.isNaN(state[k])) state[k] = m.params.find(p => p.k === k)?.v ?? state[k];
  }

  if ($('#gen-title')) $('#gen-title').textContent = m.label;
  if ($('#gen-blurb')) $('#gen-blurb').textContent = m.blurb;
  $('#controls').innerHTML =
    m.params.map(p => `
      <div class="slider-row">
        <div class="between"><label for="c-${p.k}">${p.l}</label>
          <output id="o-${p.k}">${state[p.k]}${p.u}</output></div>
        <input type="range" id="c-${p.k}" data-k="${p.k}" data-u="${p.u}"
               min="${p.min}" max="${p.max}" step="${p.step}" value="${state[p.k]}">
      </div>`).join('') +
    (m.toggles||[]).map(t => `
      <div class="toggle-row">
        <input type="checkbox" id="t-${t.k}" data-t="${t.k}" ${state[t.k] ? 'checked':''}>
        <label for="t-${t.k}">${t.l}</label>
      </div>`).join('');

}
$('#controls').addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.k){
      state[el.dataset.k] = parseFloat(el.value);
      document.getElementById('o-' + el.dataset.k).textContent = el.value + el.dataset.u;
    } else if (el.dataset.t){
      state[el.dataset.t] = el.checked;
    }
    rebuild();
});

function rebuild(){
  const m = MODELS[modelKey];
  let out;
  try { out = m.build({ ...state }); }
  catch (err){ console.error(err); HHQ.toast('That combination will not build — try smaller values.','warn'); return; }

  const geos = out.parts.filter(Boolean).map(g => {
    const c = g.clone(); c.deleteAttribute('uv'); c.deleteAttribute('normal');
    return c.toNonIndexed();
  });
  const merged = mergeGeometries(geos, false);
  merged.computeVertexNormals();
  merged.computeBoundingBox();

  if (mesh) { scene.remove(mesh); currentGeo.dispose(); }
  currentGeo = merged;
  mesh = new THREE.Mesh(merged, material);
  scene.add(mesh);

  const bb = merged.boundingBox, size = new THREE.Vector3();
  bb.getSize(size);
  const ctr = new THREE.Vector3(); bb.getCenter(ctr);
  controls.target.copy(ctr);
  const fit = Math.max(size.x, size.y, size.z) * 1.9 + 30;
  camera.position.set(ctr.x + fit*0.75, ctr.y + fit*0.6, ctr.z + fit*0.85);
  camera.far = fit * 12; camera.updateProjectionMatrix();
  grid.position.set(ctr.x, 0, ctr.z);

  $('#readout').innerHTML =
    `${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm` +
    `<br><span id="vol" style="opacity:.6">measuring volume…</span>`;
  scheduleVolume(merged);

  $('#notes').innerHTML = out.notes.map(n =>
    `<li>${HHQ.esc(n)}</li>`).join('');
  resize();
}

/* Measuring the volume costs a few hundred rays' worth of work, so it runs once
   the sliders settle rather than on every pixel of a drag. */
let volTimer = null;
function scheduleVolume(geo){
  clearTimeout(volTimer);
  volTimer = setTimeout(() => {
    const el = document.getElementById('vol');
    if (!el || geo !== currentGeo) return;
    const vol = volumeOf(geo) / 1000;                  // cm³ of solid material
    const grams = vol * 1.24;                          // PLA
    const metres = (vol * 1000) / (Math.PI * 0.875 * 0.875) / 1000;
    el.style.opacity = '1';
    el.innerHTML = `${vol.toFixed(1)} cm³ · ${grams.toFixed(1)} g PLA · ${metres.toFixed(1)} m` +
      `<br><span style="opacity:.6">solid material, before infill</span>`;
  }, 150);
}

function pickerUI(){
  if (LOCK || !$('#picker')) return;
  $('#picker').innerHTML = Object.entries(MODELS).map(([k,m]) =>
    `<button data-m="${k}" aria-pressed="${k===modelKey}">${icon(m.icon)}<span>${m.label}</span></button>`).join('');
  $('#picker').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    modelKey = b.dataset.m;
    history.replaceState(null,'', location.pathname + '?m=' + modelKey);
    HHQ.els('#picker button').forEach(x =>
      x.setAttribute('aria-pressed', String(x.dataset.m === modelKey)));
    paramsUI(); rebuild();
  });
}

/* ---------------- export ---------------- */
$('#dl').addEventListener('click', () => {
  if (!mesh) return;
  const data = new STLExporter().parse(mesh, { binary:true });
  const blob = new Blob([data], { type:'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `hotendhq-${modelKey}-${Date.now().toString(36)}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  HHQ.toast('STL downloaded — slice it and go.');
});

$('#share-cfg').addEventListener('click', async () => {
  const q = new URLSearchParams(LOCK ? {} : { m: modelKey });
  for (const [k,v] of Object.entries(state)) q.set(k, typeof v === 'boolean' ? (v?'1':'0') : v);
  const url = location.origin + location.pathname + '?' + q;
  try { await navigator.clipboard.writeText(url); HHQ.toast('Configuration link copied.'); }
  catch { HHQ.toast('Could not copy — check clipboard permissions.','warn'); }
});

$('#reset').addEventListener('click', () => {
  history.replaceState(null,'', location.pathname + (LOCK ? '' : '?m=' + modelKey));
  paramsUI(); rebuild();
});

pickerUI(); paramsUI(); rebuild(); resize();
