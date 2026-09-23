/* Navigation model — the ONE place site structure is defined.
   Header, footer, and sitemap all render from this. */
window.HHQ_NAV = {
  primary: [
    { href:'news.html',        label:'News',      desc:'Latest 3D printing news, guides, and reviews' },
    { href:'troubleshoot.html',label:'Troubleshoot', desc:'Diagnose any print failure step by step' },
    { href:'generator.html',   label:'Generator', desc:'Parametric models you customize and download' },
    { href:'gridfinity.html',  label:'Gridfinity', desc:'Custom Gridfinity bins, baseplates and drawer layouts' },
    { href:'tools.html',       label:'Tools',     desc:'Calculators and reference databases' },
    { href:'gear.html',        label:'Gear',      desc:'Tested hardware picks and buying guides' }
  ],
  footer: [
    { title:'Explore', links:[
      { href:'news.html', label:'News & Articles' },
      { href:'troubleshoot.html', label:'Troubleshooting' },
      { href:'generator.html', label:'3D Generator' },
      { href:'gridfinity.html', label:'Gridfinity Generator' },
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
