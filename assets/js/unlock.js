/* Client-side unlock for the long-form case studies.
 * Payload format (see tools/build.mjs): { v:1, salt, iv, iter, ct } with base64 values.
 * Key: PBKDF2-SHA256 -> AES-256-GCM. A wrong password fails the GCM tag check. */
(function () {
  'use strict';
  var KEY = 'akta-portfolio-pw';
  var P = (window.Portfolio = window.Portfolio || {});

  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function getPw() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setPw(v) { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) {} }

  function decrypt(payload, password) {
    if (!window.crypto || !crypto.subtle) return Promise.reject(new Error('insecure'));
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: b64(payload.salt), iterations: payload.iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      })
      .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(payload.iv) }, key, b64(payload.ct)); })
      .then(function (buf) { return new TextDecoder().decode(buf); });
  }

  function msg(form, text, ok) {
    var m = form.querySelector('[data-msg]');
    if (!m) return;
    m.textContent = text || '';
    m.classList.toggle('ok', !!ok);
  }

  function wireToggle(form) {
    var input = form.querySelector('input[type="password"],input[data-pw]');
    var btn = form.querySelector('[data-toggle]');
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      input.focus();
    });
  }

  /* ---------- long-form page ---------- */
  var payloadEl = document.getElementById('payload');
  if (payloadEl) {
    var payload = JSON.parse(payloadEl.textContent);
    var lockWrap = document.getElementById('lock-wrap');
    var layout = document.getElementById('cs-layout');
    var body = document.getElementById('cs-body');
    var progress = document.querySelector('.progress');
    var form = document.querySelector('[data-unlock-form]');
    var input = form.querySelector('input[data-pw]');
    wireToggle(form);

    var render = function (html) {
      body.innerHTML = html;
      lockWrap.hidden = true; layout.hidden = false;
      if (progress) progress.hidden = false;
      document.documentElement.setAttribute('data-unlocked', '');
      P.initLong(body);
      body.setAttribute('tabindex', '-1');
      var h = document.querySelector('.cs-head h1'); if (h) h.scrollIntoView({ block: 'start' });
    };
    var lock = function () {
      setPw('');
      body.innerHTML = '';
      layout.hidden = true; lockWrap.hidden = false;
      if (progress) progress.hidden = true;
      document.documentElement.removeAttribute('data-unlocked');
      input.value = ''; msg(form, '');
      window.scrollTo(0, 0);
      input.focus();
    };
    document.addEventListener('click', function (e) { if (e.target.closest('[data-lock]')) lock(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = input.value;
      if (!pw) { msg(form, 'Enter the password.'); input.focus(); return; }
      msg(form, 'Checking…', true);
      form.querySelector('[type="submit"]').disabled = true;
      decrypt(payload, pw).then(function (html) {
        setPw(pw); msg(form, ''); render(html);
      }).catch(function (err) {
        if (err && err.message === 'insecure') msg(form, 'Unlocking needs https or http://localhost. It does not work from a file:// address.');
        else msg(form, "That password didn't work.");
        input.focus(); input.select();
      }).then(function () { form.querySelector('[type="submit"]').disabled = false; });
    });

    var saved = getPw();
    if (saved) decrypt(payload, saved).then(render).catch(function () { setPw(''); });
  }

  /* ---------- work index: one field unlocks all four for the session ---------- */
  var idxForm = document.querySelector('[data-unlock-index]');
  if (idxForm) {
    var iin = idxForm.querySelector('input[data-pw]');
    var verifyUrl = idxForm.getAttribute('data-verify');
    wireToggle(idxForm);
    var setState = function (on) {
      document.querySelectorAll('[data-lock-state]').forEach(function (el) {
        el.textContent = on ? 'Unlocked' : 'Locked';
      });
      var lk = document.querySelector('[data-index-lock]');
      if (lk) lk.hidden = !on;
      idxForm.hidden = on;
      var done = document.querySelector('[data-index-done]'); if (done) done.hidden = !on;
    };
    var fetchPayload = function () {
      return fetch(verifyUrl, { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (t) {
        var m = t.match(/<script type="application\/json" id="payload">([\s\S]*?)<\/script>/);
        if (!m) throw new Error('nopayload');
        return JSON.parse(m[1]);
      });
    };
    idxForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = iin.value;
      if (!pw) { msg(idxForm, 'Enter the password.'); iin.focus(); return; }
      msg(idxForm, 'Checking…', true);
      fetchPayload().then(function (pl) { return decrypt(pl, pw); }).then(function () {
        setPw(pw); msg(idxForm, ''); setState(true);
      }).catch(function (err) {
        if (err && err.message === 'insecure') msg(idxForm, 'Unlocking needs https or http://localhost.');
        else if (err && err.message === 'nopayload') msg(idxForm, 'Could not check the password here. Open a long form directly.');
        else msg(idxForm, "That password didn't work.");
        iin.focus(); iin.select();
      });
    });
    document.addEventListener('click', function (e) { if (e.target.closest('[data-index-lock]')) { setPw(''); iin.value = ''; setState(false); } });
    if (getPw()) {
      fetchPayload().then(function (pl) { return decrypt(pl, getPw()); }).then(function () { setState(true); }).catch(function () { setPw(''); });
    }
  }
})();
