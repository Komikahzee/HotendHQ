/* Troubleshooting knowledge base + guided diagnostic tree.
   One record per failure mode. Nothing here repeats the long-form
   articles — these are checklists, the articles are the explanations. */
window.HHQ_ISSUES = [
 /* ---------------- FIRST LAYER & ADHESION ---------------- */
 {id:'fl-not-sticking',cat:'First Layer',sev:'high',
  title:'First layer will not stick to the bed',
  symptoms:['Lines peel up behind the nozzle','Part detaches mid-print','Skirt comes off as a single strand'],
  causes:[
   {c:'Nozzle too far from the bed',ck:'Look at the first line from the side — it should be squashed into a flat ribbon, not a round noodle.',fx:'Lower the Z offset in 0.02 mm steps while printing until lines merge with no gaps.'},
   {c:'Contaminated build surface',ck:'Fingerprints and hand oils are invisible but fatal.',fx:'Wash PEI with dish soap and hot water, then wipe with 90 %+ isopropyl alcohol. Do not use acetone on smooth PEI.'},
   {c:'Bed temperature too low',ck:'Compare the actual surface temperature with the set point using an IR thermometer.',fx:'PLA 55–60 °C, PETG 75–85 °C, ABS/ASA 95–110 °C. Raise 5 °C at a time.'},
   {c:'Printing too fast on layer one',ck:'Check the first-layer speed in your slicer.',fx:'Cap the first layer at 20–25 mm/s and disable part cooling on layer one.'},
   {c:'Warped or uneven bed',ck:'Run a bed mesh and look at the deviation range.',fx:'Anything over 0.3 mm total needs mechanical correction — shims or a new plate — before mesh compensation will save you.'}],
  read:['clogged-nozzle-five-minute-diagnostic']},

 {id:'fl-elephant-foot',cat:'First Layer',sev:'low',
  title:'Elephant foot — bulging bottom layer',
  symptoms:['First layer wider than the rest of the part','Bottom edge flares outward','Parts will not fit their sockets'],
  causes:[
   {c:'Nozzle slightly too close',ck:'Bulge with a glossy, squeezed-looking bottom surface.',fx:'Raise Z offset by 0.01–0.02 mm.'},
   {c:'Bed too hot for the material',ck:'The bottom few layers stay soft and are squashed by the weight above.',fx:'Drop bed temperature 5–10 °C after the first layer.'},
   {c:'No elephant foot compensation',ck:'Slicer setting is usually zero by default.',fx:'Set elephant foot / initial layer horizontal expansion to -0.1 to -0.2 mm.'}]},

 {id:'fl-warping',cat:'First Layer',sev:'med',
  title:'Corners lifting and warping',
  symptoms:['Corners curl up off the plate','Part bows in the middle','Worse on large flat parts and ABS'],
  causes:[
   {c:'Uneven cooling / draughts',ck:'Open window, AC vent, or an open-frame printer in a cold room.',fx:'Enclose the printer, even with a cardboard box and a blanket for ABS/ASA.'},
   {c:'Bed too cold',ck:'Material shrinks as it cools below glass transition.',fx:'Raise bed temperature and keep the chamber warm for high-shrink materials.'},
   {c:'Not enough contact area',ck:'Small footprints have nothing to hold them down.',fx:'Add a brim of 5–10 mm. For ABS, use a brim and glue stick together.'},
   {c:'Part cooling too aggressive',ck:'ABS and ASA warp badly with fans running.',fx:'Reduce part cooling to 0–20 % for ABS/ASA; keep PLA at 100 %.'}]},

 /* ---------------- EXTRUSION ---------------- */
 {id:'ex-under',cat:'Extrusion',sev:'high',
  title:'Under-extrusion — thin, gappy, weak layers',
  symptoms:['Gaps between perimeters','Layers look starved and translucent','Top surfaces have holes'],
  causes:[
   {c:'Temperature too low for the flow demanded',ck:'Calculate: layer height × width × speed = required mm³/s.',fx:'Raise temperature 5–10 °C or lower speed. Run a temperature tower.'},
   {c:'Partial clog',ck:'Push filament by hand at temperature with the idler released.',fx:'Cold pull, then clear or replace the nozzle.'},
   {c:'Worn nozzle from abrasives',ck:'Measure extruded strand width — a worn 0.4 mm nozzle puts out 0.5 mm+.',fx:'Replace with hardened steel if you print filled filaments.'},
   {c:'Extruder slipping',ck:'Look for filament shavings or a flat ground into the filament.',fx:'Adjust idler tension, clean the drive gear teeth, check grub screws.'},
   {c:'Wrong extrusion multiplier / e-steps',ck:'Mark 120 mm of filament, command 100 mm, measure what was consumed.',fx:'Recalibrate e-steps first, then flow, in that order.'}],
  read:['high-flow-hotends-explained','clogged-nozzle-five-minute-diagnostic']},

 {id:'ex-over',cat:'Extrusion',sev:'low',
  title:'Over-extrusion — blobby, oversized parts',
  symptoms:['Rough, bulging top surfaces','Dimensions too large','Nozzle drags through previous layer'],
  causes:[
   {c:'Flow rate too high',ck:'Print a single-wall cube and measure wall thickness against nozzle width.',fx:'Reduce flow in 2 % steps until measured wall matches commanded.'},
   {c:'Wrong filament diameter in slicer',ck:'Measure the filament with callipers in three places.',fx:'Enter the true average — often 1.71–1.75 mm, not exactly 1.75.'},
   {c:'E-steps set too high',ck:'Command 100 mm, measure consumed.',fx:'Recalibrate e-steps.'}]},

 {id:'ex-none',cat:'Extrusion',sev:'high',
  title:'Nothing comes out at all',
  symptoms:['Extruder clicks or ticks','Filament does not move','Print starts with air'],
  causes:[
   {c:'Nozzle pressed against the bed',ck:'The most common cause and the most overlooked. There is no space for plastic to escape.',fx:'Re-level and raise Z offset.'},
   {c:'Full clog',ck:'Hand push with idler released — immovable.',fx:'Remove nozzle hot, test the heat break separately, cold pull.'},
   {c:'Heat creep jam',ck:'Works when freshly heated, seizes after 10–20 minutes.',fx:'Fix heatsink cooling: full-speed fan whenever hot, clean fins, thermal paste on the heat break.'},
   {c:'Filament snapped in the tube',ck:'Common with old brittle PLA in Bowden setups.',fx:'Remove the tube and clear the fragment. Store filament dry.'}],
  read:['clogged-nozzle-five-minute-diagnostic']},

 {id:'ex-stringing',cat:'Extrusion',sev:'low',
  title:'Stringing and oozing between parts',
  symptoms:['Fine hairs between towers','Whiskers on travel paths','Blobs where travel starts'],
  causes:[
   {c:'Wet filament',ck:'Popping or hissing at the nozzle; strings look foamy.',fx:'Dry the spool: PLA 50 °C, PETG/nylon 65 °C, 4–6 hours.'},
   {c:'Temperature too high',ck:'Every 10 °C roughly doubles ooze.',fx:'Run a temperature tower and take the lowest good band.'},
   {c:'Retraction too short',ck:'Print a retraction tower.',fx:'Direct drive 0.4–2 mm, Bowden 2–7 mm. Take the lowest clean value.'},
   {c:'Travel crossing open air',ck:'Long travels over gaps.',fx:'Enable combing / avoid crossing perimeters and raise travel speed.'}],
  read:['retraction-tuning-that-works']},

 /* ---------------- LAYERS & QUALITY ---------------- */
 {id:'q-layer-shift',cat:'Print Quality',sev:'high',
  title:'Layer shifts — part offset partway up',
  symptoms:['Sudden sideways jump in the print','Everything above is offset','Sometimes repeats at the same height'],
  causes:[
   {c:'Belt tension too loose',ck:'Pluck the belt — it should give a low musical note, not a dull thud.',fx:'Tension until firm. Both belts equally on CoreXY.'},
   {c:'Loose pulley grub screw',ck:'Grip the pulley and try to twist it on the shaft.',fx:'Tighten onto the flat of the shaft. Blue threadlocker if it recurs.'},
   {c:'Printing faster than the motors can follow',ck:'Shifts get worse with speed or acceleration.',fx:'Reduce acceleration first, then speed. Raise stepper current slightly if within spec.'},
   {c:'Nozzle collided with a curled part',ck:'Shift happens at the same Z height every time.',fx:'Fix the warping/curling; enable Z-hop as a stopgap.'},
   {c:'Stepper driver overheating',ck:'Shifts start late in long prints; driver is hot to touch.',fx:'Add a fan to the board, reduce current, check for missing heatsinks.'}]},

 {id:'q-zbanding',cat:'Print Quality',sev:'med',
  title:'Z banding / ribbing at regular intervals',
  symptoms:['Horizontal bands repeating every few mm','Surface ripples on vertical walls'],
  causes:[
   {c:'Bent or binding lead screw',ck:'Watch the top of the screw while homing — visible wobble means bent.',fx:'Replace the screw, or decouple with an Oldham coupler so wobble does not translate to the X gantry.'},
   {c:'Z screw over-constrained',ck:'Screw is rigidly fixed at both ends and fights the linear rails.',fx:'Let the top end float. Loosen the top bearing block.'},
   {c:'Inconsistent extrusion',ck:'Bands correlate with extruder rotation period.',fx:'Check for a bent extruder shaft or an out-of-round drive gear.'},
   {c:'Temperature oscillation',ck:'Watch the temperature readout — swings of more than ±2 °C show up as bands.',fx:'Run PID autotune on the hot end.'}]},

 {id:'q-ringing',cat:'Print Quality',sev:'low',
  title:'Ringing / ghosting after sharp corners',
  symptoms:['Echoes of corners repeating across flat faces','Ripples that fade with distance'],
  causes:[
   {c:'Acceleration too high for frame stiffness',ck:'Worse at higher speeds.',fx:'Lower acceleration and jerk. Test at half and work back up.'},
   {c:'No input shaping',ck:'Klipper and modern Marlin builds support it.',fx:'Run resonance measurement and enable input shaping — the single biggest quality-per-effort win on a fast machine.'},
   {c:'Loose frame or wobbly table',ck:'Push the top of the frame — any flex is too much.',fx:'Tighten all frame fasteners; stand the printer on something solid and heavy.'},
   {c:'Loose belts',ck:'Same check as layer shifts.',fx:'Re-tension evenly.'}]},

 {id:'q-blobs',cat:'Print Quality',sev:'low',
  title:'Blobs and zits on the surface',
  symptoms:['Small bumps where each layer starts or ends','A visible seam line with lumps'],
  causes:[
   {c:'Pressure advance / linear advance not tuned',ck:'Blobs appear at the end of each perimeter.',fx:'Run a pressure advance calibration pattern. Biggest single fix here.'},
   {c:'Seam placement',ck:'All blobs stack in one vertical line.',fx:'Set seam to Random or Aligned-with-sharpest-corner.'},
   {c:'Retraction restart adding too much',ck:'Extra restart distance is set above zero.',fx:'Set extra restart to 0 and retune retraction.'}]},

 {id:'q-gaps-top',cat:'Print Quality',sev:'low',
  title:'Holes or gaps in the top surface',
  symptoms:['Pinholes on the top layer','You can see into the infill'],
  causes:[
   {c:'Not enough top layers',ck:'Fewer than four at 0.2 mm is usually too few.',fx:'Set top layers so total solid thickness is at least 0.8 mm.'},
   {c:'Infill too sparse to bridge',ck:'Below 15 % the top layers have nothing to span.',fx:'Raise infill to 15–20 % or enable ironing.'},
   {c:'Under-extrusion',ck:'Check perimeters too — if they are also thin it is a flow problem.',fx:'See under-extrusion.'}]},

 /* ---------------- MECHANICAL ---------------- */
 {id:'m-grinding',cat:'Mechanical',sev:'med',
  title:'Extruder grinding / chewing the filament',
  symptoms:['Flat ground into the filament','Plastic dust in the extruder body','Clicking during print'],
  causes:[
   {c:'Downstream blockage forcing the gear to slip',ck:'Fix the clog first — grinding is a symptom, not the disease.',fx:'Diagnose the hot end before touching extruder tension.'},
   {c:'Idler tension too high',ck:'Over-tightening deforms the filament and increases friction.',fx:'Back off until the gear just grips without visible deformation.'},
   {c:'Clogged drive gear teeth',ck:'Packed plastic dust in the knurl.',fx:'Brush out with a small wire brush.'},
   {c:'Retraction too long or too fast',ck:'The gear is sawing the same spot repeatedly.',fx:'Reduce retraction distance and speed.'}],
  read:['retraction-tuning-that-works']},

 {id:'m-axis-binding',cat:'Mechanical',sev:'med',
  title:'Axis binds, stutters, or feels rough by hand',
  symptoms:['Motion is not smooth with motors disabled','Squeaking','Positional inaccuracy'],
  causes:[
   {c:'Rails or rods need cleaning and lubrication',ck:'Wipe a rod with a paper towel — grit shows up immediately.',fx:'Clean and apply a light PTFE or lithium grease, not WD-40.'},
   {c:'Over-tightened eccentric nuts',ck:'V-wheel machines: the wheel should turn with light finger pressure.',fx:'Loosen until the wheel just grips without play.'},
   {c:'Frame out of square',ck:'Measure diagonals on the gantry.',fx:'Loosen, square, re-tighten in sequence.'},
   {c:'Flat spots on V-wheels',ck:'Roll each wheel and feel for bumps.',fx:'Replace worn wheels — they are consumables.'}]},

 {id:'m-bed-mesh',cat:'Mechanical',sev:'med',
  title:'Bed mesh differs every time you probe',
  symptoms:['Inconsistent mesh results','First layer good one day, bad the next'],
  causes:[
   {c:'Probe not temperature-stabilised',ck:'Inductive probes drift as they warm.',fx:'Probe at printing temperature, after a soak. Enable probe temperature compensation if available.'},
   {c:'Loose bed mounts or worn springs',ck:'Press the corners — any give is too much.',fx:'Replace springs with silicone spacers or solid mounts.'},
   {c:'Probe mount flexing',ck:'Wiggle the probe by hand.',fx:'Rigid mount, tight fasteners.'},
   {c:'Wobbly gantry on a single-Z machine',ck:'Check the X gantry is level to the frame, not just to the bed.',fx:'Square the gantry and check Z coupling.'}]},

 /* ---------------- THERMAL / ELECTRICAL ---------------- */
 {id:'t-runaway',cat:'Thermal',sev:'high',
  title:'Thermal runaway error / heating failed',
  symptoms:['Printer halts with a thermal error','Temperature climbs then errors','Random mid-print shutdowns'],
  causes:[
   {c:'Thermistor loose in the heat block',ck:'Gently tug the wire at the block — any movement is a fault.',fx:'Re-seat and secure with the grub screw. Replace a bead thermistor with a screw-in cartridge.'},
   {c:'Part cooling fan blasting the heat block',ck:'Error appears only when the fan ramps up.',fx:'Fit or repair the silicone sock; redirect the duct at the part, not the block.'},
   {c:'PID values wrong after a hardware change',ck:'Temperature oscillates rather than holding.',fx:'Run PID autotune at your normal printing temperature, with the sock fitted.'},
   {c:'Failing heater cartridge',ck:'Measure resistance — a 24 V 40 W cartridge should read near 14 Ω.',fx:'Replace. Open circuit or badly off resistance means it is dying.'},
   {c:'Damaged wiring in the cable chain',ck:'Flex the harness while watching the temperature readout for jumps.',fx:'Replace the harness and add strain relief.'}],
  read:['thermal-runaway-protection']},

 {id:'t-temp-swing',cat:'Thermal',sev:'med',
  title:'Temperature will not hold steady',
  symptoms:['Readout swings more than ±2 °C','Z banding correlated with temperature'],
  causes:[
   {c:'PID not tuned',ck:'Default values rarely match your specific hardware.',fx:'PID autotune with the silicone sock on and the part fan at 50 %.'},
   {c:'Missing silicone sock',ck:'Bare heat blocks lose heat to airflow unpredictably.',fx:'Fit one. Cheapest quality upgrade on the machine.'},
   {c:'Undersized heater for the hot end',ck:'40 W struggles above 260 °C on a high-flow block.',fx:'Move to 50–60 W if your board supports the current.'}]},

 {id:'e-no-heat',cat:'Electrical',sev:'high',
  title:'Hot end or bed will not heat at all',
  symptoms:['Temperature stays at ambient','Heating failed error immediately','No change when commanded'],
  causes:[
   {c:'Heater cartridge open circuit',ck:'Measure resistance across the heater leads.',fx:'Infinite resistance means replace the cartridge.'},
   {c:'Blown MOSFET or fuse',ck:'Check the board fuse and look for scorching near the heater terminals.',fx:'Replace the fuse; a scorched terminal usually means a loose screw caused arcing — fix the connection too.'},
   {c:'Connector not seated',ck:'The most common and least glamorous cause.',fx:'Re-seat every heater and thermistor connector. Ferrules on stranded wire.'},
   {c:'Power supply not delivering',ck:'Measure PSU output under load.',fx:'Sagging voltage under load means a failing PSU.'}]},

 {id:'e-thermistor',cat:'Electrical',sev:'high',
  title:'Temperature reads wildly wrong or jumps around',
  symptoms:['Reads 0 °C, -14 °C, or 500 °C','Jumps when the head moves'],
  causes:[
   {c:'Broken thermistor wire',ck:'Wiggle the harness and watch the readout.',fx:'Replace the thermistor; it is a wear item near the flex point.'},
   {c:'Short in the cable chain',ck:'Inspect where the harness bends most.',fx:'Re-route with a proper drag chain and strain relief.'},
   {c:'Wrong thermistor type in firmware',ck:'Reads plausible at room temperature but wrong when hot.',fx:'Set the correct thermistor table for your sensor.'}]},

 /* ---------------- SUPPORTS, BRIDGING, MISC ---------------- */
 {id:'s-supports',cat:'Print Quality',sev:'low',
  title:'Supports fuse to the part or will not come off',
  symptoms:['Supports weld to the surface','Damage when removing','Ugly scarring'],
  causes:[
   {c:'Z distance too small',ck:'Support top distance near zero fuses everything.',fx:'Set support Z distance to one layer height (0.2 mm) for PLA, 0.25–0.3 mm for PETG.'},
   {c:'PETG welds to itself',ck:'PETG supports on PETG are notoriously hard to remove.',fx:'Increase Z distance, or print supports in a different material with a dual system.'},
   {c:'Support density too high',ck:'Over 20 % is rarely necessary.',fx:'Drop to 10–15 % and use an interface layer instead.'}]},

 {id:'s-bridging',cat:'Print Quality',sev:'low',
  title:'Sagging bridges and drooping overhangs',
  symptoms:['Strands sag between supports','Overhang undersides rough and curled'],
  causes:[
   {c:'Not enough part cooling',ck:'Bridges need maximum airflow to freeze in place.',fx:'100 % fan on bridges and overhangs for PLA and PETG.'},
   {c:'Bridge speed wrong',ck:'Too slow lets the strand sag; too fast breaks it.',fx:'Try 25–40 mm/s with bridge flow around 95 %.'},
   {c:'Temperature too high',ck:'Hotter plastic stays fluid longer.',fx:'Drop 5–10 °C for bridge-heavy parts.'}]},

 {id:'x-dimensional',cat:'Print Quality',sev:'med',
  title:'Parts are the wrong size / holes too small',
  symptoms:['Holes undersized','Press fits will not fit','Outer dimensions slightly large'],
  causes:[
   {c:'Hole shrinkage from polygon approximation',ck:'Holes are almost always undersized — this is geometry, not calibration.',fx:'Enable hole horizontal expansion (+0.1 to +0.2 mm) or model holes oversize.'},
   {c:'Over-extrusion',ck:'Single-wall test cube measures thicker than nozzle width.',fx:'Lower flow.'},
   {c:'Steps per mm wrong on X/Y',ck:'Print a 100 mm calibration bar and measure.',fx:'Correct steps/mm — but only after confirming flow is right.'},
   {c:'Material shrinkage',ck:'ABS shrinks about 0.8 %, PLA about 0.2 %.',fx:'Apply a scale compensation factor for high-shrink materials.'}]},

 {id:'x-spaghetti',cat:'Print Quality',sev:'high',
  title:'Print detached and turned into spaghetti',
  symptoms:['Pile of loose filament','Print head dragging plastic around'],
  causes:[
   {c:'Adhesion failure',ck:'Check whether the part is still on the plate at all.',fx:'See first layer adhesion.'},
   {c:'Warping lifted the part into the nozzle',ck:'Corners curled, nozzle caught them.',fx:'Enclosure, brim, higher bed temperature.'},
   {c:'Support structure collapsed',ck:'Tall thin supports toppled.',fx:'Wider support base, tree supports, or reorient the model.'},
   {c:'Layer shift knocked the part loose',ck:'See layer shifts.',fx:'Fix belts and acceleration.'}]}
];

