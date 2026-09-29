import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Per-corner normals that only average faces within the crease angle. Uses a CSR vertex→face table,
// roughly 10× faster than hashing positions. Returns non-indexed arrays.
function creasedArrays(P, I, T, cosA) {
  const nf = I.length / 3, nv = P.length / 3;
  const fn = new Float32Array(nf * 3), fu = new Float32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    fn[f * 3] = nx; fn[f * 3 + 1] = ny; fn[f * 3 + 2] = nz;
    fu[f * 3] = nx / l; fu[f * 3 + 1] = ny / l; fu[f * 3 + 2] = nz / l;
  }
  const start = new Uint32Array(nv + 1);
  for (let k = 0; k < I.length; k++) start[I[k] + 1]++;
  for (let v = 0; v < nv; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nv), adj = new Uint32Array(I.length);
  for (let k = 0; k < I.length; k++) adj[fill[I[k]]++] = (k / 3) | 0;
  const pos = new Float32Array(nf * 9), nor = new Float32Array(nf * 9), th = new Float32Array(nf * 3);
  for (let f = 0; f < nf; f++) {
    const fx = fu[f * 3], fy = fu[f * 3 + 1], fz = fu[f * 3 + 2];
    for (let c = 0; c < 3; c++) {
      const v = I[f * 3 + c], o = (f * 3 + c) * 3;
      pos[o] = P[v * 3]; pos[o + 1] = P[v * 3 + 1]; pos[o + 2] = P[v * 3 + 2]; th[f * 3 + c] = T[v];
      let sx = 0, sy = 0, sz = 0;
      for (let q = start[v]; q < start[v + 1]; q++) {
        const g = adj[q];
        if (fx * fu[g * 3] + fy * fu[g * 3 + 1] + fz * fu[g * 3 + 2] >= cosA) { sx += fn[g * 3]; sy += fn[g * 3 + 1]; sz += fn[g * 3 + 2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      nor[o] = sx / l; nor[o + 1] = sy / l; nor[o + 2] = sz / l;
    }
  }
  return { pos, nor, th };
}

const MATERIALS = {
  matte: { roughness: 0.62, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.6, sheen: 0.25, sheenRoughness: 0.8, transmission: 0, emissiveIntensity: 0 },
  silk: { roughness: 0.3, metalness: 0.62, clearcoat: 0.35, clearcoatRoughness: 0.25, sheen: 0.6, sheenRoughness: 0.35, transmission: 0, emissiveIntensity: 0 },
  glossy: { roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0, sheenRoughness: 0.5, transmission: 0, emissiveIntensity: 0 },
  metal: { roughness: 0.24, metalness: 1, clearcoat: 0.2, clearcoatRoughness: 0.3, sheen: 0, sheenRoughness: 0.5, transmission: 0, emissiveIntensity: 0 },
  translucent: { roughness: 0.4, metalness: 0, clearcoat: 0.2, clearcoatRoughness: 0.3, sheen: 0, sheenRoughness: 0.5, transmission: 0.55, emissiveIntensity: 0 },
  glow: { roughness: 0.55, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.5, sheen: 0, sheenRoughness: 0.5, transmission: 0, emissiveIntensity: 0.9 },
};

const VIEWS = {
  standing: { front: [0, 0.02, 1], iso: [0.62, 0.32, 0.72], side: [1, 0.08, 0.02], back: [0, 0.02, -1], top: [0, 1, 0.02] },
  bed: { front: [0, 1, 0.02], iso: [0.55, 0.62, 0.62], side: [1, 0.25, 0], back: [0, -1, 0.02], top: [0, 1, 0.001] },
};

function peiTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
  const g = cv.getContext('2d');
  g.fillStyle = '#23252b'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 90000; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.02 + Math.random() * 0.04})` : `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 1.6, 1.6);
  }
  g.strokeStyle = 'rgba(255,160,80,0.10)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 1024; i += 1024 / 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
  g.fillStyle = 'rgba(255,150,70,0.16)'; g.font = '600 34px Inter, sans-serif'; g.textAlign = 'right';
  g.fillText('HOTENDHQ  ·  256 × 256', 1000, 1004);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class Viewer {
  constructor(el) {
    this.el = el;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.9;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 8000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.08, autoRotateSpeed: 1.6, minDistance: 8, maxDistance: 2000 });

    this.hemi = new THREE.HemisphereLight(0xfff4e8, 0x1a1c22, 0.35);
    this.key = new THREE.DirectionalLight(0xffffff, 2.4);
    this.key.castShadow = true;
    Object.assign(this.key.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 1, far: 800 });
    this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03;
    this.rim = new THREE.DirectionalLight(0xffc38a, 1.3);
    this.fill = new THREE.DirectionalLight(0x9fb7ff, 0.35);
    this.scene.add(this.hemi, this.key, this.key.target, this.rim, this.fill);

    this.uni = {
      uBandsOn: { value: 0 }, uBandCount: { value: 1 }, uBandZ: { value: new Float32Array(6) },
      uBandCol: { value: Array.from({ length: 6 }, () => new THREE.Color()) },
      uLayerOn: { value: 0 }, uLayerH: { value: 0.16 }, uFirstLayer: { value: 0.2 },
      uBacklit: { value: 0 }, uLitColor: { value: new THREE.Color(1, 0.86, 0.66) }, uLitK: { value: 1.75 },
    };
    this.mat = new THREE.MeshPhysicalMaterial({ color: 0xd4a017, side: THREE.FrontSide, ior: 1.45, thickness: 2 });
    this.mat.onBeforeCompile = (sh) => this._inject(sh, this.uni);
    // connector bail: same shader features, but never colour-banded
    this.uni2 = { ...this.uni, uBandsOn: { value: 0 } };
    this.mat2 = new THREE.MeshPhysicalMaterial({ color: 0xd4a017, ior: 1.45, thickness: 2 });
    this.mat2.onBeforeCompile = (sh) => this._inject(sh, this.uni2);

    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.geom = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geom, this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh2 = new THREE.Mesh(new THREE.BufferGeometry(), this.mat2);
    this.mesh2.castShadow = true; this.mesh2.receiveShadow = true; this.mesh2.visible = false;
    this.pivot.add(this.mesh, this.mesh2);

    this.shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.shadowPlane.rotation.x = -Math.PI / 2; this.shadowPlane.receiveShadow = true;
    this.scene.add(this.shadowPlane);

    this.bed = new THREE.Mesh(new THREE.BoxGeometry(256, 4, 256), [
      new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ map: peiTexture(), roughness: 0.75, metalness: 0.15 }),
      new THREE.MeshStandardMaterial({ color: 0x15161a }),
      new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.4 }),
      new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.4 }),
    ]);
    this.bed.position.y = -2.01; this.bed.receiveShadow = true;
    this.scene.add(this.bed);

    this.chain = new THREE.Group(); this.scene.add(this.chain);
    this.chainMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dce2, metalness: 1, roughness: 0.22, clearcoat: 0.3 });
    this.ring = new THREE.Mesh(new THREE.BufferGeometry(), this.chainMat); // jump ring
    this.ring.castShadow = true; this.ring.visible = false; this.pivot.add(this.ring);

    this.state = { view: 'standing', look: null, chain: false, backlit: false };
    this.pend = null; this.conn = null; this._anchor = null;
    this._firstFit = true;

    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    // Render on demand: only while the camera moves, the turntable spins or something just changed.
    // An idle scene costs nothing, which keeps phones cool and batteries full.
    this.controls.addEventListener('change', () => this.wake());
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) el.addEventListener(ev, () => this.wake(), { passive: true });
    this.wake(2500);
    const loop = () => {
      requestAnimationFrame(loop);
      const moved = this.controls.update();
      if (moved || this.controls.autoRotate || performance.now() < this._wakeUntil) this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  _inject(sh, uni) {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float thick;\nvarying float vZ;\nvarying float vThick;\nvarying vec3 vUpV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZ = position.z; vThick = thick; vUpV = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vZ; varying float vThick; varying vec3 vUpV;
        uniform float uBandsOn; uniform int uBandCount; uniform float uBandZ[6]; uniform vec3 uBandCol[6];
        uniform float uLayerOn; uniform float uLayerH; uniform float uFirstLayer;
        uniform float uBacklit; uniform vec3 uLitColor; uniform float uLitK;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uBandsOn > 0.5) {
          vec3 bc = uBandCol[0];
          for (int i = 1; i < 6; i++) { if (i < uBandCount && vZ > uBandZ[i] + 0.01) bc = uBandCol[i]; } // a surface exactly at a change height is the last layer of the colour below
          diffuseColor.rgb = bc;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uLayerOn > 0.5) {
          float lz = (vZ - uFirstLayer) / uLayerH;
          float fw = fwidth(lz);
          float amt = 1.0 - smoothstep(0.25, 0.75, fw);
          float s = sin(lz * 6.2831853);
          normal = normalize(normal + vUpV * s * 0.32 * amt);
        }`)
      .replace('#include <opaque_fragment>', `if (uBacklit > 0.5) {
          // Beer–Lambert transmission through the part's local thickness, tinted by the filament.
          float tr = exp(-uLitK * max(vThick, 0.0));
          vec3 tint = mix(vec3(1.0), diffuseColor.rgb, 0.65);
          outgoingLight = uLitColor * tint * tr * 3.2 + outgoingLight * 0.03;
        }
        #include <opaque_fragment>`);
  }

  /** keep rendering for a moment (every public method calls this, see the end of the file) */
  wake(ms = 1200) { this._wakeUntil = Math.max(this._wakeUntil || 0, performance.now() + ms); }

  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  _geometry(M, crease) {
    const g = new THREE.BufferGeometry();
    if (crease > 0) {
      // sharp shading across steps and letter walls, smooth shading on curved relief
      const C = creasedArrays(M.positions, M.renderIndex, M.thick, Math.cos(crease));
      g.setAttribute('position', new THREE.BufferAttribute(C.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(C.nor, 3));
      g.setAttribute('thick', new THREE.BufferAttribute(C.th, 1));
    } else {
      g.setAttribute('position', new THREE.BufferAttribute(M.positions, 3));
      g.setAttribute('thick', new THREE.BufferAttribute(M.thick, 1));
      g.setIndex(new THREE.BufferAttribute(M.renderIndex, 1));
      g.computeVertexNormals();
    }
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }

  setMesh(M, F, { crease = 0 } = {}) {
    const g = this._geometry(M, crease);
    this.mesh.geometry = g; this.geom.dispose(); this.geom = g;
    this.pend = { bbox: M.bbox, holes: F.holes, tubes: F.tubes || [] };
    const key = JSON.stringify([M.bbox, F.holes.map((h) => [h.x, h.y, h.r, !!h.tube]), F.tubes]);
    if (key !== this._pendKey) { this._pendKey = key; this._layout(); } // refine passes keep the layout
    if (this._firstFit) { this._firstFit = false; this.setView('iso'); }
  }

  // Connector bail (separate printed part), or null to hide it.
  setConnector(C, { crease = 0 } = {}) {
    if (!C) {
      this.mesh2.visible = false; this.conn = null;
      if (this._connKey) { this._connKey = null; this._layout(); }
      return;
    }
    const g = this._geometry(C.M, crease);
    this.mesh2.geometry.dispose(); this.mesh2.geometry = g; this.mesh2.visible = true;
    this.conn = { bbox: C.M.bbox, join: C.join, bottomHole: C.bottomHole, top: C.top, tube: C.tube, peg: C.peg, face: C.face };
    const key = JSON.stringify([C.M.bbox, C.join, C.bottomHole && [C.bottomHole.x, C.bottomHole.y, C.bottomHole.r], C.peg, C.tube, C.top && [C.top.x, C.top.y]]);
    if (key !== this._connKey) { this._connKey = key; this._layout(); }
  }

  _layout() {
    if (!this.pend) return;
    const P = this.pend, { min, max } = P.bbox, standing = this.state.view === 'standing';
    const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2, cz = standing ? (min[2] + max[2]) / 2 : 0;
    const po = new THREE.Vector3(-cx, -cy, -cz); // pendant field coords → pivot-local
    this.pivot.rotation.set(standing ? 0 : -Math.PI / 2, 0, 0);
    this.mesh.position.copy(po);
    this.ring.visible = false;

    const midZ = (min[2] + max[2]) / 2 + po.z;
    const pendHole = P.holes.filter((h) => !h.tube).reduce((a, h) => (!a || h.y > a.y ? h : a), null);
    let anchor = null;
    if (P.tubes.length) { const t = P.tubes[0]; anchor = { type: 'tube', x: t.x + po.x, y: t.yc + po.y, z: t.Ro + po.z, r: t.r, len: t.len }; }
    else if (pendHole) anchor = { type: 'hole', x: pendHole.x + po.x, y: pendHole.y + po.y, z: midZ, r: pendHole.r };

    const C = this.conn;
    if (C && this.mesh2.visible) {
      const cb = C.bbox, ch = cb.max[1] - cb.min[1];
      let co;
      if (!standing) {
        co = new THREE.Vector3(max[0] + po.x + 8 - cb.min[0], -(cb.min[1] + cb.max[1]) / 2, 0); // beside it on the bed
      } else if ((C.join === 'ring' || C.join === 'loop') && C.bottomHole && pendHole) {
        // a jump ring threads the pendant hole and the connector's lower hole
        const bh = C.bottomHole, wire = Math.max(0.35, Math.min(pendHole.r, bh.r) * 0.45);
        const dist = pendHole.r + bh.r + 2 * wire + 1.2;
        const px = pendHole.x + po.x, py = pendHole.y + po.y;
        co = new THREE.Vector3(px - bh.x, py + dist - bh.y, midZ - (cb.min[2] + cb.max[2]) / 2);
        this.ring.geometry.dispose();
        this.ring.geometry = new THREE.TorusGeometry(dist / 2, wire, 14, 56);
        this.ring.position.set(px, py + dist / 2, midZ);
        this.ring.rotation.set(0, Math.PI / 2, 0);
        this.ring.visible = true;
      } else {
        // glue pad / snap peg: the connector's face sits against the pendant's back
        const face = C.face ?? cb.max[2];
        let x = -(cb.min[0] + cb.max[0]) / 2, y = max[1] + po.y - ch * 0.38 - cb.min[1];
        if (C.join === 'peg' && C.peg && pendHole) { x = pendHole.x + po.x - C.peg.x; y = pendHole.y + po.y - C.peg.y; }
        co = new THREE.Vector3(x, y, min[2] + po.z - face);
      }
      this.mesh2.position.copy(co);
      if (C.tube) anchor = { type: 'tube', x: C.tube.x + co.x, y: C.tube.yc + co.y, z: C.tube.Ro + co.z, r: C.tube.r, len: C.tube.len };
      else if (C.top) anchor = { type: 'hole', x: C.top.x + co.x, y: C.top.y + co.y, z: (cb.min[2] + cb.max[2]) / 2 + co.z, r: C.top.r };
    }

    this.bed.visible = !standing;
    this.shadowPlane.visible = standing && !this.state.backlit;
    this.shadowPlane.position.y = standing ? -(max[1] - min[1]) / 2 - 14 : 0.02;
    const span = Math.max(max[0] - min[0], max[1] - min[1], 20);
    this.key.position.set(span * 1.2, span * 2.6, span * 2.0);
    this.rim.position.set(-span * 2, span * 0.8, -span * 2.2);
    this.fill.position.set(-span * 2, span * 0.3, span * 1.2);
    this._anchor = standing ? anchor : null;
    this._buildChain();
  }

  // Chain links follow a curve: straight up out of a hole, or draped in a V through a tube bail.
  _buildChain() {
    this.chain.clear();
    const A = this._anchor;
    if (!this.state.chain || !A) return;
    const wire = Math.max(0.35, Math.min(A.r * 0.34, 0.9));
    const len = Math.max(A.r * 2.6, 4.4), geo = linkGeometry(len * 0.62, len, wire);
    const pitch = len - 2 * wire * 1.35;
    const V = (x, y) => new THREE.Vector3(x, y, A.z);
    let curve;
    if (A.type === 'hole') {
      const y0 = A.y + A.r - wire + (len / 2 - wire); // first link rests on the top of the hole
      curve = new THREE.LineCurve3(V(A.x, y0), V(A.x, y0 + 240));
    } else {
      const L = A.len / 2, y = A.y;
      curve = new THREE.CatmullRomCurve3([V(A.x - 110, y + 230), V(A.x - L - 10, y + 7), V(A.x - L, y), V(A.x + L, y), V(A.x + L + 10, y + 7), V(A.x + 110, y + 230)], false, 'centripetal');
    }
    const total = curve.getLength(), n = Math.floor(total / pitch), up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion(), tw = new THREE.Quaternion();
    for (let i = 0; i <= n; i++) {
      const u = Math.min(1, i * pitch / total), t = curve.getTangentAt(u).normalize();
      const m = new THREE.Mesh(geo, this.chainMat);
      m.position.copy(curve.getPointAt(u));
      q.setFromUnitVectors(up, t); tw.setFromAxisAngle(t, i % 2 === 0 ? Math.PI / 2 : 0);
      m.quaternion.copy(tw).multiply(q);
      m.castShadow = true;
      this.chain.add(m);
    }
  }

  setLook(look) {
    this.state.look = look;
    const preset = MATERIALS[look.material] || MATERIALS.matte;
    for (const [mat, col] of [[this.mat, look.color], [this.mat2, look.cbColor || look.color]]) {
      Object.assign(mat, preset);
      mat.color.set(look.material === 'glow' ? '#dfffe9' : col);
      mat.emissive.set(look.material === 'glow' ? '#7dffb0' : '#000000');
      mat.wireframe = !!look.wireframe;
      mat.transmission = look.backlit ? 0 : preset.transmission; // backlight shader replaces the transmission pass
      mat.needsUpdate = true;
    }
    const u = this.uni;
    u.uBandsOn.value = look.bands ? 1 : 0;
    if (look.bands) {
      u.uBandCount.value = look.bands.length;
      look.bands.forEach((b, i) => { u.uBandZ.value[i] = b.z; u.uBandCol.value[i].set(b.color); });
    }
    u.uLayerOn.value = look.layerLines ? 1 : 0;
    u.uLayerH.value = look.layerH; u.uFirstLayer.value = look.firstLayer;
    u.uBacklit.value = look.backlit ? 1 : 0;
    this.state.backlit = !!look.backlit;
    this.scene.environmentIntensity = look.backlit ? 0.15 : look.material === 'glow' ? 0.25 : 0.9;
    this.key.intensity = look.backlit ? 0.2 : look.material === 'glow' ? 0.6 : 2.4;
    this.shadowPlane.visible = this.state.view === 'standing' && !look.backlit;
    (this.el.closest('#viewport') || this.el).classList.toggle('dark-stage', !!look.backlit || look.material === 'glow');
  }

  setDisplay({ view, chain, turntable }) {
    if (view !== undefined && view !== this.state.view) { this.state.view = view; this._layout(); this.setView('iso'); }
    if (chain !== undefined) { this.state.chain = chain; this._buildChain(); }
    if (turntable !== undefined) this.controls.autoRotate = turntable;
  }

  setView(name) {
    const dir = new THREE.Vector3(...VIEWS[this.state.view][name] || VIEWS.standing.iso).normalize();
    const box = new THREE.Box3().setFromObject(this.pivot); // pendant + connector + jump ring
    if (box.isEmpty()) box.set(new THREE.Vector3(-20, -20, -20), new THREE.Vector3(20, 20, 20));
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const target = sph.center.clone();
    const dist = sph.radius / Math.sin((this.camera.fov * Math.PI / 180) / 2) * 1.08;
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.1, dist / 200); this.camera.far = dist * 40; this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  snapshot(scale = 2) {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    const pr = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(scale * pr);
    this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const out = document.createElement('canvas'); out.width = src.width; out.height = src.height;
    const g = out.getContext('2d');
    const dark = (this.el.closest('#viewport') || this.el).classList.contains('dark-stage');
    const grd = g.createRadialGradient(out.width / 2, out.height * 0.38, 10, out.width / 2, out.height / 2, Math.max(out.width, out.height) * 0.75);
    grd.addColorStop(0, dark ? '#16171b' : '#34373f'); grd.addColorStop(0.6, dark ? '#08090b' : '#16171b'); grd.addColorStop(1, '#070708');
    g.fillStyle = grd; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, 0, 0);
    this.renderer.setPixelRatio(pr); this.resize();
    return out;
  }
}

// Any change to the scene (new mesh, look, view, stage, resize, snapshot…) goes through a method, so waking
// the render loop from every method is enough to keep the picture current.
for (const k of Object.getOwnPropertyNames(Viewer.prototype)) {
  const f = Viewer.prototype[k];
  if (k === 'constructor' || k === 'wake' || typeof f !== 'function') continue;
  Viewer.prototype[k] = function (...a) { this.wake(); return f.apply(this, a); };
}

// Oval chain link: a tube swept along a stadium path, so wire thickness stays even.
const _linkCache = new Map();
function linkGeometry(wid, len, wire) {
  const key = `${wid.toFixed(2)}|${len.toFixed(2)}|${wire.toFixed(2)}`;
  if (_linkCache.has(key)) return _linkCache.get(key);
  const rx = wid / 2 - wire, ry = len / 2 - wire;
  class Stadium extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2;
      const s = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.7);
      const c = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7);
      return target.set(rx * c, ry * s, 0);
    }
  }
  const g = new THREE.TubeGeometry(new Stadium(), 64, wire, 10, true);
  _linkCache.set(key, g);
  return g;
}
