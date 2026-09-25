/* ============================================================
   HOTEND HQ — shared shell. Renders the header and footer on
   every page from the single nav model, so no page duplicates
   site chrome or structure.
   ============================================================ */
(function () {
  const CFG = window.HHQ_CONFIG, NAV = window.HHQ_NAV;

  /* ---------- tiny icon set (stroke icons, currentColor) ---------- */
  const ICONS = {
    menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',
    close:'<path d="M18 6L6 18M6 6l12 12"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    news:'<path d="M4 5h11v14H4z"/><path d="M15 9h5v8a2 2 0 0 1-2 2h-3"/><path d="M7 9h5M7 12h5M7 15h3"/>',
    wrench:'<path d="M14.5 6a3.5 3.5 0 0 0 4.6 4.6L21 12.5 12.5 21 4 12.5 12.5 4z"/>',
    cube:'<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
    calc:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h1M12 12h1M16 12h1M8 16h1M12 16h1M16 16h1"/>',
    tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
    bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
    warn:'<path d="M12 3l9.5 16.5H2.5z"/><path d="M12 9.5v5M12 17.5v.3"/>',
    check:'<path d="M20 6L9 17l-5-5"/>',
    download:'<path d="M12 3v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    ext:'<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    filament:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    flame:'<path d="M12 2s5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9.5 11 11 12c1.5-2-1-5 1-10z"/>',
    grid:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'
  };
  window.icon = (name, cls) =>
    `<svg class="${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${ICONS[name]||''}</svg>`;

  const NAV_ICONS = { 'News':'news','Troubleshoot':'wrench','Generator':'cube','Generators':'cube','Gridfinity':'grid','Tools':'calc','Gear':'tag' };
  window.HHQ_NAV_ICONS = NAV_ICONS;

  /* ---------- helpers exposed to pages ---------- */
  window.HHQ = {
    el(sel, root){ return (root||document).querySelector(sel); },
    els(sel, root){ return Array.from((root||document).querySelectorAll(sel)); },
    esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
    /** Build an affiliate URL from a product record. */
    affLink(p){
      if (p.url) return p.url;                       // explicit override wins
      if (p.asin) return `https://www.amazon.com/dp/${p.asin}?tag=${encodeURIComponent(CFG.affiliate.amazonTag)}`;
      return `https://www.amazon.com/s?k=${encodeURIComponent(p.search || p.name)}&tag=${encodeURIComponent(CFG.affiliate.amazonTag)}`;
    },
    date(d){
      if(!d) return '';
      // bare YYYY-MM-DD is a calendar date, not UTC midnight (which shows as the day before in the US)
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
      const dt = m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(d);
      return isNaN(dt) ? '' : dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    },
    slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); },
    readTime(txt){ return Math.max(1, Math.round(String(txt||'').split(/\s+/).length/220)) + ' min read'; },
    toast(msg, kind){
      let t = document.getElementById('hhq-toast');
      if(!t){ t=document.createElement('div'); t.id='hhq-toast';
        t.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:999;'+
          'padding:12px 20px;border-radius:12px;font-weight:700;font-size:.9rem;max-width:calc(100vw - 32px);'+
          'box-shadow:0 14px 40px -12px rgba(0,0,0,.8);transition:opacity .25s,transform .25s;text-align:center';
        document.body.appendChild(t); }
      t.style.background = kind==='bad' ? '#ff5f56' : kind==='warn' ? '#ffb84d' : '#3ecf8e';
      t.style.color='#0a0a0a'; t.textContent=msg;
      t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)';
      clearTimeout(t._t); t._t=setTimeout(()=>{ t.style.opacity='0';
        t.style.transform='translateX(-50%) translateY(10px)'; }, 3200);
    }
  };

  /* ---------- head: meta, icons, fonts ---------- */
  function head(){
    const page = document.title || CFG.siteName;
    const desc = document.querySelector('meta[name=description]')?.content ||
      'Everything 3D printing — news, troubleshooting, parametric model generators, calculators, and tested gear picks.';
    const add = (html) => document.head.insertAdjacentHTML('beforeend', html);
    if(!document.querySelector('link[rel=icon]')) add(
      `<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
       <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
       <link rel="manifest" href="/site.webmanifest">`);
    if(document.querySelector('meta[property="og:title"]')) return;   // pre-rendered page already has them
    add(`<meta name="theme-color" content="#00091c">
      <meta property="og:site_name" content="${CFG.siteName}">
      <meta property="og:title" content="${HHQ.esc(page)}">
      <meta property="og:description" content="${HHQ.esc(desc)}">
      <meta property="og:type" content="website">
      <meta property="og:image" content="${CFG.baseUrl}/assets/img/og-image.png">
      <meta name="twitter:card" content="summary_large_image">`);
  }

  /* ---------- header & footer ----------
     Pure HTML builders, so the build step (build/build.mjs) can bake the
     same chrome into every page. At runtime we only inject them when a
     page does not already contain them.                                   */
  const abs = h => /^(https?:|mailto:|\/|#)/.test(h) ? h : '/' + h.replace(/^\.\//, '');
  const pageKey = p => {
    p = String(p || '').toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (p.startsWith('/guides') || /(^|\/)article(\.html)?$/.test(p)) return 'news';
    const last = p.split('/').pop() || 'index';
    return last.replace(/\.html$/, '') || 'index';
  };
  function headerHTML(path){
    const here = pageKey(path);
    const links = NAV.primary.map(n => {
      const cur = pageKey('/' + n.href) === here || (n.also || []).includes(here);
      return `<a href="${abs(n.href)}"${cur?' aria-current="page"':''}>${n.label}</a>`;
    }).join('');
    const cta = `<div class="head-cta">
        <a class="btn btn-ghost btn-sm" href="/login" data-auth-chip>${icon('user')}<span>Sign in</span></a>
        <a class="btn btn-primary btn-sm" href="/generators">${icon('cube')}Generate a part</a>
      </div>`;
    return `<a class="skip" href="#main">Skip to content</a>
       <header class="site-head">
        <div class="wrap head-in">
          <a class="brand" href="/" aria-label="${CFG.siteName} home">
            <img src="/assets/img/icon-192.png" alt="" width="38" height="38">
            <span class="brand-txt">
              <span class="brand-name"><span class="h">Hotend</span> <span class="q">HQ</span></span>
              <span class="brand-tag">${CFG.tagline}</span>
            </span>
          </a>
          <button class="burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="nav">
            ${icon('menu')}
          </button>
          <nav class="nav" id="nav">${links}${cta}</nav>
        </div>
       </header>`;
  }
  function footerHTML(year){
    const cols = NAV.footer.map(c => `
      <div class="foot-col"><h4>${c.title}</h4><ul>${
        c.links.map(l=>`<li><a href="${abs(l.href)}">${l.label}</a></li>`).join('')
      }</ul></div>`).join('');
    const social = [
      CFG.social.tiktok && `<a href="${CFG.social.tiktok}" rel="noopener">TikTok</a>`,
      CFG.social.youtube && `<a href="${CFG.social.youtube}" rel="noopener">YouTube</a>`,
      CFG.social.email && `<a href="mailto:${CFG.social.email}">Email</a>`
    ].filter(Boolean).join('');
    return `
      <footer class="site-foot">
        <div class="wrap">
          <div class="foot-grid">
            <div class="foot-col">
              <a class="brand" href="/" style="margin-bottom:14px">
                <img src="/assets/img/icon-192.png" alt="" width="38" height="38">
                <span class="brand-txt">
                  <span class="brand-name"><span class="h">Hotend</span> <span class="q">HQ</span></span>
                  <span class="brand-tag">${CFG.tagline}</span>
                </span>
              </a>
              <p class="disclosure" id="disclosure">${CFG.affiliate.disclosure}</p>
              <div class="row" style="margin-top:14px;gap:16px;font-size:.88rem">${social}</div>
            </div>
            ${cols}
          </div>
          <div class="foot-bottom">
            <span>© ${year || new Date().getFullYear()} ${CFG.siteName}. All rights reserved.</span>
            <span>Built for makers who fix things themselves.</span>
          </div>
        </div>
      </footer>`;
  }
  window.HHQ_CHROME = { headerHTML, footerHTML, pageKey };

  function header(){
    if (!document.querySelector('.site-head'))
      document.body.insertAdjacentHTML('afterbegin', headerHTML(location.pathname));
    const b = document.getElementById('burger'), nav = document.getElementById('nav');
    if (!b || !nav) return;
    b.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      b.setAttribute('aria-expanded', String(open));
      b.innerHTML = icon(open ? 'close' : 'menu');
    });
    nav.addEventListener('click', e => { if(e.target.closest('a')){
      nav.classList.remove('open'); b.setAttribute('aria-expanded','false'); b.innerHTML = icon('menu'); }});
  }
  function footer(){
    if (!document.querySelector('.site-foot'))
      document.body.insertAdjacentHTML('beforeend', footerHTML());
  }

  /* ---------- auth chip in header (filled once auth resolves) ---------- */
  window.addEventListener('hhq:auth', e => {
    const chip = document.querySelector('[data-auth-chip]');
    if(!chip) return;
    const u = e.detail && e.detail.user;
    if(u){
      chip.href = '/admin';
      chip.innerHTML = icon('edit') + '<span>' + HHQ.esc((u.email||'account').split('@')[0]) + '</span>';
    } else {
      chip.href = '/login';
      chip.innerHTML = icon('user') + '<span>Sign in</span>';
    }
  });

  /* ---------- article URLs & cards (shared by home, news, related lists) ----------
     Published articles live at /guides/<slug>/ (built by build/build.mjs).
     Drafts and not-yet-built articles fall back to the live renderer.      */
  window.articleUrl = function (p) {
    const slug = encodeURIComponent(p.slug);
    return p.status === 'draft' || p.local ? `/article?a=${slug}` : `/guides/${slug}/`;
  };
  window.featureCard = function (lead) {
    return `<a class="card card--link feature" href="${articleUrl(lead)}">
        <div class="post-cover">${lead.cover_url
          ? `<img src="${HHQ.esc(lead.cover_url)}" alt="" loading="lazy">`
          : `<span class="ph">${icon('flame')}</span>`}</div>
        <div>
          <span class="tag tag--flame">${HHQ.esc(lead.category)}</span>
          <h3 style="margin:11px 0 8px">${HHQ.esc(lead.title)}</h3>
          <p class="muted">${HHQ.esc(lead.excerpt||'')}</p>
          <div class="post-meta">
            <span>${HHQ.date(lead.published_at)}</span><span>·</span>
            <span>${HHQ.readTime(lead.body)}</span>
          </div>
        </div>
      </a>`;
  };

  /* ---------- article card ---------- */
  window.postCard = function (p) {
    return `<a class="card card--link post" href="${articleUrl(p)}">
      <div class="post-cover">${p.cover_url
        ? `<img src="${HHQ.esc(p.cover_url)}" alt="" loading="lazy">`
        : `<span class="ph">${icon('flame')}</span>`}</div>
      <span class="tag">${HHQ.esc(p.category)}</span>
      <h3>${HHQ.esc(p.title)}</h3>
      <p class="excerpt">${HHQ.esc(p.excerpt || '')}</p>
      <div class="post-meta"><span>${HHQ.date(p.published_at)}</span><span>\u00b7</span>
        <span>${HHQ.readTime(p.body)}</span>${p.status === 'draft'
          ? '<span class="tag tag--bad">Draft</span>' : ''}</div>
    </a>`;
  };

  head();
  document.addEventListener('DOMContentLoaded', () => { header(); footer(); });
})();
