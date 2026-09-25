/* FPV drone frames: ducted whoops to 7-inch, X / stretched X / H / deadcat, with motor, stack and camera mounts. */
import { R, S, B, C, D2R } from '../core.js?v=95f6f46afd';

// size classes: prop Ø (inch), default wheelbase (mm), motor pattern, stack, camera
const CLASSES = {
  w65: { prop: 1.2, wb: 65, motor: 'whoop', stack: 'none', cam: 'nano', type: 'whoop' },
  w75: { prop: 1.6, wb: 75, motor: 'whoop', stack: 'none', cam: 'nano', type: 'whoop' },
  i2: { prop: 2, wb: 95, motor: 'm9', stack: '16', cam: 'nano', type: 'whoop' },
  i25: { prop: 2.5, wb: 115, motor: 'm9', stack: '20', cam: 'nano', type: 'x' },
  i3: { prop: 3, wb: 135, motor: 'm12', stack: '20', cam: 'micro', type: 'x' },
  i35: { prop: 3.5, wb: 160, motor: 'm12', stack: '20', cam: 'micro', type: 'x' },
  i4: { prop: 4, wb: 185, motor: 'm16', stack: '25', cam: 'micro', type: 'sx' },
  i5: { prop: 5.1, wb: 225, motor: 'm16', stack: '30', cam: 'micro', type: 'sx' },
  i6: { prop: 6, wb: 260, motor: 'm16', stack: '30', cam: 'micro', type: 'sx' },
  i7: { prop: 7, wb: 295, motor: 'm19', stack: '30', cam: 'full', type: 'sx' },
};
// motor bolt patterns: [spacing (mm, square), hole Ø, centre hole Ø, count]
const MOTORS = { whoop: [6.6, 1.4, 2, 3], m9: [9, 2.2, 3, 4], m12: [12, 2.2, 4, 4], m16: [16, 3.2, 5.5, 4], m19: [19, 3.2, 6.5, 4], m16x19: [0, 3.2, 6, 4] };
const STACKS = { none: [0, 0], '16': [16, 2.2], '20': [20, 2.2], '25': [25.5, 2.2], '30': [30.5, 3.2] };
const CAMS = { nano: 14, micro: 19, full: 22 };

