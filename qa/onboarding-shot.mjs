// Capturas del formulario de alta y del panel (después de: node onboarding.mjs). Gemini falsa propia en 3199.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const B = 'http://localhost:3100';
const dir = new URL('./results/shots/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (n) => decodeURIComponent(new URL(n + '.jpg', dir).pathname.slice(1));
const qa = JSON.parse(readFileSync(new URL('./.qa-alta.json', import.meta.url), 'utf8'));
const pdfPath = decodeURIComponent(new URL('./results/rut-prueba.pdf', import.meta.url).pathname.slice(1));
writeFileSync(pdfPath, Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(1500)]));

const RUT = { esDocumentoDelNegocio: true, esRut: true, tipo: 'natural', nombre: 'JAVIER ENRIQUE MENDEZ ALCOCER', nombreComercial: 'EVOSPORT', nit: '1001994201', dv: '3', direccion: 'CR 9 9B 15 LC 1', ciudad: 'Valledupar', departamento: 'Cesar', telefono: '3003948190', correo: 'ing.javier19@gmail.com', actividad: '4762', representante: '' };
const mock = createServer((rq, rs) => { rq.resume(); rq.on('end', () => rs.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(RUT) }] } }] }))); });
await new Promise((r) => mock.listen(3199, r));

let bad = 0;
const ok = (name, cond) => { console.log(`  ${cond ? '✔' : '✘'} ${name}`); if (!cond) bad++; };
const settle = (ms = 800) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const clickText = (sel, text) => page.evaluate((sel, text) => { const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text)); el?.click(); return !!el; }, sel, text);
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ---- Formulario del cliente (celular) ----
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.goto(`${B}/alta/${qa.token}`, { waitUntil: 'networkidle0' });
await settle();
ok('El cliente ve el saludo con su nombre', await page.evaluate(() => document.querySelector('.intro h1')?.textContent.includes('Gimnasio Titanes')));
await page.screenshot({ path: file('alta-01-inicio-celular'), type: 'jpeg', quality: 80 });
await clickText('.choice button', 'Sí, tengo RUT');
await settle(300);
const input = await page.$('.drop input[type=file]');
await input.uploadFile(pdfPath);
await page.waitForFunction(() => document.querySelector('.good'), { timeout: 15000 }).catch(() => {});
ok('Al subir el RUT se llenan los datos', await page.evaluate(() => [...document.querySelectorAll('.step .input')].some((i) => i.value === 'JAVIER ENRIQUE MENDEZ ALCOCER')));
ok('Sin desborde horizontal en celular', await noOverflow());
await page.screenshot({ path: file('alta-02-rut-leido-celular'), type: 'jpeg', quality: 80, fullPage: true });

// Datos de contacto y envío
await page.evaluate(() => {
  const set = (label, v) => {
    const f = [...document.querySelectorAll('.field')].find((x) => x.querySelector('label')?.textContent.includes(label));
    const i = f?.querySelector('input'); if (!i) return;
    i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('Tu nombre', 'Javier Méndez'); set('Tu celular', '305 397 7305'); set('Instagram', '@titanes');
});
await clickText('.choice button', 'Seguir usando WhatsApp');
await clickText('.checks label', 'Crear mi cuenta de Meta Business');
await clickText('.checks label', 'Darle acceso de administrador');
await page.click('.consent input');
await clickText('button', 'Enviar mis datos');
await page.waitForFunction(() => document.body.textContent.includes('recibimos tus datos'), { timeout: 10000 }).catch(() => {});
ok('Envío correcto: "¡Listo, recibimos tus datos!"', await page.evaluate(() => document.body.textContent.includes('recibimos tus datos')));
await page.screenshot({ path: file('alta-03-enviado-celular'), type: 'jpeg', quality: 80 });

// ---- "No tengo RUT" (computador) ----
const login = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1' }, body: JSON.stringify({ email: qa.owner, password: qa.ownerPw }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const sup = async (action, data) => (await (await fetch(B + '/api/super/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1', Cookie: cookie }, body: JSON.stringify({ action, data }) })).json()).result;
const alta2 = (await sup('createOnboarding', { label: 'Panadería La Esquina' })).onboarding;
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`${B}/alta/${alta2.token}`, { waitUntil: 'networkidle0' });
await settle();
await clickText('.choice button', 'No tengo RUT');
await settle(300);
ok('Sin RUT: explica qué otro documento sirve y que el RUT es gratis', await page.evaluate(() => /recibo de luz/.test(document.querySelector('.note')?.textContent ?? '') && /gratis/.test(document.querySelector('.note')?.textContent ?? '')));
await page.screenshot({ path: file('alta-04-sin-rut'), type: 'jpeg', quality: 80, fullPage: true });

// ---- Panel de la plataforma ----
await page.setCookie({ name: 'crm_session', value: cookie.split('=')[1], domain: 'localhost', path: '/', httpOnly: true });
await page.goto(`${B}/super`, { waitUntil: 'networkidle0' });
await settle(1200);
ok('El panel muestra la sección de altas con la nueva', await page.evaluate(() => document.querySelector('.altas')?.textContent.includes('Datos recibidos') && document.querySelector('.altas')?.textContent.includes('1 nueva')));
await page.evaluate(() => document.querySelector('.altas')?.scrollIntoView());
await page.screenshot({ path: file('alta-05-panel'), type: 'jpeg', quality: 80 });
await clickText('.altas button', 'Ver datos');
await settle(600);
ok('El detalle muestra RUT, contacto, ayuda pedida y botón de descarga', await page.evaluate(() => { const t = document.querySelector('.modal')?.textContent ?? ''; return t.includes('1001994201') && t.includes('Javier Méndez') && t.includes('Crear mi cuenta de Meta Business') && t.includes('Descargar RUT'); }));
await page.screenshot({ path: file('alta-06-detalle'), type: 'jpeg', quality: 80 });
await clickText('.modal-foot button', 'Crear cliente con estos datos');
await settle(500);
ok('"Crear cliente con estos datos" llena el formulario de cliente', await page.evaluate(() => [...document.querySelectorAll('.modal .input')].some((i) => i.value === '1001994201-3')));
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.goto(`${B}/super`, { waitUntil: 'networkidle0' });
await settle(1000);
ok('Panel sin desborde en celular', await noOverflow());

await browser.close();
mock.close();
process.exit(bad ? 1 : 0);
