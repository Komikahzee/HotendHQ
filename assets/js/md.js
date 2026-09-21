/* Minimal, escape-first Markdown renderer.
   Everything is HTML-escaped before any markup is added, so article
   bodies from the database can never inject script into a page. */
window.mdToHtml = function (src) {
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = u => /^(https?:|mailto:|\/|[\w.-]+\.html)/i.test(u.trim()) ? u.trim() : '#';

  const inline = t => esc(t)
    .replace(/`([^`]+)`/g, (_,c) => `<code>${c}</code>`)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_,a,u) =>
      `<img src="${esc(safeUrl(u))}" alt="${a}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_,t2,u) => {
      const url = safeUrl(u), ext = /^https?:/i.test(url);
      return `<a href="${esc(url)}"${ext?' target="_blank" rel="noopener nofollow"':''}>${t2}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  const out = [];
  let list = null, para = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of String(src || '').replace(/\r/g,'').split('\n')) {
    const line = raw.trim();
    if (!line) { flushP(); flushL(); continue; }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushP(); flushL();
      const lv = Math.min(Math.max(m[1].length, 2), 5);  // page owns h1, so '#' and '##' are both h2
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
    } else if (/^(---|\*\*\*|___)$/.test(line)) {
      flushP(); flushL(); out.push('<hr>');
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushP(); flushL(); out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = line.match(/^[-*+]\s+(.*)$/))) {
      flushP();
      if (list !== 'ul') { flushL(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
      flushP();
      if (list !== 'ol') { flushL(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      flushL(); para.push(line);
    }
  }
  flushP(); flushL();
  return out.join('\n');
};
