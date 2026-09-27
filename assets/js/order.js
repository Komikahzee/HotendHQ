/* ============================================================
   HOTEND HQ — Print My Order form (order.html)
   Sends the order and its files to Formspree (HHQ_CONFIG.orders.formspree).
   With no endpoint set, it opens the customer's email app instead.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);
  const CFG = window.HHQ_CONFIG || {};
  const endpoint = ((CFG.orders || {}).formspree || '').trim();
  const inbox = (CFG.social || {}).email || '';
  const MAX_FILES = 10, MAX_EACH = 25 * 1024 * 1024, MAX_TOTAL = 95 * 1024 * 1024;
  const form = $('#order-form'), errEl = $('#o-errors'), sendBtn = $('#o-send'), sending = $('#o-sending');
  if (!form) return;
  document.querySelectorAll('[data-ico]').forEach(e => { e.innerHTML = window.icon ? icon(e.dataset.ico) : ''; });

  /* ---------- files: kept in our own lists so people can add in several goes and remove ---------- */
  const files = { model: [], photo: [] };
  const size = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const total = () => [...files.model, ...files.photo];
  function add(kind, list) {
    const msgs = [];
    for (const f of list) {
      if (total().length >= MAX_FILES) { msgs.push(`Only ${MAX_FILES} files can be sent with one request.`); break; }
      if (f.size > MAX_EACH) { msgs.push(`${f.name} is over 25 MB. Send a link to it instead, or zip it.`); continue; }
      if (total().reduce((a, x) => a + x.size, 0) + f.size > MAX_TOTAL) { msgs.push('That is more than 95 MB in total. Send the biggest files as a link.'); break; }
      if (kind === 'photo' && !/^image\//.test(f.type)) { msgs.push(`${f.name} is not an image. Add model files on the left.`); continue; }
      if (total().some(x => x.name === f.name && x.size === f.size)) continue;
      files[kind].push(f);
    }
    draw();
    if (msgs.length) window.HHQ?.toast(msgs[0], 'warn');
  }
  function draw() {
    $('#list-model').innerHTML = files.model.map((f, i) => `<li><span>${HHQ.esc(f.name)}</span><small>${size(f.size)}</small><button type="button" class="or-x" data-k="model" data-i="${i}" aria-label="Remove ${HHQ.esc(f.name)}">×</button></li>`).join('');
    const ul = $('#list-photo');
    ul.querySelectorAll('img').forEach(im => URL.revokeObjectURL(im.src));
    ul.innerHTML = files.photo.map((f, i) => `<li><img src="${URL.createObjectURL(f)}" alt="${HHQ.esc(f.name)}"><button type="button" class="or-x" data-k="photo" data-i="${i}" aria-label="Remove ${HHQ.esc(f.name)}">×</button></li>`).join('');
  }
  form.addEventListener('click', (e) => {
    const b = e.target.closest('.or-x'); if (!b) return;
    files[b.dataset.k].splice(+b.dataset.i, 1); draw();
  });
  for (const [kind, input, drop] of [['model', '#o-model', '#drop-model'], ['photo', '#o-photo', '#drop-photo']]) {
    const inp = $(input), dz = $(drop);
    inp.addEventListener('change', () => { add(kind, [...inp.files]); inp.value = ''; });
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('is-over'); add(kind, [...e.dataTransfer.files]); });
  }

  /* ---------- shipping or pickup ---------- */
  const shipInputs = [...form.querySelectorAll('[data-ship]')];
  const delivery = () => form.querySelector('input[name=delivery]:checked').value;
  function syncDelivery() {
    const ship = delivery() === 'Ship it to me';
    $('#o-address').classList.toggle('hidden', !ship);
    $('#o-pickup-note').classList.toggle('hidden', ship);
    shipInputs.forEach(i => { i.required = ship; if (!ship) i.removeAttribute('aria-invalid'); });
  }
  form.querySelectorAll('input[name=delivery]').forEach(r => r.addEventListener('change', syncDelivery));
  syncDelivery();
  const dateEl = $('#o-date'); dateEl.min = new Date().toISOString().slice(0, 10);

  /* ---------- validation ---------- */
  const labelOf = (el) => (form.querySelector(`label[for="${el.id}"]`)?.textContent || el.name).replace('*', '').trim();
  function validate(silent = false) {
    const errs = [];
    form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    for (const el of form.querySelectorAll('input,select,textarea')) {
      if (el.closest('.hidden') || el.type === 'file' || el.classList.contains('or-hp')) continue;
      if (!el.checkValidity()) {
        el.setAttribute('aria-invalid', 'true');
        if (el.id === 'o-agree') errs.push('Tick the box to confirm this is a quote request.');
        else if (el.validity.valueMissing) errs.push(`${labelOf(el)} is required.`);
        else if (el.type === 'email') errs.push('Check your email address.');
        else if (el.type === 'url') errs.push('The model link should be a full web address starting with https://');
        else errs.push(`Check ${labelOf(el).toLowerCase()}.`);
      }
    }
    if (!total().length && !$('#o-link').value.trim() && $('#o-desc').value.trim().length < 20)
      errs.push('Add a model file, a link or photos, or describe the part in a bit more detail so we can quote it.');
    errEl.innerHTML = errs.map(e => `<li>${HHQ.esc(e)}</li>`).join('');
    errEl.classList.toggle('hidden', !errs.length);
    if (errs.length && !silent) { const first = form.querySelector('[aria-invalid=true]') || errEl; first.focus?.(); first.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return !errs.length;
  }
  // once the error list is showing, keep it in step with what has been fixed
  const recheck = () => { if (!errEl.classList.contains('hidden')) validate(true); };
  form.addEventListener('input', recheck); form.addEventListener('change', recheck);

  /* ---------- a plain-text copy of the order (email fallback and our own records) ---------- */
  function summary(fd) {
    const g = (k) => (fd.get(k) || '').toString().trim();
    const lines = [
      `Name: ${g('name')}`, `Email: ${g('email')}`, g('phone') && `Phone: ${g('phone')}`, '',
      `Project: ${g('project')}`, g('description'), '',
      g('model_link') && `Model link: ${g('model_link')}`,
      g('design_help') && 'Needs the model designed from photos and measurements.',
      total().length ? `Files: ${total().map(f => f.name).join(', ')}` : '', '',
      `Material: ${g('material')}`, g('colour') && `Colour: ${g('colour')}`, `Quantity: ${g('quantity')}`, g('size') && `Size: ${g('size')}`,
      `Strength: ${g('strength')}`, `Finish: ${g('finish')}`, g('needed_by') && `Needed by: ${g('needed_by')}`, `Budget: ${g('budget')}`, '',
      `Delivery: ${g('delivery')}`,
      delivery() === 'Ship it to me' ? `Address: ${[g('address_street'), g('address_city'), g('address_state'), g('address_zip'), g('address_country')].filter(Boolean).join(', ')}` : '',
      g('notes') && `\nNotes: ${g('notes')}`,
    ];
    return lines.filter(l => l !== false && l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
  }
  function done(title, msg) {
    form.closest('.or-layout').classList.add('hidden');
    $('#o-done-title').textContent = title; $('#o-done-msg').textContent = msg;
    const d = $('#o-done'); d.classList.remove('hidden'); d.focus(); d.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#o-again').addEventListener('click', () => {
    form.reset(); files.model = []; files.photo = []; draw(); syncDelivery();
    $('#o-done').classList.add('hidden'); form.closest('.or-layout').classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth' });
  });

  /* ---------- send ---------- */
  const busy = (on) => { sendBtn.disabled = on; sending.hidden = !on; };
  async function post(fd) {
    const r = await fetch(endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
    let body = {}; try { body = await r.json(); } catch {}
    return { ok: r.ok, body };
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const fd = new FormData(form);
    fd.delete('_gotcha'); if (form.querySelector('.or-hp').value) return;       // bots fill the hidden field
    fd.set('_subject', `Print order: ${fd.get('project')} (${fd.get('name')})`);
    fd.set('_replyto', fd.get('email'));
    fd.set('files_attached', String(total().length));
    if (delivery() !== 'Ship it to me') for (const k of ['address_street', 'address_city', 'address_state', 'address_zip', 'address_country']) fd.delete(k);

    if (!endpoint) {                                    // no form service yet: hand it to the customer's email app
      const body = summary(fd) + (total().length ? '\n\n(Attach your files and photos to this email before sending.)' : '');
      location.href = `mailto:${inbox}?subject=${encodeURIComponent(fd.get('_subject'))}&body=${encodeURIComponent(body)}`;
      done('Your email app should open', total().length
        ? `Your order is written out in a new email to ${inbox}. Attach your files and photos to it, then press send.`
        : `Your order is written out in a new email to ${inbox}. Press send and we'll reply with your free quote.`);
      return;
    }
    busy(true);
    try {
      const withFiles = new FormData(); for (const [k, v] of fd) withFiles.append(k, v);
      files.model.forEach(f => withFiles.append('model_file', f, f.name));
      files.photo.forEach(f => withFiles.append('photo', f, f.name));
      let res = await post(withFiles);
      if (!res.ok && total().length) {
        // the form service may not take attachments (Formspree's free plan): send the order without them
        fd.set('files_note', `The customer tried to attach: ${total().map(f => f.name).join(', ')}. Ask them to reply with the files.`);
        res = await post(fd);
        if (res.ok) return done('Order request sent', `Thanks! Your details arrived, but the files could not be attached. Reply to our email with your files and photos and we'll send your free quote.`);
      }
      if (!res.ok) throw new Error((res.body.errors || []).map(x => x.message).join(' ') || 'The order could not be sent.');
      done('Order request sent', `Thanks, ${fd.get('name')}! We'll look over your request and email your free quote to ${fd.get('email')}.`);
    } catch (err) {
      errEl.innerHTML = `<li>${HHQ.esc(err.message)} Please try again${inbox ? `, or email us at <a href="mailto:${HHQ.esc(inbox)}">${HHQ.esc(inbox)}</a>` : ''}.</li>`;
      errEl.classList.remove('hidden');
    } finally { busy(false); }
  });
});
