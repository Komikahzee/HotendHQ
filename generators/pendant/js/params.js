// Parameter schema: drives defaults, the auto-generated HUD, search, presets and undo.

export const FONTS = [
  ['Cinzel', 'Cinzel — classic'], ['Cinzel Decorative', 'Cinzel Decorative'], ['Playfair Display', 'Playfair — elegant'],
  ['Bebas Neue', 'Bebas Neue — bold caps'], ['Oswald', 'Oswald — condensed'], ['Montserrat', 'Montserrat — modern'],
  ['Roboto Slab', 'Roboto Slab — sturdy'], ['Black Ops One', 'Black Ops — stencil'], ['Orbitron', 'Orbitron — tech'],
  ['Uncial Antiqua', 'Uncial — celtic'], ['Pirata One', 'Pirata — gothic'], ['Pacifico', 'Pacifico — script'],
  ['Great Vibes', 'Great Vibes — calligraphy'],
];

export const SECTIONS = [
  { id: 'shape', title: 'Shape & Size', icon: 'shape' },
  { id: 'image', title: 'Image & Height', icon: 'image' },
  { id: 'relief', title: 'Relief', icon: 'layers' },
  { id: 'border', title: 'Border & Edges', icon: 'ring' },
  { id: 'bail', title: 'Hanger / Bail', icon: 'link' },
  { id: 'connector', title: 'Connector Bail', icon: 'connector' },
  { id: 'text', title: 'Front Text', icon: 'type' },
  { id: 'back', title: 'Back & Base', icon: 'flip' },
  { id: 'look', title: 'Filament & Colors', icon: 'palette' },
];

export const SHAPES = [
  ['circle', 'Circle'], ['roundrect', 'Rounded'], ['polygon', 'Polygon'], ['heart', 'Heart'],
  ['shield', 'Shield'], ['star', 'Star'], ['scallop', 'Scalloped'], ['gear', 'Gear'],
  ['drop', 'Teardrop'], ['crescent', 'Crescent'], ['bone', 'Bone'], ['silhouette', 'Image outline'],
];

export const RELIEF_STYLES = [
  ['raised', 'Raised'], ['engraved', 'Engraved'], ['coin', 'Coin'], ['cameo', 'Cameo'], ['lithophane', 'Lithophane'],
  ['stencil', 'Stencil'], ['halftone', 'Halftone'], ['lines', 'Lines'], ['contour', 'Contours'], ['lineart', 'Line art'],
];
// Styles made of crisp raised patterns on a flat base (dots, lines…)
export const PATTERN_STYLES = ['halftone', 'lines', 'contour', 'lineart'];

export const FILAMENT_SWATCHES = [
  '#f4f1ea', '#1b1b1d', '#8a8d93', '#d4a017', '#c0c4cc', '#b8733d', '#c8102e', '#1f5fbf',
  '#1e8a4c', '#7b3fb5', '#ff7aa8', '#ff8a1f', '#6fe3c1', '#e8d7b5',
];

const R = (sec, key, label, min, max, step, def, unit = '', extra = {}) => ({ sec, key, label, type: 'range', min, max, step, def, unit, ...extra });
const S = (sec, key, label, opts, def, extra = {}) => ({ sec, key, label, type: 'select', opts, def, ...extra });
const T = (sec, key, label, def, extra = {}) => ({ sec, key, label, type: 'toggle', def, ...extra });
const X = (sec, key, label, def, extra = {}) => ({ sec, key, label, type: 'text', def, ...extra });
const C = (sec, key, label, def, extra = {}) => ({ sec, key, label, type: 'color', def, ...extra });

const not = (k, ...vals) => (p) => !vals.includes(p[k]);
const is = (k, ...vals) => (p) => vals.includes(p[k]);
const hasImg = (p, ctx) => ctx && ctx.hasImage;

