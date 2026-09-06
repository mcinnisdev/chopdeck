// Renders the Open Graph card and the PNG icons from the design system. Run: npm run assets
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const out = (f) => path.join(root, 'public', f);
// a data URI: an about:blank page (setContent) may not load file:// images
const logoUrl = 'data:image/webp;base64,' + readFileSync(path.join(root, 'public', 'logo.webp')).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'card.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.screenshot({ path: out('og.png'), type: 'png' });
console.log('wrote public/og.png');

// icons: the logo on a cream tile, at the sizes manifests and Apple want
for (const [name, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:#FBF2DA"><img src="${logoUrl}" style="width:${size}px;height:${size}px;display:block"></body></html>`);
  await p.waitForFunction(() => { const i = document.images[0]; return i && i.complete && i.naturalWidth > 0; });
  await p.screenshot({ path: out(name), type: 'png' });
  await p.close();
  console.log('wrote public/' + name);
}
await browser.close();
