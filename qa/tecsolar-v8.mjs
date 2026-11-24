// Prueba el flujo de TecSolar de producción (mejorado, v8) en la instancia de QA, con mensajes como los de sus chats reales.
// Uso: sh restart.sh && node tecsolar-v8.mjs [ruta del flujo .json]
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';

const FLOW = process.argv[2] ?? '../../entregas/tecsolar/flujo-tecsolar-v8.json';
const flow = JSON.parse(fs.readFileSync(new URL(FLOW, import.meta.url), 'utf8'));
const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
const jars = {};
let bad = 0, total = 0;
const check = (name, cond, got) => { total++; console.log(`  ${cond ? '✔' : '✘'} ${name}${cond ? '' : '  → ' + JSON.stringify(got)}`); if (!cond) bad++; };
async function call(path, { method = 'GET', body, jar } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-CRM-Request': '1' };
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const sup = (action, data) => call('/api/super/action', { method: 'POST', jar: 'owner', body: { action, data } });
const act = (action, data) => call('/api/action', { method: 'POST', jar: 'adm', body: { action, data } });

await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: pw() } });
const tenant = { name: 'TecSolar S.A.S.', city: 'Valledupar', modules: { crm: false, chatbot: true }, plan: { name: 'Chatbot', price: 1, currency: 'COP', billingDay: 5 }, status: 'prueba' };
const t = (await sup('saveTenant', { tenant, flowTemplate: 'generico' })).json.result.tenant;
const apw = pw();
await sup('createTenantUser', { tenantId: t.id, name: 'Admin', email: 'admin@tecsolar.test', password: apw, role: 'admin' });
await call('/api/auth/login', { method: 'POST', jar: 'adm', body: { email: 'admin@tecsolar.test', password: apw } });

let r = await act('saveFlow', { flow });
check('El flujo de producción mejorado se guarda en el CRM', r.status === 200, r.text);
const saved = (await call('/api/bootstrap', { jar: 'adm' })).json.flow;
check('Conserva las 8 rutas de producción', saved.nodes.find((n) => n.id === 'interes').options.length === 8 && saved.nodes.find((n) => n.id === 'interes').prefill === true, saved.nodes.find((n) => n.id === 'interes'));

async function chat(label, steps) {
  const conv = (await act('createTestConversation', { channel: 'whatsapp', name: 'Prueba' })).json.result.conversation;
  for (const [text, buttonId] of steps) await act('simulateIncoming', { conversationId: conv.id, text, ...(buttonId ? { buttonId } : {}) });
  const c = (await call('/api/bootstrap', { jar: 'adm' })).json.conversations.find((x) => x.id === conv.id);
  const msgs = (await call(`/api/conversations/${conv.id}/messages`, { jar: 'adm' })).json.messages;
  const bot = msgs.filter((m) => m.sender === 'bot').map((m) => m.text);
  console.log(`\n${label}`);
  for (const m of msgs) if (m.type !== 'note') console.log(`    ${m.sender === 'bot' ? '🤖' : '👤'} ${m.text.replace(/\n/g, ' / ').slice(0, 150)}`);
  console.log(`    → ${c.stage} · ${c.botActive ? 'bot' : 'ASESOR'} · ${c.summary ?? ''}`);
  return { c, bot, all: bot.join(' | ') };
}

// 1. Llega del anuncio del plan separe (11 veces en Kommo)
let x = await chat('Plan separe desde el anuncio', [['Quiero info del plan separe solar.'], ['Ana Gómez, Curumaní'], ['[image]'], ['Sí, soy propietario', 'paneles_o3l0_2'], ['Bajar la factura', 'paneles_p4ne_1'], ['2 aires y la nevera'], ['en la tarde']]);
check('Explica el plan separe', x.all.includes('10%'));
check('No le vuelve a preguntar qué necesita', !x.all.includes('¿Qué necesitas?'), x.bot);
check('Guarda todo en su campo (ya dijo plan separe: no se pregunta cómo pagar)', x.c.fields.categoria === 'plan separe' && x.c.fields.formaPago === 'plan separe' && x.c.fields.recibo === '[image]' && x.c.fields.propietario === 'propietario' && x.c.fields.objetivo === 'bajar la factura' && x.c.fields.horaLlamada === 'en la tarde', x.c.fields);
check('Pasa al asesor con el resumen', !x.c.botActive && /Llamar: en la tarde/.test(x.c.summary ?? ''), x.c.summary);
check('No quedan textos "[POR CONFIRMAR]"', !x.all.includes('POR CONFIRMAR'));
check('Sin doble punto en el nombre', !x.all.includes('S.A.S..'));

// 2. Paneles para mi negocio: ya NO se va directo al asesor (antes pasaba por la regla de gimnasio)
x = await chat('Paneles para negocio', [['Buenas tardes'], ['Luis, Valledupar'], ['Paneles para mi negocio', 'interes_2']]);
check('"Negocio" sigue preguntando (pide el recibo)', x.c.botActive && x.bot.at(-1).includes('recibo de energía'), x.bot.at(-1));
check('No lo marca como gimnasio', !x.c.tags.includes('gym'), x.c.tags);

// 3. Pregunta por cuotas y por Afinia en medio del flujo: responde y sigue (no lo pasa a "Pago confirmado")
x = await chat('Cuotas y Afinia', [['Hola'], ['Rosa, Santa Marta'], ['Paneles para mi casa', 'interes_1'], ['¿lo dan a cuotas?'], ['¿ustedes hacen el trámite con Afinia?']]);
check('Explica la financiación', x.all.includes('cuotas sin intereses'));
check('Explica el trámite con Afinia', x.all.includes('3 a 6 meses'));
check('Sigue con el bot y no pasa a "Pago confirmado"', x.c.botActive && x.c.stage !== 'pago', x.c.stage);

// 4. Ya es cliente: no le pregunta la forma de pago
x = await chat('Posventa', [['Hola'], ['Pedro, El Copey'], ['Ya soy cliente', 'interes_7'], ['tengo dudas con la cuota de este mes']]);
check('Le pregunta el tema antes de pasarlo', x.all.includes('¿Con qué tema te ayudamos'), x.bot);
check('Posventa pasa al asesor sin preguntar contado o financiado', !x.c.botActive && !x.all.includes('contado o financiado'), x.bot);
check('El asesor ve el tema', (x.c.summary ?? '').includes('Busca: tengo dudas con la cuota'), x.c.summary);

// 5. Escribe todo de una: "paneles para mi finca"
x = await chat('Todo en un mensaje', [['Buenos días, necesito paneles para mi finca'], ['Jorge, Aguachica']]);
check('Entiende "finca" sin preguntar qué necesita', x.c.fields.categoria === 'paneles finca' && x.bot.at(-1).includes('recibo'), [x.c.fields, x.bot.at(-1)]);

// 6. Empleo
x = await chat('Empleo', [['Hola'], ['Marta, Valledupar'], ['Empleo o proveedor', 'interes_8'], ['Soy electricista y quiero dejar mi hoja de vida']]);
check('Empleo pasa al equipo con el dato', !x.c.botActive && (x.c.summary ?? '').includes('electricista'), x.c.summary);

console.log(`\n${total - bad}/${total} pruebas OK`);
process.exit(bad ? 1 : 0);
