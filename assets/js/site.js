/* Site behaviour. Vanilla JS, no dependencies. Everything degrades without it. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var P = (window.Portfolio = window.Portfolio || {});

  /* ---- reveal on scroll ---- */
  var io = null;
  if ('IntersectionObserver' in window && !reduce) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  }
  function reveal(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.in)');
    els.forEach(function (el) { if (io) io.observe(el); else el.classList.add('in'); });
  }

  /* ---- "to update" chips: tooltip + draft counter ---- */
  var tip = null;
  function showTip(el) {
    hideTip();
    tip = document.createElement('div');
    tip.className = 'tip';
    tip.setAttribute('role', 'tooltip');
    var b = document.createElement('b'); b.textContent = 'To update';
    tip.appendChild(b);
    tip.appendChild(document.createTextNode(el.getAttribute('data-todo') || ''));
    document.body.appendChild(tip);
    var r = el.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.top - h - 8; if (top < 8) top = r.bottom + 8;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { if (tip && tip.parentNode) tip.parentNode.removeChild(tip); tip = null; }
  document.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('.todo'); if (t) showTip(t); });
  document.addEventListener('mouseout', function (e) { if (e.target.closest && e.target.closest('.todo')) hideTip(); });
  document.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('.todo'); if (t) showTip(t); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });

  function countTodos() {
    var c = document.getElementById('draft-counter');
    if (!c) return;
    var n = document.querySelectorAll('.todo').length;
    c.textContent = n + (n === 1 ? ' item' : ' items') + ' to update';
  }
  P.countTodos = countTodos;

  /* ---- long form: TOC, scroll spy, progress ---- */
  P.initLong = function (root) {
    var sections = Array.prototype.slice.call(root.querySelectorAll('[data-toc]'));
    var list = document.querySelector('[data-toc-list]');
    var sel = document.querySelector('[data-toc-select]');
    var links = [];
    if (list) {
      list.innerHTML = '';
      sections.forEach(function (s) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + s.id; a.textContent = s.getAttribute('data-toc');
        li.appendChild(a); list.appendChild(li); links.push(a);
      });
    }
    if (sel) {
      sel.innerHTML = '';
      sections.forEach(function (s) {
        var o = document.createElement('option');
        o.value = s.id; o.textContent = s.getAttribute('data-toc'); sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        var t = document.getElementById(sel.value);
        if (t) { t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
      });
    }
    var bar = document.querySelector('.progress i');
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.scrollY + 140, cur = 0;
      sections.forEach(function (s, i) { if (s.getBoundingClientRect().top + window.scrollY <= y) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('active', i === cur); if (i === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      if (sel && sections[cur]) sel.value = sections[cur].id;
      if (bar) {
        var rect = root.getBoundingClientRect();
        var total = root.offsetHeight - window.innerHeight * 0.6;
        var done = Math.min(Math.max(-rect.top + 80, 0), Math.max(total, 1));
        bar.style.width = (done / Math.max(total, 1) * 100).toFixed(1) + '%';
      }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    reveal(root);
    countTodos();
  };

  document.addEventListener('DOMContentLoaded', function () { reveal(document); countTodos(); });
})();
