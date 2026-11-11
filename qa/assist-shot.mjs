// Capturas: sugerencia de respuesta en el chat, historial y clientes potenciales (después de: node market.mjs).
// Levanta su propia Gemini falsa en el puerto 3199.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';

const B = 'http://localhost:3100';
const dir = new URL('./results/shots/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (n) => decodeURIComponent(new URL(n + '.jpg', dir).pathname.slice(1));
const demo = JSON.parse(readFileSync(new URL('./.qa-demo.json', import.meta.url), 'utf8'));

const mock = createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    const out = { reply: 'Hola, Ana 😊 Con gusto te ayudo. ¿La trotadora sería para caminar o para trotar?', why: 'Todavía no sabemos cómo la va a usar: primero entender, después recomendar.', stage: 'Descubrimiento', alt: '¿Para cuántas personas sería la trotadora?' };
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }));
  });
});
await new Promise((r) => mock.listen(3199, r));

const login = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1' }, body: JSON.stringify({ email: demo.email, password: demo.password }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const boot = await (await fetch(B + '/api/bootstrap', { headers: { Cookie: cookie, 'X-CRM-Request': '1' } })).json();
const conv = boot.conversations.find((c) => c.name === 'Ana');

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setCookie({ name: 'crm_session', value: cookie.split('=')[1], domain: 'localhost', path: '/', httpOnly: true });
const settle = (ms = 1000) => new Promise((r) => setTimeout(r, ms));
const clickText = (sel, text) => page.evaluate((sel, text) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));
  el?.click();
  return !!el;
}, sel, text);
let bad = 0;
const ok = (name, cond) => { console.log(`  ${cond ? '✔' : '✘'} ${name}`); if (!cond) bad++; };

for (const [w, h, suffix] of [[1440, 900, ''], [375, 812, '-celular']]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 500 });
  await page.goto(`${B}/inbox/${conv.id}`, { waitUntil: 'networkidle0' });
  await settle(1200);
  ok('Botón "Sugerir respuesta" en el chat' + suffix, await clickText('.composer button', 'Sugerir respuesta'));
  await settle(1500);
  ok('Aparece la sugerencia' + suffix, await page.evaluate(() => document.querySelector('.suggest')?.textContent.includes('caminar o para trotar') ?? false));
  await page.screenshot({ path: file('sugerencia' + suffix), type: 'jpeg', quality: 80 });
  await clickText('.suggest button', 'Usar (puedes editarla)');
  await settle(400);
  ok('"Usar" la pone en la caja para escribir (sin enviarla)' + suffix, await page.evaluate(() => document.querySelector('.composer textarea')?.value.includes('caminar o para trotar') && !document.querySelector('.suggest')));
  ok('Sin desborde horizontal' + suffix, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
}

await page.setViewport({ width: 1440, height: 1100 });
await page.goto(B + '/market', { waitUntil: 'networkidle0' });
await settle(1200);
await clickText('.tabs button', 'Historial');
await settle(600);
ok('Historial con todos los análisis', (await page.$$('.hist-row')).length >= 5);
await page.screenshot({ path: file('historial'), type: 'jpeg', quality: 80 });
await page.click('.hist-row:last-child');
await settle(800);
ok('Al tocar un análisis del historial se abre en su pestaña', await page.evaluate(() => !document.querySelector('.hist-row')));
await clickText('.tabs button', 'Clientes potenciales');
await settle(800);
ok('Clientes: "Lo encontramos en" y botón de Google Maps, sin teléfono', await page.evaluate(() => {
  const card = document.querySelector('.lead');
  return !!card && card.textContent.includes('Lo encontramos en') && card.textContent.includes('Google Maps') && !card.querySelector('.phone');
}));
await page.screenshot({ path: file('clientes-fuente'), type: 'jpeg', quality: 80 });

await browser.close();
mock.close();
process.exit(bad ? 1 : 0);
