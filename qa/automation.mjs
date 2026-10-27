// Pruebas de remarketing y alertas de compra sobre la instancia de QA (después de conversations.mjs).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../backend');
const pg = createRequire(path.join(backend, 'package.json'))('pg');
const B = 'http://localhost:3100';
const DB_URL = 'postgresql://crm:qa_test_only@localhost:5544/crm_qa';
const demo = JSON.parse(readFileSync(path.join(here, '.qa-demo.json'), 'utf8'));
let cookie = '';

async function call(p, body) {
  const r = await fetch(B + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const json = await r.json().catch(() => null);
  if (r.status !== 200) throw new Error(`${p} → ${r.status} ${JSON.stringify(json)}`);
  return json;
}
const act = async (action, data) => (await call('/api/action', { action, data })).result;
const boot = () => call('/api/bootstrap');
const msgs = async (id) => (await call(`/api/conversations/${id}/messages`)).messages;
const conv = async (id) => (await boot()).conversations.find((c) => c.id === id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function chat(channel, name, texts) {
  const c = (await act('createTestConversation', { channel, name })).conversation;
  for (const text of texts) await act('simulateIncoming', { conversationId: c.id, text });
  return c.id;
}
/** Una pasada del remarketing "N horas después" (mismo código del servidor). */
function remarketingAt(hours) {
  execFileSync(process.execPath, [path.join(backend, 'node_modules/tsx/dist/cli.mjs'), path.join(here, 'run-remarketing.ts'), String(hours)], {
    env: { ...process.env, DATABASE_URL: DB_URL, NODE_ENV: 'development' }, stdio: 'inherit',
  });
}

await call('/api/auth/login', { email: demo.email, password: demo.password });
const b = await boot();
const results = [];
const check = (scenario, name, pass) => {
  scenario.checks.push({ name, pass: !!pass });
  console.log(`  ${pass ? '✔' : '✘'} ${name}`);
};

// ---------------------------------------------------------------------------
// 1) Remarketing configurado: 3 pasos (texto, imagen, plantilla de WhatsApp)
// ---------------------------------------------------------------------------
console.log('\nRemarketing');
const flow = b.flow;
flow.followUps = [
  { afterHours: 2, message: '{nombre}, ¿pudiste ver las opciones que te envié? 😊 Si quieres te ayudo a elegir la ideal o te envío la cotización.' },
  { afterHours: 20, message: 'Hola {nombre} 👋 Esta semana tenemos descuento pagando en efectivo o transferencia, y envío gratis en Valledupar. ¿Te ayudo con tu {producto}?', imageUrl: '@producto' },
  { afterHours: 72, message: 'Última consulta, {nombre}: ¿aún te interesa tu {producto}?', templateId: 'tpl_remarketing' },
];
flow.remarketing = { enabled: true, stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'], withAdvisor: true, loseAfterHours: 48 };
await act('saveFlow', { flow });
await sleep(300);

const rm = { key: 'remarketing', channel: 'whatsapp', name: 'Valentina', title: 'Remarketing: la cliente deja de contestar (WhatsApp)',
  goal: '3 mensajes automáticos configurables: a las 2 h (texto), a las 20 h (con la foto del producto que le interesa) y a las 72 h (plantilla aprobada, obligatoria en WhatsApp después de 24 h). Luego pasa a Perdido.', checks: [] };
rm.id = await chat('whatsapp', 'Valentina', ['¿Tienen caminadoras?', 'Valentina de Valledupar', 'Para mi casa']);
const ms = { key: 'remarketing-messenger', channel: 'messenger', name: 'Andrés', title: 'Remarketing en Messenger después de 24 h', goal: 'Messenger no permite mensajes promocionales pasadas 24 h: ese paso se omite y queda la nota para el equipo.', checks: [] };
ms.id = await chat('messenger', 'Andrés', ['¿Tienen bicicletas de spinning?', 'Andrés de Valledupar']);
for (const h of [1, 3, 21, 73, 125]) remarketingAt(h);
await sleep(500);
const rmMsgs = await msgs(rm.id);
const autos = rmMsgs.filter((m) => m.authorName === 'Remarketing');
check(rm, 'A la 1 h no envía nada (aún no toca)', !rmMsgs.some((m) => m.authorName === 'Remarketing' && m.createdAt < Date.now() + 2 * 3600e3 - 60e3));
check(rm, 'Paso 1 (2 h): texto con su nombre', autos[0]?.type === 'text' && /^Valentina, ¿pudiste/.test(autos[0].text));
check(rm, 'Paso 2 (20 h): mensaje con la foto del producto que le interesa', autos[1]?.type === 'image' && /trotadora/i.test(autos[1].imageUrl ?? '') && /Trotadora/i.test(autos[1].text));
check(rm, 'Paso 3 (72 h): usa la plantilla de WhatsApp', autos[2]?.type === 'template' && autos[2].templateName === 'remarketing_evosport');
const rmConv = await conv(rm.id);
check(rm, 'Sin respuesta después del último paso → Perdido', rmConv.stage === 'perdido');
const msMsgs = await msgs(ms.id);
const msAutos = msMsgs.filter((m) => m.authorName === 'Remarketing');
check(ms, 'Dentro de 24 h sí envía', msAutos.length === 2);
check(ms, 'La foto es la de SU producto (spinning), no la de otro cliente', /spinning/i.test(msAutos[1]?.imageUrl ?? ''));
check(ms, 'Pasadas 24 h omite el paso y deja nota', msMsgs.some((m) => m.type === 'note' && /no enviado/.test(m.text)));
results.push(rm, ms);

// ---------------------------------------------------------------------------
// 2) Alertas de compra
// ---------------------------------------------------------------------------
console.log('\nAlertas de compra');
const settings = b.settings;
settings.socialProof = {
  enabled: true, triggerStage: 'pago', inactiveHours: 1, stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'], sameCategoryOnly: true,
  cooldownHours: 24, maxRecipients: 100, includeImage: true,
  message: '🔥 Un cliente de {ciudad_comprador} acaba de comprar {producto}. Aún quedan unidades con el descuento de esta semana. {nombre}, ¿quieres que te ayude con tu compra?',
};
delete settings.advisors;
await act('saveSettings', { settings });
const al = { key: 'alerta', channel: 'whatsapp', name: 'Paola', title: 'Alerta de compra a un lead inactivo',
  goal: 'Ricardo (Valledupar) paga una Trotadora Vigor: Paola y Miguel, que buscaban cardio y llevan 2 h sin contestar, reciben la alerta con la foto. Sandra (fuerza) y Diego (contestó hace un momento) no.', checks: [] };
al.id = await chat('whatsapp', 'Paola', ['¿Tienen caminadoras?', 'Paola de Codazzi']);
const miguel = await chat('instagram', 'Miguel', ['¿Tienen elípticas?', 'Miguel de La Paz']);
const sandra = await chat('whatsapp', 'Sandra', ['¿Tienen multigimnasios?', 'Sandra de Valledupar']);
const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
// Simula que llevan 2 horas sin contestar.
for (const id of [al.id, miguel, sandra]) {
  await db.query(`UPDATE conversations SET data = data || jsonb_build_object('waitingSince', $3::bigint) WHERE tenant_id = $1 AND id = $2`, [demo.tenant, id, Date.now() - 2 * 3600e3]);
}
const diego = await chat('whatsapp', 'Diego', ['¿Tienen trotadoras?', 'Diego de Valledupar']);
const buyer = { key: 'comprador', channel: 'whatsapp', name: 'Ricardo', title: 'Venta que dispara la alerta', goal: 'Al pasar a "Pago confirmado" se avisa a los leads inactivos, sin revelar quién compró.', checks: [] };
buyer.id = await chat('whatsapp', 'Ricardo', ['Hola', 'Ricardo de Valledupar', 'Quiero comprar la Vigor', 'una']);
await act('setStage', { conversationId: buyer.id, stage: 'pago' });
await sleep(1500);
const alertOf = async (id) => (await msgs(id)).find((m) => m.authorName === 'Alerta de compra');
const pa = await alertOf(al.id);
check(al, 'Paola (cardio, 2 h sin contestar) recibe la alerta con la foto', pa?.type === 'image' && /Valledupar acaba de comprar Trotadora Vigor/.test(pa.text) && /Paola/.test(pa.text));
check(al, 'Miguel (Instagram, cardio) también la recibe', !!(await alertOf(miguel)));
check(al, 'Sandra (buscaba fuerza) no la recibe', !(await alertOf(sandra)));
check(al, 'Diego (contestó hace un momento) no la recibe', !(await alertOf(diego)));
check(al, 'Nunca menciona el nombre del comprador', !/Ricardo/.test(pa?.text ?? ''));
const bn = (await msgs(buyer.id)).find((m) => m.type === 'note' && /Alerta de compra enviada a/.test(m.text));
check(buyer, 'El equipo ve en el chat del comprador a cuántos se avisó', /enviada a 2 cliente/.test(bn?.text ?? ''));
await act('setStage', { conversationId: buyer.id, stage: 'ganado' });
await sleep(800);
check(buyer, 'Pasar luego a Ganado no repite la alerta', (await msgs(al.id)).filter((m) => m.authorName === 'Alerta de compra').length === 1);
results.push(al, buyer);

// ---------------------------------------------------------------------------
// 3) Pedido sin respuesta a "¿te interesa otro producto?": pasa solo al asesor
// ---------------------------------------------------------------------------
console.log('\nPedido sin respuesta');
const cartConv = (await act('createTestConversation', { channel: 'whatsapp', name: 'Valeria Cotes' })).conversation;
const cartScenario = { id: cartConv.id, key: 'pedido-espera', title: 'Eligió un producto y no contestó "¿te interesa otro?"', checks: [] };
await act('simulateIncoming', { conversationId: cartConv.id, text: 'Hola, quiero una caminadora' });
await act('simulateIncoming', { conversationId: cartConv.id, text: 'Valeria de Valledupar' });
const firstCard = [...(await msgs(cartConv.id))].reverse().find((m) => m.cards?.length).cards[0].productId;
await act('simulateIncoming', { conversationId: cartConv.id, buttonId: `sel_${firstCard}`, title: 'Lo quiero' });
await act('simulateIncoming', { conversationId: cartConv.id, buttonId: 'qty_1', title: '1' });
check(cartScenario, 'Queda esperando la respuesta con el bot activo', (await conv(cartConv.id)).bot.nodeId === 'carrito');
remarketingAt(0.1); // 6 minutos: aún no
check(cartScenario, 'A los 6 minutos todavía espera', (await conv(cartConv.id)).botActive === true);
remarketingAt(0.3); // 18 minutos: pasa al asesor
const cv = await conv(cartConv.id);
check(cartScenario, 'A los 15 minutos pasa al asesor con su pedido', cv.botActive === false && cv.stage === 'asesor' && cv.cart?.length === 1);
check(cartScenario, 'Le avisa al cliente que una asesora le escribe', (await msgs(cartConv.id)).some((m) => m.sender === 'bot' && /asesora/.test(m.text ?? '') && m.createdAt > Date.now()));
check(cartScenario, 'Crea la tarea "Cotizar a" para el asesor', (await boot()).tasks.some((t) => t.conversationId === cartConv.id && /Cotizar a Valeria/.test(t.title)));
results.push(cartScenario);
await db.end();

for (const r of results) {
  r.messages = await msgs(r.id);
  const c = await conv(r.id);
  r.final = { stage: c.stage, hot: c.hot, score: c.score, botActive: c.botActive, fields: c.fields, intent: c.intent, name: c.name };
}
writeFileSync(path.join(here, 'results/automation.json'), JSON.stringify({ scenarios: results }, null, 2));
const all = results.flatMap((r) => r.checks);
console.log(`\n${all.filter((c) => c.pass).length}/${all.length} verificaciones`);
