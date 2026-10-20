import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// One viewer for both the raw AI model (textured, as the Space made it) and the print-ready solid
// (clay or filament colour, standing on a print bed, Z up in mm).
export class Viewer {
  constructor(el) {
    this.el = el;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 10000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, autoRotateSpeed: 1.2 });
    this.key = new THREE.DirectionalLight(0xffffff, 2.2); this.key.castShadow = true;
    Object.assign(this.key.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 1500 });
    this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0003; this.key.shadow.normalBias = 0.02;
    this.rim = new THREE.DirectionalLight(0xbfd4ff, 1.1);
    this.fill = new THREE.HemisphereLight(0xfff4e8, 0x20242c, 0.35);
    this.scene.add(this.key, this.key.target, this.rim, this.fill);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.clay = new THREE.MeshStandardMaterial({ color: 0xc9c4bc, roughness: 0.62, metalness: 0.0 });
    this.wire = false;
    // print bed
    const bed = this.bed = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(256, 3, 256), new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.8, metalness: 0.2 }));
    plate.position.y = -1.51; plate.receiveShadow = true; bed.add(plate);
    const grid = new THREE.GridHelper(256, 16, 0x3a4a60, 0x26303e); grid.position.y = 0.02; bed.add(grid);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(256, 256), new THREE.ShadowMaterial({ opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; shadow.receiveShadow = true; bed.add(shadow);
    this.scene.add(bed);
    this.mode = 'raw';
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    const loop = () => { this.controls.update(); r.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }
  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  clear() { for (const c of [...this.root.children]) { this.root.remove(c); c.traverse?.((o) => { o.geometry?.dispose?.(); }); } }

  // Raw AI model: shown as delivered, scaled to ~120 mm and stood on the bed.
  async showGLB(blob) {
    const gltf = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '');
    this.clear();
    const g = gltf.scene;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.mat = o.material; if (this.wire) o.material.wireframe = true; } });
    const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = 120 / Math.max(size.y, 1e-6);
    const holder = new THREE.Group(); holder.add(g);
    g.position.set(-c.x, -box.min.y, -c.z); holder.scale.setScalar(s);
    this.root.add(holder); this.mode = 'raw';
    if (this.clayOn) this.setClay(true);
    this.frame(new THREE.Box3().setFromObject(holder));
    return gltf;
  }
  // Print-ready solid in printer coordinates (mm, Z up).
  // Print-ready solid in printer coordinates (mm, Z up). With labels + palette it is shown in its
  // filament colours, one colour per triangle, as the slicer will print it.
  showPrint(positions, indices, color, labels, palette) {
    this.clear();
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    let mat = this.clay;
    if (labels && palette) {
      const nF = indices.length / 3, nrm = geo.attributes.normal.array;
      const P = new Float32Array(nF * 9), N = new Float32Array(nF * 9), C = new Float32Array(nF * 9);
      const lin = palette.map((c) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear());
      for (let f = 0; f < nF; f++) {
        const col = lin[labels[f]] || lin[0];
        for (let k = 0; k < 3; k++) {
          const v = indices[f * 3 + k] * 3, o = f * 9 + k * 3;
          P[o] = positions[v]; P[o + 1] = positions[v + 1]; P[o + 2] = positions[v + 2];
          N[o] = nrm[v]; N[o + 1] = nrm[v + 1]; N[o + 2] = nrm[v + 2];
          C[o] = col.r; C[o + 1] = col.g; C[o + 2] = col.b;
        }
      }
      geo.dispose(); geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      mat = this.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
    } else if (color) this.clay.color.set(color);
    mat.wireframe = this.wire;
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
    m.rotation.x = -Math.PI / 2; // Z up -> Y up
    this.root.add(m); this.mode = 'print';
    if (!this.keepView) this.frame(new THREE.Box3().setFromObject(m));
  }
  // Raw model without its texture: shows the real geometry the AI made.
  setClay(on) {
    this.clayOn = on;
    if (this.mode !== 'raw') return;
    this.root.traverse((o) => { if (o.isMesh && o.userData.mat) { o.material = on ? this.clay : o.userData.mat; o.material.wireframe = this.wire; } });
  }
  setWire(on) { this.wire = on; this.root.traverse((o) => { if (o.isMesh) o.material.wireframe = on; }); }
  frame(box) {
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.5 || 50;
    const d = r / Math.sin((this.camera.fov * Math.PI / 180) / 2) * 1.05;
    this.controls.target.copy(c);
    this.camera.position.set(c.x + d * 0.35, c.y + d * 0.22, c.z + d * 0.92);
    this.camera.near = d / 100; this.camera.far = d * 20; this.camera.updateProjectionMatrix();
    this.key.position.set(c.x + r * 2, c.y + r * 4, c.z + r * 3); this.key.target.position.copy(c);
    this.rim.position.set(c.x - r * 3, c.y + r * 2, c.z - r * 3);
    this.controls.update();
  }
  snapshot(w = 320) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement, cv = document.createElement('canvas');
    cv.width = w; cv.height = Math.round(w * src.height / src.width);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85);
  }
}

// All triangles of a loaded glTF, in world space (glTF Y up), merged into one indexed mesh.
// All triangles of a loaded glTF, in world space (glTF Y up), merged into one indexed mesh, with an sRGB
// colour per vertex read from the base-colour texture (or vertex colours / material colour).
export function trianglesOf(gltf) {
  const parts = []; let nv = 0, ni = 0;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry, p = g.attributes.position, n = p.count;
    const P = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    const I = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    parts.push({ P, I, C: vertexColours(o, n), base: nv }); nv += n; ni += I.length;
  });
  const positions = new Float32Array(nv * 3), indices = new Uint32Array(ni), colors = new Uint8Array(nv * 3);
  let o = 0;
  for (const pt of parts) { positions.set(pt.P, pt.base * 3); colors.set(pt.C, pt.base * 3); for (let i = 0; i < pt.I.length; i++) indices[o++] = pt.I[i] + pt.base; }
  return { positions, indices, colors };
}
const texCache = new WeakMap();
function texPixels(tex) {
  if (texCache.has(tex)) return texCache.get(tex);
  const img = tex.image; let out = null;
  if (img && img.width) {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    out = { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data };
  }
  texCache.set(tex, out); return out;
}
function vertexColours(mesh, n) {
  const C = new Uint8Array(n * 3), mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, g = mesh.geometry;
  const base = mat?.color ? mat.color.clone().convertLinearToSRGB() : new THREE.Color(0.8, 0.8, 0.8);
  const uv = g.attributes.uv, tex = mat?.map ? texPixels(mat.map) : null, vc = g.attributes.color;
  for (let i = 0; i < n; i++) {
    let r = base.r, gg = base.g, b = base.b;
    if (tex && uv) {
      let u = uv.getX(i), w = uv.getY(i);
      u = u - Math.floor(u); w = w - Math.floor(w);
      if (mat.map.flipY) w = 1 - w;
      const x = Math.min(tex.w - 1, (u * tex.w) | 0), y = Math.min(tex.h - 1, (w * tex.h) | 0), k = (y * tex.w + x) * 4;
      r *= tex.d[k] / 255; gg *= tex.d[k + 1] / 255; b *= tex.d[k + 2] / 255;
    } else if (vc) { r *= vc.getX(i); gg *= vc.getY(i); b *= vc.getZ(i); }
    C[i * 3] = Math.round(r * 255); C[i * 3 + 1] = Math.round(gg * 255); C[i * 3 + 2] = Math.round(b * 255);
  }
  return C;
}
