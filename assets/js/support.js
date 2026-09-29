/* ============================================================
   HOTEND HQ — Support (/support)
   The form has no backend: it opens the visitor's email app with
   the message addressed to HHQ_CONFIG.social.email, ready to send.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const email = ((window.HHQ_CONFIG || {}).social || {}).email || 'hotendhq@gmail.com';
  const $ = (id) => document.getElementById(id);

  // keep every address on the page in step with config.js
  document.querySelectorAll('[data-support-mail]').forEach(a => {
    a.href = 'mailto:' + email;
    if (!a.hasAttribute('data-keep-text')) a.textContent = email;
  });
  document.querySelectorAll('.ico[data-ico]').forEach(s => { if (!s.innerHTML && window.icon) s.innerHTML = icon(s.dataset.ico); });

  const copy = $('ct-copy');
  copy.addEventListener('click', async () => {
    const label = copy.querySelector('span:last-child');
    try { await navigator.clipboard.writeText(email); label.textContent = 'Copied'; }
    catch { window.prompt('Copy the support address:', email); }
    setTimeout(() => { label.textContent = 'Copy address'; }, 2200);
  });

  const form = $('support-form'), topic = $('c-topic'), msg = $('c-msg'), hint = $('c-msg-hint');
  const pre = new URLSearchParams(location.search).get('topic');
  if (pre === 'help' || pre === 'suggestion') topic.value = pre;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = msg.value.trim();
    if (!text) { hint.hidden = false; msg.focus(); return; }
    hint.hidden = true;
    const name = $('c-name').value.trim();
    const subject = topic.value === 'suggestion' ? 'Suggestion for Hotend HQ' : 'Help with Hotend HQ';
    const body = text + (name ? '\n\n' + name : '');
    location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    $('c-fallback').hidden = false;
  });
});
