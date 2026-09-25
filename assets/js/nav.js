/* Navigation model — the ONE place site structure is defined.
   Header, footer, and sitemap all render from this. */
window.HHQ_NAV = {
  primary: [
    { href:'/news',        label:'News',      desc:'Latest 3D printing news, guides, and reviews' },
    { href:'/troubleshoot',label:'Troubleshoot', desc:'Diagnose any print failure step by step' },
    { href:'/generators',  label:'Generators', desc:'Gridfinity, boxes, brackets, chains and more, made to your size',
      also:['gridfinity','chain','storage-box','grid-organiser','cable-clip','spool-holder','wall-bracket','generator'] },
    { href:'/tools',       label:'Tools',     desc:'Calculators and reference databases' },
    { href:'/gear',        label:'Gear',      desc:'Tested hardware picks and buying guides' }
  ],
  footer: [
    { title:'Explore', links:[
      { href:'/news', label:'News & Articles' },
      { href:'/troubleshoot', label:'Troubleshooting' },
      { href:'/generators', label:'3D Model Generators' },
      { href:'/tools', label:'Calculators' },
      { href:'/gear', label:'Gear Picks' }
    ]},
    { title:'Site', links:[
      { href:'/about', label:'About' },
      { href:'/about#contact', label:'Contact' },
      { href:'/about#disclosure', label:'Affiliate Disclosure' },
      { href:'/about#privacy', label:'Privacy' },
      { href:'/login', label:'Contributor Sign-in' }
    ]}
  ]
};
