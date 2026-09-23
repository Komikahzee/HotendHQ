/* ============================================================
   HOTEND HQ — shared renderers for data-driven sections.
   Used in the browser (gear.html, tools.html) AND by the build
   step, so the HTML the server sends already contains the gear
   picks and the filament table. Same markup either way.
   ============================================================ */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function gearCard(g){
    const href = HHQ.affLink(g);
    return `<div class="card gear-item">
      <span class="tier">${esc(g.tier)}</span>
      <h3>${esc(g.name)}</h3>
      <span class="brand">${esc(g.brand)} · ${esc(g.price)}</span>
      <p class="why">${esc(g.why)}</p>
      <dl class="spec-list">${Object.entries(g.specs).map(([k,v]) =>
        `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="faint" style="margin:8px 0 0"><strong style="color:var(--text-dim)">Best for:</strong>
        ${esc(g.bestFor)}</p>
      <a class="btn btn-primary btn-sm" href="${esc(href)}" target="_blank"
         rel="nofollow sponsored noopener" style="margin-top:12px">
         ${icon('ext')}Check current price</a>
    </div>`;
  }

  function gearSections(active){
    const CATS = window.HHQ_GEAR_CATS || [], ITEMS = window.HHQ_GEAR || [];
    const cats = !active || active === 'all' ? CATS : CATS.filter(c => c.key === active);
    return cats.map(c => {
      const items = ITEMS.filter(i => i.cat === c.key);
      if (!items.length) return '';
      return `<section style="margin-bottom:46px">
        <div class="sec-head">
          <h2 id="${c.key}" style="font-size:1.5rem;margin-bottom:.25em">${esc(c.label)}</h2>
          <p class="muted" style="margin:0">${esc(c.blurb)}</p>
        </div>
        <div class="grid g3">${items.map(gearCard).join('')}</div>
      </section>`;
    }).join('');
  }

  function gearChips(active){
    const CATS = window.HHQ_GEAR_CATS || [];
    active = active || 'all';
    return [{key:'all',label:'Everything'}, ...CATS].map(c =>
      `<button class="chip" aria-pressed="${c.key===active}" data-c="${c.key}">${esc(c.label)}</button>`).join('');
  }

  function filamentRows(rows){
    const diff = d => ({Easy:'tag--ok',Medium:'tag',Hard:'tag--flame',Expert:'tag--bad'}[d]||'tag');
    return rows.map(m => `
      <tr>
        <td><strong>${esc(m.name)}</strong>${m.abrasive?' <span class="tag tag--bad">Abrasive</span>':''}
            <div class="faint">${esc(m.full)}</div></td>
        <td>${esc(m.nozzle)}</td><td>${esc(m.bed)}</td><td>${esc(m.chamber)}</td>
        <td>${esc(m.cooling)}</td><td>${esc(m.dry)}</td>
        <td><span class="tag ${diff(m.diff)}">${esc(m.diff)}</span></td>
        <td style="min-width:260px">${esc(m.notes)}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted">No material matches that.</td></tr>';
  }

  /** Full article markup (header, body, footer note). Needs md.js loaded. */
  function article(a){
    const email = (window.HHQ_CONFIG && HHQ_CONFIG.social && HHQ_CONFIG.social.email) || '';
    return `
    <nav class="faint" aria-label="Breadcrumb" style="margin-bottom:16px">
      <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/news.html">Guides</a>${
        a.category && !/^guides?$/i.test(a.category) ? ` <span aria-hidden="true">/</span> <span>${esc(a.category)}</span>` : ''}
    </nav>
    <div class="article-head">
      <div><span class="tag tag--flame">${esc(a.category)}</span>
        ${a.status === 'draft' ? '<span class="tag tag--bad">Draft preview</span>' : ''}</div>
      <h1 style="margin:14px 0 12px">${esc(a.title)}</h1>
      <p class="lede" style="margin-inline:auto">${esc(a.excerpt || '')}</p>
      <div class="post-meta" style="justify-content:center;margin-top:16px">
        <span>${esc(a.author_name || 'Hotend HQ')}</span><span>·</span>
        <time datetime="${esc(String(a.published_at || a.created_at || '').slice(0,10))}">${HHQ.date(a.published_at || a.created_at)}</time><span>·</span>
        <span>${HHQ.readTime(a.body)}</span>
      </div>
    </div>
    ${a.cover_url ? `<img src="${esc(a.cover_url)}" alt=""
        style="max-width:860px;margin:0 auto 34px;border-radius:var(--r-lg);border:1px solid var(--border)">` : ''}
    <div class="prose">${mdToHtml(a.body)}</div>
    <div class="prose" style="margin-top:38px">
      <div class="note note--info">${icon('info')}
        <p>Spotted something wrong, or have a fix that works better? Tell us at
        <a href="mailto:${esc(email)}">${esc(email)}</a> — corrections get credited.</p></div>
      <div class="row" style="margin-top:20px">
        <button class="btn btn-ghost btn-sm" id="share" type="button">${icon('ext')}Share</button>
        <a class="btn btn-ghost btn-sm" href="/troubleshoot.html">${icon('wrench')}Diagnose a problem</a>
      </div>
    </div>`;
  }

  /** Related articles: same category first, then shared tags. */
  function related(a, rows, n = 3){
    const score = r => (r.category === a.category ? 2 : 0) +
      ((r.tags||[]).filter(t => (a.tags||[]).includes(t)).length ? 1 : 0);
    return rows.filter(r => r.slug !== a.slug).sort((x,y) => score(y) - score(x)).slice(0, n);
  }

  window.HHQ_RENDER = { gearCard, gearSections, gearChips, filamentRows, article, related };
})();
