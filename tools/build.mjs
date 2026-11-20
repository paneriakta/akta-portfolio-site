#!/usr/bin/env node
/* Static site builder. Node 18+, standard library only.
 *
 *   node tools/build.mjs                full build (needs private/ and a password)
 *   node tools/build.mjs --public-only  rebuild public pages only; encrypted long forms untouched
 *
 * Password: env PORTFOLIO_PASSWORD, else private/.password (one line).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.join(ROOT, ...p);
const PUBLIC_ONLY = process.argv.includes('--public-only');
const ITER = 600000;
const PLACEHOLDER_PW = 'change-me-before-publishing';
const TODO_FILE = 'private/TODO.md'; // kept out of the public repo: it lists hints about locked content

/* Only http(s) links may come out of feed data. */
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '#');

/* Content-Security-Policy, delivered as a meta tag (GitHub Pages cannot set headers).
 * The one inline script in the head is allowed by hash; everything else must be same-origin. */
/* Password-request form service (e.g. Formspree). Only an https URL is accepted. */
function requestEndpoint() {
  const u = String(site.passwordRequestForm || '').trim();
  if (!u) return '';
  try { const x = new URL(u); if (x.protocol === 'https:') return x.href; } catch { /* fall through */ }
  console.warn('WARN passwordRequestForm in data/site.json must be an https URL. Ignored: ' + u);
  return '';
}

function cspMeta() {
  const ep = requestEndpoint();
  const formOrigin = ep ? ' ' + new URL(ep).origin : '';
  const head = read(path.join(ROOT, 'src/partials/head.html'));
  const hashes = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
  const csp = [
    "default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(), "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self'", `connect-src 'self'${formOrigin}`, "object-src 'none'", "base-uri 'self'", `form-action 'self'${formOrigin}`,
  ].join('; ');
  return `<meta http-equiv="Content-Security-Policy" content="${csp}">\n<meta name="referrer" content="strict-origin-when-cross-origin">\n`;
}

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const exists = (p) => fs.existsSync(p);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const noDash = (s) => String(s).replace(/--/g, '- -');

const site = JSON.parse(read(R('data/site.json')));
const studies = JSON.parse(read(R('data/studies.json')));
const email = site.email || site.emailPlaceholder;
const linkedin = site.linkedin || site.linkedinPlaceholder;
const mediumUrl = site.mediumUrl || (site.medium ? `https://medium.com/@${site.medium}` : 'https://medium.com/');
const year = new Date().getFullYear();

const ICON_LOCK = '<svg class="icon-lock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
const ICON_IMG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const ICON_INFO = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2V11M8 5v.1"/></svg>';

/* ---------- collected report data ---------- */
const report = { fills: {}, gaps: [], flags: [], images: [], warnings: [], figTodos: [] };

