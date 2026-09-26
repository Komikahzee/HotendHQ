/* Seed articles.
   Optional SEO fields: seo_title (the <title>, used as-is) and meta_description.
   Without them the build falls back to "<title> — Hotend HQ" and the excerpt.
 These ship with the site so it is never empty, and they are
   the fallback when no backend is configured. Once Supabase is connected,
   published rows from the database are shown first and these fill in behind. */
window.HHQ_SEED_ARTICLES = [
{
  slug:'free-3d-model-generators',
  seo_title:'17 Free 3D Model Generators: Gridfinity, Chains, Dice, Signs and More',
  meta_description:'Seventeen free generators that run in your browser: Gridfinity, print-in-place chains, custom dice, layered signs, stencils, plant markers, drone frames, mic clips, fidget spinners, board game pieces and more.',
  title:'Seventeen Free 3D Model Generators, Now Live on Hotend HQ',
  category:'News',
  tags:['generators','gridfinity','jewelry','free tools'],
  excerpt:'Gridfinity, print-in-place chains, dice, signs, stencils, drone frames, mic clips and more. Set your sizes, pick your printer, download a file that is ready to slice.',
  published_at:'2026-09-25',
  author_name:'Hotend HQ',
  featured:true,
  cover_url:'/assets/img/articles/generators-spotlight.webp',
  body:`
Most of what we print at home is not art. It is a box the right size, a bracket for one awkward shelf, a tray for one drawer. Downloading someone else's file and scaling it never quite works, because scaling stretches the walls, the screw holes and the clearances along with everything else.

So we built generators. You type in the sizes you need, the model is built from scratch to those sizes, and you download a file that is ready for your slicer. All seventeen are free and live now at [hotendhq.com/generators](/generators).

## What every generator does

- **Sized to your printer.** Pick your machine from a list of more than 40 printers from Bambu Lab, Prusa, Creality, Elegoo, Anycubic, Sovol, QIDI, Voron and more, or type in a custom bed. Every generator tells you whether the model fits, and the choice is remembered on your device for next time.
- **Nothing to install, nothing uploaded.** The model is built on your own computer or phone, in the browser. There is no account and no queue.
- **Real files.** STL for every generator, and 3MF with a separate object per colour or part on most of them.
- **Share links.** Copy a link and anyone who opens it gets the same design.
- **Yours to keep.** Print what you make, change it, give it away or sell it.

## Gridfinity generator

![Gridfinity bin preview](/assets/img/generators/gridfinity.webp)

[Gridfinity](/generators/gridfinity) is the modular storage system where bins click into a grid baseplate in your drawer. The generator covers the whole system:

- **Bins** in whole or half units, with dividers (even or uneven), finger scoops, label tabs with printed text, and magnet or screw holes in the feet.
- **Tool holders** with pockets cut for hex bits, batteries, pens or SD cards.
- **Lids**, flat, labelled or stackable.
- **Baseplates** in five styles: minimal, magnetic, weighted, skeleton and screw-down.
- **Drawer fitter.** Enter the inside of your drawer and it fills it edge to edge, then splits the baseplate into pieces that fit your bed and clip together.

The settings panel shows how many nozzle lines your walls print as and the weight in your filament, and it keeps your last design so you can pick up where you left off.

## Chain generator

![Endless print-in-place chain on the bed](/assets/img/articles/endless-chain.webp)

The [chain generator](/generators/chain) makes necklace chains that come off the bed already linked. Neighbouring links lean at about 45° in opposite directions and thread through each other with a gap all the way round, so nothing needs supports and nothing needs assembling.

- **34 styles**, from cable, rolo, belcher and paperclip to curb, Cuban, figaro, marquise, flat mariner, bar & link, rosary, rope, box, snake, name chains and three hand-assembled kits, in sizes from fine to extra chunky.
- **Endless loops.** A chain with no clasp prints as one closed circle that slips straight over your head.
- **Clasps and extras.** Plain end loops, a built-in toggle clasp, an extender tail and matching jump rings.
- **Looks.** Graduated links, two-tone chains exported as separate 3MF objects, station beads, and your own link shape from an uploaded SVG or image.
- **A test strip** that prints three short chains at your gap setting and 0.1 mm either side, so you find the right clearance before a long print.

## Storage box generator

![Storage box with dividers and lid](/assets/img/generators/storage-box.webp)

The [storage box generator](/generators/storage-box) makes a box from 20 to 250 mm in any direction. Set the wall and floor thickness and the corner radius, add up to 49 compartments, and add a snap-on lid or screw-down mounting ears.

## Grid organiser generator

![Grid organiser tray](/assets/img/generators/grid-organiser.webp)

The [grid organiser](/generators/grid-organiser) is a single drawer tray with a grid of cells, up to 12 by 12. Size each cell to what you store, choose the depth, and switch on stacking feet if the trays will sit on top of each other.

## Cable clip generator

![Set of cable clips](/assets/img/generators/cable-clip.webp)

The [cable clip generator](/generators/cable-clip) makes screw-down clips for a single cable or a bundle from 2 to 40 mm across. The opening is narrower than the cable, so it presses in and stays put. Print up to eight in one go.

## Spool holder generator

![Wall-mounted spool holder](/assets/img/generators/spool-holder.webp)

The [spool holder generator](/generators/spool-holder) makes a wall-mounted arm with a tapered hub for any spool bore from 15 to 90 mm. A support gusset makes it much stiffer, and an end flange stops the spool walking off.

## Wall bracket generator

![L-bracket with gusset](/assets/img/generators/wall-bracket.webp)

The [wall bracket generator](/generators/wall-bracket) makes an L-bracket with legs up to 160 mm, one to four counterbored screw holes per leg and an optional gusset. Print it standing on its horizontal leg and the corner supports itself.

## Custom dice generator

![Set of custom dice](/assets/img/generators/dice.webp)

The [dice generator](/generators/dice) makes d4, d6, d8, d10, d12, d20 and percentile d100, or all seven as a set. Faces can carry numbers, your own words or symbols, or pips on a d6, and opposite faces add up like real dice. Round the edges, pick a font and fill the engraving in a second colour.

## Layered sign generator

![Layered workshop sign](/assets/img/generators/layered-signs.webp)

The [layered sign generator](/generators/layered-signs) builds a multicolour sign in layers: base, border, an outline around the letters and the letters themselves, with icons or your own logo. On a single-nozzle printer it lists the heights to change filament; on an AMS or MMU the 3MF has an object per colour.

## Stencil generator

![Text stencil with bridges](/assets/img/generators/stencils.webp)

The [stencil generator](/generators/stencils) cuts text, shapes or your own image into a stencil plate and adds bridges automatically, so the middles of letters like O, A and B stay in. It also makes whole letter sets.

## Plant marker generator

![Garden plant markers](/assets/img/generators/plant-markers.webp)

The [plant marker generator](/generators/plant-markers) turns a list of plant names into a full set of markers: stakes, pot-rim clips or hanging tags, with raised, inlaid or engraved text.

## Lettering & calligraphy generator

![Name tracing template](/assets/img/generators/lettering.webp)

The [lettering generator](/generators/lettering) makes name tracing templates, mirrored letter stamps with a handle, and calligraphy guide rulers set to your x-height, nib width and slant angle.

## Pen grip & cutter adapter generator

![Pen adapter for a cutting machine](/assets/img/generators/pen-grips.webp)

The [pen grip generator](/generators/pen-grips) makes adapters that hold your own pens and markers in a Cricut, Silhouette or Brother cutter, with fit-test rings to dial in the fit, plus chunky comfort grips for pens, pencils and craft knives.

## Board game pieces generator

![Numbered game tokens](/assets/img/generators/board-game-pieces.webp)

The [board game pieces generator](/generators/board-game-pieces) makes numbered tokens and coins, pawns, meeples and figures, resource cubes and gems, and card stands, as whole sets with a colour per player.

## Fidget spinner generator

![Tri-lobe fidget spinner](/assets/img/generators/fidget-spinners.webp)

The [fidget spinner generator](/generators/fidget-spinners) makes classic spinners for 608, 688, R188, 626 and 6000 bearings with coin, nut or bearing weights, print-in-place spinners with no bearing at all, and spinning rings in your ring size.

## Drone frame generator

![FPV quad frame](/assets/img/generators/drone-frame.webp)

The [drone frame generator](/generators/drone-frame) makes FPV frames from 65 mm whoops to 10-inch long range: quads (true X, stretched, H, deadcat, cinewhoop), X8 cinelifters, tricopters with a tilting tail, Y6, hexacopters and octocopters. Choose one-piece or bolt-on arms, fit your motors, stack, camera and GoPro, and see it built with motors, props and a battery before you print. A Randomize button rolls a whole new design.

## Mic clip & stand accessory generator

![Mic clip and hinged stand mount](/assets/img/generators/mic-accessories.webp)

The [mic accessory generator](/generators/mic-accessories) makes mic clips, shock mounts, thread adapters, stand cable clips, pop filters and phone mounts, with real 5/8″-27, 3/8″-16 and 1/4″-20 threads and a hinge to set the angle.

## What's next

More generators are on the way. If there is a part you keep having to design from scratch, [tell us about it](/about#contact).
`
},
{
  slug:'first-layer-that-sticks',
  seo_title:'First Layer Not Sticking? Fix Z-Offset, Bed Surface and Speed',
  meta_description:'Most first-layer failures come down to three things: nozzle height, a dirty or mismatched bed surface, and printing it too fast. How to read the layer and fix each one.',
  title:'A First Layer That Sticks: Z-Offset, Surfaces and the Ten-Minute Fix',
  category:'Troubleshooting',
  tags:['first layer','bed adhesion','beginner'],
  excerpt:'The first layer tells you exactly what is wrong if you know how to read it. Here is how to read it, and the four fixes that solve nearly every adhesion problem.',
  published_at:'2026-09-23',
  author_name:'Hotend HQ',
  body:`
Most failed prints fail in the first two minutes. A corner lifts, a line drags, and forty minutes later you have a nest of spaghetti. The good news is that the first layer is also the easiest layer to diagnose, because everything that goes wrong with it leaves a visible mark.

## Read the layer before you change anything

Print a single large square one layer thick, then look at it closely.

- **Round lines with gaps between them** that peel up as one piece: the nozzle is too high. The plastic is being laid on the bed, not pressed into it.
- **Rough, ridged or see-through lines**, or plastic building up around the nozzle: the nozzle is too low. It is scraping through its own extrusion.
- **Flat lines that just touch each other** with a smooth, even top: that is the target.
- **Good in the middle, bad in one corner or along one edge**: this is a bed-mesh or levelling problem, not a nozzle-height problem. Changing the Z-offset will make one area better and another worse.

## Fix 1: Clean the plate properly

This is the fix people skip, and the one that solves the most problems. Fingerprints leave skin oil on the build surface, and PLA will not stick to oil.

Isopropyl alcohol is fine for a quick wipe between prints, but it mostly spreads oil around. Every so often, take the plate to the sink and wash it with warm water and a drop of dish soap, rinse it, and dry it with a clean paper towel. Then handle it by the edges only.

## Fix 2: Set the Z-offset while it prints

Start a large first-layer test and adjust the Z-offset live, 0.02 mm at a time, while you watch the lines go down. Stop when the lines are flat and just touching.

If your printer calibrates its own first layer, and many recent machines do, run that calibration again after you change the nozzle or swap plates, before you touch any offsets by hand.

## Fix 3: Match the surface to the material

Different plastics want different surfaces and temperatures. As a starting point:

- **PLA:** smooth or textured PEI, bed at 55–65 °C.
- **PETG:** textured PEI, bed at 70–85 °C. On smooth PEI, PETG can bond so well that it pulls the coating off when you remove the part. A thin layer of glue stick acts as a release layer.
- **ABS and ASA:** PEI at 90–110 °C, ideally in an enclosure so the part cools evenly.
- **TPU:** textured PEI or a glue-stick layer, bed at about 40–60 °C. The problem with TPU is usually getting it off, not keeping it on.
- **Nylon:** garolite or a glue-stick layer, and dry filament (see our guide to drying filament).

Always check the recommended temperatures on the spool; brands vary.

## Fix 4: Slow the first layer down

The first layer should be the slowest layer of the print. Settings that help:

- **First-layer speed of 20–50 mm/s**, even on a fast printer.
- **Part-cooling fan off** for the first layer or two, so the plastic stays soft long enough to grip.
- **A wider first-layer line**, around 120 % of the nozzle size, for more contact area.

## When the bed itself is the problem

If one area is always wrong, check the bed mesh. Re-run the printer's bed levelling with the bed at printing temperature, because plates change shape as they heat. On large beds, give the bed five to ten minutes to heat through before printing; the edges lag behind the centre.

A plate that is visibly warped or has a worn patch in the middle (usually from printing the same part in the same spot) needs replacing. No setting fixes a damaged surface.

## Big flat parts lift at the corners

Wide, flat parts such as Gridfinity baseplates pull their corners up as they cool and shrink. A brim, or small round "mouse ears" at each corner, helps. So does keeping draughts away from the printer.

The other fix is not to print one huge part at all. The **Drawer fitter** in our [Gridfinity generator](/generators/gridfinity) splits a drawer-sized baseplate into smaller pieces that fit your bed and clip together, and smaller pieces lift far less.
`
},
{
  slug:'dry-filament-guide',
  seo_title:'How to Dry Filament: Temperatures and Times for PLA, PETG, TPU and Nylon',
  meta_description:'Wet filament pops, strings and prints weak. The signs to look for, drying temperatures and times for each material, and how to keep spools dry afterwards.',
  title:'Wet Filament: How to Tell, and How to Dry It Properly',
  category:'Materials',
  tags:['filament','moisture','PETG','nylon'],
  excerpt:'Popping at the nozzle, stringing that tuning will not fix, weak layers. It is often water in the filament. How to spot it, dry it and keep it dry.',
  published_at:'2026-09-21',
  author_name:'Hotend HQ',
  body:`
Most filaments absorb water from the air. Some take weeks to get bad and some take a day. When damp filament reaches the hot end, that water turns to steam inside the melt, and the steam is what ruins the print.

## The signs

- **Popping or hissing** at the nozzle while it prints.
- **Tiny bubbles** or a rough, pitted surface on walls that should be smooth.
- **Stringing that retraction tuning will not fix.** Steam pushes plastic out of the nozzle during travel moves.
- **Weak, brittle parts** that snap along layer lines.
- **Filament that snaps** on the spool (common with damp PLA).

A quick test: print a small part, then dry the same spool and print it again. If the second print is clearly better, moisture was the problem.

## How much each material cares

- **Nylon** absorbs water fastest. It can be noticeably wet within a day in a humid room.
- **TPU and PETG** get wet within days to weeks and print badly when they do.
- **PC, ABS and ASA** absorb moisture more slowly, but still print better dry.
- **PLA** is the most forgiving, but an old spool left out for months will still string and snap.

Filled filaments (carbon fibre, glass fibre) behave like the plastic underneath.

## Drying temperatures and times

These are common starting points. Always check the spool label or the manufacturer's page first; brands differ.

- **PLA:** 45–50 °C for 4–6 hours. Do not go hotter: PLA softens at around 55–60 °C and the spool can fuse into a solid lump.
- **PETG:** 60–65 °C for 4–6 hours.
- **TPU:** 45–55 °C for 4–8 hours.
- **ABS and ASA:** 70–80 °C for about 4 hours.
- **Nylon:** 70–80 °C for 8–12 hours, then print straight from the dryer.
- **PC:** 70–80 °C for 6–8 hours.

The spool matters too. Some plastic spools soften at the higher temperatures, so check that the spool can take the heat, or rewind onto one that can.

## What to dry it in

- **A filament dryer** is the easiest option. Most hold a set temperature, and many let you print straight from the box.
- **A food dehydrator** works well if it reaches the temperature you need. Check it with a separate thermometer; many run hotter or cooler than their dial says.
- **Your printer's bed**, with the spool covered by a box, works in a pinch, and some printers have a drying mode built in.
- **A kitchen oven** is the riskiest choice. Many ovens overshoot at low settings, and a few degrees too hot will ruin a spool of PLA. If you use one, check it with a thermometer first and never leave it unattended.

To check that drying worked, weigh the spool before and after. The weight it loses is the water that came out.

## Keep it dry afterwards

Drying only helps if the spool stays dry. Store spools in an airtight box or bag with a few packets of silica gel and a cheap humidity card or hygrometer. Aim to keep the humidity inside under about 20 %. When the silica gel changes colour, dry it out and reuse it.

For nylon and TPU, print from a dry box or dryer so the filament never sits in room air during a long print.

Our [filament database](/tools#filaments) lists typical printing temperatures and properties for each material, so you can plan prints and drying together.
`
},
{
  slug:'layer-height-line-width-nozzle',
  seo_title:'Layer Height vs Nozzle Size: The Rules That Actually Matter',
  meta_description:'Layer height, line width and nozzle size decide how strong, fast and detailed a print is. The ratios that work, the ones that do not, and settings for common jobs.',
  title:'Layer Height, Line Width and Nozzle Size: Picking the Right Combination',
  category:'Tuning',
  tags:['slicer','nozzles','print quality'],
  excerpt:'Three numbers decide how strong, fast and detailed your prints are. Here are the rules of thumb, why they work, and how to design parts around them.',
  published_at:'2026-09-18',
  author_name:'Hotend HQ',
  body:`
Every print is built from the same thing: lines of plastic, stacked in layers. Three settings decide the size of those lines, and together they decide how strong, how fast and how detailed a print can be.

- **Nozzle size** is the hole the plastic comes out of.
- **Line width** is how wide each extruded line is.
- **Layer height** is how thick each layer is.

## Rule 1: Layer height stays between 25 % and 75 % of the nozzle

The nozzle presses each line flat as it lays it down. If the layer is too thick, the nozzle cannot press it into the layer below and the layers bond poorly. If it is too thin, the plastic has nowhere to go and the print slows down for no gain.

For a 0.4 mm nozzle that means layers from about 0.1 to 0.3 mm. A 0.2 mm layer is the usual default, 0.12–0.16 mm is for fine detail, and 0.28 mm is a common fast draft setting.

## Rule 2: Line width runs from 100 % to about 150 % of the nozzle

Lines can be wider than the nozzle, because the flat face around the hole spreads the plastic out. Most slicers default to a little over 100 %, around 0.42–0.45 mm for a 0.4 mm nozzle.

Wider lines press harder into their neighbours and bond better, so a slightly wider line can make a part stronger. Narrower lines, close to the nozzle size, give sharper detail.

## Rule 3: Design walls as whole numbers of lines

Your slicer builds walls from whole lines. A wall that is not a whole number of lines wide gets a thin, wiggly line of "gap fill" squeezed into the middle, which is slow and weak.

With a 0.4 mm nozzle, wall thicknesses of 0.8, 1.2 and 1.6 mm print cleanly. A 1.0 mm wall does not. Our [Gridfinity generator](/generators/gridfinity) shows how many lines each wall and divider will print as for the nozzle you choose, and warns you when a thickness falls between two.

## Rule 4: Heights should be whole numbers of layers

The same idea applies vertically. A part that is 10 mm tall prints as exactly 50 layers at 0.2 mm. A 10.1 mm part forces the slicer to round, and a lid or a fit that depends on that last 0.1 mm will not come out as designed. Gridfinity's 7 mm height unit works out to exactly 35 layers at 0.2 mm, which is one reason it prints so reliably.

## Speed comes from all three

How fast a printer can go is limited by how fast the hot end can melt plastic, which is measured as volume per second:

flow (mm³/s) = layer height × line width × speed

Double the layer height and you move twice as much plastic at the same speed. That is why a bigger nozzle, which allows thicker layers and wider lines, can halve print time on large parts even though the printer moves no faster.

## Which nozzle for which job

- **0.2 mm:** miniatures, small text and fine jewellery. On our [chain generator](/generators/chain), the 0.2 mm setting allows thinner wire and smaller gaps for delicate chains. Expect long print times.
- **0.4 mm:** the all-rounder, and what almost every printer ships with.
- **0.6 mm:** strong functional parts such as brackets, holders and tools. Wider lines bond better and prints finish much faster, with only slightly softer detail.
- **0.8 mm:** big, simple parts and vases, where speed matters more than detail.

## Settings to start from

- **Detailed display parts:** 0.4 mm nozzle, 0.12 mm layers, 0.42 mm lines.
- **Everyday parts:** 0.4 mm nozzle, 0.2 mm layers, 0.45 mm lines.
- **Strong brackets and holders:** 0.6 mm nozzle, 0.3 mm layers, 0.65 mm lines, four or more walls.
- **Fast drafts:** 0.4 mm nozzle, 0.28 mm layers, 0.5 mm lines.

Small details need at least two lines to print well. Text strokes, thin ribs and wire on a chain thinner than two line widths will come out patchy or not at all, which is why the chain generator warns you when the wire is too thin for the nozzle you picked.
`
},
{
  slug:'all-metal-vs-ptfe-hotends',
  seo_title:'All-Metal vs PTFE Hotend: Which Does Your Printer Need? (2026)',
  meta_description:'PTFE-lined hotends cap out around 240°C. Here\'s when an all-metal upgrade pays off, when it causes new clogs, and which one to buy.',
  title:'All-Metal vs PTFE-Lined Hot Ends: What Actually Changes',
  category:'Guides',
  tags:['hot ends','upgrades','beginner'],
  excerpt:'The upgrade everyone recommends, explained honestly — including the three cases where a PTFE-lined hot end is still the better call.',
  published_at:'2026-09-14',
  author_name:'Hotend HQ',
  body:`
A PTFE-lined hot end runs a short length of PTFE tube all the way down to the top of the nozzle. It is cheap, it seals beautifully, and molten plastic slides over it with almost no friction. That is why nearly every budget printer ships with one.

The catch is temperature. PTFE begins to soften around 240 °C and starts breaking down past roughly 250 °C. You lose the seal, you get a gap where filament oozes and cooks, and — the part people skip — the decomposition products are not something you want to breathe.

An all-metal hot end deletes the liner from the melt zone. The filament path becomes a polished metal heat break, typically bimetal or titanium, with a thin thermal bridge between a cold zone and a hot zone. Nothing in the path melts at printing temperature, so 300 °C is routine.

## What you actually gain

**Materials.** Polycarbonate, nylon, PC blends, PPS-CF, and most carbon-filled engineering filaments all need 260 °C or more. With a lined hot end they are simply off the table.

**Consistency over long prints.** A PTFE liner creeps. After a few hundred hours it compresses, a gap opens above the nozzle, and you start getting intermittent under-extrusion that no amount of retraction tuning fixes. All-metal removes that wear item entirely.

**Higher sustained flow.** Modern all-metal designs pair a long melt zone with a high-wattage heater. A good one will push 25–35 mm³/s where a stock lined hot end taps out near 12.

## What you actually give up

**PLA becomes fussier.** This is the honest tradeoff. Without the liner, the heat break relies on a sharp thermal gradient and steady part cooling. If the heat break is not properly cooled, PLA softens too early in the transition zone, swells, and jams. This is the single most common reason people say their all-metal upgrade "made printing worse."

**Retraction needs retuning.** Longer melt zones hold more molten plastic. Expect to re-run a retraction tower after the swap.

**Assembly is less forgiving.** The nozzle must be tightened hot against the heat break, not against the heat block. Get that wrong and you get a leak that will eventually wrap the block in a blob of cooked plastic.

## The three cases where lined still wins

1. **You print PLA and PETG exclusively, at speed.** A quality lined hot end at 215 °C is dead reliable and costs a third as much.
2. **The printer lives in a cold garage.** All-metal heat breaks depend on the cold side staying cold, but they also depend on the hot side staying hot. Drafty rooms cause both problems at once.
3. **You are still learning.** Add one variable at a time. Master first layers and bed adhesion before changing the melt path.

## If you do upgrade

Check the heat break type before anything else. A **bimetal** heat break — copper or brass hot side bonded to a thin stainless throat — beats a plain titanium one for both thermal performance and jam resistance, and the price difference is now trivial.

Then make sure the heatsink fan runs at 100 % from the moment the hot end is above 50 °C. Not tied to part cooling. Not thermostatic. Always on. More all-metal jams trace back to that one setting than to the hardware itself.

Finally, cold-pull once after assembly with a piece of nylon. It scrubs the transition zone and tells you immediately whether your assembly sealed properly: a clean cone means you are good, a ragged plug means go back and re-seat the nozzle hot.
`
},
{
  slug:'clogged-nozzle-five-minute-diagnostic',
  seo_title:'Clogged Nozzle? A 5-Minute Diagnostic to Find the Real Cause',
  meta_description:'Most 3D printer "clogs" aren\'t clogs. Check extruder grip, heat creep and the heat break, then cold pull, in that order, before you replace a nozzle.',
  title:'Fix a Clogged Nozzle for Good: The Five-Minute Diagnostic',
  category:'Troubleshooting',
  tags:['clogs','maintenance','extruder'],
  excerpt:'Most "clogs" are not clogs. Work through this order and you will find the real fault instead of replacing a nozzle that was fine.',
  published_at:'2026-09-10',
  author_name:'Hotend HQ',
  body:`
A clog is a specific failure: material physically blocking the melt path. Far more often the symptom — nothing coming out — is caused by something upstream that has nothing to do with the nozzle. Work in this order and you will stop replacing good parts.

## Step 1 — Can the extruder push at all? (30 seconds)

Heat to printing temperature, release the idler arm tension, and push filament through by hand. If it flows with light thumb pressure, **the hot end is clear** and your problem is the extruder: worn gears, wrong tension, a slipping stepper, or a loose grub screw on the drive shaft. Stop here and go look at the extruder.

If you have to lean on it, keep going.

## Step 2 — Heat creep or a true blockage? (1 minute)

Let the hot end cool completely, then reheat and try again.

If it flows fine when freshly heated and seizes 10–20 minutes into a print, that is **heat creep**, not a clog. Heat is migrating up the heat break and softening filament above the melt zone until it swells and locks. Fix the cooling, not the nozzle: heatsink fan at full speed whenever hot, fan duct actually aimed at the fins, thermal paste between heat break and heatsink, and no plastic shroud choking airflow.

## Step 3 — Nozzle or heat break? (2 minutes)

Remove the nozzle while hot — always hot, or you will shear it. Now push filament through the heat break alone.

- Flows freely → the **nozzle** is blocked. Burn it out with a torch, soak in acetone for PLA or use a needle, or just replace it. Brass nozzles are consumables.
- Still blocked → the **heat break** is blocked, which usually means a heat creep jam has already welded a plug in place, or a PTFE liner has receded and a charred ring has formed at the gap.

## Step 4 — The cold pull

For a partially restricted path, a cold pull is more effective than any needle. Nylon works best; PETG is a decent substitute; PLA is the weakest option but will do.

1. Heat to 250 °C for nylon (230 °C for PETG) and push material through until the colour running out is clean.
2. Drop the temperature to 90 °C for nylon, 100 °C for PETG, and hold.
3. Pull firmly and steadily — not a jerk.

Look at what came out. A clean cone with a crisp tip means the path is clear. A ragged, hollow, or stringy end means debris is still in there — repeat until it comes out clean. Two or three pulls is normal.

## The causes worth fixing permanently

**Printing too cold for the speed.** Under-heated filament raises pressure in the melt zone until the extruder skips. It looks exactly like a clog. If your flow demands exceed what the hot end can melt, no nozzle change helps.

**Debris and dust.** Filament drags surface dust into a 0.4 mm hole. A foam filter clipped to the filament path costs nothing and removes a real share of nozzle failures.

**Abrasive filament in a brass nozzle.** Carbon fibre and glow-in-the-dark filaments wear brass in hours, not months. The hole goes oval, extrusion goes inconsistent, and it reads as a partial clog. Use hardened steel for anything filled.

**Wet filament.** Nylon and PETG absorb moisture; it flashes to steam in the melt zone, causes popping, voids, and erratic pressure. Dry the spool before assuming hardware.

## When to just replace it

Nozzles are cheap and the internal geometry matters more than people think. If you have burned one out twice, replace it. If you print abrasives at all, keep hardened steel in the machine and keep a spare in the drawer.
`
},
{
  slug:'nozzle-materials-decoded',
  seo_title:'Brass vs Hardened Steel vs Tungsten Carbide Nozzles (2026)',
  meta_description:'Nozzle choice is heat transfer versus wear. When brass is right, when abrasive filaments need hardened steel, and whether tungsten carbide or ruby is worth it.',
  title:'Nozzle Materials Decoded: Brass, Steel, Hardened Steel, Tungsten Carbide, Ruby',
  category:'Materials',
  tags:['nozzles','abrasives','materials'],
  excerpt:'Thermal conductivity versus wear resistance is the whole story. Here is which one belongs in your machine.',
  published_at:'2026-09-06',
  author_name:'Hotend HQ',
  body:`
Every nozzle material is a trade between how fast it moves heat into plastic and how well it resists being sanded away from the inside. You cannot max both, so pick for what you actually print.

## Brass — the default, and usually right

Thermal conductivity around 110 W/m·K. Nothing common beats it for getting heat into filament, which is why brass stays the highest-flow option for unfilled materials. It is also soft. Carbon fibre, glass fill, metal fill, glow powder, and wood fill will open a 0.4 mm brass nozzle to 0.5 mm inside a couple of spools.

**Use it for:** PLA, PETG, ABS, ASA, TPU — anything unfilled. Replace when your extrusion widths start drifting.

## Stainless steel — the food-safe compromise

Roughly 15 W/m·K, so seven times worse at heat transfer than brass, and only mildly more wear resistant. Its real reason to exist is that it contains no lead and is accepted for food-contact-adjacent prints.

**Use it for:** food-adjacent parts and nothing else. Expect to raise temperatures 5–10 °C to match brass flow.

## Hardened steel — the abrasive workhorse

Around 20 W/m·K with a hardened or coated bore. This is the right answer for filled filaments and it is cheap. The downside is real but manageable: slightly lower flow and a surface that some users find holds onto residue more than brass.

**Use it for:** carbon fibre, glass filled, glow in the dark, wood fill, metal fill, anything with visible particles.

## Tungsten carbide — the long-haul option

Extreme hardness with conductivity in the 70–90 W/m·K range, so it recovers most of the flow that hardened steel gives up. It will outlast hardened steel by an order of magnitude on abrasives. It is also brittle: drop it on concrete and it can chip, and over-torquing can crack it.

**Use it for:** production machines running filled materials constantly, where nozzle swaps cost more than the nozzle.

## Ruby and plated tips — precision, at a price

A synthetic ruby insert in a brass or copper body gives you brass-class conductivity with a wear surface that is essentially permanent. Nickel-plated copper does something similar with a coating instead of an insert. Both are excellent and both are expensive enough that you should be sure abrasives are a permanent part of your workflow.

**Use it for:** fine-detail abrasive printing where you also want maximum flow.

## The part people get wrong

Nozzle material changes your effective temperature, not just your wear life. Swapping brass for hardened steel without raising temperature is the most common cause of sudden under-extrusion after an "upgrade." When you change material, re-run a temperature tower. Ten minutes, and it saves a week of chasing ghosts.

## Diameter matters more than material for most people

If you print functional parts and you have never left 0.4 mm, try 0.6 mm before you spend money on exotic alloys. You get roughly twice the flow, stronger parts from wider extrusions, and a nozzle far less prone to blocking — at the cost of detail you probably were not using.
`
},
{
  slug:'retraction-tuning-that-works',
  seo_title:'Retraction Settings: Fix 3D Print Stringing in 20 Minutes',
  meta_description:'Stringing is a pressure problem, not a distance problem. Dry the spool, run a temperature tower, then tune retraction in the right order and it disappears.',
  title:'Why Your Retraction Settings Are Wrong (And the 20-Minute Fix)',
  category:'Tuning',
  tags:['stringing','retraction','calibration'],
  excerpt:'Stringing is a pressure problem, not a distance problem. Tune in the right order and it disappears.',
  published_at:'2026-09-02',
  author_name:'Hotend HQ',
  body:`
Almost everyone tunes retraction first and temperature last. That is backwards, and it is why people end up with 8 mm retractions on a direct drive extruder, grinding filament flat and calling it solved.

Stringing happens when molten plastic under pressure leaks from the nozzle during a travel move. Retraction relieves that pressure. But three things set the pressure in the first place, and retraction is the least important of them.

## Order of operations

**1. Dry the filament.** Wet filament boils in the melt zone and pushes material out regardless of retraction. PETG and nylon are the worst offenders. If you see steam, hear popping, or the strings look foamy and rough rather than fine and glassy, stop tuning and dry the spool. Four hours at 50 °C for PLA, 65 °C for PETG and nylon.

**2. Run a temperature tower.** Every 10 °C above where you need to be roughly doubles ooze. Print a tower from 230 °C down to 195 °C for PLA and pick the lowest band that still shows good layer adhesion and no under-extrusion. This single step removes most stringing for most people.

**3. Now tune retraction distance.** Start from the geometry, not from a forum post:
   - Direct drive: start at 0.8 mm, test 0.4–2 mm.
   - Bowden: start at 4 mm, test 2–7 mm.
   
   Print a retraction tower and take the lowest value that is clean. More is not safer — excess retraction pulls molten plastic back into the heat break where it cools, swells, and causes the clog you will be diagnosing next week.

**4. Then retraction speed.** 35–45 mm/s is a good window for direct drive, 25–35 mm/s for Bowden. Too fast and the drive gear shaves a flat into the filament; you will see the shavings collecting in the extruder body.

**5. Only now touch travel settings.** Raise travel speed so the nozzle spends less time over open air. Enable combing or "avoid crossing perimeters" so travels stay inside the part where a string cannot be seen.

## The settings people reach for too early

**Coasting** stops extrusion before the end of a line. It hides stringing by under-filling the end of every perimeter. Use it last, in small amounts, and only if you like the trade.

**Z-hop** helps with knocked-over parts, not with stringing. It slightly increases stringing by adding travel time. Turn it on for a reason, not by default.

**Extra restart distance** compensates for oozing during long travels. If you need a lot of it, your retraction is too high.

## A note on flow-dependent ooze

High-flow hot ends have long melt zones holding more molten plastic, so they hold more pressure and take longer to relieve it. If you upgraded your hot end and stringing got worse, that is expected and normal — re-run the tower rather than assuming the new hardware is faulty.

## What good looks like

Fine, glassy strings that break when you touch them are cosmetic and take seconds to clean. Thick, rough strands that take a knife are a real problem. Chase the second. Living with the first is a reasonable choice.
`
},
{
  slug:'thermal-runaway-protection',
  seo_title:'Thermal Runaway Protection: A 10-Minute Test for Your Printer',
  meta_description:'Would your printer catch a failed heater or loose thermistor? How thermal runaway protection works, how to test it safely, and what quietly disables it.',
  title:'Thermal Runaway: What It Is, and How to Prove Your Printer Survives It',
  category:'Safety',
  tags:['safety','firmware','thermistor'],
  excerpt:'A ten-minute test that tells you whether your printer would catch a heater failure — or keep heating until something burns.',
  published_at:'2026-08-28',
  author_name:'Hotend HQ',
  featured:true,
  body:`
Thermal runaway is the failure where a printer keeps applying power to a heater while believing the temperature is fine. The usual cause is mechanical: the thermistor falls out of the heat block. Now the sensor reads cooling air, the firmware asks for more power to reach target, the block keeps climbing, and nothing stops it.

Modern firmware ships with protection for this. It is not optional and it is worth verifying rather than assuming.

## What the protection actually does

Two checks run continuously:

**Watch period.** After a heating command, if temperature has not risen by a minimum amount within a set window, the firmware halts. This catches a disconnected or displaced thermistor that reads a fixed low value.

**Hysteresis check.** Once at target, if measured temperature drifts outside a band for longer than a set period, the firmware halts. This catches a thermistor that has fallen out mid-print.

On a halt the printer should kill all heaters and require a full power cycle. Anything less is a bug.

## Verify it in ten minutes

You do not need to create a dangerous condition. You need to create a sensor disagreement.

1. Heat the hot end to 200 °C and let it stabilise.
2. With the printer running, carefully slide the thermistor out of the heat block — tools, not fingers, and stay clear of the block.
3. Watch the readout. It should fall fast. Within the hysteresis window, the printer should stop with a thermal runaway error and shut off heat.

If the printer instead keeps heating, or simply reports a drop and continues, your protection is disabled or misconfigured. Fix that before you print again.

Repeat for the bed if your bed has an independent thermistor.

## Common ways it gets disabled

**Firmware compiled with it commented out.** On Marlin builds, look for THERMAL_PROTECTION_HOTENDS and THERMAL_PROTECTION_BED in the configuration. Some vendor builds and many older custom builds ship them off.

**Klipper without verify_heater tuning.** Klipper enables verification by default, but aggressive max_delta or check_gain_time values edited to silence nuisance errors will silence real ones too.

**A "fix" for false positives.** If your printer trips protection during normal printing, the answer is to find the cause — a part cooling fan blasting the heat block, a loose thermistor, bad PID values — not to widen the window until the error stops.

## The mechanical side matters more

Firmware is the backstop. The primary defence is that the thermistor cannot move.

- Use a screw-retained thermistor cartridge rather than a bare bead pushed into a hole.
- Strain-relieve the wiring so head movement does not tug on the sensor.
- Inspect the heater and thermistor wires where they flex. Repeated bending cracks insulation, and a short at the heater cartridge is the other way this failure happens.
- Replace any heat block with visibly cooked plastic around the thermistor hole.

## Worth doing regardless

Put the printer on a non-combustible surface. Keep it out of the path of anything you would mind losing. If you print unattended at all, a smoke detector in the room is a twenty-dollar decision that does not need justifying.
`
},
{
  slug:'high-flow-hotends-explained',
  seo_title:'High-Flow Hotends: What Volumetric Flow Specs Really Mean',
  meta_description:'Manufacturers quote mm³/s at conditions you\'ll never print in. How to read the spec, turn flow into real print speed, and measure your own hotend honestly.',
  title:'High-Flow Hot Ends: What the Numbers Mean and Which Ones Matter',
  category:'Reviews',
  tags:['hot ends','flow rate','upgrades'],
  excerpt:'Manufacturers quote volumetric flow at conditions you will never print in. Here is how to read the spec and what to actually expect.',
  published_at:'2026-08-22',
  author_name:'Hotend HQ',
  body:`
Flow rate is the headline number on every hot end sold today, quoted in cubic millimetres per second. It is a useful spec and a badly abused one.

## How the number is generated

A manufacturer quote is usually PLA, at the top of the temperature range, extruding into open air, with no part cooling and no pressure requirement. That is the most generous possible condition. Your actual print has a fan blowing on the nozzle, a bed pulling heat away, quality requirements, and a material that may be far harder to melt.

A realistic rule: **expect 55–70 % of the quoted figure in real printing**, and less with ABS, PETG, or anything filled.

## Translating flow into speed

The number that matters is whether the hot end can keep up with your slicer. For a given layer height and extrusion width:

flow (mm³/s) = layer height × extrusion width × print speed

At 0.2 mm layers and 0.42 mm width, 200 mm/s needs about 17 mm³/s. At 300 mm/s you need 25. A stock lined hot end delivering 11–13 real mm³/s cannot feed a 300 mm/s machine no matter how fast the motion system moves — you will just get under-extrusion that looks like a mechanical problem.

## What actually creates flow

**Melt zone length.** More time in contact with hot metal is the single biggest factor. High-flow designs use longer heat blocks, internal grooves, or a spiral path to increase contact area.

**Heater power.** 60 W has become standard on high-flow hot ends for a reason. Melting is an energy problem: you need to keep pouring heat in at the same rate you are pulling melted plastic out.

**Nozzle bore geometry.** A long, smooth, gently tapered bore both melts better and generates less pressure than a short one.

**Thermal conductivity of the path.** Copper and copper alloy blocks move heat into the melt far better than aluminium. Plated copper gets the conductivity without the corrosion.

## What does not create flow

A bigger nozzle **orifice** alone does not add melting capacity. It lowers pressure, which helps, but if the hot end cannot melt the material you are simply extruding under-melted plastic — it looks glossy, it is weak between layers, and it will disappoint you.

More heater wattage on a short melt zone mostly cooks the plastic nearest the wall while the core stays cold.

## How to measure yours honestly

1. Heat to your normal printing temperature.
2. Command a fixed extrusion — say 100 mm of 1.75 mm filament, which is about 240 mm³ — at a known feed rate.
3. Increase feed rate until the actual extruded length falls short of commanded by more than 5 %.
4. The last rate that held is your real maximum flow at that temperature.

Do it with the part cooling fan running, because that is how you print.

## Is it worth upgrading?

Only if flow is your actual bottleneck. Check in this order: is your motion system capable of the speeds you want, is your extruder capable of the force, and only then, is your hot end capable of the melt. Upgrading a hot end on a machine limited by frame rigidity or input shaping buys you nothing but a more expensive bottleneck somewhere else.
`
}
];
