/* ============================================================
   FPV drone frames: tiny whoops to 10-inch long range, as quads (X, stretched,
   squashed, H, deadcat, plus, ducted), X8 coaxial cinelifters, tricopters,
   Y6, hexacopters and octocopters. One piece, or a bottom plate with
   replaceable bolted arms.

   Every printed part is built where it sits on the finished drone
   ("assembled" coordinates: frame centre at the origin, bottom at z = 0,
   +y forward). Each part then gets a print pose (flat on the bed, packed
   into a layout) and an `asm` matrix that puts it back, so the viewer can
   show the drone assembled with motors, props and electronics while the
   download is the print layout.
   ============================================================ */
import { R, S, B, C, D2R, PALETTE } from '../core.js?v=95f6f46afd';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// size classes: prop Ø (inch), typical wheelbase (mm), motor pattern, stack, camera, standoff height, battery [W, L, H] for the preview
const CLASSES = {
  w65: { prop: 1.2, wb: 65, motor: 'whoop', stack: 'none', cam: 'nano', type: 'whoop', soH: 0, batt: [12, 30, 7] },
  w75: { prop: 1.6, wb: 75, motor: 'whoop', stack: 'none', cam: 'nano', type: 'whoop', soH: 0, batt: [13, 38, 8] },
  i2: { prop: 2, wb: 95, motor: 'm9', stack: '16', cam: 'nano', type: 'whoop', soH: 16, batt: [22, 50, 13] },
  i25: { prop: 2.5, wb: 115, motor: 'm9', stack: '20', cam: 'nano', type: 'x', soH: 18, batt: [25, 58, 15] },
  i3: { prop: 3, wb: 135, motor: 'm12', stack: '20', cam: 'micro', type: 'x', soH: 20, batt: [28, 65, 19] },
  i35: { prop: 3.5, wb: 160, motor: 'm12', stack: '20', cam: 'micro', type: 'x', soH: 22, batt: [30, 68, 22] },
  i4: { prop: 4, wb: 185, motor: 'm16', stack: '25', cam: 'micro', type: 'sx', soH: 24, batt: [33, 70, 27] },
  i5: { prop: 5.1, wb: 225, motor: 'm16', stack: '30', cam: 'micro', type: 'sx', soH: 26, batt: [36, 75, 36] },
  i6: { prop: 6, wb: 260, motor: 'm16', stack: '30', cam: 'micro', type: 'sx', soH: 28, batt: [38, 80, 38] },
  i7: { prop: 7, wb: 295, motor: 'm19', stack: '30', cam: 'full', type: 'sx', soH: 30, batt: [44, 118, 40] },
  i8: { prop: 8, wb: 340, motor: 'm19', stack: '30', cam: 'full', type: 'sx', soH: 30, batt: [46, 130, 44] },
  i10: { prop: 10, wb: 420, motor: 'm25', stack: '30', cam: 'full', type: 'sx', soH: 32, batt: [52, 150, 52] },
};
const CLASS_OPTS = [['w65', '65 mm whoop (31 mm props)'], ['w75', '75 mm whoop (40 mm props)'], ['i2', '2″ cinewhoop'], ['i25', '2.5″'], ['i3', '3″'],
  ['i35', '3.5″ toothpick'], ['i4', '4″'], ['i5', '5″ freestyle / race'], ['i6', '6″'], ['i7', '7″ long range'], ['i8', '8″'], ['i10', '10″ long range / lifter']];
// motor bolt patterns: [spacing (mm, square), hole Ø, centre hole Ø, holes]; bell [Ø, height] for the preview
const MOTORS = { whoop: [6.6, 1.4, 2, 3], m9: [9, 2.2, 3, 4], m12: [12, 2.2, 4, 4], m16: [16, 3.2, 5.5, 4], m19: [19, 3.2, 6.5, 4], m25: [25, 3.2, 8, 4], m16x19: [0, 3.2, 6, 4] };
const BELL = { whoop: [8.5, 8], m9: [14, 11], m12: [19, 14], m16: [28, 17], m19: [33, 19], m25: [38, 24], m16x19: [30, 18] };
const STACKS = { none: [0, 0], '16': [16, 2.2], '20': [20, 2.2], '25': [25.5, 2.2], '30': [30.5, 3.2] };
const CAMS = { nano: 14, micro: 19, full: 22 };
const ARMS = { quad: 4, x8: 4, tri: 3, y6: 3, hex: 6, octo: 8 };
const isQuad = (s) => s.air === 'quad' || s.air === 'x8';
const isWhoop = (s) => isQuad(s) && (s.type === 'whoop' || (s.type === 'auto' && CLASSES[s.cls]?.type === 'whoop'));

/* ---------------- tiny rigid-transform kit (3×4, row-major) ---------------- */
const I3 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const mul = (a, b) => { const o = new Array(12); for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c]; o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3]; } return o; };
const tr = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
const rx = (d) => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
const rz = (d) => { const c = Math.cos(d * D2R), s = Math.sin(d * D2R); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
const inv = (m) => { const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t = [m[3], m[7], m[11]];
  return [r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]), r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]), r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2])]; };
const col16 = (m) => [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, m[3], m[7], m[11], 1];

/* ---------------- randomizer ---------------- */
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const COLS = Object.values(PALETTE);
function randomDrone() {
  const air = pick(['quad', 'quad', 'quad', 'quad', 'x8', 'tri', 'y6', 'hex', 'octo']);
  let cls = air === 'quad' ? pick(['w65', 'w75', 'i2', 'i25', 'i3', 'i35', 'i4', 'i5', 'i5', 'i6', 'i7']) : air === 'octo' || air === 'hex' ? pick(['i3', 'i35', 'i4', 'i5']) : pick(['i4', 'i5', 'i5', 'i6', 'i7']);
  let type = 'auto';
  if (air === 'quad') type = ['w65', 'w75', 'i2'].includes(cls) ? 'whoop' : pick(['x', 'sx', 'sx', 'sqx', 'h', 'dc', 'whoop']);
  if (air === 'x8') type = pick(['x', 'sx', 'sqx']);
  if (type === 'whoop' && !['w65', 'w75', 'i2', 'i25', 'i3', 'i35'].includes(cls)) cls = pick(['i2', 'i25', 'i3', 'i35']);
  const tiny = ['w65', 'w75'].includes(cls), bigFrame = air === 'hex' || air === 'octo' || ['i6', 'i7'].includes(cls);
  const gps = ['i6', 'i7'].includes(cls) && Math.random() < 0.6;
  return {
    air, cls, type, wb: 0, stretch: +(1.1 + Math.random() * 0.35).toFixed(2), hexOri: pick(['x', 'plus']),
    build: type === 'whoop' || type === 'h' ? 'uni' : bigFrame ? 'sandwich' : pick(['uni', 'sandwich']),
    armShape: pick(['straight', 'tapered', 'tapered', 'dogbone', 'flared']), armTaper: +(0.15 + Math.random() * 0.5).toFixed(2),
    pad: pick(['round', 'square', 'tear', 'tear']), holes: pick(['none', 'slots', 'circles', 'truss', 'truss']), chamfer: pick([0, 0.4, 0.6]),
    guards: type === 'whoop' ? 'none' : pick(['none', 'none', 'bumper', ['i25', 'i3'].includes(cls) && air === 'quad' ? 'ring' : 'bumper']),
    bodyShape: pick(['auto', 'rect', 'chamfer', 'oval']), batt: gps ? 'bottom' : pick(['top', 'top', 'bottom']),
    gopro: ['i4', 'i5', 'i6', 'i7'].includes(cls) && air !== 'octo' ? pick(['none', 'plate', 'strap']) : 'none', goproTilt: pick([0, 15, 20, 25, 30]),
    gps, antenna: !tiny && Math.random() < 0.5, xt60: Math.random() < 0.4,
    camTilt: pick([15, 20, 25, 30, 35, 40]), camTop: Math.random() < 0.4, stackRot: pick(['0', '0', '45']),
    blades: pick([2, 3, 3, 3, 4, 5]),
    colFrame: pick(['#23262b', '#23262b', '#1c2f6b', '#8a939e', '#f2f4f7', '#d63b32']),
    colParts: pick(COLS), colMotor: pick(['#1182c9', '#d63b32', '#8a939e', '#d6a93a', '#7a4fc9', '#3e9b4f', '#f3662e']), colProps: pick(COLS), colBatt: pick(['#f5c542', '#23262b', '#d63b32', '#1182c9']),
  };
}

