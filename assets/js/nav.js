/* Navigation model — the ONE place site structure is defined.
   Header, footer, and sitemap all render from this. */
window.HHQ_NAV = {
  primary: [
    { href:'news.html',        label:'News',      desc:'Latest 3D printing news, guides, and reviews' },
    { href:'troubleshoot.html',label:'Troubleshoot', desc:'Diagnose any print failure step by step' },
    { href:'generators.html',  label:'Generators', desc:'Gridfinity, boxes, brackets, chains and more, made to your size',
      also:['gridfinity','chain','storage-box','grid-organiser','cable-clip','spool-holder','wall-bracket','generator'] },
    { href:'tools.html',       label:'Tools',     desc:'Calculators and reference databases' },
    { href:'gear.html',        label:'Gear',      desc:'Tested hardware picks and buying guides' }
  ],
  footer: [
    { title:'Explore', links:[
      { href:'news.html', label:'News & Articles' },
      { href:'troubleshoot.html', label:'Troubleshooting' },
      { href:'generators.html', label:'3D Model Generators' },
      { href:'gridfinity.html', label:'Gridfinity Generator' },
      { href:'chain.html', label:'Chain Generator' },
      { href:'tools.html', label:'Calculators' },
      { href:'gear.html', label:'Gear Picks' }
    ]},
    { title:'Site', links:[
      { href:'about.html', label:'About' },
      { href:'about.html#contact', label:'Contact' },
      { href:'about.html#disclosure', label:'Affiliate Disclosure' },
      { href:'about.html#privacy', label:'Privacy' },
      { href:'login.html', label:'Contributor Sign-in' }
    ]}
  ]
};
