// Captura de los guiones en viñetas y la conversación de venta (después de: node market.mjs).
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const B = 'http://localhost:3100';
const dir = new URL('./results/shots/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (n) => decodeURIComponent(new URL(n + '.jpg', dir).pathname.slice(1));
const demo = JSON.parse(readFileSync(new URL('./.qa-demo.json', import.meta.url), 'utf8'));
const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1' }, body: JSON.stringify({ email: demo.email, password: demo.password }) });
const cookie = r.headers.get('set-cookie').split(';')[0].split('=')[1];

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setCookie({ name: 'crm_session', value: cookie, domain: 'localhost', path: '/', httpOnly: true });
let bad = 0;
for (const [w, h, name, dark] of [[1440, 1800, 'guiones-escritorio', false], [375, 2400, 'guiones-celular', false], [1440, 1800, 'guiones-oscuro', true]]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 500 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.goto(B + '/market', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /guiones/i.test(b.textContent))?.click());
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => document.querySelector('app-storyboard')?.scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 500));
  const info = await page.evaluate(() => ({
    frames: document.querySelectorAll('app-storyboard .frame').length,
    steps: document.querySelectorAll('.sales .sstep').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  console.log(name, JSON.stringify(info));
  if (!info.frames || !info.steps || info.overflow > 0) bad++;
  await page.screenshot({ path: file(name), type: 'jpeg', quality: 80 });
}
await browser.close();
process.exit(bad ? 1 : 0);
