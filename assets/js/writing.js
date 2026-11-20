/* Tag filter for the writing list. The list itself is rendered at build time,
 * so this is a progressive enhancement only. */
(function () {
  'use strict';
  var bar = document.querySelector('[data-tag-filter]');
  if (!bar) return;
  var posts = Array.prototype.slice.call(document.querySelectorAll('[data-post]'));
  var tags = {};
  posts.forEach(function (p) { (p.getAttribute('data-tags') || '').split('|').forEach(function (t) { if (t) tags[t] = 1; }); });
  var names = Object.keys(tags).sort();
  if (names.length < 2) return;
  function mk(label, value) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', value === '' ? 'true' : 'false');
    b.addEventListener('click', function () {
      bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      posts.forEach(function (p) {
        var has = value === '' || (p.getAttribute('data-tags') || '').split('|').indexOf(value) > -1;
        p.hidden = !has;
      });
    });
    bar.appendChild(b);
  }
  mk('All', '');
  names.forEach(function (n) { mk(n, n); });
  bar.hidden = false;
})();