export const PARAMS = [
  // ── Shape ───────────────────────────────────────────────
  { sec: 'shape', key: 'shape', label: 'Outline', type: 'shapes', def: 'circle', help: 'The outline of the pendant. "Image outline" follows the subject of your picture (remove the background first).' },
  R('shape', 'size', 'Width', 15, 150, 0.5, 50, 'mm', { help: 'Overall width of the main shape (excluding the bail).' }),
  R('shape', 'aspect', 'Height ratio', 0.3, 2, 0.01, 1, '×', { help: 'Height ÷ width. 1 = symmetric. Use <1 for dog tags and fobs, >1 for tall ovals.', show: not('shape', 'silhouette') }),
  R('shape', 'sides', 'Sides', 3, 12, 1, 6, '', { show: is('shape', 'polygon') }),
  R('shape', 'starPoints', 'Points', 3, 16, 1, 5, '', { show: is('shape', 'star') }),
  R('shape', 'starInner', 'Inner radius', 0.25, 0.9, 0.01, 0.52, '×', { show: is('shape', 'star') }),
  R('shape', 'petals', 'Scallops', 6, 48, 1, 16, '', { show: is('shape', 'scallop') }),
  R('shape', 'petalDepth', 'Scallop depth', 0.02, 0.25, 0.005, 0.07, '×', { show: is('shape', 'scallop') }),
  R('shape', 'teeth', 'Teeth', 6, 60, 1, 24, '', { show: is('shape', 'gear') }),
  R('shape', 'toothDepth', 'Tooth depth', 0.03, 0.25, 0.005, 0.1, '×', { show: is('shape', 'gear') }),
  T('shape', 'starBalls', 'Ball-tipped points', false, { show: is('shape', 'star'), help: 'Rounds each point into a ball — the classic sheriff / police star.' }),
  R('shape', 'starBallSize', 'Ball size', 0.04, 0.2, 0.005, 0.1, '×', { show: (p) => p.shape === 'star' && p.starBalls }),
  R('shape', 'corner', 'Corner rounding', 0, 1, 0.01, 0.3, '', { show: is('shape', 'roundrect', 'polygon', 'star', 'shield') }),
  R('shape', 'shapeRotate', 'Rotate outline', -180, 180, 1, 0, '°', { adv: true }),
  R('shape', 'silMargin', 'Outline margin', 0, 12, 0.1, 2.5, 'mm', { show: is('shape', 'silhouette'), help: 'How far the outline grows beyond the subject. Larger = sturdier.' }),
  S('shape', 'silStyle', 'Outline style', [['solid', 'Solid cut-out'], ['outline', 'Outline only']], 'solid', { seg: true, show: is('shape', 'silhouette'), help: 'Solid: the pendant is the subject’s silhouette. Outline only: a hollow line that traces every contour of the subject.' }),
  R('shape', 'silLineW', 'Outline width', 0.8, 6, 0.05, 1.8, 'mm', { show: (p) => p.shape === 'silhouette' && p.silStyle === 'outline', help: 'At least 3 nozzle widths (1.2 mm) for strength.' }),
  T('shape', 'silInner', 'Include inner contours', false, { show: (p) => p.shape === 'silhouette' && p.silStyle === 'outline', help: 'Also trace holes inside the subject. Inner rings that don’t touch the outer line print as loose pieces.' }),
  T('shape', 'backing', 'Background layer', false, { help: 'Adds a flat plate behind the design that follows its outline exactly, at a set distance — like a keychain backing. The hanger attaches to it. Swap filament at its top for a crisp two-colour look (the report gives the layer).' }),
  R('shape', 'backOffset', 'Layer margin', 0, 10, 0.1, 2, 'mm', { show: (p) => p.backing, help: 'How far the background layer reaches beyond the design. 0 = exactly the outline (it then fills in behind an "Outline only" silhouette).' }),
  R('shape', 'backThick', 'Layer thickness', 0.4, 6, 0.01, 1.16, 'mm', { show: (p) => p.backing, help: 'Keep it thinner than the design (Relief → Base thickness) so the design stands proud of it. Use a multiple of your layer height.' }),
  R('shape', 'traceSmooth', 'Trace smoothing', 0, 1, 0.01, 0.5, '', { show: is('shape', 'silhouette'), help: 'How much pixel noise is smoothed out of the traced contour.' }),
  R('shape', 'traceDetail', 'Trace detail', 0, 1, 0.01, 0.6, '', { show: is('shape', 'silhouette'), help: 'Higher keeps small features and sharp corners; lower gives simpler, rounder curves.' }),
  R('shape', 'traceMinArea', 'Ignore bits under', 0, 5, 0.05, 0.15, '%', { adv: true, show: is('shape', 'silhouette'), help: 'Traced islands and holes smaller than this share of the image are dropped.' }),
  R('shape', 'silSmooth', 'Extra rounding', 0, 4, 0.05, 0.3, 'mm', { adv: true, show: is('shape', 'silhouette'), help: 'Rounds off thin necks and tight corners after tracing.' }),

  // ── Image ───────────────────────────────────────────────
  T('image', 'imageOn', 'Show image on face', true, { help: 'Turn off for plain faces — tags, signs and text-only designs. Your image is kept.' }),
  S('image', 'heightSource', 'Height from', [['brightness', 'Brightness'], ['depth', 'AI Depth'], ['hybrid', 'Hybrid']], 'brightness',
    { seg: true, help: 'Brightness: light = high (classic). AI Depth: a neural network estimates real 3D depth from the photo, right in your browser (one-time ~50 MB load, ~10 s per image; the photo never leaves your device) — great for faces, pets and objects. Hybrid mixes the two: depth for form, brightness for fine detail.' }),
  S('image', 'imgKind', 'Image type', [['auto', 'Auto'], ['graphic', 'Graphic'], ['photo', 'Photo']], 'auto', { seg: true, show: (p) => p.mode === 'raised' || p.mode === 'engraved',
    help: 'Graphic: logos, lettering and clip art — every flat colour becomes a flat face with crisp vertical walls. Photo: a smooth sculpted relief. Auto decides from the image.' }),
  R('image', 'depthMix', 'Depth ↔ detail mix', 0, 1, 0.01, 0.65, '', { show: is('heightSource', 'hybrid'), help: 'Higher = more of the sculpted AI depth, lower = more fine detail from the photo’s shading.' }),
  T('image', 'sculpt', 'Sculpted bas-relief', true, { show: (p) => p.heightSource !== 'brightness', help: 'Shapes the AI depth the way a medal engraver would: big forms are flattened into the relief depth while cheeks, folds and fur keep their full modelling, and the step around the subject becomes a gentle lift instead of a cliff. Off = the raw depth map.' }),
  R('image', 'sculptFlatten', 'Flatten big forms', 0, 0.9, 0.01, 0.55, '', { show: (p) => p.heightSource !== 'brightness' && p.sculpt !== false, help: 'Higher = a flatter, coin-like relief where fine modelling reads more strongly. Lower = closer to the true depth of the scene.' }),
  R('image', 'sculptDetail', 'Photo detail', 0, 1, 0.01, 0.15, '', { show: (p) => p.heightSource === 'depth' && p.sculpt !== false, help: 'Borrows fine detail (hair, fabric, engraving) from the photo’s shading. 0 = pure sculpted depth.' }),
  S('image', 'bgMode', 'Background removal', [['none', 'None'], ['alpha', 'PNG transparency'], ['auto', 'Smart auto (colour)'], ['ai', 'AI portrait cut-out (people)'], ['light', 'Remove light'], ['dark', 'Remove dark']], 'alpha',
    { help: 'Separates the subject from its background. Smart auto learns the background colours from the border (handles gradients). AI portrait cut-out runs a matting neural network right in your browser — best for photos of people (one-time ~7 MB load; the photo never leaves your device). For logos, objects and pets use Smart auto.' }),
  R('image', 'bgTolerance', 'Tolerance', 0.01, 0.6, 0.01, 0.14, '', { show: is('bgMode', 'auto', 'light', 'dark') }),
  T('image', 'bgKeepLargest', 'Keep main subject only', false, { show: is('bgMode', 'auto', 'ai', 'light', 'dark'), help: 'Discards everything except the largest connected subject.' }),
  T('image', 'bgFillHoles', 'Fill pinholes', true, { adv: true, show: is('bgMode', 'auto', 'ai', 'light', 'dark'), help: 'Closes small enclosed gaps inside the subject.' }),
  R('image', 'bgSpeck', 'Remove specks under', 0, 3, 0.05, 0.1, '%', { adv: true, show: is('bgMode', 'auto', 'ai', 'light', 'dark'), help: 'Specks smaller than this share of the image are removed.' }),
  T('image', 'bgEdge', 'Snap edge to image', true, { adv: true, show: is('bgMode', 'auto', 'ai', 'light', 'dark'), help: 'Refines the cut-out edge onto the real image edge (guided filter).' }),
  R('image', 'bgLevel', 'Background height', 0, 1, 0.01, 0, '', { help: 'Height used for removed background and uncovered areas (0 = flat base).', adv: true }),
  T('image', 'invert', 'Invert', false, { help: 'Swap high and low. Useful for dark-on-light artwork.' }),
  T('image', 'autoLevels', 'Auto levels', true, { help: 'Stretches the image to use the full height range.' }),
  R('image', 'brightness', 'Brightness', -0.5, 0.5, 0.01, 0, ''),
  R('image', 'contrast', 'Contrast', -0.8, 1.5, 0.01, 0.1, ''),
  R('image', 'gamma', 'Midtones', 0.3, 3, 0.01, 1, '', { help: '>1 lifts midtones (more volume), <1 pushes them down.' }),
  R('image', 'denoise', 'Clean surface', 0, 2, 0.01, 0.45, 'mm', { help: 'Edge-preserving smoothing: irons out grain, JPEG noise and pixel steps while keeping edges crisp. The main control for a pristine finish.' }),
  R('image', 'denoiseEdge', 'Edge protection', 0.01, 0.4, 0.005, 0.07, '', { adv: true, help: 'Lower = only strong edges survive (smoother, more "cast"). Higher = keeps more fine texture.' }),
  S('image', 'symmetry', 'Symmetry', [['none', 'None'], ['mirrorX', 'Mirror ↔'], ['mirrorY', 'Mirror ↕'], ['quad', 'Quad'], ['radial', 'Radial']], 'none', { help: 'Makes the design perfectly symmetrical about the pendant centre. Radial = kaleidoscope, great for mandalas and medallions.' }),
  R('image', 'radialN', 'Radial segments', 2, 24, 1, 8, '', { show: is('symmetry', 'radial') }),
  R('image', 'smoothing', 'Soften (blur)', 0, 2, 0.01, 0, 'mm', { adv: true, help: 'Plain blur — rounds everything, including edges. Prefer "Clean surface".' }),
  R('image', 'sharpen', 'Sharpen', 0, 3, 0.05, 0, '', { adv: true, help: 'Crisps fine detail edges (unsharp mask). Can add grain on photos.' }),
  R('image', 'clarity', 'Clarity', 0, 2, 0.05, 0, '', { adv: true, help: 'Boosts local contrast so detail reads even in shallow reliefs.' }),
  R('image', 'edgeBoost', 'Edge outline', 0, 2, 0.05, 0, '', { adv: true, help: 'Raises the outlines of shapes — a cartoon/engraved look.' }),
  R('image', 'posterize', 'Posterize steps', 0, 12, 1, 0, '', { show: (p) => !PATTERN_STYLES.includes(p.mode) && p.mode !== 'stencil', help: 'Quantises height into flat terraces (0 = off). Match with filament colour bands for layer-art prints.' }),
  R('image', 'imgZoom', 'Zoom', 0.1, 5, 0.01, 1, '×', { help: 'Tip: scroll on the design preview to zoom.' }),
  R('image', 'imgX', 'Offset X', -80, 80, 0.1, 0, 'mm', { help: 'Tip: drag the design preview to move the image.' }),
  R('image', 'imgY', 'Offset Y', -80, 80, 0.1, 0, 'mm'),
  R('image', 'imgRotate', 'Rotate', -180, 180, 0.5, 0, '°', { help: 'Tip: Shift + scroll on the design preview.' }),
  T('image', 'imgFlip', 'Mirror image', false),
  R('image', 'imgInset', 'Gap to border', 0, 10, 0.1, 0.6, 'mm', { help: 'Flat margin between the rim and the image.' }),
  R('image', 'imgFade', 'Edge fade', 0, 8, 0.1, 1.2, 'mm', { help: 'Softly blends the relief into the base near its edge.' }),

  // ── Relief ──────────────────────────────────────────────
  S('relief', 'mode', 'Style', RELIEF_STYLES.map(([k, l]) => [k, l]), 'raised',
    { seg: true, help: 'Raised: bright areas stand up. Engraved: carved into a flat plate. Coin: medal-style bas-relief — big forms flattened, fine detail kept, edges rolled. Cameo: the subject puffs up like a cushion. Lithophane: thin panel that shows the photo when backlit. Stencil: crisp two-level cut-out. Halftone, Lines, Contours and Line art turn the image into crisp printable patterns — superb with a colour swap.' }),
  R('relief', 'base', 'Base thickness', 0.4, 6, 0.05, 1.6, 'mm', { help: 'Solid backing under the relief. ≥1.2 mm recommended for pendants.' }),
  R('relief', 'depth', 'Relief depth', 0.2, 8, 0.05, 2, 'mm', { show: (p) => !PATTERN_STYLES.includes(p.mode), help: 'Height range of the image above the base (lithophane: thin → thick range).' }),
  R('relief', 'stencilThreshold', 'Threshold', 0.02, 0.98, 0.01, 0.5, '', { show: is('mode', 'stencil') }),
  R('relief', 'styleDetail', 'Fine detail', 0, 1, 0.01, 0.5, '', { show: is('mode', 'coin', 'cameo'), help: 'How strongly fine texture (hair, fur, engraving) is kept on top of the main forms.' }),
  R('relief', 'styleRound', 'Edge rounding', 0.3, 12, 0.1, 2.5, 'mm', { show: is('mode', 'coin', 'cameo'), help: 'How far in from the subject’s outline the surface rolls down to the field. Larger = puffier.' }),
  R('relief', 'patternH', 'Pattern height', 0.2, 4, 0.05, 1, 'mm', { show: (p) => PATTERN_STYLES.includes(p.mode), help: 'How far the dots or lines stand above the base. Use a multiple of your layer height; with a colour swap at this height the pattern prints in a second colour.' }),
  R('relief', 'patternPitch', 'Pattern spacing', 0.6, 5, 0.05, 1.6, 'mm', { show: is('mode', 'halftone', 'lines'), help: 'Distance between dots or lines. At least 3× your nozzle width keeps every gap printable.' }),
  R('relief', 'dotAngle', 'Screen angle', -90, 90, 1, 45, '°', { show: is('mode', 'halftone'), adv: true }),
  R('relief', 'lineAngle', 'Line angle', -90, 90, 1, 0, '°', { show: is('mode', 'lines') }),
  R('relief', 'lineW', 'Line width', 0.3, 2.5, 0.05, 0.6, 'mm', { show: is('mode', 'contour', 'lineart'), help: 'Keep ≥ your nozzle width (0.4 mm) so lines print cleanly.' }),
  R('relief', 'contourN', 'Contour levels', 3, 40, 1, 12, '', { show: is('mode', 'contour') }),
  R('relief', 'lineSens', 'Line sensitivity', 0, 1, 0.01, 0.5, '', { show: is('mode', 'lineart'), help: 'Higher picks up fainter edges; lower keeps only the strongest outlines.' }),
  R('relief', 'minDot', 'Smallest dot / line', 0.2, 1.2, 0.01, 0.4, 'mm', { show: is('mode', 'halftone', 'lines'), adv: true, help: 'Dots and lines thinner than this are dropped (dots) or held at this width (lines), so nothing is too fine to print.' }),
  R('relief', 'minFeature', 'Smallest detail', 0, 1, 0.01, 0.12, 'mm²', { adv: true, help: 'Terrace or lettering fragments smaller than this merge into their surroundings — no unprintable specks or stray walls.' }),
  R('relief', 'minIsland', 'Drop loose bits under', 0, 20, 0.1, 1, 'mm²', { adv: true, help: 'Separate islands of the outline smaller than this are removed so nothing prints loose.' }),
  R('relief', 'dome', 'Dome', 0, 6, 0.05, 0, 'mm', { help: 'Curves the whole face like a coin or cabochon.' }),
  R('relief', 'pillow', 'Puffy edge', 0, 4, 0.05, 0, 'mm', { help: 'Rounds the face down towards the outline like a cushion — soft, jewellery-style edges.' }),
  R('relief', 'pillowW', 'Puffy width', 0.5, 15, 0.1, 4, 'mm', { show: (p) => p.pillow > 0 }),

  // ── Border ──────────────────────────────────────────────
  S('border', 'rimStyle', 'Rim style', [['none', 'None'], ['flat', 'Flat'], ['rounded', 'Rounded'], ['bevel', 'Bevelled'], ['beaded', 'Beaded'], ['rope', 'Rope twist'], ['double', 'Double line'], ['stepped', 'Stepped'], ['milled', 'Coin milled']], 'none'),
  R('border', 'rimWidth', 'Rim width', 0.8, 10, 0.05, 2.8, 'mm', { show: not('rimStyle', 'none') }),
  R('border', 'rimHeight', 'Rim height', 0, 8, 0.05, 2.4, 'mm', { show: not('rimStyle', 'none'), help: 'Rim top measured from the top of the base. Slightly above relief depth protects the design.' }),
  R('border', 'topBevel', 'Top edge bevel', 0, 2.5, 0.05, 0.4, 'mm', { help: 'Chamfers the top outer edge — softer feel, no sharp corner.' }),
  R('border', 'footChamfer', 'Elephant-foot chamfer', 0, 1.2, 0.05, 0.3, 'mm', { help: 'Small chamfer on the bottom edge that cancels first-layer squish (elephant foot).' }),

  // ── Bail ────────────────────────────────────────────────
  S('bail', 'bail', 'Type', [['none', 'None'], ['tab', 'Loop'], ['punched', 'Hole'], ['tube', 'Tube'], ['cord', 'Cord slot']], 'none', { seg: true,
    help: 'Loop: a ring grows from the edge (strongest; hang with a jump ring). Hole: punched inside the shape with a reinforcing collar. Tube: a horizontal chain tunnel — the chain threads straight through and the pendant faces forward, no jump ring needed. Cord slot: a wide slot for leather cord or ribbon.' }),
  { sec: 'bail', key: 'tabShape', label: 'Loop shape', type: 'select', seg: true, def: 'round', opts: [['round', 'Round'], ['oval', 'Oval'], ['drop', 'Drop'], ['heart', 'Heart'], ['bar', 'Ribbon bar'], ['double', 'Double'], ['hook', 'Clip hook'], ['flower', 'Flower'], ['star', 'Star'], ['hex', 'Hex']],
    show: is('bail', 'tab'), help: 'Oval gives chains room to move. Ribbon bar takes wide cords. Double = two stacked loops (charm + chain). Clip hook has a slot so it slides onto a chain without opening a ring.' },
  { sec: 'bail', key: 'holeShape', label: 'Hole shape', type: 'select', seg: true, def: 'round', opts: [['round', 'Round'], ['slot', 'Slot'], ['drop', 'Drop'], ['heart', 'Heart'], ['star', 'Star']], show: is('bail', 'punched') },
  S('bail', 'bailPlace', 'Position', [['top', 'Top'], ['pair', 'Top pair'], ['sides', 'Sides']], 'top', { seg: true, show: is('bail', 'tab', 'punched'), help: 'Sides = bracelet charm / connector.' }),
  R('bail', 'bailAngle', 'Rotate position', -180, 180, 1, 0, '°', { show: is('bail', 'tab', 'punched'), help: 'Move the bail around the edge — e.g. 45° for a keychain corner.' }),
  R('bail', 'tubeHoleD', 'Chain channel', 1.6, 7, 0.1, 3.4, 'mm', { show: is('bail', 'tube'), help: 'Inner diameter of the tunnel. Most chains need 2.5–3.5 mm; leather cord 3.5–5 mm. The roof is teardrop-shaped so it prints without supports.' }),
  R('bail', 'tubeWall', 'Tube wall', 0.8, 3, 0.05, 1.3, 'mm', { show: is('bail', 'tube') }),
  R('bail', 'tubeLen', 'Tube length', 4, 40, 0.5, 9, 'mm', { show: is('bail', 'tube') }),
  R('bail', 'bailSpread', 'Pair spread', 8, 90, 1, 28, '°', { show: (p) => p.bail !== 'none' && p.bailPlace === 'pair' }),
  R('bail', 'cordW', 'Slot length', 3, 30, 0.5, 9, 'mm', { show: is('bail', 'cord'), help: 'Width of the cord slot along the edge.' }),
  R('bail', 'holeD', 'Hole diameter', 1.2, 12, 0.1, 3.6, 'mm', { show: is('bail', 'tab', 'punched', 'cord'), help: 'Jump rings need ~3 mm; keyrings ~5 mm; cords 2–4 mm.' }),
  R('bail', 'tabD', 'Loop outer diameter', 3, 24, 0.1, 8.5, 'mm', { show: is('bail', 'tab') }),
  R('bail', 'tabThick', 'Loop thickness', 0.8, 8, 0.05, 3.2, 'mm', { show: is('bail', 'tab', 'tube'), help: 'Thickness of the loop (or the neck under a tube bail).' }),
  R('bail', 'tabOverlap', 'Loop overlap', 0, 8, 0.1, 1.8, 'mm', { show: is('bail', 'tab'), adv: true, help: 'How far the loop sinks into the shape. More = stronger joint.' }),
  R('bail', 'holeInset', 'Hole inset', 1, 20, 0.1, 4.2, 'mm', { show: is('bail', 'punched', 'cord'), help: 'Distance from the outer edge to the hole centre.' }),
  T('bail', 'collar', 'Reinforcing collar', true, { show: is('bail', 'punched', 'cord') }),
  R('bail', 'collarW', 'Collar width', 0.4, 4, 0.05, 1.2, 'mm', { show: (p) => (p.bail === 'punched' || p.bail === 'cord') && p.collar }),

  // ── Text ────────────────────────────────────────────────
  X('text', 'textTop', 'Top arc text', ''),
  X('text', 'textBottom', 'Bottom arc text', ''),
  X('text', 'textCenter', 'Centre text', '', { multiline: true, help: 'Straight text. Use Enter for multiple lines.' }),
  S('text', 'font', 'Font', FONTS, 'Cinzel', { font: true }),
  T('text', 'textBold', 'Bold', true),
  S('text', 'textStyle', 'Text style', [['raised', 'Raised'], ['engraved', 'Engraved']], 'raised', { seg: true }),
  R('text', 'textSize', 'Arc text size', 1.5, 14, 0.1, 4.4, 'mm'),
  R('text', 'centerSize', 'Centre text size', 1.5, 30, 0.1, 7, 'mm'),
  R('text', 'centerY', 'Centre text Y', -60, 60, 0.1, 0, 'mm'),
  R('text', 'textHeight', 'Text height/depth', 0.2, 3, 0.05, 0.8, 'mm', { help: 'Aim for at least 4 layers so letters read clearly.' }),
  R('text', 'textSpacing', 'Letter spacing', -0.2, 1, 0.01, 0.12, 'em'),
  R('text', 'textRadius', 'Arc radius', 0, 80, 0.1, 0, 'mm', { adv: true, help: '0 = follow the outline automatically. Set a fixed radius to run lettering around a seal or inner ring.' }),
  R('text', 'textInset', 'Arc inset', -8, 12, 0.05, 0.6, 'mm', { help: 'Distance of arc text from the rim.' }),
  R('text', 'textBevel', 'Letter bevel', 0, 1, 0.01, 0, 'mm', { help: '0 = crisp vertical letter walls (sharpest print, least geometry). Above 0 chamfers the edges like struck coin lettering.' }),
  R('text', 'textStroke', 'Stroke boost', 0, 0.8, 0.01, 0.12, 'mm', { help: 'Thickens thin letter strokes so a 0.4 mm nozzle can print them.' }),
  T('text', 'textClear', 'Clear image behind arc text', true, { help: 'Flattens the relief under the arc text for readability.' }),

  // ── Back ────────────────────────────────────────────────
  X('back', 'backText', 'Engraved back text', '', { multiline: true, help: 'Mirrored automatically so it reads correctly from the back. Great for names, dates, phone numbers.' }),
  S('back', 'backFont', 'Back font', FONTS, 'Montserrat', { font: true, show: (p) => !!p.backText }),
  R('back', 'backSize', 'Back text size', 1.5, 20, 0.1, 4.5, 'mm', { show: (p) => !!p.backText }),
  R('back', 'backDepth', 'Engrave depth', 0.2, 2, 0.05, 0.4, 'mm', { show: (p) => !!p.backText }),
  T('back', 'pocket', 'Magnet / insert pocket', false, { help: 'Round recess in the back for a magnet, NFC tag or photo insert.' }),
  R('back', 'pocketD', 'Pocket diameter', 2, 40, 0.1, 10.2, 'mm', { show: (p) => p.pocket }),
  R('back', 'pocketDepth', 'Pocket depth', 0.4, 5, 0.05, 2.1, 'mm', { show: (p) => p.pocket }),

  // ── Connector bail (separate printed part) ──────────────
  T('connector', 'cbOn', 'Add a connector bail', false, { help: 'A separate decorative bail that joins the pendant to the chain. Prints flat with no supports, next to the pendant.' }),
  { sec: 'connector', key: 'cbTemplate', label: 'Design', type: 'templates', def: 'crown', show: (p) => p.cbOn },
  { sec: 'connector', key: 'cbImage', label: 'Your image', type: 'cbimage', def: null, show: (p) => p.cbOn && p.cbTemplate === 'custom' },
  S('connector', 'cbBgMode', 'Background removal', [['alpha', 'PNG transparency'], ['auto', 'Auto (edge flood)'], ['light', 'Remove light'], ['dark', 'Remove dark']], 'auto', { show: (p) => p.cbOn && p.cbTemplate === 'custom' }),
  R('connector', 'cbBgTol', 'Tolerance', 0.01, 0.6, 0.01, 0.16, '', { show: (p) => p.cbOn && p.cbTemplate === 'custom' && p.cbBgMode !== 'alpha' }),
  T('connector', 'cbInvert', 'Invert relief', false, { show: (p) => p.cbOn && p.cbTemplate === 'custom' }),
  S('connector', 'cbSymmetry', 'Symmetry', [['none', 'None'], ['mirrorX', 'Mirror ↔']], 'none', { seg: true, show: (p) => p.cbOn && p.cbTemplate === 'custom' }),
  R('connector', 'cbMargin', 'Outline margin', 0, 5, 0.05, 0.8, 'mm', { show: (p) => p.cbOn && p.cbTemplate === 'custom' }),
  R('connector', 'cbSize', 'Height', 8, 45, 0.5, 18, 'mm', { show: (p) => p.cbOn }),
  R('connector', 'cbBase', 'Thickness', 0.8, 5, 0.05, 1.8, 'mm', { show: (p) => p.cbOn }),
  R('connector', 'cbDepth', 'Relief depth', 0.2, 4, 0.05, 1.1, 'mm', { show: (p) => p.cbOn }),
  R('connector', 'cbPillow', 'Puffy edge', 0, 3, 0.05, 0.6, 'mm', { show: (p) => p.cbOn }),
  S('connector', 'cbRim', 'Rim', [['none', 'None'], ['flat', 'Flat'], ['rounded', 'Rounded'], ['beaded', 'Beaded'], ['rope', 'Rope']], 'none', { show: (p) => p.cbOn }),
  R('connector', 'cbRimW', 'Rim width', 0.6, 3, 0.05, 1.2, 'mm', { show: (p) => p.cbOn && p.cbRim !== 'none' }),
  S('connector', 'cbChannel', 'Chain side', [['tube', 'Tube'], ['loop', 'Loop']], 'tube', { seg: true, show: (p) => p.cbOn,
    help: 'Tube: the chain threads through horizontally so the pendant faces forward. Loop: a flat loop for a jump ring or split ring.' }),
  { sec: 'connector', key: 'cbLoopShape', label: 'Loop shape', type: 'select', seg: true, def: 'round', opts: [['round', 'Round'], ['oval', 'Oval'], ['drop', 'Drop'], ['heart', 'Heart']], show: (p) => p.cbOn && p.cbChannel === 'loop' },
  R('connector', 'cbChainD', 'Chain hole', 1.6, 7, 0.1, 3.4, 'mm', { show: (p) => p.cbOn }),
  R('connector', 'cbWall', 'Wall', 0.8, 3, 0.05, 1.3, 'mm', { show: (p) => p.cbOn }),
  R('connector', 'cbTubeLen', 'Tube length', 4, 30, 0.5, 9, 'mm', { show: (p) => p.cbOn && p.cbChannel === 'tube' }),
  S('connector', 'cbJoin', 'Joins pendant by', [['ring', 'Jump ring'], ['loop', 'Loop'], ['glue', 'Glue pad'], ['peg', 'Snap peg']], 'ring', { seg: true, show: (p) => p.cbOn,
    help: 'Jump ring: a hole at the bottom for a metal jump ring. Loop: a printed loop instead of a hole. Glue pad: flat back to glue behind the pendant. Snap peg: a post that pushes through the pendant hole (add a drop of glue).' }),
  R('connector', 'cbRingD', 'Ring hole', 1.2, 6, 0.1, 2.2, 'mm', { show: (p) => p.cbOn && (p.cbJoin === 'ring' || p.cbJoin === 'loop') }),
  R('connector', 'cbPegD', 'Peg diameter', 1, 8, 0.05, 3.3, 'mm', { show: (p) => p.cbOn && p.cbJoin === 'peg', help: 'Make it ~0.3 mm smaller than the pendant hole for a snug push fit.' }),
  R('connector', 'cbPegH', 'Peg length', 0.8, 8, 0.05, 3.2, 'mm', { show: (p) => p.cbOn && p.cbJoin === 'peg' }),
  T('connector', 'cbMatch', 'Same filament as pendant', true, { show: (p) => p.cbOn }),
  C('connector', 'cbColor', 'Connector colour', '#d4a017', { show: (p) => p.cbOn && !p.cbMatch }),
  // ── Look ────────────────────────────────────────────────
  S('look', 'material', 'Filament type', [['matte', 'Matte PLA'], ['silk', 'Silk PLA'], ['glossy', 'PETG gloss'], ['metal', 'Metal cast'], ['translucent', 'Translucent'], ['glow', 'Glow-in-dark']], 'silk'),
  C('look', 'color', 'Filament colour', '#d4a017', { show: (p) => p.colorMode === 'single' }),
  S('look', 'colorMode', 'Colouring', [['single', 'Single filament'], ['bands', 'Colour swap layers']], 'single', { seg: true,
    help: 'Colour swap: changes filament at set heights (M600 / pause). The report lists the exact layer numbers.' }),
  { sec: 'look', key: 'bands', label: 'Band colours', type: 'bands', def: null, show: is('colorMode', 'bands') },
  R('look', 'bandCount', 'Colours', 2, 6, 1, 4, '', { show: is('colorMode', 'bands') }),
  C('look', 'band0', 'Colour 1 (base)', '#1b1b1d', { hidden: true }),
  C('look', 'band1', 'Colour 2', '#6b6f78', { hidden: true }),
  C('look', 'band2', 'Colour 3', '#c9b99a', { hidden: true }),
  C('look', 'band3', 'Colour 4', '#f4f1ea', { hidden: true }),
  C('look', 'band4', 'Colour 5', '#ff8a1f', { hidden: true }),
  C('look', 'band5', 'Colour 6', '#c8102e', { hidden: true }),
  R('look', 'bandLow', 'First swap at', 0, 1, 0.01, 0, '', { show: is('colorMode', 'bands'), adv: true, help: 'Fraction of relief depth where the first colour change happens.' }),
  R('look', 'bandHigh', 'Last swap at', 0, 1, 0.01, 1, '', { show: is('colorMode', 'bands'), adv: true }),
  R('look', 'layerH', 'Layer height', 0.04, 0.4, 0.01, 0.16, 'mm', { help: 'Used for layer-line preview, swap layer numbers and checks.' }),
  R('look', 'firstLayer', 'First layer', 0.08, 0.4, 0.01, 0.2, 'mm', { adv: true }),
  R('look', 'density', 'Filament density', 0.9, 2.5, 0.01, 1.24, 'g/cm³', { adv: true }),

  // ── Non-HUD (export / view) ─────────────────────────────
  { key: 'exportRes', def: 0.08 }, { key: 'exportFormat', def: 'stl' }, { key: 'meshTol', def: 0.01 },
];

