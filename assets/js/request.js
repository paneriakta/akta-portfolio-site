/* "Request the password" form: sends the visitor's email to the form service
 * without leaving the page. Without JavaScript the form still posts normally. */
(() => {
  const forms = document.querySelectorAll('[data-request-form]');
  forms.forEach((form) => {
    const msg = form.querySelector('[data-request-msg]');
    const input = form.querySelector('input[type="email"]');
    const btn = form.querySelector('button[type="submit"]');
    const say = (text, ok) => { msg.textContent = text; msg.classList.toggle('ok', !!ok); msg.classList.toggle('err', !ok); };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!email || !input.checkValidity()) { say('Please enter a valid email address.'); input.focus(); return; }
      btn.disabled = true; btn.textContent = 'Sending…'; say('', true);
      try {
        const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.querySelector('.request-row').hidden = true;
        say(`Thanks. I'll send the password to ${email}.`, true);
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Request password';
        say('That didn’t go through. Please try again in a minute, or use the contact link in the navigation.');
      }
    });
  });
})();
