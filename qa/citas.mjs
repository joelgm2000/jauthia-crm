// Citas, garantía por producto y gimnasio → asesor, en el CRM real (instancia de QA).
// Uso: sh restart.sh && node conversations.mjs && node citas.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'node:fs';

const B = 'http://localhost:3100';
const dir = new URL('./results/shots/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = (n) => decodeURIComponent(new URL(n + '.jpg', dir).pathname.slice(1));
const demo = JSON.parse(readFileSync(new URL('./.qa-demo.json', import.meta.url), 'utf8'));

let cookie = '';
async function call(path, body) {
  const r = await fetch(B + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => null) };
}
const act = async (action, data) => {
  const r = await call('/api/action', { action, data });
  if (r.status !== 200) throw new Error(`${action} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.result;
};

let ok = 0, bad = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : bad++; console.log(`  ${cond ? '✔' : '✘'} ${name}${cond ? '' : '  → ' + extra}`); };

await call('/api/auth/login', { email: demo.email, password: demo.password });

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.setCookie({ name: 'crm_session', value: cookie.split('=')[1], domain: 'localhost', path: '/', httpOnly: true });
const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { await page.screenshot({ path: file(name), type: 'jpeg', quality: 82 }); console.log('  📸', name); };
const clickText = (sel, text) => page.evaluate((sel, text) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(text));
  if (el) el.click();
  return !!el;
}, sel, text);

// 1) Flujo del bot → pestaña Citas: activar y guardar desde la pantalla.
await page.goto(B + '/flow', { waitUntil: 'networkidle0' });
await settle();
check('Pestaña "Citas" en el flujo', await clickText('.tabs button', 'Citas'));
await settle(500);
await page.evaluate(() => {
  const sw = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Agendar citas desde el chat'))?.querySelector('input');
  sw?.click();
});
await settle(500);
await page.evaluate(() => {
  const input = [...document.querySelectorAll('.field')].find((f) => f.textContent.includes('Dirección de la tienda'))?.querySelector('input');
  input.value = 'Calle 16 # 9-45, Valledupar';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await settle(300);
await shot('citas-01-flujo');
await clickText('button', 'Guardar flujo');
await settle(1200);
const state = await call('/api/bootstrap');
const savedFlow = state.json?.flow ?? state.json?.result?.flow;
check('Citas guardadas como activas', savedFlow?.citas?.enabled === true, JSON.stringify(savedFlow?.citas)?.slice(0, 200));
check('Dirección guardada', savedFlow?.citas?.address === 'Calle 16 # 9-45, Valledupar');
check('Gimnasio/negocio va al traspaso (flujo de ejemplo)', savedFlow?.nodes?.find((n) => n.id === 'uso')?.options?.find((o) => o.id === 'uso_negocio')?.next === 'handoff');

// 2) Conversación: pide cita, elige día y hora.
const conv = (await act('createTestConversation', { channel: 'whatsapp', name: 'Marta Cita' })).conversation;
const say = (data) => act('simulateIncoming', { conversationId: conv.id, ...data });
await say({ text: 'Hola' });
await say({ text: 'Marta de Valledupar' });
let r = await say({ text: '¿Puedo pasar por la tienda a verla?' });
const st1 = await call('/api/bootstrap');
const msgs = async () => (await call(`/api/conversations/${conv.id}/messages`)).json;
const s1 = st1.json.conversations.find((c) => c.id === conv.id);
check('Pregunta el día (bot en "cita_dia")', s1.bot.nodeId === 'cita_dia', s1.bot.nodeId);
// Elige el primer día que ofrece el bot y la primera hora.
const lastBot = (list) => [...list].reverse().find((m) => m.direction === 'out' && m.buttons?.length);
let m = await msgs();
const listMsgs = Array.isArray(m) ? m : m?.messages ?? m?.result ?? [];
const dayBtn = lastBot(listMsgs)?.buttons?.find((b) => b.id.startsWith('cdia_'));
check('Lista de días con botones', !!dayBtn, JSON.stringify(lastBot(listMsgs)));
await say({ buttonId: dayBtn.id, title: dayBtn.title });
m = await msgs();
const list2 = Array.isArray(m) ? m : m?.messages ?? m?.result ?? [];
const hourBtn = lastBot(list2)?.buttons?.find((b) => b.id.startsWith('chora_'));
check('Lista de horas', !!hourBtn);
await say({ buttonId: hourBtn.id, title: hourBtn.title });
const s2 = (await call('/api/bootstrap')).json.conversations.find((c) => c.id === conv.id);
check('Cita agendada y guardada', s2.cita?.status === 'agendada', JSON.stringify(s2.cita));
check('Pasa al asesor (bot en pausa)', s2.botActive === false && s2.stage === 'asesor');
const tasks = (await call('/api/bootstrap')).json.tasks.filter((t) => t.conversationId === conv.id);
check('Tarea "Cita en la tienda" a la hora de la cita', tasks.some((t) => t.title.startsWith('Cita en la tienda') && t.dueAt === s2.cita.at));

// 3) Otra: no puede venir → videollamada.
const conv2 = (await act('createTestConversation', { channel: 'instagram', name: 'Pedro Video' })).conversation;
const say2 = (data) => act('simulateIncoming', { conversationId: conv2.id, ...data });
await say2({ text: 'Hola, quiero agendar una cita' });
await say2({ buttonId: 'cita_no', title: 'No puedo ir' });
await say2({ buttonId: 'cita_vllamada', title: '📹 Videollamada' });
await say2({ text: 'mañana a las 10 de la mañana' });
let s3 = (await call('/api/bootstrap')).json.conversations.find((c) => c.id === conv2.id);
if (!s3.cita) { // mañana puede ser domingo (cerrado): elige el primer día de la lista
  const mm = await (async () => { const x = (await call(`/api/conversations/${conv2.id}/messages`)).json; return Array.isArray(x) ? x : x?.messages ?? []; })();
  const d = lastBot(mm)?.buttons?.find((b) => b.id.startsWith('vdia_'));
  if (d) await say2({ buttonId: d.id, title: d.title });
  const mm2 = await (async () => { const x = (await call(`/api/conversations/${conv2.id}/messages`)).json; return Array.isArray(x) ? x : x?.messages ?? []; })();
  const h = lastBot(mm2)?.buttons?.find((b) => b.id.startsWith('vhora_'));
  if (h) await say2({ buttonId: h.id, title: h.title });
  s3 = (await call('/api/bootstrap')).json.conversations.find((c) => c.id === conv2.id);
}
check('Videollamada agendada', s3.cita?.kind === 'videollamada' && s3.cita.status === 'agendada', JSON.stringify(s3.cita));

// 4) Gimnasio → asesor enseguida, con botones de cita.
const conv3 = (await act('createTestConversation', { channel: 'whatsapp', name: 'Gym Andes' })).conversation;
await act('simulateIncoming', { conversationId: conv3.id, text: 'Hola' });
await act('simulateIncoming', { conversationId: conv3.id, text: 'Carlos de Valledupar' });
await act('simulateIncoming', { conversationId: conv3.id, buttonId: 'uso_negocio', title: '🏋️ Gimnasio/negocio' });
const s4 = (await call('/api/bootstrap')).json.conversations.find((c) => c.id === conv3.id);
check('Gimnasio pasa al asesor enseguida', s4.botActive === false && s4.stage === 'asesor' && s4.priority === 'alta', `${s4.botActive} ${s4.stage} ${s4.priority}`);

// 5) Pantalla Citas: marca "Asistió".
await page.goto(B + '/citas', { waitUntil: 'networkidle0' });
await settle(1200);
const items = await page.$$eval('.cita', (els) => els.map((e) => e.textContent));
check('Pantalla Citas muestra las 2 citas', items.length === 2 && items.some((t) => t.includes('Marta')) && items.some((t) => t.includes('Videollamada')), JSON.stringify(items));
check('Menú muestra "Citas"', await page.evaluate(() => [...document.querySelectorAll('nav a, aside a')].some((a) => a.textContent.includes('Citas'))));
await shot('citas-02-pantalla');
await clickText('.cita:first-child button', 'Asistió');
await clickText('.cita button', 'Asistió') || await clickText('.cita button', 'Se hizo');
await settle(1200);
const after = (await call('/api/bootstrap')).json.conversations.filter((c) => c.cita).map((c) => c.cita.status);
check('Marcar "Asistió" se guarda', after.includes('asistio'), JSON.stringify(after));

// 6) Panel del chat muestra la cita.
await page.goto(`${B}/inbox/${conv.id}`, { waitUntil: 'networkidle0' });
await settle(1500);
check('El chat muestra la cita en el panel', await page.evaluate(() => document.querySelector('aside.info')?.textContent.includes('Cita') ?? false));
await shot('citas-03-chat');

// 7) Catálogo: campo Garantía, se guarda y aparece en la ficha.
await page.goto(B + '/catalog', { waitUntil: 'networkidle0' });
await settle(1000);
await page.click('article.prod');
await settle(800);
await page.evaluate(() => {
  const input = [...document.querySelectorAll('.field')].find((f) => f.querySelector('label')?.textContent.trim() === 'Garantía')?.querySelector('input');
  input.value = '6 meses';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await settle(600);
check('Vista previa muestra "Garantía 6 meses"', await page.evaluate(() => document.querySelector('.pv')?.textContent.includes('Garantía 6 meses') ?? false));
await shot('citas-04-garantia');
await clickText('.modal-foot button', 'Guardar');
await settle(1200);
const prods = (await call('/api/bootstrap')).json.products;
check('Garantía guardada en el producto', prods.some((p) => p.warranty === '6 meses'));

// 8) Celular.
await page.setViewport({ width: 375, height: 812, isMobile: true });
await page.goto(B + '/citas', { waitUntil: 'networkidle0' });
await settle(1000);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('Citas sin desborde en celular', overflow <= 0, String(overflow));
await shot('citas-05-celular');

await browser.close();
console.log(`\n${ok}/${ok + bad} verificaciones`);
process.exit(bad ? 1 : 0);