export function defaults() {
  const p = {};
  for (const s of PARAMS) if (s.def !== null && s.def !== undefined) p[s.key] = s.def;
  return p;
}

export const DEFAULTS = defaults();

export const BAND_PALETTES = [
  ['Mono (black → white)', ['#1b1b1d', '#6b6f78', '#b9bcc2', '#f4f1ea', '#ffffff', '#ffffff']],
  ['Gold on black', ['#1b1b1d', '#6b4e16', '#b8860b', '#e7c35a', '#fff1b8', '#ffffff']],
  ['Sunset', ['#2b1740', '#8f2d56', '#d8572a', '#f7b538', '#fff1c1', '#ffffff']],
  ['Ocean', ['#0b1d3a', '#12507b', '#1f8aa8', '#7fd1c7', '#e9fbf6', '#ffffff']],
  ['Forest', ['#14261a', '#2e5e3a', '#6f9a4f', '#c9d98a', '#f4f1ea', '#ffffff']],
  ['Sepia portrait', ['#20140c', '#5b3b24', '#9b6e45', '#d8b98c', '#f4ead8', '#ffffff']],
];

// cat: jewelry | badges | signs | photo (multi-colour presets also appear under "Multi-colour").
// forceSample: always load the preset's own artwork (e.g. a badge seal) instead of keeping the user's image.
export const PRESETS = [
  // ── Jewellery ──
  { id: 'heirloom', cat: 'jewelry', name: 'Heirloom + Crown Bail', desc: 'Medallion hung from a jewelled crown connector.', sample: 'compass',
    p: { shape: 'circle', size: 44, rimStyle: 'beaded', rimWidth: 2.4, material: 'silk', color: '#c0c4cc', bail: 'tab', tabD: 7.5, holeD: 3, textTop: 'FOREVER', textBottom: '✦', cbOn: true, cbTemplate: 'crown', cbJoin: 'ring', cbChannel: 'tube', cbSize: 17 } },
  { id: 'medallion', cat: 'jewelry', name: 'Classic Medallion', desc: 'Gold silk, rope rim, arc lettering.', sample: 'compass',
    p: { shape: 'circle', size: 50, rimStyle: 'rope', material: 'silk', color: '#d4a017', textTop: 'HOTENDHQ', textBottom: '★ 2026 ★', bail: 'tab' } },
  { id: 'namebar', cat: 'jewelry', name: 'Name Bar Necklace', desc: 'Script name on a bar with side loops.',
    p: { shape: 'roundrect', size: 50, aspect: 0.32, corner: 1, imageOn: false, textCenter: 'Olivia', font: 'Great Vibes', centerSize: 11, textHeight: 1, textStroke: 0.22, rimStyle: 'rounded', rimWidth: 1.4, rimHeight: 0.9, base: 1.6, depth: 0.4, bail: 'tab', bailPlace: 'sides', tabD: 5.2, holeD: 2.4, tabThick: 2, material: 'silk', color: '#d4a017' } },
  { id: 'monogram', cat: 'jewelry', name: 'Monogram Disc', desc: 'Single script initial in a rope frame.',
    p: { shape: 'circle', size: 34, imageOn: false, textCenter: 'A', font: 'Great Vibes', centerSize: 19, centerY: 0.5, textHeight: 1.3, textStroke: 0.25, rimStyle: 'rope', rimWidth: 2.2, rimHeight: 1.5, base: 1.6, depth: 0.4, dome: 0.6, material: 'silk', color: '#b8733d', bail: 'tab', tabShape: 'oval' } },
  { id: 'heart', cat: 'jewelry', name: 'Heart Charm', desc: 'Beaded heart in pink silk.', sample: 'sunburst',
    p: { shape: 'heart', size: 32, rimStyle: 'beaded', rimWidth: 2, rimHeight: 1.8, depth: 1.4, base: 1.4, material: 'silk', color: '#ff7aa8', bail: 'tab', tabD: 6.5, holeD: 2.8, tabThick: 2.6 } },
  { id: 'angel', cat: 'jewelry', name: 'Angel Wing Drop', desc: 'Teardrop pendant under a winged-heart bail.', sample: 'sunburst',
    p: { shape: 'drop', size: 34, rimStyle: 'rounded', rimWidth: 2, rimHeight: 1.6, pillow: 0.8, pillowW: 3, material: 'silk', color: '#e8d7b5', bail: 'tab', tabD: 6.5, holeD: 2.8, cbOn: true, cbTemplate: 'wing', cbSize: 22, cbJoin: 'ring' } },
  { id: 'tubecharm', cat: 'jewelry', name: 'Tube-Bail Charm', desc: 'Chain threads straight through — faces forward.', sample: 'sunburst',
    p: { shape: 'scallop', size: 34, petals: 20, rimStyle: 'rounded', rimWidth: 2, rimHeight: 1.8, depth: 1.5, bail: 'tube', tubeLen: 10, material: 'glossy', color: '#7b3fb5', pillow: 0.8, pillowW: 3.5 } },

  // ── Badges & tags ──
  { id: 'dogtag', cat: 'badges', name: 'Military Dog Tag', desc: 'Regulation 2" × 1⅛" tag, rolled edge, embossed ID.',
    p: { shape: 'roundrect', size: 50.8, aspect: 0.563, corner: 0.34, imageOn: false, rimStyle: 'rounded', rimWidth: 1.6, rimHeight: 0.5, base: 1.1, depth: 0.3, topBevel: 0.2, footChamfer: 0.2,
      textCenter: 'MILLER\nJAMES R\n0412 7788 21\nO POS\nNO PREFERENCE', font: 'Roboto Slab', textBold: true, centerSize: 3.4, textHeight: 0.5, textSpacing: 0.06, textStroke: 0.08, centerY: 0,
      bail: 'punched', bailAngle: -90, holeD: 3.2, holeInset: 4.6, collar: false, material: 'metal', color: '#c0c4cc' } },
  { id: 'police', cat: 'badges', name: 'Police Star Badge', desc: 'Seven-point ball-tipped star with a lettered seal.', sample: 'seal', forceSample: true,
    p: { shape: 'star', size: 52, starPoints: 7, starInner: 0.58, starBalls: true, starBallSize: 0.095, corner: 0.4, rimStyle: 'bevel', rimWidth: 1.6, rimHeight: 1.8, base: 2, depth: 1.4,
      imgZoom: 0.62, imgInset: 0, imgFade: 0.4, textTop: 'POLICE', textBottom: 'DEPARTMENT', textRadius: 11.6, textSize: 3, font: 'Roboto Slab', textBold: true, textSpacing: 0.14, textHeight: 0.6, textClear: false,
      backText: 'BADGE\n0451', bail: 'tab', material: 'metal', color: '#d4a017' } },
  { id: 'sheriff', cat: 'badges', name: 'Sheriff Star', desc: 'Six-point star, silver, county seal.', sample: 'seal', forceSample: true,
    p: { shape: 'star', size: 50, starPoints: 6, starInner: 0.56, starBalls: true, starBallSize: 0.1, corner: 0.4, rimStyle: 'bevel', rimWidth: 1.5, rimHeight: 1.8, base: 2, depth: 1.4,
      imgZoom: 0.58, imgInset: 0, imgFade: 0.4, textTop: 'SHERIFF', textBottom: 'COUNTY', textRadius: 10.8, textSize: 3, font: 'Cinzel', textBold: true, textSpacing: 0.16, textHeight: 0.6, textClear: false,
      bail: 'tab', material: 'metal', color: '#c0c4cc' } },
  { id: 'award', cat: 'badges', name: 'Award Star Medal', desc: 'Ball-tipped star on a shield bail.', sample: 'sunburst',
    p: { shape: 'star', size: 40, starPoints: 5, starInner: 0.46, starBalls: true, starBallSize: 0.085, corner: 0.5, imgZoom: 0.5, rimStyle: 'bevel', rimWidth: 1.6, rimHeight: 1.6, material: 'metal', color: '#d4a017', bail: 'tab', cbOn: true, cbTemplate: 'shield', cbJoin: 'ring', cbSize: 18 } },
  { id: 'coin', cat: 'badges', name: 'Challenge Coin', desc: 'Domed, milled edge, no bail.', sample: 'sunburst',
    p: { shape: 'circle', size: 44, rimStyle: 'milled', rimWidth: 2.4, rimHeight: 2.2, dome: 1.2, bail: 'none', material: 'metal', color: '#b8733d', textTop: 'HONOR · COURAGE', textBottom: 'COMMITMENT', base: 2, footChamfer: 0.4 } },
  { id: 'crest', cat: 'badges', name: 'Shield Crest', desc: 'Bevelled shield in brushed silver.', sample: 'compass',
    p: { shape: 'shield', size: 40, aspect: 1.15, corner: 0.15, rimStyle: 'bevel', rimWidth: 2.6, rimHeight: 2.6, material: 'metal', color: '#c0c4cc', textCenter: '', bail: 'tab' } },
  { id: 'hexbadge', cat: 'badges', name: 'Tech Hex Badge', desc: 'Hexagon, stepped rim, Orbitron lettering.', sample: 'sunburst',
    p: { shape: 'polygon', sides: 6, shapeRotate: 30, corner: 0.2, size: 46, imgZoom: 0.62, rimStyle: 'stepped', rimWidth: 2.6, rimHeight: 1.8, textTop: 'SYSTEM', textBottom: 'ONLINE', font: 'Orbitron', textSize: 3.4, textSpacing: 0.2, material: 'glossy', color: '#1f5fbf', bail: 'tab', tabShape: 'bar', tabD: 6, holeD: 2.6 } },
  { id: 'pet', cat: 'badges', name: 'Pet Tag', desc: 'Bone tag, name up front, phone on back.', sample: 'paw',
    p: { shape: 'bone', size: 42, aspect: 0.55, rimStyle: 'rounded', rimWidth: 1.8, rimHeight: 1.6, depth: 1.2, base: 1.8, bail: 'punched', bailAngle: -90, holeD: 4, holeInset: 4.5, textCenter: '', material: 'glossy', color: '#1f5fbf', backText: 'CALL ME\n555-0123', imgZoom: 0.6, imgX: 4 } },

  // ── Signs & fun ──
  { id: 'stop', cat: 'signs', name: 'Stop Sign', desc: 'Octagon in red and white — two-colour print.',
    p: { shape: 'polygon', sides: 8, shapeRotate: 22.5, corner: 0.06, size: 40, imageOn: false, rimStyle: 'flat', rimWidth: 1.8, rimHeight: 0.8, base: 2, depth: 0.4, topBevel: 0.15,
      textCenter: 'STOP', font: 'Oswald', textBold: true, centerSize: 12.5, textSpacing: 0.02, textHeight: 0.8, textStroke: 0.05,
      colorMode: 'bands', bandCount: 2, band0: '#c8102e', band1: '#f4f1ea', layerH: 0.2, firstLayer: 0.2, material: 'matte', bail: 'tab', tabThick: 2 } },
  { id: 'pick', cat: 'signs', name: 'Guitar Pick', desc: 'Classic pick shape with a hanging hole.', sample: 'sunburst',
    p: { shape: 'polygon', sides: 3, shapeRotate: 180, corner: 0.85, aspect: 1.06, size: 40, imgZoom: 0.9, rimStyle: 'rounded', rimWidth: 1.4, rimHeight: 1.2, base: 1.2, depth: 1, bail: 'punched', holeD: 2.6, holeInset: 3.2, material: 'glossy', color: '#c8102e' } },
  { id: 'bottlecap', cat: 'signs', name: 'Bottle Cap', desc: '21-crimp cap with a domed face.', sample: 'sunburst',
    p: { shape: 'scallop', size: 32, petals: 21, petalDepth: 0.055, rimStyle: 'rounded', rimWidth: 2.4, rimHeight: 1.2, dome: 0.8, material: 'metal', color: '#c0c4cc', bail: 'tab' } },
  { id: 'fob', cat: 'signs', name: 'Keychain Fob', desc: 'Rounded fob with corner hole.', sample: 'compass',
    p: { shape: 'roundrect', size: 48, aspect: 0.62, corner: 0.35, rimStyle: 'double', rimWidth: 3, rimHeight: 2, bail: 'punched', bailAngle: -58, holeD: 5, holeInset: 5.2, material: 'glossy', color: '#c8102e', base: 2.2 } },
  { id: 'sun', cat: 'signs', name: 'Sun Gear', desc: 'Steampunk gear medallion.', sample: 'sunburst',
    p: { shape: 'gear', size: 50, teeth: 22, toothDepth: 0.09, rimStyle: 'stepped', rimWidth: 3.2, rimHeight: 2.4, material: 'metal', color: '#b8733d', bail: 'tab' } },
  { id: 'twotone', cat: 'signs', name: 'Two-Tone Keychain', desc: 'Cut-out design on a matching background layer — two colours.', sample: 'paw',
    p: { shape: 'silhouette', size: 38, silMargin: 1.2, bgMode: 'alpha', backing: true, backOffset: 2.4, backThick: 1.16, base: 2.12, depth: 1, rimStyle: 'none', topBevel: 0.3,
      colorMode: 'bands', bandCount: 2, band0: '#1b1b1d', band1: '#ff8a1f', layerH: 0.16, firstLayer: 0.2, material: 'matte', bail: 'punched', holeD: 4, holeInset: 4.4, collar: false } },
  { id: 'silhouette', cat: 'signs', name: 'Silhouette Charm', desc: 'Outline follows your subject.', sample: 'paw',
    p: { shape: 'silhouette', size: 36, mode: 'raised', silMargin: 2.2, rimStyle: 'flat', rimWidth: 1.4, rimHeight: 2.2, depth: 1.8, bgMode: 'alpha', material: 'matte', color: '#f4f1ea', bail: 'tab' } },

  // ── Photo & light / multi-colour ──
  { id: 'litho', cat: 'photo', name: 'Lithophane Pendant', desc: 'Photo appears when held to light.', sample: 'peaks',
    p: { shape: 'circle', size: 45, mode: 'lithophane', base: 0.8, depth: 2.2, rimStyle: 'flat', rimWidth: 2.4, rimHeight: 2.4, material: 'translucent', color: '#f4f1ea', denoise: 0.35, imgInset: 0, imgFade: 0.2, contrast: 0.15, topBevel: 0.3 },
    view: { backlit: true } },
  { id: 'heartlitho', cat: 'photo', name: 'Heart Lithophane', desc: 'Keepsake photo heart — glows when backlit.', sample: 'peaks',
    p: { shape: 'heart', size: 44, mode: 'lithophane', base: 0.8, depth: 2.2, rimStyle: 'flat', rimWidth: 2.2, rimHeight: 2.4, material: 'translucent', color: '#f4f1ea', denoise: 0.35, imgInset: 0, imgFade: 0.2, contrast: 0.15, bail: 'tab', tabD: 7, holeD: 3 },
    view: { backlit: true } },
  { id: 'medal', cat: 'photo', name: 'Bas-Relief Medal', desc: 'Sculpted coin relief — try it with AI depth on a photo.', sample: 'compass',
    p: { shape: 'circle', size: 44, mode: 'coin', styleDetail: 0.55, styleRound: 1.6, depth: 2.2, rimStyle: 'beaded', rimWidth: 2.2, rimHeight: 2.6, material: 'metal', color: '#d4a017', bail: 'tab' } },
  { id: 'cameo', cat: 'jewelry', name: 'Cameo Brooch', desc: 'Puffed subject on a Victorian oval.', sample: 'paw',
    p: { shape: 'circle', aspect: 1.3, size: 34, mode: 'cameo', styleRound: 3, styleDetail: 0.3, depth: 2.4, imgZoom: 0.8, rimStyle: 'rope', rimWidth: 2.4, rimHeight: 2.6, material: 'glossy', color: '#e8d7b5', bail: 'tab' } },
  { id: 'halftone', cat: 'photo', name: 'Halftone Two-Tone', desc: 'Pop-art dots printed in a second colour.', sample: 'peaks',
    p: { shape: 'circle', size: 48, mode: 'halftone', patternPitch: 1.4, patternH: 0.8, base: 1.6, rimStyle: 'flat', rimWidth: 2, rimHeight: 0.8, colorMode: 'bands', bandCount: 2, band0: '#1b1b1d', band1: '#f4f1ea', layerH: 0.2, firstLayer: 0.2, material: 'matte', bail: 'tab' } },
  { id: 'engraving', cat: 'photo', name: 'Banknote Engraving', desc: 'Engraved lines whose width follows the image.', sample: 'peaks',
    p: { shape: 'roundrect', size: 50, aspect: 0.62, corner: 0.2, mode: 'lines', patternPitch: 1.2, lineAngle: 0, patternH: 0.6, rimStyle: 'double', rimWidth: 2.6, rimHeight: 1.2, material: 'metal', color: '#1e8a4c', bail: 'punched', bailAngle: -58, holeD: 4, holeInset: 4.5 } },
  { id: 'topo', cat: 'signs', name: 'Topographic Map', desc: 'Contour ridges like a trail map.', sample: 'peaks',
    p: { shape: 'polygon', sides: 6, shapeRotate: 30, corner: 0.2, size: 46, mode: 'contour', contourN: 14, lineW: 0.6, patternH: 0.8, rimStyle: 'flat', rimWidth: 2, rimHeight: 1, material: 'matte', color: '#6f9a4f', bail: 'tab' } },
  { id: 'sketch', cat: 'signs', name: 'Line-Art Sketch', desc: 'Image edges drawn as crisp raised lines.', sample: 'paw',
    p: { shape: 'circle', size: 40, mode: 'lineart', lineW: 0.6, lineSens: 0.5, patternH: 0.8, rimStyle: 'rounded', rimWidth: 1.8, rimHeight: 1, colorMode: 'bands', bandCount: 2, band0: '#f4f1ea', band1: '#1b1b1d', layerH: 0.2, firstLayer: 0.2, material: 'matte', bail: 'tab' } },
  { id: 'layerart', cat: 'photo', name: 'Colour-Swap Layer Art', desc: 'Four filaments, stepped terraces.', sample: 'peaks',
    p: { shape: 'roundrect', size: 55, aspect: 1.2, corner: 0.18, rimStyle: 'flat', rimWidth: 2.2, rimHeight: 2.24, base: 1.32, depth: 1.92, posterize: 4, colorMode: 'bands', bandCount: 4, material: 'matte', bail: 'punched', layerH: 0.16, denoise: 0.6 } },
];
