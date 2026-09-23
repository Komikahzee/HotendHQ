/* Seed articles.
   Optional SEO fields: seo_title (the <title>, used as-is) and meta_description.
   Without them the build falls back to "<title> — Hotend HQ" and the excerpt.
 These ship with the site so it is never empty, and they are
   the fallback when no backend is configured. Once Supabase is connected,
   published rows from the database are shown first and these fill in behind. */
window.HHQ_SEED_ARTICLES = [
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
  featured:true,
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
