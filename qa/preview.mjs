import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await b.newPage();
await p.setViewport({ width: 688, height: 1000, deviceScaleFactor: 1 }); // A4 menos márgenes (182mm)
await p.emulateMediaType('print');
await p.goto(new URL('./results/informe.html', import.meta.url).href, { waitUntil: 'networkidle0' });
const pages = await p.$$('.page');
for (const [i, el] of pages.entries()) { const bb = await el.boundingBox(); console.log(i + 1, Math.round(bb.height), 'px (max ~1000)'); await el.screenshot({ path: `results/prev-${String(i + 1).padStart(2, '0')}.png` }); }
await b.close();