export default {
  id: 'drone-frame', title: 'Drone frames', usesBed: false,
  file: (s) => `drone-frame-${s.air}-${s.cls}${isQuad(s) ? '-' + s.type : ''}`,
  modes: {
    frame: {
      label: 'Frame', title: 'FPV drone frame',
      blurb: 'Quads, X8, tricopters, Y6, hexa and octocopters from 65 mm whoops to 10″. Pick a size and everything fills in; the preview shows it built with motors, props and electronics.',
      camera: { dir: [0.62, 0.9, 0.62] },
      random: randomDrone,
      groups: [
        { title: 'Airframe', open: true, items: [
          S('air', 'Aircraft', [['quad', 'Quadcopter (4 motors)'], ['x8', 'X8 coaxial cinelifter (8 motors on 4 arms)'], ['tri', 'Tricopter (3 motors, tilting tail)'],
            ['y6', 'Y6 coaxial (6 motors on 3 arms)'], ['hex', 'Hexacopter (6 arms)'], ['octo', 'Octocopter (8 arms)']], 'quad'),
          S('cls', 'Size class', CLASS_OPTS, 'i5', { hint: 'Sets the prop size and fills in typical motors, stack, camera and standoffs below.' }),
          S('type', 'Frame shape', [['auto', 'Typical for the size'], ['x', 'True X'], ['sx', 'Stretched X (freestyle)'], ['sqx', 'Squashed X (wide)'], ['h', 'H frame'],
            ['dc', 'Deadcat (props out of the camera view)'], ['plus', 'Plus (+)'], ['whoop', 'Ducted cinewhoop']], 'auto', { show: isQuad }),
          S('hexOri', 'Arm orientation', [['x', 'X (two arms forward)'], ['plus', 'Plus (one arm forward)']], 'x', { show: s => s.air === 'hex' || s.air === 'octo' }),
          R('wb', 'Wheelbase (motor to motor, diagonal)', 0, 800, 1, 0, 'mm', { hint: '0 picks the typical size, or the smallest that keeps the props apart.' }),
          R('stretch', 'Stretch', 1.05, 1.6, 0.01, 1.2, '×', { show: s => isQuad(s) && ['auto', 'sx', 'sqx', 'h', 'dc'].includes(s.type), hint: 'Length ÷ width of the motor layout.' }),
          R('propGap', 'Minimum prop clearance', 2, 20, 0.5, 4, 'mm'),
          S('build', 'Construction', [['uni', 'One piece (unibody)'], ['sandwich', 'Bottom plate + replaceable arms']], 'uni',
            { show: s => !(isQuad(s) && (s.type === 'h' || isWhoop(s))), hint: 'Separate arms bolt to the bottom plate, so a crash costs one arm and big frames fit small beds.' }),
        ] },
        { title: 'Arms', open: true, items: [
          S('armShape', 'Arm shape', [['straight', 'Straight'], ['tapered', 'Tapered (wide at the body)'], ['dogbone', 'Dogbone (waisted)'], ['flared', 'Flared (wide at the motor)']], 'tapered'),
          R('armTaper', 'Shape strength', 0.05, 0.8, 0.01, 0.35, '', { show: s => s.armShape !== 'straight' }),
          R('armW', 'Arm width', 0, 30, 0.5, 0, 'mm', { hint: '0 picks a width for the size.' }),
          R('armT', 'Arm thickness', 0, 10, 0.1, 0, 'mm', { hint: '0 picks a thickness for the size. Printed arms need to be thicker than carbon.' }),
          S('pad', 'Motor pad', [['round', 'Round'], ['square', 'Square'], ['tear', 'Teardrop (blends into the arm)']], 'tear'),
          S('holes', 'Weight-saving cutouts', [['none', 'None (strongest)'], ['slots', 'Slots'], ['circles', 'Round holes'], ['truss', 'Truss (triangles)']], 'truss'),
          R('chamfer', 'Edge chamfer', 0, 1.2, 0.1, 0.4, 'mm', { hint: 'Softens the top and bottom edges. 0 for sharp edges.' }),
          B('wireHole', 'Motor wire pass-through', true, { show: s => !isWhoop(s), hint: 'A slot beside each motor to route the wires under the arm.' }),
          S('guards', 'Motor guards', [['none', 'None'], ['bumper', 'Bumpers around the motors'], ['ring', 'Full prop guard rings']], 'none', { show: s => !isWhoop(s) }),
          R('guardH', 'Guard height', 2, 14, 0.5, 6, 'mm', { show: s => s.guards !== 'none' && !isWhoop(s) }),
        ] },
        { title: 'Body & plates', items: [
          S('bodyShape', 'Body shape', [['auto', 'Typical for the aircraft'], ['rect', 'Rounded rectangle'], ['chamfer', 'Chamfered corners'], ['oval', 'Oval'], ['round', 'Round']], 'auto'),
          R('bodyW', 'Body width', 0, 200, 0.5, 0, 'mm', { hint: '0 sizes it around the stack and the arms.' }),
          R('bodyL', 'Body length', 0, 220, 0.5, 0, 'mm', { hint: '0 sizes it around the stack, battery and arms.' }),
          R('bodyR', 'Corner radius', 0, 20, 0.5, 6, 'mm', { show: s => s.bodyShape === 'rect' || (s.bodyShape === 'auto' && isQuad(s)) }),
          R('plateT', 'Bottom plate thickness', 0, 8, 0.1, 0, 'mm', { hint: '0 picks one for the size.' }),
          B('standoffs', 'Standoffs and a top plate', true, { hint: 'Hex standoffs hold a top plate over the electronics. Tiny whoops use a canopy instead.' }),
          R('soH', 'Standoff height', 0, 45, 0.5, 0, 'mm', { show: s => s.standoffs, hint: '0 picks a height for the size. The camera must fit between the plates.' }),
          S('soHole', 'Standoff screws', [['m3', 'M3'], ['m2', 'M2']], 'm3', { show: s => s.standoffs }),
          R('topT', 'Top plate thickness', 1.2, 5, 0.1, 2.5, 'mm', { show: s => s.standoffs }),
          B('topWindow', 'Window in the top plate', true, { show: s => s.standoffs }),
          S('batt', 'Battery goes', [['top', 'On the top plate'], ['bottom', 'Under the bottom plate']], 'top'),
          B('strap', 'Battery strap slots', true),
          R('strapW', 'Strap width', 10, 25, 0.5, 16, 'mm', { show: s => s.strap || s.gopro === 'strap' }),
          B('xt60', 'Rear tab for the battery lead (zip-tie slots)', false),
          B('gps', 'GPS pad on the top plate', false, { show: s => s.standoffs }),
          S('gopro', 'Action camera mount', [['none', 'None'], ['plate', 'On the top plate'], ['strap', 'Strap-on mount for the battery']], 'none', { hint: 'A GoPro-style three-prong mount.' }),
          R('goproTilt', 'Action camera tilt', 0, 45, 1, 20, '°', { show: s => s.gopro !== 'none' }),
        ] },
        { title: 'Motors', items: [
          S('motor', 'Motor mount', [['auto', 'Typical for the size'], ['whoop', 'Whoop motors (3 holes, 6.6 mm)'], ['m9', '9 × 9 mm, M2 (1103–1204)'], ['m12', '12 × 12 mm, M2 (1404–1507)'],
            ['m16', '16 × 16 mm, M3 (2204–2207)'], ['m19', '19 × 19 mm, M3 (2306–2809)'], ['m25', '25 × 25 mm, M3 (3110 and up)'], ['m16x19', '16 × 19 mm, M3 (combo)'], ['custom', 'Custom']], 'auto'),
          R('mSpace', 'Hole spacing', 5, 30, 0.1, 16, 'mm', { show: s => s.motor === 'custom' }),
          R('mHole', 'Hole Ø', 1, 4, 0.05, 3.2, 'mm', { show: s => s.motor === 'custom' }),
          R('mCentre', 'Centre hole Ø', 0, 10, 0.1, 5.5, 'mm', { show: s => s.motor === 'custom', hint: 'Clearance for the shaft and circlip.' }),
          R('mCount', 'Holes', 3, 4, 1, 4, '', { show: s => s.motor === 'custom' }),
        ] },
        { title: 'Flight stack', items: [
          S('stack', 'Stack mounting', [['auto', 'Typical for the size'], ['none', 'None / AIO glued'], ['16', '16 × 16 mm, M2'], ['20', '20 × 20 mm, M2'], ['25', '25.5 × 25.5 mm, M2'], ['30', '30.5 × 30.5 mm, M3']], 'auto'),
          S('stackRot', 'Stack rotation', [['0', 'Square to the frame'], ['45', 'Turned 45°']], '0'),
          S('stackHole', 'Stack holes', [['bolt', 'Bolt size'], ['grommet', 'Bigger, for soft-mount grommets']], 'bolt'),
          B('vtxStack', 'Second 20 × 20 mount behind (VTX, receiver)', false),
        ] },
        { title: 'Camera & antennas', items: [
          S('cam', 'FPV camera', [['auto', 'Typical for the size'], ['nano', 'Nano (14 mm)'], ['micro', 'Micro (19 mm)'], ['full', 'Full size (22 mm)'], ['none', 'No camera mount']], 'auto'),
          R('camTilt', 'Camera angle', 0, 60, 1, 25, '°', { show: s => s.cam !== 'none' }),
          R('camH', 'Camera mount height', 0, 40, 0.5, 0, 'mm', { show: s => s.cam !== 'none', hint: '0 picks the lowest height that clears the base at this angle.' }),
          B('camTop', 'Top bar over the camera', false, { show: s => s.cam !== 'none', hint: 'Protects the camera in crashes.' }),
          B('antenna', 'Rear antenna mount (two tubes at 45°)', false, { show: s => s.standoffs }),
        ] },
        { title: 'Ducts', items: [
          R('ductH', 'Duct height', 0, 40, 0.5, 0, 'mm', { hint: '0 picks about a third of the prop size.' }),
          R('ductWall', 'Duct wall', 0.8, 3, 0.1, 1.4, 'mm'),
          R('tipGap', 'Prop tip clearance', 0.5, 4, 0.1, 1.5, 'mm'),
          R('lip', 'Rounded intake lip', 0, 5, 0.25, 2, 'mm', { hint: 'A bell-mouth at the top of each duct, like real cinewhoop ducts.' }),
          S('spokes', 'Motor mount spokes', [['3', '3'], ['4', '4']], '3'),
        ], show: isWhoop },
        { title: 'Tricopter tail', items: [
          B('tailTilt', 'Tilting tail motor (servo yaw)', true, { hint: 'The tail motor sits on a hinged mount driven by a 9 g servo in the tail arm.' }),
        ], show: s => s.air === 'tri' },
        { title: 'Preview', items: [
          B('pvParts', 'Show motors, electronics and battery', true, { hint: 'Preview only: they are never in the download.' }),
          B('pvProps', 'Show props', true),
          R('blades', 'Prop blades', 2, 5, 1, 3, '', { show: s => s.pvProps }),
          B('cfLook', 'Carbon-fibre look for the frame', true, { hint: 'Preview only. Print in PA-CF or PETG-CF for the real thing.' }),
        ] },
        { title: 'Colours', items: [C('colFrame', 'Frame', '#23262b'), C('colParts', 'Top plate & mounts', '#f3662e'), C('colMotor', 'Motor bells (preview)', '#1182c9'),
          C('colProps', 'Props (preview)', '#f87b1e'), C('colBatt', 'Battery (preview)', '#f5c542')] },
      ],
      presets: [
        ['5″ freestyle', { cls: 'i5', type: 'sx', build: 'sandwich', armShape: 'tapered', holes: 'truss', gopro: 'plate', goproTilt: 25, batt: 'top' }],
        ['5″ race', { cls: 'i5', type: 'x', build: 'uni', armShape: 'straight', holes: 'slots', bodyW: 40, batt: 'top', colParts: '#d63b32' }],
        ['7″ long range deadcat', { cls: 'i7', type: 'dc', build: 'sandwich', gps: true, antenna: true, batt: 'bottom', gopro: 'plate', goproTilt: 15 }],
        ['3″ cinewhoop', { cls: 'i3', type: 'whoop', gopro: 'plate', goproTilt: 10, colProps: '#1ea39a' }],
        ['3.5″ toothpick', { cls: 'i35', type: 'x', armShape: 'straight', armW: 7, armT: 3.2, holes: 'circles', stack: 'none', standoffs: false, batt: 'bottom' }],
        ['65 mm tiny whoop', { cls: 'w65', type: 'whoop', colFrame: '#f2f4f7', colProps: '#e86fa6' }],
        ['5″ tricopter', { air: 'tri', cls: 'i5', build: 'sandwich', armShape: 'dogbone' }],
        ['5″ hexacopter', { air: 'hex', cls: 'i5', build: 'sandwich', holes: 'truss' }],
        ['5″ X8 cinelifter', { air: 'x8', cls: 'i5', type: 'sqx', build: 'sandwich', gopro: 'plate', goproTilt: 10 }],
        ['3″ octocopter', { air: 'octo', cls: 'i3', build: 'sandwich', armShape: 'straight', holes: 'circles' }],
      ],
      test: [{ type: 'x' }, { type: 'whoop', cls: 'w75' }, { motor: 'custom' }, { stack: '20' }, { cam: 'nano' }, { type: 'h' }, { type: 'dc', build: 'sandwich' },
        { air: 'tri' }, { air: 'y6' }, { air: 'hex' }, { air: 'octo', cls: 'i3' }, { air: 'x8' }, { guards: 'ring', cls: 'i3' }, { guards: 'bumper' },
        { gopro: 'plate' }, { gopro: 'strap' }, { gps: true }, { antenna: true }, { xt60: true }, { standoffs: false }, { batt: 'bottom' }, { bodyShape: 'round' }],
    },
  },

  async build(K, p) {
    const warn = [], info = { facts: [], lines: [] };
    const cl = CLASSES[p.cls] || CLASSES.i5;
    const air = ARMS[p.air] ? p.air : 'quad', quadLike = air === 'quad' || air === 'x8';
    const type = quadLike ? (p.type === 'auto' ? cl.type : p.type) : 'radial';
    const whoop = type === 'whoop', hFrame = type === 'h';
    const nArms = ARMS[air], coax = air === 'x8' || air === 'y6';
    const propD = cl.prop * 25.4, propR = propD / 2, small = propD < 70;
    let sandwich = p.build === 'sandwich';
    if (sandwich && (whoop || hFrame)) { sandwich = false; info.lines.push(`${whoop ? 'Ducted' : 'H'} frames print in one piece.`); }
    const soft = (cs, r) => r > 0.01 ? cs.offset(r, 'Round').offset(-2 * r, 'Round').offset(r, 'Round') : cs;
    const slab = (cs, h) => (p.chamfer > 0.05 && h > 2 * p.chamfer + 0.4 ? K.softSlab(cs, h, p.chamfer, { chamfer: true, steps: 2 }) : K.extrude(cs, h));

    /* ---------- motor layout ---------- */
    let wb = p.wb, pos;
    const hexOri = p.hexOri === 'plus' ? 'plus' : 'x';
    if (!wb) wb = quadLike ? cl.wb : Math.max(cl.wb, Math.ceil((propD + p.propGap + 2) / Math.sin(Math.PI / nArms)));
    const d = wb / 2;
    if (!quadLike) {
      let angles;
      if (air === 'tri' || air === 'y6') angles = [30, 150, 270];
      else { const step = 360 / nArms, off = hexOri === 'plus' ? 90 : 90 - step / 2; angles = Array.from({ length: nArms }, (_, i) => off + i * step); }
      pos = angles.map(a => [d * Math.cos(a * D2R), d * Math.sin(a * D2R)]);
    } else if (type === 'x' || whoop) { const a = d / Math.SQRT2; pos = [[a, a], [-a, a], [-a, -a], [a, -a]]; }
    else if (type === 'plus') pos = [[0, d], [-d, 0], [0, -d], [d, 0]];
    else {
      const k = type === 'sqx' ? 1 / p.stretch : p.stretch, w = d / Math.sqrt(1 + k * k), l = w * k;
      // deadcat: front motors swept wide and back so the props leave the camera view; rear stays a normal X
      if (type === 'dc') pos = [[w * 1.4, l * 0.72], [-w * 1.4, l * 0.72], [-w, -l * 1.05], [w, -l * 1.05]];
      else pos = [[w, l], [-w, l], [-w, -l], [w, -l]];
    }
    const arms = pos.map(([x, y]) => ({ x, y, L: Math.hypot(x, y), a: Math.atan2(y, x) }));
    let minGap = Infinity;
    for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) minGap = Math.min(minGap, Math.hypot(arms[i].x - arms[j].x, arms[i].y - arms[j].y) - propD);
    if (minGap < p.propGap) warn.push(`Props would come within ${minGap.toFixed(1)} mm of each other (${cl.prop}″ props). Set the wheelbase to 0 (auto) or at least ${Math.ceil(wb + (p.propGap - minGap) * (quadLike ? 1.5 : 2.2))} mm.`);

    /* ---------- sizes ---------- */
    const mk = p.motor === 'auto' ? cl.motor : p.motor;
    const [mS, mH, mC, mN] = mk === 'custom' ? [p.mSpace, p.mHole, p.mCentre, p.mCount] : MOTORS[mk];
    const padR = mk === 'm16x19' ? 13 : mk === 'custom' ? mS / Math.SQRT2 + mH + 2.5 : mN === 3 ? mS / 2 + mH + 2 : mS / Math.SQRT2 + mH / 2 + 2.6;
    const armW = p.armW || clamp(wb * (quadLike ? 0.065 : 0.05), whoop ? 4 : 6, 24);
    const armT = p.armT || (small ? 2.6 : clamp(wb * 0.022, 3.5, 7));
    const plateT = p.plateT || (sandwich ? clamp(armT * 0.55, 2, 3.5) : armT);
    const st = p.stack === 'auto' ? cl.stack : p.stack, [sS, sH0] = STACKS[st] || STACKS.none;
    const sH = p.stackHole === 'grommet' && sS ? sH0 + 1.8 : sH0;
    const stackHalf = sS ? sS * 0.707 + sH / 2 + 1.5 : 7;
    const soOn = p.standoffs && (cl.soH > 0 || p.soH > 0);
    if (p.standoffs && !soOn) info.lines.push('Tiny whoops use a canopy instead of standoffs and a top plate, so none are made. Set a standoff height to add them.');
    const camKey = p.cam === 'auto' ? cl.cam : p.cam, cw = CAMS[camKey] || 0;
    // camera: mount height from the tilt, and the room it needs between the plates
    const camT = p.camTilt * D2R, camC = cw / 2, camWall = 2.2, camInner = cw + 0.4;
    const camSpan = camC * (Math.sin(camT) + Math.cos(camT));            // half the tilted camera's height
    const camNeedH = Math.ceil((camSpan + 1.2 + 2.8 + 4) * 2) / 2;
    const camH = p.camH || camNeedH, camPivot = camH - 4, camTopZ = cw ? Math.max(camH, camPivot + camSpan) : 0;
    const soH = p.soH || Math.max(cl.soH || 16, Math.ceil(camTopZ + 0.5)), soR = p.soHole === 'm2' ? 1.1 : 1.6;
    const wf = (() => {
      const w = armW, tp = p.armTaper;
      if (p.armShape === 'tapered') return t => w * (1 + tp * (1 - t));
      if (p.armShape === 'dogbone') return t => w * (1 - tp * 0.4 + tp * 0.8 * Math.pow(Math.abs(2 * t - 1), 1.6));
      if (p.armShape === 'flared') return t => w * (1 + tp * t * t);
      return () => w;
    })();

    // bolted arms start here (clear of the stack and of each other)
    let minSep = 7;
    for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) { let dA = Math.abs(arms[i].a - arms[j].a) % (2 * Math.PI); minSep = Math.min(minSep, dA, 2 * Math.PI - dA); }
    const rin = Math.max(stackHalf + 2.5, (wf(0) / 2 + 1) / Math.sin(minSep / 2), 8);
    const boltSp = Math.max(7, armW * 0.9);

    /* ---------- body ---------- */
    const bodyShape = p.bodyShape === 'auto' ? (quadLike ? 'rect' : 'round') : p.bodyShape;
    let bodyW, bodyL;
    if (quadLike) {
      bodyW = p.bodyW || Math.max(sS ? sS + 14 : 22, small ? 22 : 36, cw ? cw + 16 : 0);
      bodyL = p.bodyL || Math.max(sS ? sS + 30 : 30, wb * (small ? 0.32 : 0.42) * (type === 'plus' ? 0.8 : 1));
    } else { const D = Math.max(sS * 1.41 + 26, wb * (air === 'tri' || air === 'y6' ? 0.36 : 0.3)); bodyW = p.bodyW || D; bodyL = p.bodyL || D; }
    const vtxY = -(Math.max(sS, 20) / 2 + 12 + 10);
    if (p.vtxStack && !p.bodyL) bodyL = Math.max(bodyL, 2 * (Math.abs(vtxY) + 15));     // room for the second mount behind the stack
    if (bodyShape === 'round' && !p.bodyW && !p.bodyL) bodyW = bodyL = Math.max(bodyW, bodyL);
    const chamOf = () => Math.min(bodyW, bodyL) * 0.22;
    const edgeDist = (a) => {
      const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), hw = bodyW / 2, hl = bodyL / 2;
      if (bodyShape === 'round' || bodyShape === 'oval') return 1 / Math.sqrt((c / hw) ** 2 + (s / hl) ** 2);
      let r = Math.min(c > 1e-6 ? hw / c : Infinity, s > 1e-6 ? hl / s : Infinity);
      if (bodyShape === 'chamfer') r = Math.min(r, (hw + hl - chamOf()) / (c + s));
      return r;
    };
    // bolted arms: grow an automatic body until the arm bolts fit inside it
    if (sandwich) for (let it = 0; it < 40; it++) {
      if (Math.min(...arms.map(a => edgeDist(a.a))) - 4.5 - boltSp - (rin + 3) >= 0) break;
      if (p.bodyW && p.bodyL) { warn.push('The body is too small for the arm bolts. Make it bigger or set it to 0 (auto).'); break; }
      if (!p.bodyW) bodyW += 2;
      if (!p.bodyL) bodyL += 2;
    }
    const bodyCS = () => {
      if (bodyShape === 'round' || bodyShape === 'oval') return K.ellipse(bodyW, bodyL, 128);
      if (bodyShape === 'chamfer') { const w = bodyW / 2, l = bodyL / 2, c = chamOf();
        return soft(K.poly([[-w + c, -l], [w - c, -l], [w, -l + c], [w, l - c], [w - c, l], [-w + c, l], [-w, l - c], [-w, -l + c]]), 1.5); }
      return K.rrect(bodyW, bodyL, Math.max(0.2, Math.min(p.bodyR, bodyW / 2 - 0.1, bodyL / 2 - 0.1)));
    };

    /* ---------- standoffs (on the arm axes for bolted arms and multirotors, body corners otherwise) ---------- */
    let so = [];
    if (soOn || sandwich) {
      if (quadLike && !sandwich) {
        const cA = Math.atan2(bodyL, bodyW), r = edgeDist(cA) - 5;
        so = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => [sx * r * Math.cos(cA), sy * r * Math.sin(cA)]);
      } else so = arms.map(a => { const r = Math.max(edgeDist(a.a) - 4.5, rin + 3 + boltSp); return [r * Math.cos(a.a), r * Math.sin(a.a)]; });
    }
    const pairOf = (front) => {     // the symmetric pair of standoffs furthest forward (or back)
      let best = null;
      for (let i = 0; i < so.length; i++) for (let j = i + 1; j < so.length; j++) {
        const [a, b] = [so[i], so[j]];
        if (Math.abs(a[1] - b[1]) > 0.5 || Math.abs(a[0] + b[0]) > 0.5 || Math.abs(a[0]) < 3) continue;
        const y = a[1]; if ((front ? y : -y) <= 0) continue;
        if (!best || (front ? y > best.y : y < best.y)) best = { x: Math.abs(a[0]), y };
      }
      return best;
    };

    // the camera mount bolts to the front standoffs when they are far enough apart, otherwise to its own two holes
    const front = pairOf(true), rear = pairOf(false);
    const camSO = !!(front && camInner / 2 + camWall + 0.5 <= front.x - soR - 2.5 && front.y > bodyL * 0.2);
    const camOwnX = camInner / 2 + camWall + 3.5;
    const camY = camSO ? front.y : edgeDist(Math.PI / 2) - 9;

    /* ---------- 2D helpers in an arm's own frame (arm along +x) ---------- */
    const armPoly = (x0, x1, round0) => {
      const N = 16, top = [], bot = [];
      for (let i = 0; i <= N; i++) { const t = i / N, x = x0 + (x1 - x0) * t, hw = wf(t) / 2; top.push([x, hw]); bot.push([x, -hw]); }
      let cs = K.poly([...bot, ...top.reverse()]);
      if (round0) cs = cs.add(K.circle(wf(0) / 2, 40).translate([x0, 0]));
      return cs;
    };
    const padCS = (L) => {
      if (p.pad === 'square') return K.rrect(padR * 2, padR * 2, padR * 0.4).translate([L, 0]);
      if (p.pad === 'tear') return K.CS.hull([K.circle(padR, 64).translate([L, 0]), K.circle(Math.min(padR, wf(1) / 2 + 0.6), 32).translate([L - padR * 1.9, 0])]);
      return K.circle(padR, 64).translate([L, 0]);
    };
    const motorHoles = (L, wire = true) => {
      const out = [];
      if (mC > 0) out.push(K.circle(mC / 2, 32).translate([L, 0]));
      const pat = [];
      if (mk === 'm16x19') for (const [r, a0] of [[16 / 2, 45], [19 / 2, 135]]) for (const aa of [a0, a0 + 180]) pat.push([r * Math.cos(aa * D2R), r * Math.sin(aa * D2R)]);
      else if (mN === 3) for (let i = 0; i < 3; i++) { const aa = (180 + 120 * i) * D2R; pat.push([mS / 2 * Math.cos(aa), mS / 2 * Math.sin(aa)]); }
      else for (const sx of [-1, 1]) for (const sy of [-1, 1]) pat.push([sx * mS / 2, sy * mS / 2]);
      const rot = mN === 3 || mk === 'm16x19' ? 0 : 45 * D2R;          // square patterns sit at 45° to the arm, like on carbon frames
      for (const [hx, hy] of pat) out.push(K.circle(mH / 2, 24).translate([L + hx * Math.cos(rot) - hy * Math.sin(rot), hx * Math.sin(rot) + hy * Math.cos(rot)]));
      if (wire && p.wireHole && !whoop) out.push(K.rrect(4, 2.2, 1.1).translate([L - padR - 1.8, 0]));
      return out;
    };
    const cutouts = (xa, xb, x0, x1) => {            // weight-saving holes between xa and xb along the arm
      const out = [], len = xb - xa, tAt = (x) => clamp((x - x0) / (x1 - x0), 0, 1);
      if (p.holes === 'none' || len < armW * 1.2) return out;
      if (p.holes === 'slots') {
        const n = Math.max(1, Math.floor(len / (armW * 1.5))), s = len / n;
        for (let i = 0; i < n; i++) { const x = xa + s * (i + 0.5), w = wf(tAt(x)); out.push(K.rrect(s - Math.max(2.2, w * 0.35), w * 0.42, w * 0.2).translate([x, 0])); }
      } else if (p.holes === 'circles') {
        const n = Math.max(1, Math.floor(len / (armW * 1.05))), s = len / n;
        for (let i = 0; i < n; i++) { const x = xa + s * (i + 0.5), w = wf(tAt(x)); out.push(K.circle(Math.min(w * 0.27, s * 0.36), 32).translate([x, 0])); }
      } else {                                        // truss: alternating triangles with rounded corners
        const n = Math.max(2, Math.round(len / (armW * 1.05))), s = len / n;
        for (let i = 0; i < n; i++) {
          const a = xa + i * s, b = a + s, w = Math.min(wf(tAt(a)), wf(tAt(b))), e = Math.max(1.4, w * 0.17), hw = w / 2 - e, strut = Math.max(1.3, w * 0.15);
          if (hw < 1.2) continue;
          const tri = i % 2 ? [[a, hw], [(a + b) / 2, -hw], [b, hw]] : [[a, -hw], [b, -hw], [(a + b) / 2, hw]];
          const rf = Math.min(0.8, w * 0.06), c = K.poly(tri).offset(-(strut / 2 + rf), 'Miter');
          if (!c.isEmpty()) out.push(c.offset(rf, 'Round'));
        }
      }
      return out;
    };
    const place = (cs, arm) => cs.rotate(arm.a / D2R);
    const guardCS = (L) => {
      if (p.guards === 'bumper') {
        const ro = padR + 3.2, ri = padR - 0.6, pts = [[L, 0]];
        for (let i = 0; i <= 20; i++) { const a = (-115 + 230 * i / 20) * D2R; pts.push([L + (ro + 5) * 2 * Math.cos(a), (ro + 5) * 2 * Math.sin(a)]); }
        return K.circle(ro, 64).subtract(K.circle(ri, 64)).translate([L, 0]).intersect(K.poly(pts));
      }
      if (p.guards === 'ring') {
        const rg = propR + Math.max(2, p.propGap * 0.5), cs = K.circle(rg + 2.2, 128).subtract(K.circle(rg, 128)).translate([L, 0]);
        return cs.add(K.CS.union([0, 90, -90].map(ang => K.rect(rg + 1, 2.8).translate([(rg + 1) / 2, 0]).rotate(ang).translate([L, 0]))));
      }
      return null;
    };

    /* ---------- the tricopter tail: hinge ears on the arm, a separate tilting motor mount ---------- */
    const tailIdx = air === 'tri' && p.tailTilt ? arms.findIndex(a => Math.abs(a.a + Math.PI / 2) < 0.01) : -1;
    const lugT = 3, earT = 3, hingeGap = 0.4, tailArmW = Math.max(armW, 17);
    const tailLen = (a) => a.L + lugT / 2 + hingeGap + earT;
    const servoCut = (a) => { const x = a.L - padR - 16;
      return [K.rrect(23.2, 12.6, 1).translate([x, 0]), K.circle(0.8, 16).translate([x - 13.8, 0]), K.circle(0.8, 16).translate([x + 13.8, 0])]; };
    const earsFor = (a, z0) => {            // two ears across the tail arm, hinge axis along the arm
      const hz = z0 + armT + 5.5, parts = [];
      for (const s of [-1, 1]) {
        const xc = a.L + s * (lugT / 2 + hingeGap + earT / 2);
        parts.push(K.hull([K.box(earT, 12, 0.5).translate([xc, 0, z0 + armT - 0.5]), K.cyl(5, earT).rotate([0, 90, 0]).translate([xc - earT / 2, 0, hz])]));
      }
      return K.union(parts).subtract(K.cyl(1.65, 20).rotate([0, 90, 0]).translate([a.L - 10, 0, hz])).rotate([0, 0, a.a / D2R]);
    };

    /* ---------- printed parts, in assembled coordinates ---------- */
    const printed = [];     // { name, label, m, colorKey, color, look, orient }
    const zArm0 = sandwich ? plateT : 0, zArmTop = zArm0 + armT, zStand = sandwich ? plateT + armT : plateT, zTop = zStand + soH;
    const lighten = (arm) => {
      const x0 = sandwich ? rin : 0, e = edgeDist(arm.a);
      return cutouts(Math.max(e, sandwich ? rin + 3 + boltSp + 3.5 : e) + armW * 0.35, arm.L - padR - (p.wireHole ? 5 : 1.5) - armW * 0.2, x0, arm.L);
    };
    const holesBody = [];
    if (sS) {
      const r = (+p.stackRot || 0) * D2R;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const x = sx * sS / 2, y = sy * sS / 2; holesBody.push(K.circle(sH / 2, 24).translate([x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)])); }
    }
    if (p.vtxStack) {
      if (Math.abs(vtxY) + 14 > bodyL / 2) warn.push('The second 20 × 20 mount does not fit behind the stack on this body. Make the body longer.');
      else for (const sx of [-1, 1]) for (const sy of [-1, 1]) holesBody.push(K.circle(1.1, 20).translate([sx * 10, vtxY + sy * 10]));
    }
    for (const [x, y] of so) holesBody.push(K.circle(soR, 24).translate([x, y]));
    if (cw && !camSO) for (const sx of [-1, 1]) holesBody.push(K.circle(1.6, 24).translate([sx * camOwnX, camY]));
    const strapY = Math.max(sS / 2, 8) + 7.5;
    if (p.strap && !small) {
      const half = bodyShape === 'round' || bodyShape === 'oval' ? (bodyW / 2) * Math.sqrt(Math.max(0, 1 - (strapY / (bodyL / 2)) ** 2)) : bodyW / 2;
      if (p.strapW / 2 + 3 > half) warn.push(`A ${p.strapW} mm strap is wider than the body at the slots. Widen the body or use a narrower strap.`);
      else for (const sy of [-1, 1]) holesBody.push(K.rrect(p.strapW + 1, 3, 1.2).translate([0, sy * strapY]));
    }
    // bolted arms: two bolts per arm through the bottom plate, the outer one being the standoff screw
    if (sandwich) arms.forEach((a, i) => { const rs = Math.hypot(so[i][0], so[i][1]); holesBody.push(K.circle(1.6, 24).translate([(rs - boltSp) * Math.cos(a.a), (rs - boltSp) * Math.sin(a.a)])); });
    // rear tab for the battery lead
    let bodyPlus = bodyCS();
    if (p.xt60) {
      const clash = arms.some(a => Math.abs(((a.a / D2R + 90 + 540) % 360) - 180) < 28);
      if (clash) info.lines.push('No rear lead tab: an arm points straight back on this layout.');
      else { const ey = edgeDist(-Math.PI / 2);
        bodyPlus = bodyPlus.add(K.rrect(24, 16, 4).translate([0, -(ey + 5)]));
        holesBody.push(K.rrect(4.2, 2, 1).translate([-6, -(ey + 8)]), K.rrect(4.2, 2, 1).translate([6, -(ey + 8)])); }
    }

    let frame;
    if (whoop) {
      /* ducted: one piece with a bell-mouth duct round every prop */
      const ri = propR + p.tipGap, dW = p.ductWall, dH = p.ductH || Math.max(8, propD * 0.32), lip = Math.min(p.lip, dH * 0.4);
      const prof = [[ri, 0], [ri + dW, 0], [Math.max(ri + dW + lip * 0.6, ri + lip + dW * 0.9), dH]];
      for (let i = 0; i <= 8; i++) { const a = (90 + 90 * i / 8) * D2R; prof.push([ri + lip + lip * Math.cos(a), dH - lip + lip * Math.sin(a)]); }
      const duct = K.revolve(K.poly(prof), 96);
      let body = bodyPlus.add(K.CS.union(arms.map(a => place(armPoly(0, a.L, false).add(K.circle(padR, 48).translate([a.L, 0])), a))));
      const spokes = [];
      for (const a of arms) for (let i = 0; i < +p.spokes; i++) {
        const ang = a.a / D2R + 180 / +p.spokes + i * 360 / +p.spokes;
        spokes.push(K.rect(ri + dW / 2, 1.8).translate([(ri + dW / 2) / 2, 0]).rotate(ang).translate([a.x, a.y]));
      }
      body = body.add(K.CS.union(spokes));
      const holes = [...holesBody, ...arms.flatMap(a => motorHoles(a.L).map(h => place(h, a)))];
      frame = slab(body.subtract(K.CS.union(holes)), armT).add(K.union(arms.map(a => duct.translate([a.x, a.y, 0]))))
        .subtract(K.union(arms.map(a => K.cyl(ri, dH + 2, 96).translate([a.x, a.y, -1]))));
      info.facts.push(`${dH.toFixed(0)} mm ducts`);
    } else if (hFrame) {
      const rx0 = Math.abs(arms[0].x) * 0.7, rw = armW;
      let rails = K.CS.union([-1, 1].map(sx => K.rect(rw, Math.abs(arms[0].y - arms[3].y) + rw).translate([sx * rx0, (arms[0].y + arms[3].y) / 2])));
      for (const sy of [-1, 1]) rails = rails.add(K.rect(rx0 * 2, rw).translate([0, sy * bodyL * 0.3]));
      for (const a of arms) rails = rails.add(K.rect(Math.abs(a.x) - rx0, rw).translate([Math.sign(a.x) * (rx0 + Math.abs(a.x)) / 2, a.y])).add(place(padCS(a.L), a));
      const armsL = rails.subtract(K.CS.union(arms.flatMap(a => motorHoles(a.L).map(h => place(h, a)))));
      frame = slab(armsL, armT).add(slab(bodyPlus.subtract(K.CS.union(holesBody)), plateT));
    } else if (!sandwich) {
      /* one piece: arms from the centre, body over them */
      let armsL = null;
      const cuts = [];
      arms.forEach((a, i) => {
        const tail = i === tailIdx;
        const cs = place(tail ? K.rect(tailLen(a), tailArmW).translate([tailLen(a) / 2, 0]) : armPoly(0, a.L, false).add(padCS(a.L)), a);
        armsL = armsL ? armsL.add(cs) : cs;
        if (tail) cuts.push(...servoCut(a).map(h => place(h, a)));
        else cuts.push(...motorHoles(a.L).map(h => place(h, a)), ...lighten(a).map(h => place(h, a)));
      });
      frame = slab(armsL.subtract(K.CS.union(cuts.concat(holesBody))), armT)
        .add(slab(bodyPlus.subtract(K.CS.union(holesBody)), plateT));
      if (tailIdx >= 0) frame = frame.add(earsFor(arms[tailIdx], 0));
    } else {
      /* bottom plate; the arms are their own parts */
      frame = slab(bodyPlus.subtract(K.CS.union(holesBody)), plateT);
    }
    // motor guards on one-piece frames
    if (!whoop && !sandwich && p.guards !== 'none') {
      const g = arms.map((a, i) => (i === tailIdx ? null : guardCS(a.L))).map((c, i) => c && place(c, arms[i])).filter(Boolean);
      if (g.length) frame = frame.add(K.extrude(K.CS.union(g), Math.max(armT, p.guardH)));
    }
    const look = p.cfLook ? 'carbon' : null;
    printed.push({ name: 'frame', label: sandwich ? 'Bottom plate' : 'Frame', m: frame, colorKey: 'colFrame', color: p.colFrame, look });

    if (sandwich) arms.forEach((a, i) => {
      const tail = i === tailIdx, rs = Math.hypot(so[i][0], so[i][1]);
      const cs = tail ? K.rect(tailLen(a) - rin, tailArmW).translate([(tailLen(a) + rin) / 2, 0]).add(K.circle(tailArmW / 2, 40).translate([rin, 0]))
        : armPoly(rin, a.L, true).add(padCS(a.L));
      const cuts = [K.circle(1.6, 24).translate([rs, 0]), K.circle(1.6, 24).translate([rs - boltSp, 0])];
      if (tail) cuts.push(...servoCut(a)); else cuts.push(...motorHoles(a.L), ...lighten(a));
      let m = slab(cs.subtract(K.CS.union(cuts)), armT);
      if (!tail && p.guards !== 'none') { const g = guardCS(a.L); if (g) m = m.add(K.extrude(g, Math.max(armT, p.guardH))); }
      m = m.rotate([0, 0, a.a / D2R]).translate([0, 0, zArm0]);
      if (tail) m = m.add(earsFor(a, zArm0));
      printed.push({ name: 'arm' + (i + 1), label: `Arm ${i + 1}`, m, colorKey: 'colFrame', color: p.colFrame, look, orient: rz(-a.a / D2R) });
    });

    // tricopter tilting motor mount (printed upside down: pad on the bed, lug up)
    let tiltTop = null;
    if (tailIdx >= 0) {
      const a = arms[tailIdx], hz = zArm0 + armT + 5.5, padZ = hz + 5, tT = 3;
      const pad = K.extrude(K.circle(padR, 64).subtract(K.CS.union(motorHoles(0, false))), tT).translate([0, 0, padZ]);
      let lug = K.hull([K.box(lugT, 11, 0.5).translate([0, 0, padZ]), K.cyl(5.5, lugT).rotate([0, 90, 0]).translate([-lugT / 2, 0, hz]), K.cyl(2.2, lugT).rotate([0, 90, 0]).translate([-lugT / 2, 9, hz - 1.5])]);
      lug = lug.subtract(K.cyl(1.7, lugT + 2).rotate([0, 90, 0]).translate([-lugT / 2 - 1, 0, hz])).subtract(K.cyl(0.8, lugT + 2).rotate([0, 90, 0]).translate([-lugT / 2 - 1, 9, hz - 1.5]));
      tiltTop = padZ + tT;
      printed.push({ name: 'tail-mount', label: 'Tail motor mount', m: pad.add(lug).translate([a.L, 0, 0]).rotate([0, 0, a.a / D2R]), colorKey: 'colParts', color: p.colParts, orient: rx(180) });
      info.lines.push('Tricopter tail: bolt the tail motor mount between the hinge ears with an M3 bolt, fit a 9 g servo in the tail arm and link its horn to the small hole in the lug. Yaw comes from tilting this motor.');
    }

    // GoPro-style three-prong mount: prongs across the flight direction, tilted back by `tilt`
    const goproMount = (tilt) => {
      const pr = [];
      for (const x of [-6.35, 0, 6.35]) pr.push(K.hull([K.box(3, 15, 0.5).translate([x, 0, 2.3]), K.cyl(7.5, 3).rotate([0, 90, 0]).translate([x - 1.5, 0, 10])]));
      let m = K.box(21, 18, 2.5).add(K.union(pr)).subtract(K.cyl(2.6, 30).rotate([0, 90, 0]).translate([-15, 0, 10]));
      if (tilt > 0) {
        m = m.rotate([tilt, 0, 0]);
        const b = m.boundingBox();
        m = m.translate([0, 0, -b.min[2]]);
        m = m.add(K.hull([m.intersect(K.box(40, 40, 3)), K.box(21, (b.max[1] - b.min[1]) * 0.8, 0.1)]));
      }
      return m;
    };

    /* ---------- top plate ---------- */
    if (soOn && so.length) {
      const th = so.map(([x, y]) => K.circle(soR, 24).translate([x, y]));
      if (p.topWindow && !small) th.push(K.rrect(bodyW * 0.42, bodyL * 0.3, 3).translate([0, bodyL * 0.02]));
      if (p.strap && p.batt === 'top' && !small) for (const sy of [-1, 1]) th.push(K.rrect(p.strapW + 1, 3, 1.2).translate([0, sy * bodyL * 0.3]));
      let m = slab(bodyCS().subtract(K.CS.union(th)), p.topT);
      if (p.gps) {
        m = m.add(K.extrude(K.rrect(24, 24, 3).subtract(K.rrect(21.6, 21.6, 2)), 1.6).translate([0, -bodyL * 0.26, p.topT - 0.01]));
        if (p.batt === 'top') warn.push('The GPS pad sits under the battery. Put the battery underneath, or mount the GPS on a mast.');
      }
      if (p.gopro === 'plate') m = m.add(goproMount(p.goproTilt).translate([0, bodyL * 0.22, p.topT - 0.01]));
      printed.push({ name: 'top', label: 'Top plate', m: m.translate([0, 0, zTop]), colorKey: 'colParts', color: p.colParts });
      info.facts.push(`${soH} mm standoffs`);
    }

    /* ---------- camera mount ---------- */
    let camInfo = null;
    if (cw) {
      const wallT = camWall, inner = camInner, c = camC, t = camT, H = camH, pivotZ = camPivot, need = camNeedH;
      if (pivotZ - camSpan - 1.2 < 2.8 - 0.01) warn.push(`The camera would hit the base at ${p.camTilt}°. Set the height to 0 (auto) or raise the camera mount height to at least ${need} mm.`);
      if (soOn && camTopZ > soH) warn.push(`At ${p.camTilt}° the camera needs about ${Math.ceil(camTopZ)} mm between the plates, more than the ${soH} mm standoffs. Set the standoff height to 0 (auto) or use a smaller camera.`);
      const sx = camSO ? front.x : camOwnX, cy = camY;
      const baseW = Math.max(inner + 2 * wallT, 2 * sx + 7);
      let baseCS = K.rrect(baseW, 14, 2).subtract(K.circle(camSO ? soR : 1.6, 24).translate([-sx, 0]).add(K.circle(camSO ? soR : 1.6, 24).translate([sx, 0])));
      for (const [x, y] of so) if (Math.abs(x) < baseW / 2 + soR && Math.abs(y - cy) < 7 + soR) baseCS = baseCS.subtract(K.circle(soR, 24).translate([x, y - cy]));   // standoffs that land on the base
      let br = K.extrude(baseCS, 2.2);
      const side = () => K.extrude(K.poly([[-7, 0], [7, 0], [7, H * 0.6], [4, H], [-4, H], [-7, H * 0.6]]), wallT).rotate([90, 0, 90])
        .subtract(K.cyl(1.05, wallT + 2, 24).rotate([0, 90, 0]).translate([-1, 0, pivotZ]));
      br = br.add(side().translate([inner / 2, 0, 0])).add(side().translate([-inner / 2 - wallT, 0, 0]));
      const ry = -c * Math.cos(t) + c * Math.sin(t), rzb = Math.max(2.8, pivotZ - camSpan - 1.2);
      br = br.add(K.cyl(1.2, inner + 2 * wallT, 24).rotate([0, 90, 0]).translate([-inner / 2 - wallT, clamp(ry, -6, 6), rzb]));
      if (p.camTop) br = br.add(K.box(inner + 2 * wallT, 3.5, 2).translate([0, -2.5, H - 2]));
      printed.push({ name: 'camera', label: 'Camera mount', m: br.translate([0, cy, zStand]), colorKey: 'colParts', color: p.colParts });
      camInfo = { cy, z: zStand + pivotZ, t: p.camTilt };
      info.facts.push(`${H} mm camera mount`);
      info.lines.push(`Camera mount for ${camKey} cameras (${cw} mm): M2 screws through the pivot holes; the camera's lower back edge rests on the bar at ${p.camTilt}°.`);
    }

    /* ---------- antenna mount & strap-on action camera mount ---------- */
    let antInfo = null;
    if (p.antenna && soOn) {
      if (!rear) info.lines.push('No antenna mount: there is no pair of rear standoffs on this layout.');
      else {
        const w = 2 * rear.x + 8;
        let m = K.hull([K.box(w, 9, 1), K.box(Math.max(16, w - 10), 9, 11)]).subtract(K.cyl(soR, 30).translate([rear.x, 0, -1])).subtract(K.cyl(soR, 30).translate([-rear.x, 0, -1]));
        for (const s of [-1, 1]) m = m.subtract(K.cyl(2.1, 40, 24).translate([0, 0, -20]).rotate([45, 0, 0]).rotate([0, 0, s * 25]).translate([s * 3.5, 1, 6]));
        printed.push({ name: 'antenna', label: 'Antenna mount', m: m.translate([0, rear.y, zTop - 11 - 0.01]), colorKey: 'colParts', color: p.colParts });
        antInfo = { y: rear.y, z: zTop - 5 };
      }
    }
    const battTop = p.batt === 'top';
    const [bW, bL, bH] = cl.batt;
    const battZ = battTop ? (soOn ? zTop + p.topT : zArmTop + 1) : -bH;
    const strapZ = battZ + (battTop ? bH : 0);
    if (p.gopro === 'strap') {
      const base = K.box(Math.max(26, bW * 0.8), 34, 3).subtract(K.box(p.strapW + 1, 3, 10).translate([0, 11, -1])).subtract(K.box(p.strapW + 1, 3, 10).translate([0, -11, -1]));
      printed.push({ name: 'gopro-mount', label: 'Action cam mount', m: base.add(goproMount(p.goproTilt).translate([0, 0, 2.99])).translate([0, 0, strapZ]), colorKey: 'colParts', color: p.colParts });
      info.lines.push('Strap-on camera mount: thread the battery strap through both slots so it holds the battery and the camera together.');
    } else if (p.gopro === 'plate' && !soOn) warn.push('The action camera mount goes on the top plate. Turn on standoffs and a top plate.');

    /* ---------- print poses & layout ---------- */
    const items = printed.map(pt => {
      const T = pt.orient || I3(), m = pt.m.transform(col16(T)), b = m.boundingBox();
      return { pt, T, m, w: b.max[0] - b.min[0], d: b.max[1] - b.min[1], min: b.min };
    });
    const maxW = Math.max((p.bedX || 256) - 6, ...items.map(i => i.w));
    let x = 0, y = 0, rowD = 0;
    const parts = [];
    for (const it of items) {
      if (x > 0 && x + it.w > maxW) { x = 0; y += rowD + 8; rowD = 0; }
      const P = tr(x - it.min[0], y - it.min[1], -it.min[2]);
      x += it.w + 8; rowD = Math.max(rowD, it.d);
      parts.push({ name: it.pt.name, label: it.pt.label, m: it.m.transform(col16(P)), colorKey: it.pt.colorKey, color: it.pt.color, look: it.pt.look || null, asm: col16(inv(mul(P, it.T))) });
    }

    /* ---------- preview-only parts (assembled coordinates, never exported) ---------- */
    const pv = (name, label, m, colorKey, color, lk, opacity) => { if (m && !m.isEmpty()) parts.push({ name, label, m, colorKey, color, look: lk, opacity, preview: true }); };
    const [bD, bHt] = mk === 'custom' ? [Math.max(12, mS * 1.7), Math.max(10, mS)] : BELL[mk];
    const motorTop = [], bells = [], stators = [];
    arms.forEach((a, i) => {
      const z0 = i === tailIdx ? tiltTop : zArmTop;
      const stat = K.cyl(bD / 2 * 0.86, bHt * 0.3, 40).add(K.cyl(Math.max(0.8, bD * 0.05), bHt + 3, 16));
      const bell = K.cyl(bD / 2, bHt * 0.62, 48).translate([0, 0, bHt * 0.28]).add(K.cyl(bD / 2, bHt * 0.1, 48, bD / 2 * 0.72).translate([0, 0, bHt * 0.9]));
      stators.push(stat.translate([a.x, a.y, z0])); bells.push(bell.translate([a.x, a.y, z0]));
      motorTop.push({ x: a.x, y: a.y, z: z0 + bHt + 0.6, dir: i % 2 ? 1 : -1 });
      if (coax) {
        stators.push(stat.rotate([180, 0, 0]).translate([a.x, a.y, zArm0])); bells.push(bell.rotate([180, 0, 0]).translate([a.x, a.y, zArm0]));
        motorTop.push({ x: a.x, y: a.y, z: zArm0 - bHt - 1.4, dir: i % 2 ? -1 : 1 });
      }
    });
    if (p.pvParts) {
      pv('motors', 'Motors', K.union(bells), 'colMotor', p.colMotor, 'metal');
      const hw = [...stators];
      if (soOn) for (const [sx, sy] of so) hw.push(K.cyl(2.75, soH, 6).translate([sx, sy, zStand]));
      if (antInfo) for (const s of [-1, 1]) hw.push(K.cyl(1.9, 38, 16).rotate([45, 0, 0]).rotate([0, 0, s * 25]).translate([s * 3.5, antInfo.y - 1, antInfo.z]));
      pv('hardware', 'Standoffs & hardware', K.union(hw), null, '#9aa3ad', 'metal');
      const el = [];
      if (sS || !whoop) {
        const bs = sS ? sS + 6 : 24, bz = zStand + 3, rot = +p.stackRot || 0;
        el.push(K.box(bs, bs, 1.6).rotate([0, 0, rot]).translate([0, 0, bz]), K.box(bs * 0.3, bs * 0.3, 1.2).translate([0, 0, bz + 1.6]));
        if (sS && soH > 14) el.push(K.box(bs, bs, 1.6).rotate([0, 0, rot]).translate([0, 0, bz + 8]), K.box(bs * 0.25, bs * 0.4, 2).translate([bs * 0.2, 0, bz + 9.6]));
      } else el.push(K.box(26, 26, 1.6).translate([0, 0, armT + 1]));
      if (camInfo) el.push(K.box(cw, cw, cw, true).add(K.cyl(cw * 0.36, 6, 32).rotate([-90, 0, 0]).translate([0, cw / 2, 0])).rotate([camInfo.t, 0, 0]).translate([0, camInfo.cy, camInfo.z]));
      if (p.gps && soOn) el.push(K.box(20, 20, 6).translate([0, -bodyL * 0.26, zTop + p.topT + 1.6]));
      if (p.vtxStack && Math.abs(vtxY) + 14 <= bodyL / 2) el.push(K.box(26, 26, 1.6).translate([0, vtxY, zStand + 3]));
      // battery strap (black webbing) belongs with the electronics colour-wise
      const sw = Math.min(p.strapW, 20);
      el.push(K.box(bW + 1.6, sw, bH + 1.6).subtract(K.box(bW + 0.2, sw + 2, bH + 0.2).translate([0, 0, 0.7])).translate([0, 0, battZ - 0.8]));
      pv('electronics', 'Electronics & strap', K.union(el), null, '#1d2b24', 'pcb');
      const batt = K.softSlab(K.rrect(bW, bL, Math.min(4, bW * 0.15)), bH, Math.min(2.5, bH * 0.2), { steps: 3 }).translate([0, 0, battZ])
        .add(K.box(bW * 0.5, bL + 0.4, 0.5).translate([0, 0, battZ + bH * 0.35]));
      pv('battery', 'Battery', batt, 'colBatt', p.colBatt, 'plastic');
      if (p.gopro === 'strap' || (p.gopro === 'plate' && soOn)) {
        const gz = p.gopro === 'strap' ? strapZ + 3 : zTop + p.topT, gy = p.gopro === 'strap' ? 0 : bodyL * 0.22;
        const cam = K.box(62, 22, 44, true).add(K.cyl(9, 5, 40).rotate([-90, 0, 0]).translate([-14, 11, 6])).translate([0, 0, 22 + 16]);
        pv('actioncam', 'Action camera', cam.rotate([p.goproTilt, 0, 0]).translate([0, gy, gz]), null, '#16181c', 'plastic');
      }
    }
    if (p.pvProps) {
      const hubR = Math.max(2, propR * 0.09), top = [], bot = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, r = hubR * 0.6 + (propR - hubR * 0.6) * t, c = propR * (0.1 + 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.25))) * (1 - 0.55 * t * t);
        top.push([r, c * 0.62]); bot.push([r, -c * 0.38]); }
      const blade = K.extrude(soft(K.poly([...bot, ...top.reverse()]), Math.min(0.8, propR * 0.02)), Math.max(0.5, propR * 0.012)).rotate([12, 0, 0]);
      const one = K.union([K.cyl(hubR, Math.max(3, propR * 0.08), 24).translate([0, 0, -1]), ...Array.from({ length: p.blades }, (_, k) => blade.rotate([0, 0, k * 360 / p.blades]))]);
      const mirrored = one.mirror([0, 1, 0]), props = [], discs = [];
      motorTop.forEach((mt, i) => { props.push((mt.dir > 0 ? one : mirrored).rotate([0, 0, i * 37]).translate([mt.x, mt.y, mt.z])); discs.push(K.cyl(propR, 0.3, 64).translate([mt.x, mt.y, mt.z + 0.2])); });
      pv('props', 'Props', K.union(props), 'colProps', p.colProps, 'plastic');
      pv('discs', 'Prop arcs', K.union(discs), 'colProps', p.colProps, 'glass', 0.14);
    }

    /* ---------- notes ---------- */
    const diag = quadLike ? Math.max(Math.hypot(pos[0][0] - pos[2][0], pos[0][1] - pos[2][1]), Math.hypot(pos[1][0] - pos[3][0], pos[1][1] - pos[3][1])) : 2 * d;
    const nm = { quad: 'Quad', x8: 'X8', tri: 'Tricopter', y6: 'Y6', hex: 'Hexacopter', octo: 'Octocopter' }[air];
    info.facts.unshift(`${nm}, ${nArms * (coax ? 2 : 1)} motors`, `${cl.prop}″ props`, `${Math.round(diag)} mm wheelbase`);
    if (isFinite(minGap) && minGap >= p.propGap) info.facts.push(`${minGap.toFixed(0)} mm prop gap`);
    if (coax) info.lines.push('Coaxial: a second motor bolts under each arm with its prop facing down, spinning the other way.');
    if (sandwich) info.lines.push('Bolted arms: two M3 bolts hold each arm to the bottom plate; the outer one is the standoff screw. Print a spare arm or two.');
    info.lines.push('Print flat with 4–6 walls and 50–100% infill. PA-CF, PETG-CF or PETG survive crashes far better than PLA.');
    info.lines.push('A printed frame is heavier and flexier than carbon fibre: great for learning, cinewhoops and spares, but expect to reprint arms after hard crashes.');
    return { parts, warn, info };
  },
};
