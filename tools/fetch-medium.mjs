#!/usr/bin/env node
/* Fetch the latest Medium posts into data/posts.json. Node 18+, standard library only.
 *   node tools/fetch-medium.mjs [handle]
 * Handle defaults to "medium" in data/site.json. Medium's feed returns the ten most recent posts and
 * blocks browser fetches (no CORS), so this runs at build time (locally or in the GitHub workflow). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const handle = (process.argv[2] || site.medium || '').replace(/^@/, '');
if (!handle) { console.error('No Medium handle. Set "medium" in data/site.json or pass it as an argument.'); process.exit(1); }

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const strip = (html) => decode(html.replace(/<figure[\s\S]*?<\/figure>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)); return m ? m[1] : ''; };

const url = `https://medium.com/feed/@${handle}`;
const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; portfolio-build)' } });
if (!res.ok) { console.error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`); process.exit(1); }
const xml = await res.text();
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
if (!items.length) { console.error('No <item> entries found in the feed.'); process.exit(1); }

const posts = items.map((it) => {
  const content = tag(it, 'content:encoded') || tag(it, 'description');
  const text = strip(content);
  const words = text.split(/\s+/).filter(Boolean).length;
  const link = decode(tag(it, 'link')).split('?')[0];
  const img = (content.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
  const tags = [...it.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((m) => decode(m[1]).trim());
  const d = new Date(decode(tag(it, 'pubDate')));
  const excerpt = text.length > 160 ? text.slice(0, 157).replace(/\s+\S*$/, '') + '...' : text;
  return { title: decode(tag(it, 'title')).trim(), url: link, date: isNaN(d) ? '' : d.toISOString().slice(0, 10), readingTime: `${Math.max(1, Math.round(words / 220))} min read`, excerpt, tags, image: img };
}).filter((p) => p.title && /^https:\/\//i.test(p.url));

fs.writeFileSync(path.join(ROOT, 'data/posts.json'), JSON.stringify(posts, null, 2) + '\n');
console.log(`Wrote ${posts.length} posts for @${handle} to data/posts.json`);
