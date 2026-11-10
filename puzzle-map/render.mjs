// Рендер map.svg → map.png (4500×3000) и map.pdf (420×280 мм, вектор)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const svg = fs.readFileSync(path.join(dir, 'map.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}svg{display:block;width:100vw;height:auto}</style></head><body>${svg}</body></html>`;
const scale = Number(process.argv[2] || 3);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: scale });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(dir, scale === 1 ? 'preview.png' : 'map.png') });
if (scale !== 1) {
  await page.pdf({ path: path.join(dir, 'map.pdf'), width: '420mm', height: '280mm', printBackground: true, pageRanges: '1' });
}
await browser.close();
