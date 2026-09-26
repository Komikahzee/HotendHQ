/* Every generator on the site: the hub page, "More generators" sections and
   the sitemap all read this list. Add a generator here and run
   node build/make-pages.mjs to rebuild the pages that list them. */
export const CATEGORIES = {
  organize: 'Organizing', crafts: 'Crafts & signs', games: 'Games & toys', jewelry: 'Jewelry', workshop: 'Workshop', hobby: 'Hobby & tech',
};
export const GENERATORS = [
  { slug: 'gridfinity', name: 'Gridfinity generator', cat: 'organize', tags: ['STL', '3MF', 'Splits for your bed'],
    blurb: 'Bins with dividers, scoops, labels and magnets, plus baseplates, lids, tool holders and a drawer fitter.' },
  { slug: 'chain', name: 'Chain generator', cat: 'jewelry', tags: ['STL', '3MF', 'Print-in-place'],
    blurb: 'Print-in-place necklace chains in 34 styles, sized to your nozzle and bed, with clasps or as an endless loop.' },
  { slug: 'layered-signs', name: 'Layered sign generator', cat: 'crafts', tags: ['3MF', 'Multicolour'],
    blurb: 'Multicolour signs with raised or inlaid text, borders and mounting, with the colour-change heights worked out.' },
  { slug: 'dice', name: 'Dice generator', cat: 'games', tags: ['STL', '3MF', 'd4–d20'],
    blurb: 'd4, d6, d8, d10, d12, d20 and d100 with your own numbers, words or pips on every face.' },
  { slug: 'stencils', name: 'Stencil generator', cat: 'crafts', tags: ['STL', 'Auto bridges'],
    blurb: 'Text and image stencils with bridges added automatically so the middles of O, A and B stay in.' },
  { slug: 'plant-markers', name: 'Plant marker generator', cat: 'crafts', tags: ['STL', '3MF', 'Batch'],
    blurb: 'A whole set of garden markers from a list of names, with stakes, pot-rim clips or hanging tags.' },
  { slug: 'lettering', name: 'Lettering & calligraphy generator', cat: 'crafts', tags: ['STL', 'Stamps', 'Guides'],
    blurb: 'Name tracing templates, mirrored letter stamps and calligraphy guide rulers with your slant and x-height.' },
  { slug: 'pen-grips', name: 'Pen grip & cutter adapter generator', cat: 'crafts', tags: ['STL', 'Cricut', 'Silhouette'],
    blurb: 'Adapters that fit any pen into Cricut, Silhouette and Brother cutters, plus comfort grips for pens and craft knives.' },
  { slug: 'board-game-pieces', name: 'Board game pieces generator', cat: 'games', tags: ['STL', '3MF', 'Sets'],
    blurb: 'Numbered tokens and coins, pawns, meeples, resource cubes and card stands, made as whole sets.' },
  { slug: 'fidget-spinners', name: 'Fidget spinner generator', cat: 'games', tags: ['STL', 'Bearing or print-in-place'],
    blurb: 'Spinners for 608, 688 and R188 bearings or with no bearing at all, plus spinning rings.' },
  { slug: 'drone-frame', name: 'Drone frame generator', cat: 'hobby', tags: ['STL', '3MF', 'Whoop to 10″'],
    blurb: 'FPV quads, cinewhoops, tricopters, hexa and octocopters from 65 mm to 10-inch, shown built with motors and props, plus a randomizer.' },
  { slug: 'mic-accessories', name: 'Mic clip & stand accessory generator', cat: 'hobby', tags: ['STL', '5/8″ & 3/8″ threads'],
    blurb: 'Mic clips, shock mounts, thread adapters, stand cable clips, pop filters and phone mounts with real stand threads.' },
  { slug: 'storage-box', name: 'Storage box generator', cat: 'organize', tags: ['STL', 'Lid', 'Dividers'],
    blurb: 'A box to your exact size, with dividers, a snap-on lid and screw-down mounting ears.' },
  { slug: 'grid-organiser', name: 'Grid organiser generator', cat: 'organize', tags: ['STL', 'Stackable'],
    blurb: 'A drawer tray with a grid of cells sized to what you store, with optional stacking feet.' },
  { slug: 'cable-clip', name: 'Cable clip generator', cat: 'organize', tags: ['STL', 'Set of up to 8'],
    blurb: 'Screw-down clips for any cable or bundle from 2 to 40 mm, printed as a set.' },
  { slug: 'spool-holder', name: 'Spool holder generator', cat: 'workshop', tags: ['STL', 'Wall-mounted'],
    blurb: 'A wall-mounted filament spool arm sized to the bore of the spools you own.' },
  { slug: 'wall-bracket', name: 'Wall bracket generator', cat: 'workshop', tags: ['STL', 'Gusset'],
    blurb: 'An L-bracket with counterbored screw holes and an optional gusset, sized to the job.' },
];
/* which generators to suggest from each page */
export const RELATED = {
  gridfinity: ['storage-box', 'grid-organiser', 'plant-markers'], chain: ['layered-signs', 'lettering', 'dice'],
  'layered-signs': ['stencils', 'lettering', 'plant-markers'], dice: ['board-game-pieces', 'fidget-spinners', 'layered-signs'],
  stencils: ['lettering', 'layered-signs', 'pen-grips'], 'plant-markers': ['layered-signs', 'stencils', 'gridfinity'],
  lettering: ['stencils', 'pen-grips', 'layered-signs'], 'pen-grips': ['lettering', 'stencils', 'gridfinity'],
  'board-game-pieces': ['dice', 'fidget-spinners', 'gridfinity'], 'fidget-spinners': ['dice', 'board-game-pieces', 'chain'],
  'drone-frame': ['mic-accessories', 'wall-bracket', 'cable-clip'], 'mic-accessories': ['cable-clip', 'wall-bracket', 'drone-frame'],
  'storage-box': ['gridfinity', 'grid-organiser', 'cable-clip'], 'grid-organiser': ['gridfinity', 'storage-box', 'plant-markers'],
  'cable-clip': ['mic-accessories', 'wall-bracket', 'gridfinity'], 'spool-holder': ['wall-bracket', 'gridfinity', 'cable-clip'],
  'wall-bracket': ['spool-holder', 'cable-clip', 'storage-box'],
};