/* ---------- tokens: [FILL], [GAP], [FLAG] ---------- */
function chip(hint) {
  const h = esc(hint);
  return `<span class="todo" data-todo="${h}" tabindex="0" role="note" aria-label="To update: ${h}">to update</span>`;
}
/* Public text: [GAP: x] and [FLAG: x] */
function publicTokens(html, where) {
  return html.replace(/\[(GAP|FLAG):\s*([^\]]*)\]/g, (m, kind, hint) => {
    (kind === 'GAP' ? report.gaps : report.flags).push({ where, hint: hint.trim() });
    return `<!-- TODO-DATA: ${noDash(where)} / ${noDash(hint.trim())} -->${chip(hint.trim())}`;
  });
}
/* Long form: [FILL] / [FILL: x], tracked per study and section */
function longTokens(html, slug) {
  let section = 'Header';
  const re = /<section\b[^>]*data-toc="([^"]*)"[^>]*>|\[FILL(?::\s*([^\]]*))?\]|\[FLAG:\s*([^\]]*)\]|\[FIG:\s*([^\]|]*)\|\s*([^\]]*)\]|data-fig-todo="([^"]*)"/g;
  return html.replace(re, (m, toc, fill, flag, figLabel, figHint, figAttr) => {
    if (toc !== undefined) { section = toc; return m; }
    if (figAttr !== undefined) { report.figTodos.push({ slug, section, hint: figAttr }); return m; }
    if (figLabel !== undefined) {
      report.figTodos.push({ slug, section, hint: `${figLabel.trim()}: ${figHint.trim()}` });
      const h = esc(figHint.trim());
      return `<!-- TODO-DATA: ${slug} / ${noDash(section)} / figure value ${noDash(figLabel.trim())} -->` + `<span class="todo" data-todo="${h}" tabindex="0" role="note" aria-label="To update: ${h}">${esc(figLabel.trim())}</span>`;
    }
    if (flag !== undefined) {
      report.flags.push({ where: `${slug} / ${section}`, hint: flag.trim() });
      return `<!-- TODO-DATA: ${slug} / ${noDash(section)} / ${noDash(flag.trim())} -->${chip(flag.trim())}`;
    }
    const hint = (fill || '').trim();
    (report.fills[slug] ||= []).push({ section, hint });
    const label = hint ? `FILL: ${hint}` : 'FILL';
    return `<!-- TODO-DATA: ${slug} / ${noDash(section)} / ${noDash(label)} -->${chip(label)}`;
  });
}

/* ---------- template engine ---------- */
function partial(name) { return read(R('src/partials', name + '.html')); }
function figureSrc(name) {
  for (const p of [R('private/figures', name + '.html'), R('src/figures', name + '.html')]) if (exists(p)) return read(p);
  throw new Error('Missing figure: ' + name);
}
function render(tpl, vars, depth = 0) {
  if (depth > 6) throw new Error('Include depth exceeded');
  let out = tpl.replace(/\{\{include ([\w-]+)\}\}/g, (_, n) => partial(n));
  out = out.replace(/\{\{figure ([\w-]+)\}\}/g, (_, n) => figureSrc(n));
  if (/\{\{(include|figure) /.test(out)) out = render(out, vars, depth + 1);
  return out.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function baseVars(relDir, extra = {}) {
  const depth = relDir ? relDir.split('/').filter(Boolean).length : 0;
  const base = extra.rootAbs ? (site.basePath || '') + '/' : '../'.repeat(depth);
  const home = base || './';
  return {
    base, home, email, linkedin, medium: mediumUrl, mediumUrl, year, resume: site.resume,
    email_todo: site.email ? '' : ' data-placeholder="email"',
    linkedin_todo: site.linkedin ? '' : ' data-placeholder="linkedin"',
    medium_todo: '', lock: ICON_LOCK, arrow: ICON_ARROW, info: ICON_INFO,
    ...extra.vars,
  };
}

/* "Request password" CTA. It is a mailto link with the subject filled in, so it works with no JavaScript
 * and no form service. When a form service is set, request.js turns it into a button that opens a modal
 * where the visitor only types their email. */
function requestHtml(study, small = false) {
  const subject = 'Password request: ' + study;
  const href = site.email ? `mailto:${site.email}?subject=${encodeURIComponent(subject)}` : 'mailto:';
  const open = requestEndpoint() ? ` data-request-open data-study="${esc(study)}" aria-haspopup="dialog"` : '';
  return `<a class="btn btn-ghost${small ? ' btn-sm' : ''}" href="${esc(href)}"${open}${site.email ? '' : ' data-placeholder="email"'}>Request password</a>`;
}

/* One modal per page, added only when the page has a request CTA and a form service is set. */
function requestDialog() {
  const ep = requestEndpoint();
  if (!ep) return '';
  return `
<dialog class="modal" id="request-dialog" aria-labelledby="rq-title" aria-describedby="rq-desc">
  <form class="modal-form" action="${esc(ep)}" method="POST" data-request-form novalidate>
    <div class="modal-head">
      <h2 id="rq-title">Request the password</h2>
      <button class="modal-x" type="button" data-request-close aria-label="Close">${ICON_CLOSE}</button>
    </div>
    <p class="modal-desc" id="rq-desc">Enter your email and I'll send you the password for <strong data-request-study>the full case studies</strong>.</p>
    <div data-request-fields>
      <label class="modal-label" for="rq-email">Your email</label>
      <div class="field"><input id="rq-email" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@company.com" aria-describedby="rq-msg" autofocus></div>
      <input type="hidden" name="_subject" value="Password request" data-request-subject>
      <input type="hidden" name="study" value="" data-request-study-field>
      <div class="hp" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden"><label>Leave this empty <input type="text" name="_gotcha" tabindex="-1" autocomplete="off"></label></div>
    </div>
    <p class="form-msg" id="rq-msg" role="status" aria-live="polite" data-request-msg></p>
    <div class="btn-row" data-request-actions>
      <button class="btn btn-primary" type="submit">Send request</button>
      <button class="btn btn-ghost" type="button" data-request-close>Cancel</button>
    </div>
    <div class="btn-row" data-request-done hidden><button class="btn btn-primary" type="button" data-request-close>Done</button></div>
    <p class="modal-note">Used only to send you the password.</p>
  </form>
</dialog>`;
}

const curVars = (cur) => ({
  cur_work: cur === 'work' ? ' aria-current="page"' : '',
  cur_writing: cur === 'writing' ? ' aria-current="page"' : '',
  cur_about: cur === 'about' ? ' aria-current="page"' : '',
});

function pageShell({ relDir, title, description, body, cur, robots = '', scripts = [], rootAbs = false, bodyClass = '', pathForUrl }) {
  const vars = baseVars(relDir, { rootAbs });
  const url = (site.siteUrl || '') + (site.basePath || '') + '/' + (pathForUrl ?? relDir ?? '');
  const ogimage = (site.siteUrl || '') + (site.basePath || '') + '/' + site.ogImage;
  const scriptTags = scripts.map((s) => `<script src="${vars.base}assets/js/${s}" defer></script>\n`).join('');
  const v = {
    ...vars, ...curVars(cur), title: esc(title), description: esc(description), canonical: esc(url), ogimage: esc(ogimage),
    robots: robots ? `<meta name="robots" content="${robots}">\n` : '', scripts: scriptTags, csp: cspMeta(),
  };
  if (body.includes('data-request-open')) body += requestDialog();
  const html = render(partial('head') + partial('nav') + `<main id="main"${bodyClass ? ` class="${bodyClass}"` : ''}>\n` + body + '\n</main>\n' + partial('footer'), v);
  return html;
}

/* ---------- pieces built from data ---------- */
const studyUrl = (s, base) => `${base}work/${s.slug}/`;
const fullUrl = (s, base) => `${base}work/${s.slug}/full/`;
const hasGap = (t) => /\[GAP/.test(t);

function cardsHtml(base) {
  return studies.map((s) => `
<article class="card reveal">
  <div class="card-thumb">{{figure thumb-${s.slug}}}</div>
  <div class="card-body">
    <p class="card-meta">${s.n} &middot; ${esc(s.roleShort)}${hasGap(s.timeline) ? '' : ' &middot; ' + esc(s.timeline)}</p>
    <h3><a href="${studyUrl(s, base)}">${esc(s.title)}</a></h3>
    <p>${esc(s.summary)}</p>
    <div class="chips">${s.chips.slice(0, 3).map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    <div class="card-actions">
      <a href="${studyUrl(s, base)}">Read summary ${ICON_ARROW.replace('<svg', '<svg width="13" height="13"')}</a>
      <a class="locked" href="${fullUrl(s, base)}">${ICON_LOCK} Full case study</a>
    </div>
  </div>
</article>`).join('\n');
}

function rowsHtml(base, where) {
  return studies.map((s) => `
<article class="row reveal">
  <div class="n">${s.n}</div>
  <div>
    <h3><a href="${studyUrl(s, base)}">${esc(s.title)}</a></h3>
    <p>${esc(s.summary)}</p>
  </div>
  <dl>
    <div><dt>Role</dt><dd>${esc(s.roleShort)}</dd></div>
    <div><dt>Timeline</dt><dd>${publicTokens(esc(s.timeline), where + ' / ' + s.slug + ' timeline')}</dd></div>
    <div><dt>Key result</dt><dd>${esc(s.key)}</dd></div>
  </dl>
  <div class="acts">
    <a class="btn btn-ghost btn-sm" href="${studyUrl(s, base)}">Short form ${ICON_ARROW}</a>
    <a class="btn btn-ghost btn-sm" href="${fullUrl(s, base)}"><span style="display:inline-flex;gap:8px;align-items:center">${ICON_LOCK}<span>Long form</span></span><span class="mono muted" data-lock-state style="font-size:.6875rem">Locked</span></a>
  </div>
</article>`).join('\n');
}

function metaHtml(s, where) {
  const rows = s.meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${publicTokens(esc(v), where + ' / meta ' + k)}</dd></div>`).join('');
  return `<dl class="meta">${rows}</dl>`;
}

function prevNext(s, base) {
  const i = studies.findIndex((x) => x.slug === s.slug);
  const prev = studies[i - 1], next = studies[i + 1];
  const a = (t, cls, label) => t
    ? `<a class="${cls}" href="${studyUrl(t, base)}"><p class="eyebrow">${label}</p><strong>${esc(t.title)}</strong></a>`
    : `<span class="empty"></span>`;
  return `<nav class="prevnext" aria-label="Other case studies">${a(prev, 'prev', 'Previous study')}${a(next, 'next', 'Next study')}</nav>`;
}

function tilesHome(base) {
  const t = [
  ['+40%',  'Weekly active usage after the platform rebuild',       'Platform rebuild', 'scrut-automation'],
  ['5',     'AI features in daily workflows, one review pattern',   'AI at Scrut',      'ai-at-scrut'],
  ['#1',    'Most used feature: the Task Center I specced',         'Task Center',      'notification-task-center'],
  ['$500K', 'New revenue in one quarter from the Workflow Builder', 'Spendflo',         'spendflo'],
];
  return t.map(([v, l, src, slug]) => `<a class="tile" href="${base}work/${slug}/"><span class="v">${v}</span><span class="l">${l}</span><span class="s">${src} &rarr;</span></a>`).join('');
}

function loadPosts() {
  let a = []; let b = [];
  try { a = JSON.parse(read(R('data/posts.json'))); } catch { /* none */ }
  try { b = JSON.parse(read(R('data/posts-manual.json'))); } catch { /* none */ }
  const seen = new Set(); const out = [];
  for (const p of [...a, ...b]) {
    if (!p.sample) { if (seen.has(p.url)) continue; seen.add(p.url); }
    out.push(p);
  }
  const real = out.filter((p) => !p.sample);
  const list = real.length ? real : out; // real posts replace the samples
  return list.sort((x, y) => String(y.date).localeCompare(String(x.date)));
}
function fmtDate(d) {
  const dt = new Date(d); if (isNaN(dt)) return esc(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function postHtml(p) {
  const tags = (p.tags || []).filter(Boolean);
  return `<a class="post reveal" href="${esc(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer" data-post data-tags="${esc(tags.join('|'))}">
  <time datetime="${esc(p.date)}">${fmtDate(p.date)}</time>
  <div><h3>${esc(p.title)}</h3><p>${esc(p.excerpt || '')}</p>
  <div class="tags">${p.sample ? '<span class="tag sample">sample</span>' : ''}${tags.filter((t) => t !== 'sample').map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${p.readingTime ? `<span class="tag">${esc(p.readingTime)}</span>` : ''}</div></div>
  <span class="arrow" aria-hidden="true">&nearr;</span>
</a>`;
}

/* ---------- page front matter ---------- */
function parsePage(src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error('page missing <!--meta-->');
  return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
}

const outputs = []; // public pages for sitemap

function buildPublicPage(srcFile, outRel, extra = {}) {
  const { meta, body } = parsePage(read(srcFile));
  const relDir = path.dirname(outRel) === '.' ? '' : path.dirname(outRel);
  const rootAbs = !!meta.rootAbs;
  const base = baseVars(relDir, { rootAbs }).base;
  const posts = loadPosts();
  const vars = {
    request: requestHtml('all case studies', true), cards: cardsHtml(base), rows: body.includes('{{rows}}') ? rowsHtml(base, outRel) : '', tiles_home: tilesHome(base),
    posts_home: posts.slice(0, 3).map(postHtml).join('\n'), posts_list: posts.map(postHtml).join('\n'),
    verify: fullUrl(studies[0], base), ...extra,
  };
  let bodyHtml = render(render(body, { ...baseVars(relDir, { rootAbs }), ...vars }), baseVars(relDir, { rootAbs }));
  bodyHtml = publicTokens(bodyHtml, outRel);
  const html = pageShell({ relDir, title: meta.title, description: meta.description, body: bodyHtml, cur: meta.nav, robots: meta.robots || '', scripts: meta.scripts || [], rootAbs, pathForUrl: outRel === 'index.html' ? '' : outRel.replace(/index\.html$/, '') });
  write(R(outRel), html);
  if (!meta.robots) outputs.push(outRel.replace(/index\.html$/, ''));
}

function buildShort(s) {
  const rel = `work/${s.slug}/index.html`;
  const relDir = `work/${s.slug}`;
  const base = baseVars(relDir).base;
  const src = read(R('src/short', s.slug + '.html'));
  const { meta, body } = parsePage(src);
  const vars = { ...baseVars(relDir), meta: metaHtml(s, rel), prevnext: prevNext(s, base), full: 'full/', request: requestHtml(s.short) };
  let b = render(body, vars);
  b = publicTokens(b, rel);
  const html = pageShell({ relDir, title: meta.title, description: meta.description, body: b, cur: 'work', bodyClass: 'short', scripts: ['request.js'], pathForUrl: `work/${s.slug}/` });
  write(R(rel), html);
  outputs.push(`work/${s.slug}/`);
}

/* ---------- long forms: placeholders, images, encryption ---------- */
const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
function findImg(slug, fig) {
  for (const e of IMG_EXT) { const p = R('private/img', slug, `fig-${fig}.${e}`); if (exists(p)) return { p, e }; }
  return null;
}
function expandPlaceholders(html, slug) {
  return html.replace(/<ph\s+([^>]*)>([\s\S]*?)<\/ph>/g, (m, attrs, inner) => {
    const a = {}; attrs.replace(/(\w+)="([^"]*)"/g, (_, k, v) => (a[k] = v));
    const bare = /\bbare\b/.test(attrs.replace(/"[^"]*"/g, ''));
    const fig = a.fig, title = a.title;
    const bullets = [...inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
    const why = (inner.match(/<why>([\s\S]*?)<\/why>/) || [])[1] || '';
    const file = `private/img/${slug}/fig-${fig}.png`;
    const size = a.size || '1600 px wide, 16:10';
    const ratio = (a.ratio || '16/10').replace(':', '/');
    const img = findImg(slug, fig);
    report.images.push({ slug, fig, title, file, found: !!img });
    let inner2;
    if (img) {
      const data = fs.readFileSync(img.p).toString('base64');
      inner2 = `<img class="fig-img" src="data:${MIME[img.e]};base64,${data}" alt="${esc(a.alt || title)}" width="1600" height="1000" loading="lazy">`;
    } else {
      inner2 = `<div class="ph" style="aspect-ratio:auto"><div class="ph-inner"><div class="ph-icon">${ICON_IMG}</div><div>
<p class="ph-fig">Image to supply &middot; Figure ${fig}</p><h4>${title}</h4>
<p class="ph-h">What to show</p><ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
${why ? `<p class="ph-h">Why it matters</p><p>${why}</p>` : ''}
<p class="ph-file"><span>Recommended size ${esc(size)}. Save as</span> ${file}</p>
</div></div></div>`;
    }
    if (bare) return inner2;
    return `<figure class="fig" id="fig-${fig}">${img ? '' : ''}<div class="fig-frame-plain">${inner2}</div><figcaption><b>Figure ${fig}</b><span>${a.caption || title}</span></figcaption></figure>`;
  });
}

function deriveAndEncrypt(plain, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]); // tag appended: WebCrypto layout
  return { v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), iter: ITER, ct: ct.toString('base64') };
}

function getPassword() {
  if (process.env.PORTFOLIO_PASSWORD) return process.env.PORTFOLIO_PASSWORD;
  const f = R('private/.password');
  if (exists(f)) { const p = read(f).replace(/\r?\n$/, ''); if (p) return p; }
  console.error('No password. Set PORTFOLIO_PASSWORD or put one line in private/.password');
  process.exit(1);
}

function buildLong(s, password) {
  const srcFile = R('private/long', s.slug + '.html');
  if (!exists(srcFile)) throw new Error('Missing ' + srcFile);
  const relDir = `work/${s.slug}/full`;
  const base = baseVars(relDir).base;
  let plain = read(srcFile);
  plain = render(plain, { ...baseVars(relDir), study_base: base + 'work/' });
  plain = expandPlaceholders(plain, s.slug);
  plain = longTokens(plain, s.slug);
  const imgBytes = Buffer.byteLength(plain);
  if (imgBytes > 5 * 1024 * 1024) { report.warnings.push(`${s.slug}: payload is ${(imgBytes / 1048576).toFixed(1)} MB (over 5 MB). Compress images.`); console.warn('WARN', report.warnings.at(-1)); }
  const payload = deriveAndEncrypt(plain, password);
  const rel = `work/${s.slug}/full/index.html`;
  const shellBody = render(partial('full-shell'), {
    ...baseVars(relDir), slug: s.slug, title_text: esc(s.title), summary: esc(s.summary),
    meta: metaHtml(s, rel), short_url: '../', payload: JSON.stringify(payload),
    prevnext: prevNext(s, base), request: requestHtml(s.short),
  });
  let b = publicTokens(shellBody, rel);
  const html = pageShell({ relDir, title: `${s.short}: full case study (password protected)`, description: s.summary, body: b, cur: 'work', robots: 'noindex', scripts: ['unlock.js', 'request.js'], pathForUrl: `work/${s.slug}/full/` });
  write(R(rel), html);
  return { bytes: plain.length };
}

/* ---------- TODO.md ---------- */
function writeTodo(pw) {
  const pwNote = pw === PLACEHOLDER_PW ? 'The long forms are encrypted with the PLACEHOLDER password, which is printed in the public build script, so they are NOT protected yet. Do not publish in this state.' : 'A custom password is set.';
  const L = [];
  L.push('# TODO: things only you can supply', '', '_Generated by `node tools/build.mjs` into `private/` (never published). Do not edit by hand: change the sources, then rebuild._', '');
  L.push('## 1. Placeholders (data/site.json and assets)', '');
  L.push(`- [ ] **Password.** ${pwNote} Pick a long passphrase (five or more random words), put it in \`private/.password\` (or set PORTFOLIO_PASSWORD), rebuild, then publish.`);
  L.push(`- [ ] **Email.** ${site.email ? 'Set: ' + site.email : 'Set `email` in data/site.json (currently a placeholder).'}`);
  L.push(`- [ ] **LinkedIn URL.** ${site.linkedin ? 'Set.' : 'Set `linkedin` in data/site.json (currently a placeholder).'}`);
  L.push(`- [ ] **Run the Medium fetch.** Handle \`${site.medium}\` is set. From a machine with internet access run \`node tools/fetch-medium.mjs && node tools/build.mjs\`. Until then three labelled sample posts are shown. (The shell used to build this site could not reach Medium.)`);
  L.push('- [ ] **Resume PDF.** Save as `assets/akta-paneri-resume.pdf` (the About page button points at it).');
  L.push('- [ ] **Portrait.** Add `assets/img/portrait.jpg` (4:5) and swap the labelled slot in `src/pages/about.html`.');
  L.push(`- [ ] **Site URL.** \`siteUrl\` in data/site.json is \`${site.siteUrl}\` (used in sitemap and Open Graph). Confirm.`);
  L.push('- [ ] **Custom domain decision.** No `CNAME` file is created, because aktapaneri.com currently serves the existing site. See README, "Custom domain".');
  L.push('- [ ] **Open Graph image.** `assets/img/og.png` is a generated 1200x630 image. Replace it if you want a different card.');
  L.push('');
  L.push('## 2. Short-form and About gaps', '', 'Study meta rows live in `data/studies.json`; About page dates in `src/pages/about.html`. Replace the `[GAP: ...]` text, then rebuild.', '');
  if (report.gaps.length) {
    const by = new Map();
    for (const g of report.gaps) { const k = g.hint; if (!by.has(k)) by.set(k, new Set()); by.get(k).add(g.where.replace(/ \/ (meta )?[\w -]*$/, '')); }
    for (const [hint, wheres] of by) L.push(`- [ ] ${hint} (shown on: ${[...wheres].map((w) => '`' + w + '`').join(', ')})`);
  } else L.push('_None._');
  L.push('');
  const flags = [...new Map(report.flags.map((f) => [f.where + f.hint, f])).values()];
  if (flags.length) {
    L.push('## 3. Flagged inconsistencies', '');
    for (const f of flags) L.push(`- [ ] \`${f.where}\`: ${f.hint}`);
    L.push('');
  }
  L.push('## 4. Data points to fill, by study', '', 'Each item is a `[FILL: ...]` marker from the source Google Doc. It shows as a dashed "to update" chip in the long form. Fill it in `private/long/<slug>.html` (and the matching `private/source/<slug>.md`), then rebuild.', '');
  let total = 0;
  const counts = {};
  for (const s of studies) {
    const items = report.fills[s.slug] || [];
    counts[s.slug] = items.length; total += items.length;
    L.push(`### ${s.short} (${items.length})`, '');
    let last = null;
    for (const it of items) {
      if (it.section !== last) { L.push(`**${it.section}**`, ''); last = it.section; }
      L.push(`- [ ] [FILL${it.hint ? ': ' + it.hint : ''}]`);
    }
    L.push('');
  }
  L.push(`**Total [FILL] items: ${total}** (${studies.map((s) => `${s.slug} ${counts[s.slug]}`).join(', ')})`, '');
  L.push('## 5. Image slots (long forms)', '', 'Drop the file at the path shown, then rebuild. The build replaces the placeholder and encrypts the image into the page.', '');
  for (const s of studies) {
    L.push(`### ${s.short}`, '');
    for (const im of report.images.filter((x) => x.slug === s.slug)) L.push(`- [${im.found ? 'x' : ' '}] Figure ${im.fig}: ${im.title} -> \`${im.file}\``);
    L.push('');
  }
  L.push('## 6. Values inside diagrams to update', '', 'Labels in the built diagrams that stand in for real data. They show as dashed amber text or chips.', '');
  for (const s of studies) {
    const f = report.figTodos.filter((x) => x.slug === s.slug);
    if (!f.length) continue;
    L.push(`### ${s.short}`, '');
    for (const x of f) L.push(`- [ ] ${x.section}: ${x.hint}`);
    L.push('');
  }
  if (report.warnings.length) { L.push('## Warnings', ''); report.warnings.forEach((w) => L.push('- ' + w)); L.push(''); }
  write(R(TODO_FILE), L.join('\n'));
  return { total, counts };
}

/* ---------- sitemap, robots ---------- */
function writeSeo() {
  const u = (site.siteUrl || '') + (site.basePath || '');
  const pages = [...new Set(outputs)].sort();
  write(R('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${u}/${p}</loc></url>`).join('\n')}\n</urlset>\n`);
  write(R('robots.txt'), `User-agent: *\nAllow: /\nDisallow: /work/*/full/\n\nSitemap: ${u}/sitemap.xml\n`);
}

/* ---------- main ---------- */
function main() {
  write(R('.nojekyll'), '');
  buildPublicPage(R('src/pages/index.html'), 'index.html');
  buildPublicPage(R('src/pages/work.html'), 'work/index.html');
  buildPublicPage(R('src/pages/about.html'), 'about/index.html');
  buildPublicPage(R('src/pages/writing.html'), 'writing/index.html');
  buildPublicPage(R('src/pages/404.html'), '404.html');
  studies.forEach(buildShort);
  if (PUBLIC_ONLY) {
    writeSeo();
    console.log('Built public pages (--public-only). Encrypted long forms and private/TODO.md left untouched.');
    return;
  }
  if (!exists(R('private/long'))) { console.error('private/long/ is missing. Use --public-only if you only want the public pages.'); process.exit(1); }
  const pw = getPassword();
  for (const s of studies) { const r = buildLong(s, pw); console.log(`  encrypted ${s.slug} (${(r.bytes / 1024).toFixed(0)} KB plain)`); }
  writeSeo();
  const t = writeTodo(pw);
  console.log(`Built ${outputs.length} public pages + ${studies.length} encrypted long forms. private/TODO.md: ${t.total} [FILL] items.`);
  if (pw === PLACEHOLDER_PW) console.log('\nWARNING: built with the PLACEHOLDER password. It is printed in this public script, so the long forms are not protected.\n         Set your own passphrase and rebuild BEFORE the first push: anything pushed stays in git history.');
  else if (pw.length < 16) console.log('\nWARNING: the password is short (' + pw.length + ' characters). The encrypted pages are public, so anyone can try guesses offline. Use 16+ characters or five random words.');
}
main();
