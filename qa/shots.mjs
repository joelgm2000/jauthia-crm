// Capturas de pantalla del CRM real (instancia de QA) con Chrome sin ventana.
// Uso: node shots.mjs tenant|super
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const B = 'http://localhost:3100';
const mode = process.argv[2] ?? 'tenant';
const dir = new URL('./results/shots/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (n) => decodeURIComponent(new URL(n + '.jpg', dir).pathname.slice(1));

async function cookieFor(email, password) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1' }, body: JSON.stringify({ email, password }) });
  if (r.status !== 200) throw new Error('login ' + r.status);
  return r.headers.get('set-cookie').split(';')[0].split('=')[1];
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, opts = {}) => { await page.screenshot({ path: file(name), type: 'jpeg', quality: 82, ...opts }); console.log('  📸', name); };

/** Captura cada conversación completa dentro de la bandeja del CRM. */
async function shootChats(scenarios) {
  for (const s of scenarios) {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${B}/inbox/${s.id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.messages', { timeout: 10000 });
    await settle(1200);
    // Alto suficiente para que se vea la conversación completa dentro del CRM.
    const h = await page.evaluate(() => { const m = document.querySelector('.messages'); return m ? m.scrollHeight - m.clientHeight : 0; });
    if (h > 0) {
      await page.setViewport({ width: 1440, height: Math.min(900 + h + 40, 5200) });
      await settle(700);
      await page.evaluate(() => { const m = document.querySelector('.messages'); if (m) m.scrollTop = 0; });
      await settle(300);
    }
    await shot('chat-' + s.key);
  }
  await page.setViewport({ width: 1440, height: 900 });
}

const readJson = (f) => JSON.parse(readFileSync(new URL('./' + f, import.meta.url), 'utf8'));
const loginDemo = async () => {
  const demo = readJson('.qa-demo.json');
  await page.setCookie({ name: 'crm_session', value: await cookieFor(demo.email, demo.password), domain: 'localhost', path: '/', httpOnly: true });
};

if (mode === 'tenant') {
  await page.goto(B + '/login', { waitUntil: 'networkidle0' });
  await settle();
  await shot('00-login');
  await loginDemo();
  await shootChats(readJson('results/conversations.json').scenarios);
  for (const [route, name] of [['pipeline', '10-kanban'], ['dashboard', '11-dashboard'], ['catalog', '12-catalogo'], ['channels', '14-canales'], ['contacts', '15-contactos'], ['tasks', '16-tareas']]) {
    await page.goto(`${B}/${route}`, { waitUntil: 'networkidle0' });
    await settle(1200);
    await shot(name);
  }
  // Flujo del bot → "Vendedor y datos básicos" (página completa).
  await page.goto(`${B}/flow`, { waitUntil: 'networkidle0' });
  await settle(1200);
  const fh = await page.evaluate(() => document.querySelector('.page')?.scrollHeight ?? 900);
  await page.setViewport({ width: 1440, height: Math.min(fh + 40, 4200) });
  await settle(500);
  await shot('13-flujo');
  await page.setViewport({ width: 1440, height: 900 });
} else if (mode === 'auto') {
  await loginDemo();
  await shootChats(readJson('results/automation.json').scenarios);
  await page.goto(`${B}/automation`, { waitUntil: 'networkidle0' });
  await settle(1200);
  const h = await page.evaluate(() => document.querySelector('.page')?.scrollHeight ?? 900);
  await page.setViewport({ width: 1440, height: Math.min(h + 40, 3600) });
  await settle(500);
  await shot('17-remarketing');
} else {
  const ownerPw = readFileSync(new URL('./.qa-owner', import.meta.url), 'utf8');
  await page.setCookie({ name: 'crm_session', value: await cookieFor('joelgarciamaestrejgm@gmail.com', ownerPw), domain: 'localhost', path: '/', httpOnly: true });
  await page.goto(`${B}/super`, { waitUntil: 'networkidle0' });
  await settle(1500);
  await shot('20-super-admin');
}
await browser.close();
