#!/usr/bin/env node
/* Sanity checks. Node 18+, standard library only. Exit code 1 on any failure.
 *  - private/ is git-ignored and not tracked
 *  - no long-form body sentence appears in a generated public file (unless it is also authored in src/ or data/)
 *  - the encrypted pages carry a payload with the expected parameters
 *  - [FILL] counts agree between source, long form and TODO.md
 *  - every internal link and asset in the built public pages resolves
 *  - no third-party requests (scripts, styles, images, fonts)
 *  - security: CSP on every page, no inline handlers, TODO/PLAN not public, placeholder password not in use
 *    (run with --publish before every push: the placeholder password then fails the check)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (...p) => path.join(ROOT, ...p);
const studies = JSON.parse(fs.readFileSync(R('data/studies.json'), 'utf8'));
let failed = 0;
const ok = (m) => console.log('  pass  ' + m);
const bad = (m) => { failed++; console.log('  FAIL  ' + m); };
const walk = (d, out = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['private', 'node_modules', '.git'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

console.log('1. private/ is ignored');
const gi = fs.existsSync(R('.gitignore')) ? fs.readFileSync(R('.gitignore'), 'utf8') : '';
/^private\/?$/m.test(gi) ? ok('.gitignore lists private/') : bad('.gitignore does not list private/');
if (fs.existsSync(R('.git'))) {
  try { execSync('git check-ignore -q private/long/x.html', { cwd: ROOT }); ok('git check-ignore confirms private/ is ignored'); } catch { bad('git does not ignore private/'); }
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => f.startsWith('private/'));
  tracked.length ? bad('tracked files under private/: ' + tracked.join(', ')) : ok('no tracked files under private/');
} else ok('(no .git folder yet; git checks skipped)');

console.log('2. no long-form text in public files');
const publicFiles = walk(ROOT).filter((f) => /\.(html|json|xml|txt|js|css)$/.test(f) && !f.endsWith('PLAN.md') && !f.endsWith('TODO.md'));
const authored = walk(ROOT).filter((f) => (f.includes(`${path.sep}src${path.sep}`) || f.includes(`${path.sep}data${path.sep}`)));
const authoredText = authored.map((f) => text(fs.readFileSync(f, 'utf8'))).join(' ');
const built = publicFiles.filter((f) => !authored.includes(f) && !f.includes(`${path.sep}tools${path.sep}`) && !f.includes(`${path.sep}assets${path.sep}js${path.sep}`));
const builtText = built.map((f) => [f, text(fs.readFileSync(f, 'utf8'))]);
const fullPages = built.filter((f) => f.includes(`${path.sep}full${path.sep}`));
let checked = 0, leaks = 0;
const longDir = R('private/long');
if (fs.existsSync(longDir)) {
  for (const f of fs.readdirSync(longDir)) {
    const t = text(fs.readFileSync(path.join(longDir, f), 'utf8'));
    const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 60 && !/\[FILL|\[FIG|\[FLAG/.test(s));
    for (const s of sentences) {
      checked++;
      if (authoredText.includes(s)) continue; // intentionally public (short form / data)
      for (const [file, tx] of builtText) if (tx.includes(s)) { leaks++; bad(`sentence from ${f} found in ${path.relative(ROOT, file)}: "${s.slice(0, 60)}..."`); }
    }
  }
  leaks === 0 ? ok(`${checked} long-form sentences checked against ${built.length} public files, none found`) : 0;
} else ok('(private/long not present; sentence scan skipped)');
for (const f of fullPages) {
  const h = fs.readFileSync(f, 'utf8');
  const m = h.match(/<script type="application\/json" id="payload">([\s\S]*?)<\/script>/);
  if (!m) { bad(path.relative(ROOT, f) + ': no payload'); continue; }
  const p = JSON.parse(m[1]);
  p.v === 1 && p.iter >= 600000 && p.salt && p.iv && p.ct ? ok(`${path.relative(ROOT, f)}: payload v${p.v}, ${p.iter} PBKDF2 iterations, ${Math.round(p.ct.length * 0.75 / 1024)} KB ciphertext`) : bad(path.relative(ROOT, f) + ': bad payload');
  /noindex/.test(h) ? 0 : bad(path.relative(ROOT, f) + ': missing noindex');
}

console.log('3. [FILL] counts');
if (fs.existsSync(R('private/source')) && fs.existsSync(R('private/TODO.md'))) {
  const todo = fs.readFileSync(R('private/TODO.md'), 'utf8');
  for (const s of studies) {
    const src = (fs.readFileSync(R('private/source', s.slug + '.md'), 'utf8').match(/\[FILL/g) || []).length;
    const lng = (fs.readFileSync(R('private/long', s.slug + '.html'), 'utf8').match(/\[FILL/g) || []).length;
    const block = todo.split(/^### /m).find((b) => b.startsWith(s.short + ' (')) || '';
    const td = (block.match(/^- \[ \] \[FILL/gm) || []).length;
    src === lng && lng === td ? ok(`${s.slug}: source ${src} = long form ${lng} = TODO.md ${td}`) : bad(`${s.slug}: source ${src}, long form ${lng}, TODO.md ${td}`);
  }
} else ok('(private/source or TODO.md missing; skipped)');

console.log('4. links and assets resolve');
const pages = built.filter((f) => f.endsWith('.html') && !f.endsWith('404.html'));
let links = 0, broken = 0;
for (const f of pages) {
  const h = fs.readFileSync(f, 'utf8').replace(/<script type="application\/json"[\s\S]*?<\/script>/g, '');
  const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of h.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const u = m[1];
    if (!u || /^(https?:|mailto:|data:|tel:|javascript:)/.test(u)) continue;
    links++;
    if (u.startsWith('#')) { if (u !== '#' && !ids.has(u.slice(1))) { broken++; bad(`${path.relative(ROOT, f)}: missing anchor ${u}`); } continue; }
    const [rel, hash] = u.split('#');
    let target = path.resolve(path.dirname(f), rel.split('?')[0]);
    if (u.startsWith('/')) target = path.join(ROOT, rel);
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) {
      // resume PDF is supplied by the owner; reported in TODO.md rather than failing
      if (/akta-paneri-resume\.pdf$/.test(rel) || /portrait\.jpg$/.test(rel)) { continue; }
      broken++; bad(`${path.relative(ROOT, f)}: broken ${u}`);
    }
  }
}
broken === 0 ? ok(`${links} internal links and assets in ${pages.length} pages resolve (resume PDF and portrait are owner-supplied and excluded)`) : 0;

console.log('5. no third-party requests');
let third = 0;
for (const f of pages) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*?\s(?:src|href)="(https?:[^"]+)"/g)) {
    if (/<link\b[^>]*rel="(canonical|alternate)"/.test(m[0])) continue;
    third++; bad(`${path.relative(ROOT, f)}: external resource ${m[1]}`);
  }
}
third === 0 ? ok('no external scripts, styles, images or fonts') : 0;

console.log('6. security');
{
  const crypto = await import('node:crypto');
  const noCsp = pages.filter((f) => !/http-equiv="Content-Security-Policy"/.test(fs.readFileSync(f, 'utf8')));
  noCsp.length ? bad('pages without a Content-Security-Policy: ' + noCsp.map((f) => path.relative(ROOT, f)).join(', ')) : ok(`Content-Security-Policy on all ${pages.length} pages`);
  const handlers = pages.filter((f) => /\son[a-z]+="|href="javascript:/i.test(fs.readFileSync(f, 'utf8')));
  handlers.length ? bad('inline event handlers or javascript: links in ' + handlers.map((f) => path.relative(ROOT, f)).join(', ')) : ok('no inline event handlers or javascript: links');
  for (const n of ['TODO.md', 'PLAN.md']) fs.existsSync(R(n)) ? bad(`${n} is in the public folder; it belongs in private/ (it describes locked content)`) : ok(`${n} is not in the public folder`);
  // Would the placeholder password open the published pages?
  const PLACEHOLDER = 'change-me-before-publishing';
  let open = 0;
  for (const s of studies) {
    const f = R('work', s.slug, 'full', 'index.html');
    if (!fs.existsSync(f)) continue;
    const m = fs.readFileSync(f, 'utf8').match(/<script type="application\/json" id="payload">([\s\S]*?)<\/script>/);
    if (!m) continue;
    try {
      const p = JSON.parse(m[1]); const ct = Buffer.from(p.ct, 'base64');
      const key = crypto.pbkdf2Sync(PLACEHOLDER, Buffer.from(p.salt, 'base64'), p.iter, 32, 'sha256');
      const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
      d.setAuthTag(ct.subarray(ct.length - 16)); d.update(ct.subarray(0, ct.length - 16)); d.final(); open++;
    } catch { /* does not open: good */ }
  }
  if (open) {
    const msg = `${open} long form(s) open with the placeholder password, which is printed in the public build script. They are not protected. Set your own passphrase and rebuild before pushing.`;
    process.argv.includes('--publish') ? bad(msg) : console.log('  WARN  ' + msg + ' (fails with --publish)');
  } else ok('the placeholder password does not open any long form');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
