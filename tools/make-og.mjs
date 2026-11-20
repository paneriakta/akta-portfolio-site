#!/usr/bin/env node
/* Optional: render assets/img/og.svg to assets/img/og.png (1200x630). Needs Playwright installed globally or locally. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(process.env.NODE_PATH || '', 'playwright'))); }
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.goto('file://' + path.join(ROOT, 'assets/img/og.svg'));
await p.screenshot({ path: path.join(ROOT, 'assets/img/og.png') });
await b.close(); console.log('Wrote assets/img/og.png');
