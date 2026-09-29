/* Navigation model — the ONE place site structure is defined.
   Header, footer, and sitemap all render from this. */
window.HHQ_NAV = {
  primary: [
    { href:'/news',        label:'News',      desc:'Latest 3D printing news, guides, and reviews' },
    { href:'/troubleshoot',label:'Troubleshoot', desc:'Diagnose any print failure step by step' },
    { href:'/generators',  label:'Generators', desc:'Gridfinity, chains, pendants, drone frames and more, made to your size',
      also:['gridfinity','chain','storage-box','grid-organiser','cable-clip','spool-holder','wall-bracket','generator'] },
    { href:'/tools',       label:'Tools',     desc:'Calculators and reference databases' },
    { href:'/order',       label:'Print My Order', desc:'Send a file or a photo and get a free quote to have it printed' }
  ],
  footer: [
    { title:'Explore', links:[
      { href:'/news', label:'News & Articles' },
      { href:'/troubleshoot', label:'Troubleshooting' },
      { href:'/generators', label:'3D Model Generators' },
      { href:'/tools', label:'Calculators' },
      { href:'/order', label:'Print My Order (free quotes)' }
    ]},
    { title:'Site', links:[
      { href:'/about', label:'About' },
      { href:'/contact', label:'Contact & Support' },
      { href:'/about#disclosure', label:'Affiliate Disclosure' },
      { href:'/about#privacy', label:'Privacy' }
    ]}
  ]
};