/* ---------------------------------------------------------------
   Guided diagnostic tree — "What's actually broken?"
   Each node: a question, then options that either point to another
   node (next) or land on an issue id (issue).
   --------------------------------------------------------------- */
window.HHQ_TREE = {
 start:{q:'Where does it go wrong?',
  opts:[
   {l:'The print never gets going properly',d:'First layer problems, nothing extruding, nothing sticking',next:'start-fail'},
   {l:'It fails partway through',d:'Started fine, went wrong later',next:'mid-fail'},
   {l:'It finishes but looks wrong',d:'Surface quality, stringing, dimensions',next:'quality'},
   {l:'The printer throws an error or shuts down',d:'Thermal errors, heating failures, halts',next:'errors'}]},

 'start-fail':{q:'What is happening at the nozzle?',
  opts:[
   {l:'Nothing is coming out',d:'Extruder clicks, or filament simply does not move',next:'no-flow'},
   {l:'Plastic comes out but will not stick',d:'Lines peel up or get dragged around',issue:'fl-not-sticking'},
   {l:'It sticks but the first layer looks wrong',d:'Bulging, gappy, or uneven',next:'first-layer-look'}]},

 'no-flow':{q:'Heat the hot end, release the idler, and push filament by hand. What happens?',
  opts:[
   {l:'It pushes through easily',d:'The hot end is clear — the fault is in the extruder',issue:'m-grinding'},
   {l:'It will not move at all',d:'Something is physically blocking the melt path',issue:'ex-none'},
   {l:'It flows when freshly heated, jams after 10–20 minutes',d:'Classic heat creep signature',issue:'ex-none'},
   {l:'The nozzle is touching the bed',d:'No room for plastic to escape',issue:'fl-not-sticking'}]},

 'first-layer-look':{q:'What does the first layer look like?',
  opts:[
   {l:'Squashed and flared at the edges',d:'Bottom is wider than the rest of the part',issue:'fl-elephant-foot'},
   {l:'Thin with gaps between lines',d:'Lines are round rather than flattened ribbons',issue:'fl-not-sticking'},
   {l:'Good in places, bad in others',d:'One region sticks, another does not',issue:'m-bed-mesh'}]},

 'mid-fail':{q:'How did it fail?',
  opts:[
   {l:'Everything above a certain height is offset sideways',d:'A clean horizontal jump',issue:'q-layer-shift'},
   {l:'Extrusion faded out and stopped',d:'Layers got thinner then disappeared',issue:'ex-under'},
   {l:'The part came off the plate',d:'Spaghetti, or the part is stuck to the nozzle',issue:'x-spaghetti'},
   {l:'The extruder started clicking and grinding',d:'Flat ground into the filament',issue:'m-grinding'},
   {l:'Corners lifted off the bed',d:'Warping as the print got taller',issue:'fl-warping'}]},

 quality:{q:'Which part of the print looks wrong?',
  opts:[
   {l:'Hairs and whiskers between parts',d:'Stringing on travel moves',issue:'ex-stringing'},
   {l:'Vertical walls have bands or ripples',d:'Repeating horizontal marks',next:'walls'},
   {l:'Top surface has holes or roughness',d:'Pinholes, or you can see the infill',issue:'q-gaps-top'},
   {l:'Overhangs and bridges droop',d:'Sagging undersides',issue:'s-bridging'},
   {l:'Dimensions are off',d:'Holes too small, press fits fail',issue:'x-dimensional'},
   {l:'Supports fused to the part',d:'Cannot remove them cleanly',issue:'s-supports'}]},

 walls:{q:'What do the marks look like?',
  opts:[
   {l:'Echoes of corners, fading across the face',d:'Repeating ripple after every sharp turn',issue:'q-ringing'},
   {l:'Even horizontal bands at a regular pitch',d:'Repeats every few millimetres up the part',issue:'q-zbanding'},
   {l:'Small bumps in a vertical line',d:'A seam with lumps in it',issue:'q-blobs'},
   {l:'Walls are thin and translucent',d:'Starved-looking extrusion',issue:'ex-under'}]},

 errors:{q:'What does the printer report?',
  opts:[
   {l:'Thermal runaway or heating failed',d:'Printer halts and needs a power cycle',issue:'t-runaway'},
   {l:'Temperature reads an impossible number',d:'0 °C, negative, or 500 °C',issue:'e-thermistor'},
   {l:'Nothing heats at all',d:'Temperature never moves from ambient',issue:'e-no-heat'},
   {l:'Temperature wanders during printing',d:'Swinging more than a couple of degrees',issue:'t-temp-swing'},
   {l:'An axis grinds or misses steps',d:'Rough motion or wrong positions',issue:'m-axis-binding'}]}
};
