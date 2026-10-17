import { zipSync, strToU8 } from '/assets/vendor/fflate/fflate.js';

export function toSTL(P, I, name = 'mesh-lab') {
  const nt = I.length / 3, buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = `HotendHq Mesh Lab ${name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
    for (const v of [a, b, c]) { dv.setFloat32(o, P[v], true); dv.setFloat32(o + 4, P[v + 1], true); dv.setFloat32(o + 8, P[v + 2], true); o += 12; }
    o += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

const CT = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

export function to3MF(P, I, name = 'mesh-lab', color = '#C9C4BC') {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
    `<metadata name="Title">${name}</metadata>\n<metadata name="Application">HotendHq Mesh Lab</metadata>\n<resources>\n`,
    `<basematerials id="1"><base name="${name}" displaycolor="${color.toUpperCase()}FF"/></basematerials>\n<object id="2" type="model" name="${name}" pid="1" pindex="0"><mesh><vertices>\n`];
  let s = '';
  for (let i = 0; i < P.length; i += 3) {
    s += `<vertex x="${P[i].toFixed(4)}" y="${P[i + 1].toFixed(4)}" z="${P[i + 2].toFixed(4)}"/>`;
    if (s.length > 1 << 20) { parts.push(s); s = ''; }
  }
  parts.push(s, '\n</vertices><triangles>\n'); s = '';
  for (let t = 0; t < I.length; t += 3) {
    s += `<triangle v1="${I[t]}" v2="${I[t + 1]}" v3="${I[t + 2]}"/>`;
    if (s.length > 1 << 20) { parts.push(s); s = ''; }
  }
  parts.push(s, '\n</triangles></mesh></object>\n</resources>\n<build><item objectid="2"/></build>\n</model>\n');
  const model = strToU8(parts.join(''));
  return new Blob([zipSync({ '[Content_Types].xml': strToU8(CT), '_rels/.rels': strToU8(RELS), '3D/3dmodel.model': model }, { level: 6 })], { type: 'model/3mf' });
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
