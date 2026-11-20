/* "Request password": the CTA is a mailto link with the subject filled in. When the page has the
 * request modal (a form service is configured), the CTA opens the modal instead, and the visitor
 * only types their email. Without JavaScript the mailto link still works. */
(() => {
  const dialog = document.getElementById('request-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const form = dialog.querySelector('[data-request-form]');
  const input = form.querySelector('input[type="email"]');
  const msg = form.querySelector('[data-request-msg]');
  const fields = form.querySelector('[data-request-fields]');
  const actions = form.querySelector('[data-request-actions]');
  const done = form.querySelector('[data-request-done]');
  const send = actions.querySelector('button[type="submit"]');
  const studyText = form.querySelector('[data-request-study]');
  const studyField = form.querySelector('[data-request-study-field]');
  const subject = form.querySelector('[data-request-subject]');
  let opener = null;

  const say = (text, ok) => { msg.textContent = text; msg.classList.toggle('ok', !!ok); };
  const reset = () => {
    form.reset(); say('');
    fields.hidden = false; actions.hidden = false; done.hidden = true;
    send.disabled = false; send.textContent = 'Send request';
    input.removeAttribute('aria-invalid');
  };

  document.querySelectorAll('[data-request-open]').forEach((a) => {
    a.setAttribute('role', 'button');
    a.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); a.click(); } });
    a.addEventListener('click', (e) => {
      e.preventDefault();
      opener = a;
      reset();
      const study = a.getAttribute('data-study') || 'the full case studies';
      studyText.textContent = study;
      studyField.value = study;
      subject.value = 'Password request: ' + study;
      dialog.showModal();
      document.documentElement.classList.add('modal-open');
      input.focus();
    });
  });

  const close = () => dialog.open && dialog.close();
  form.querySelectorAll('[data-request-close]').forEach((b) => b.addEventListener('click', close));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); }); // click on the backdrop
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('modal-open');
    if (opener) opener.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!email || !input.checkValidity()) {
      input.setAttribute('aria-invalid', 'true');
      say('Please enter a valid email address.');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    send.disabled = true; send.textContent = 'Sending…'; say('');
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      fields.hidden = true; actions.hidden = true; done.hidden = false;
      say(`Thanks. I'll send the password to ${email}.`, true);
      done.querySelector('button').focus();
    } catch {
      send.disabled = false; send.textContent = 'Send request';
      say('That didn’t go through. Please try again in a minute.');
    }
  });
})();