export default {
  id: 'drone-frame', title: 'Drone frames', usesBed: false,
  file: (s) => `drone-frame-${s.cls}-${s.type}`,
  modes: {
    frame: {
      label: 'Frame', title: 'FPV quad frame',
      blurb: 'Pick a size class and the frame fills in typical motor, stack and camera sizes. Every size is adjustable.',
      groups: [
        { title: 'Size & layout', open: true, items: [
          S('cls', 'Size class', [['w65', '65 mm whoop (31 mm props)'], ['w75', '75 mm whoop (40 mm props)'], ['i2', '2″ cinewhoop'], ['i25', '2.5″'], ['i3', '3″ toothpick / cinewhoop'],
            ['i35', '3.5″'], ['i4', '4″'], ['i5', '5″ freestyle'], ['i6', '6″'], ['i7', '7″ long range']], 'i5', { hint: 'Sets the prop size and fills in typical parts below.' }),
          S('type', 'Frame shape', [['auto', 'Typical for the size'], ['x', 'True X'], ['sx', 'Stretched X'], ['sqx', 'Squashed X'], ['h', 'H frame'], ['dc', 'Deadcat (props out of view)'], ['whoop', 'Ducted whoop']], 'auto'),
          R('wb', 'Wheelbase (motor to motor, diagonal)', 50, 400, 1, 0, 'mm', { hint: '0 uses the typical wheelbase for the size class.' }),
          R('stretch', 'Stretch', 1.05, 1.6, 0.01, 1.2, '×', { show: s => ['sx', 'sqx', 'h', 'dc'].includes(s.type) || (s.type === 'auto'), hint: 'Length ÷ width of the motor layout.' }),
          R('propGap', 'Minimum prop clearance', 2, 15, 0.5, 4, 'mm'),
        ] },
        { title: 'Arms & plate', open: true, items: [
          R('armW', 'Arm width', 5, 30, 0.5, 0, 'mm', { hint: '0 picks a width for the size.' }),
          R('armT', 'Arm thickness', 2, 10, 0.1, 0, 'mm', { hint: '0 picks a thickness for the size. Printed arms need to be thicker than carbon.' }),
          R('plateT', 'Centre plate thickness', 1.5, 6, 0.1, 0, 'mm', { hint: '0 matches the arms.' }),
          R('bodyW', 'Centre body width', 20, 80, 0.5, 0, 'mm', { hint: '0 sizes it around the flight stack.' }),
          R('bodyL', 'Centre body length', 20, 140, 0.5, 0, 'mm', { hint: '0 sizes it around the stack and battery.' }),
          B('lighten', 'Lightening holes in the arms', true),
          B('strap', 'Battery strap slots', true),
          R('strapW', 'Strap width', 10, 25, 0.5, 16, 'mm', { show: s => s.strap }),
        ] },
        { title: 'Motors', open: true, items: [
          S('motor', 'Motor mount', [['auto', 'Typical for the size'], ['whoop', 'Whoop motors (3 holes, 6.6 mm)'], ['m9', '9 × 9 mm, M2 (1103–1204)'], ['m12', '12 × 12 mm, M2 (1404–1507)'],
            ['m16', '16 × 16 mm, M3 (2204–2207)'], ['m19', '19 × 19 mm, M3 (2306 and up)'], ['m16x19', '16 × 19 mm, M3 (combo)'], ['custom', 'Custom']], 'auto'),
          R('mSpace', 'Hole spacing', 5, 30, 0.1, 16, 'mm', { show: s => s.motor === 'custom' }),
          R('mHole', 'Hole Ø', 1, 4, 0.05, 3.2, 'mm', { show: s => s.motor === 'custom' }),
          R('mCentre', 'Centre hole Ø', 0, 10, 0.1, 5.5, 'mm', { show: s => s.motor === 'custom', hint: 'Clearance for the shaft and circlip.' }),
          R('mCount', 'Holes', 3, 4, 1, 4, '', { show: s => s.motor === 'custom' }),
        ] },
        { title: 'Flight stack', items: [
          S('stack', 'Stack mounting', [['auto', 'Typical for the size'], ['none', 'None / AIO glued'], ['16', '16 × 16 mm, M2'], ['20', '20 × 20 mm, M2'], ['25', '25.5 × 25.5 mm, M2'], ['30', '30.5 × 30.5 mm, M3']], 'auto'),
          B('standoffs', 'Standoff holes for a top plate', true, { hint: 'M3 holes at the corners of the body.' }),
          B('top', 'Print a top plate', true, { show: s => s.standoffs }),
          R('topT', 'Top plate thickness', 1.5, 5, 0.1, 2.5, 'mm', { show: s => s.standoffs && s.top }),
        ] },
        { title: 'Camera', items: [
          S('cam', 'Camera size', [['auto', 'Typical for the size'], ['nano', 'Nano (14 mm)'], ['micro', 'Micro (19 mm)'], ['full', 'Full size (22 mm)'], ['none', 'No camera mount']], 'auto'),
          R('camTilt', 'Camera angle', 0, 60, 1, 25, '°', { show: s => s.cam !== 'none' }),
          R('camH', 'Camera mount height', 0, 40, 0.5, 0, 'mm', { show: s => s.cam !== 'none', hint: '0 picks the lowest height that clears the base at this angle. Keep it at or under your standoff height.' }),
        ] },
        { title: 'Colours', items: [C('colFrame', 'Frame', '#23262b'), C('colParts', 'Top plate & camera mount', '#f3662e')] },
      ],
      presets: [['5″ freestyle', { cls: 'i5', type: 'sx' }], ['3″ toothpick', { cls: 'i3', type: 'x', armT: 3 }], ['65 mm whoop', { cls: 'w65', type: 'whoop' }], ['7″ deadcat', { cls: 'i7', type: 'dc' }], ['2.5″ H', { cls: 'i25', type: 'h' }]],
      test: [{ type: 'x' }, { type: 'whoop', cls: 'w75' }, { motor: 'custom' }, { stack: '20' }, { cam: 'nano' }],
    },
  },

  async build(K, p) {
    const warn = [], info = { facts: [], lines: [] };
    const cl = CLASSES[p.cls];
    const type = p.type === 'auto' ? cl.type : p.type;
    const propD = cl.prop * 25.4, whoop = type === 'whoop';
    const small = propD < 70;
    let wb = p.wb || cl.wb;
    const armW = p.armW || Math.max(6, Math.min(22, wb * 0.065)), armT = p.armT || (small ? 2.4 : Math.max(3.5, Math.min(7, wb * 0.022)));
    const plateT = p.plateT || armT;
    const mk = p.motor === 'auto' ? cl.motor : p.motor;
    const [mS, mH, mC, mN] = mk === 'custom' ? [p.mSpace, p.mHole, p.mCentre, p.mCount] : MOTORS[mk];
    const padR = mk === 'm16x19' ? 13 : mk === 'custom' ? mS / Math.SQRT2 + mH + 2.5 : mN === 3 ? mS / 2 + mH + 2 : mS / Math.SQRT2 + mH / 2 + 2.6;
    const st = p.stack === 'auto' ? cl.stack : p.stack, [sS, sH] = STACKS[st];
    // motor positions (x = right, y = forward)
    let pos;
    const d = wb / 2;
    if (type === 'x' || whoop) { const a = d / Math.SQRT2; pos = [[a, a], [-a, a], [-a, -a], [a, -a]]; }
    else {
      const k = type === 'sqx' ? 1 / p.stretch : p.stretch, w = d / Math.sqrt(1 + k * k) * 2 / 2, l = w * k;       // half width, half length on the diagonal
      // deadcat: front motors swept wide and back so the props leave the camera view; rear stays a normal X
      if (type === 'dc') pos = [[w * 1.4, l * 0.72], [-w * 1.4, l * 0.72], [-w, -l * 1.05], [w, -l * 1.05]];
      else pos = [[w, l], [-w, l], [-w, -l], [w, -l]];
    }
    // prop clearance
    let minGap = Infinity;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) minGap = Math.min(minGap, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]) - propD);
    if (minGap < p.propGap) warn.push(`Props would come within ${minGap.toFixed(1)} mm of each other (${cl.prop}″ props). Increase the wheelbase to at least ${Math.ceil(wb + (p.propGap - minGap) * 1.5)} mm.`);
    // centre body
    const bodyW = p.bodyW || Math.max(sS ? sS + 12 : 20, small ? 22 : 36), bodyL = p.bodyL || Math.max(sS ? sS + 30 : 30, wb * (small ? 0.32 : 0.42));
    let body = K.rrect(bodyW, bodyL, Math.min(6, bodyW / 4));
    const soX = bodyW / 2 - 4, soY = bodyL / 2 - 5;
    let arms = null;
    const armLine = (x0, y0, x1, y1, w0, w1) => { const L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0) / D2R;
      return K.poly([[0, -w0 / 2], [L, -w1 / 2], [L, w1 / 2], [0, w0 / 2]]).rotate(a).translate([x0, y0]); };
    const pads = pos.map(([x, y]) => K.circle(padR, 64).translate([x, y]));
    if (type === 'h') {
      const rail = (sx) => armLine(pos[0][0] * sx * 0.7, pos[3][1], pos[0][0] * sx * 0.7, pos[0][1], armW, armW);
      arms = rail(1).add(rail(-1));
      const rx = pos[0][0] * 0.7;
      for (const sy of [-1, 1]) arms = arms.add(armLine(-rx, sy * bodyL * 0.3, rx, sy * bodyL * 0.3, armW, armW));   // cross braces tie the rails to the body
      for (const [x, y] of pos) arms = arms.add(armLine(Math.sign(x) * pos[0][0] * 0.7, y, x, y, armW, armW));
    } else if (!whoop) {
      for (const [x, y] of pos) { const s = armLine(0, 0, x, y, armW * 1.35, armW); arms = arms ? arms.add(s) : s; }
    }
    // lightening holes along each arm
    let armHoles = null;
    if (p.lighten && !whoop && type !== 'h') for (const [x, y] of pos) {
      const L = Math.hypot(x, y), a = Math.atan2(y, x), n = Math.floor((L - padR - bodyW * 0.6) / (armW * 1.4));
      for (let i = 0; i < n; i++) { const t = bodyW * 0.6 + armW * 0.7 + i * armW * 1.4; const hole = K.rrect(armW * 1.0, armW * 0.42, armW * 0.2).rotate(a / D2R).translate([Math.cos(a) * t, Math.sin(a) * t]); armHoles = armHoles ? armHoles.add(hole) : hole; }
    }
    // holes: motors, stack, standoffs, strap
    const holes = [];
    for (const [x, y] of pos) {
      if (mC > 0) holes.push(K.circle(mC / 2, 32).translate([x, y]));
      const pat = [];
      if (mk === 'm16x19') for (const [r, a0] of [[16 / 2, 45], [19 / 2, 135]]) for (const a of [a0, a0 + 180]) pat.push([r * Math.cos(a * D2R), r * Math.sin(a * D2R)]);
      else if (mN === 3) for (let i = 0; i < 3; i++) { const a = (90 + 120 * i) * D2R; pat.push([mS / 2 * Math.cos(a), mS / 2 * Math.sin(a)]); }
      else for (const sx of [-1, 1]) for (const sy of [-1, 1]) pat.push([sx * mS / 2, sy * mS / 2]);
      const rot = Math.atan2(y, x) - Math.PI / 4;
      for (const [hx, hy] of pat) holes.push(K.circle(mH / 2, 24).translate([x + hx * Math.cos(rot) - hy * Math.sin(rot), y + hx * Math.sin(rot) + hy * Math.cos(rot)]));
    }
    if (sS) for (const sx of [-1, 1]) for (const sy of [-1, 1]) holes.push(K.circle(sH / 2, 24).translate([sx * sS / 2, sy * sS / 2]));
    if (p.standoffs) for (const sx of [-1, 1]) for (const sy of [-1, 1]) holes.push(K.circle(1.6, 24).translate([sx * soX, sy * soY]));
    // strap runs front to back, so the slots run across the body just ahead of and behind the stack
    if (p.strap && !small) {
      for (const sy of [-1, 1]) holes.push(K.rrect(p.strapW + 1, 3, 1.2).translate([0, sy * (Math.max(sS / 2, 8) + 7.5)]));
      if (p.strapW + 1 > 2 * soX - 4) warn.push(`A ${p.strapW} mm strap is wider than the space between the standoffs. Widen the body or use a narrower strap.`);
    }
    const holeCS = K.CS.union(holes);
    let frame;
    if (whoop) {
      // ducts: rings around each prop, tied to a small centre body
      const ductIn = propD / 2 + 1.5, ductW = 1.4, ductH = Math.max(8, propD * 0.3);
      let rings = null, spokes = null;
      for (const [x, y] of pos) {
        const r = K.circle(ductIn + ductW, 96).subtract(K.circle(ductIn, 96)).translate([x, y]);
        rings = rings ? rings.add(r) : r;
        for (const a of [45, 165, 285]) { const t = armLine(x, y, x + Math.cos((a + Math.atan2(y, x) / D2R) * D2R) * (ductIn + 0.5), y + Math.sin((a + Math.atan2(y, x) / D2R) * D2R) * (ductIn + 0.5), 1.8, 1.8); spokes = spokes ? spokes.add(t) : t; }
      }
      const base2 = body.add(K.CS.union(pads)).add(spokes).add(K.CS.union(pos.map(([x, y]) => armLine(0, 0, x, y, armW, armW * 0.7))));
      frame = K.extrude(base2.subtract(holeCS), armT).add(K.extrude(rings, ductH).subtract(K.union(pos.map(([x, y]) => K.cyl(ductIn, ductH + 2, 96).translate([x, y, -1])))));
      info.lines.push('Ducted whoops print best in PETG or TPU-reinforced PLA+ for crashes; keep the ducts at 2 walls for weight.');
    } else {
      const plate2 = body.subtract(holeCS);
      frame = K.extrude(plate2, plateT).add(K.extrude(arms.add(K.CS.union(pads)).subtract(holeCS).subtract(armHoles || K.circle(0.001).translate([9999, 0])), armT));
    }
    const parts = [{ name: 'frame', label: 'Frame', m: frame, colorKey: 'colFrame', color: p.colFrame }];
    const cam = p.cam === 'auto' ? cl.cam : p.cam;
    let xOff = K.bb(frame).max[0] + 12;
    if (p.standoffs && p.top) {
      let top = K.rrect(bodyW, bodyL, Math.min(6, bodyW / 4));
      const th = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) th.push(K.circle(1.6, 24).translate([sx * soX, sy * soY]));
      if (!small) th.push(K.rrect(bodyW * 0.45, bodyL * 0.35, 3));            // weight saving window
      if (p.strap && !small) for (const sy of [-1, 1]) th.push(K.rrect(p.strapW + 1, 3, 1.2).translate([0, sy * bodyL * 0.3]));
      top = top.subtract(K.CS.union(th));
      parts.push({ name: 'top', label: 'Top plate', m: K.extrude(top, p.topT).translate([xOff + bodyW / 2, 0, 0]), colorKey: 'colParts', color: p.colParts });
      xOff += bodyW + 10;
    }
    if (cam !== 'none') {
      const cw = CAMS[cam], wallT = 2.2, inner = cw + 0.4, c = cw / 2, t = p.camTilt * D2R;
      const H = p.camH || Math.ceil(c * (Math.sin(t) + Math.cos(t)) + 1.2 + 3.4 + 4 + 0.5);
      const pivotZ = H - 4;
      // base: spans the front standoffs when there are any, otherwise one centre screw
      const baseW = p.standoffs ? Math.max(inner + 2 * wallT, 2 * soX + 7) : inner + 2 * wallT;
      let baseCS = K.rrect(baseW, 14, 2);
      baseCS = baseCS.subtract(p.standoffs ? K.circle(1.6, 24).translate([-soX, 0]).add(K.circle(1.6, 24).translate([soX, 0])) : K.circle(1.6, 24));
      let bracket = K.extrude(baseCS, 2.2);
      const side = () => {
        let s = K.extrude(K.poly([[-7, 0], [7, 0], [7, H * 0.6], [4, H], [-4, H], [-7, H * 0.6]]), wallT).rotate([90, 0, 90]);
        return s.subtract(K.cyl(1.05, wallT + 2, 24).rotate([0, 90, 0]).translate([-1, 0, pivotZ]));      // M2 pivot
      };
      bracket = bracket.add(side().translate([inner / 2, 0, 0])).add(side().translate([-inner / 2 - wallT, 0, 0]));
      // rest bar: the camera's lower back edge sits on it, which sets the tilt angle
      const ry = -c * Math.cos(t) + c * Math.sin(t), rz = Math.max(2.2 + 1.2, pivotZ - c * Math.sin(t) - c * Math.cos(t) - 1.2);
      if (pivotZ - c * Math.sin(t) - c * Math.cos(t) - 1.2 < 3.4) warn.push(`The camera would hit the base at ${p.camTilt}°. Set the height to 0 (auto) or raise the camera mount height to at least ${Math.ceil(3.4 + 1.2 + c * Math.sin(t) + c * Math.cos(t) + 4)} mm.`);
      bracket = bracket.add(K.cyl(1.2, inner + 2 * wallT, 24).rotate([0, 90, 0]).translate([-inner / 2 - wallT, Math.max(-6, Math.min(6, ry)), rz]));
      parts.push({ name: 'camera', label: 'Camera mount', m: bracket.translate([xOff + baseW / 2, 0, 0]), colorKey: 'colParts', color: p.colParts });
      info.facts.push(`${H} mm camera mount`);
      info.lines.push(`Camera mount for ${cam} cameras (${cw} mm wide): M2 screws through the pivot holes, and the camera's lower back edge rests on the bar at ${p.camTilt}°.`);
    }
    const diag = Math.max(Math.hypot(pos[0][0] - pos[2][0], pos[0][1] - pos[2][1]), Math.hypot(pos[1][0] - pos[3][0], pos[1][1] - pos[3][1]));
    if (!isFinite(minGap) || minGap >= p.propGap) info.facts.push(`${minGap.toFixed(0)} mm prop gap`);
    info.facts.push(`${cl.prop}″ props`, `${Math.round(diag)} mm wheelbase`);
    info.lines.push('Print flat, arms down, with 4–6 walls and 50–100% infill. PA-CF or PETG survive crashes far better than PLA.');
    info.lines.push('A printed frame is heavier and flexier than carbon fibre: great for learning, cinewhoops and spares, but expect to reprint arms after hard crashes.');
    return { parts, warn, info };
  },
};
