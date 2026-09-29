/* ============================================================
   HOTEND HQ — Contact & Support (/contact)
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

  // copy address
  const copy = $('ct-copy');
  copy.addEventListener('click', async () => {
    const label = copy.querySelector('span:last-child');
    try { await navigator.clipboard.writeText(email); label.textContent = 'Copied'; }
    catch { window.prompt('Copy the support address:', email); }
    setTimeout(() => { label.textContent = 'Copy address'; }, 2200);
  });

  const form = $('contact-form'), topic = $('c-topic'), msg = $('c-msg'), hint = $('c-msg-hint');
  const LABELS = {
    question: 'Question', generator: 'Generator help', order: 'Print order', correction: 'Correction',
    account: 'Account', idea: 'Idea', business: 'Business', other: 'Message'
  };

  // "A generator isn't working" / "Something here is wrong" cards preselect the topic
  document.querySelectorAll('[data-topic]').forEach(a => a.addEventListener('click', () => {
    topic.value = a.dataset.topic;
    setTimeout(() => msg.focus({ preventScroll: true }), 350);
  }));
  const pre = new URLSearchParams(location.search).get('topic');
  if (pre && LABELS[pre]) topic.value = pre;

  // keep an unsent draft if they wander off and come back
  const KEY = 'hhq-contact-draft';
  try { const d = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (d) { $('c-name').value = d.name || ''; $('c-page').value = d.page || ''; msg.value = d.msg || ''; if (d.topic && !pre) topic.value = d.topic; } } catch {}
  form.addEventListener('input', () => {
    try { sessionStorage.setItem(KEY, JSON.stringify({ name: $('c-name').value, page: $('c-page').value, msg: msg.value, topic: topic.value })); } catch {}
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = msg.value.trim();
    if (!text) { hint.hidden = false; msg.focus(); return; }
    hint.hidden = true;

    const name = $('c-name').value.trim(), page = $('c-page').value.trim();
    const subject = `[${LABELS[topic.value] || 'Message'}] ` + (page ? page.slice(0, 80) : 'Hotend HQ support');
    const lines = [text, '', '---'];
    if (name) lines.push('Name: ' + name);
    lines.push('Topic: ' + topic.options[topic.selectedIndex].text);
    if (page) lines.push('Page: ' + page);
    if ($('c-device').checked) {
      lines.push('Browser: ' + navigator.userAgent);
      lines.push('Screen: ' + screen.width + 'x' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x');
    }
    location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
    $('c-fallback').hidden = false;
  });
});
