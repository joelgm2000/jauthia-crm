// TECSOLAR (solo chatbot, plantilla de energía solar) por la API real.
// Uso: sh restart.sh && node solar.mjs
import { randomBytes } from 'node:crypto';

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
const base = { modules: { crm: false, chatbot: true }, plan: { name: 'Chatbot', price: 1, currency: 'COP', billingDay: 5 }, status: 'activo', city: 'Valledupar' };
const r0 = await sup('saveTenant', { tenant: { ...base, name: 'TecSolar QA' }, flowTemplate: 'solar' });
check('Se crea el cliente con la plantilla de energía solar', r0.status === 200, r0.text);
const t = r0.json.result.tenant;
const apw = pw();
await sup('createTenantUser', { tenantId: t.id, name: 'Admin', email: 'admin@tecsolar.test', password: apw, role: 'admin' });
await call('/api/auth/login', { method: 'POST', jar: 'adm', body: { email: 'admin@tecsolar.test', password: apw } });

let boot = (await call('/api/bootstrap', { jar: 'adm' })).json;
check('Queda como "Solo chatbot"', boot.tenant.modules.chatbot && !boot.tenant.modules.crm, boot.tenant.modules);
check('El flujo es el de energía solar', boot.flow?.nodes?.some((n) => n.id === 'recibo') && boot.flow.persona.botName === 'Sol', boot.flow?.nodes?.map((n) => n.id));

// El flujo se puede guardar desde el editor (con el campo "prefill" incluido)
let r = await act('saveFlow', { flow: boot.flow });
check('El editor puede guardar el flujo', r.status === 200, r.text);

const conv = (await act('createTestConversation', { channel: 'whatsapp', name: 'Prueba' })).json.result.conversation;
const say = (text, buttonId) => act('simulateIncoming', { conversationId: conv.id, text, ...(buttonId ? { buttonId } : {}) });
await say('Buenos días, quiero paneles solares para mi finca');
await say('Carlos Pérez, Valledupar');
await say('$300.000 a $600.000', 'gas_2');
await say('el NIC es 49740738');
await say('Financiado', 'pag_cuotas');
boot = (await call('/api/bootstrap', { jar: 'adm' })).json;
const c = boot.conversations.find((x) => x.id === conv.id);
check('Entendió "paneles para mi finca" sin preguntarlo', c.fields.categoria === 'paneles' && c.fields.tipoPropiedad === 'finca', c.fields);
check('Guarda pago de luz, NIC y forma de pago', c.fields.gastoLuz === '$300.000 a $600.000' && c.fields.recibo.includes('49740738') && c.fields.formaPago === 'financiado', c.fields);
check('Pasa al asesor', c.botActive === false, c);
const msgs = (await call(`/api/conversations/${conv.id}/messages`, { jar: 'adm' })).json.messages;
const bot = msgs.filter((m) => m.sender === 'bot').map((m) => m.text);
check('Pide el recibo de luz o el NIC', bot.some((x) => x.includes('recibo de luz')), bot);
check('El asesor ve el resumen con los datos', /Para finca.*Paga de luz.*Recibo: el NIC es 49740738/.test(c.summary ?? ''), c.summary);
console.log('  Resumen para el asesor:', c.summary);
check('Nunca pidió la cédula', !bot.some((x) => /c[eé]dula/i.test(x)));
console.log('\nConversación:');
for (const m of msgs) console.log(`  ${m.sender === 'bot' ? '🤖' : m.type === 'note' ? '📝' : '👤'} ${m.text.replace(/\n/g, ' / ').slice(0, 170)}`);

console.log(`\n${total - bad}/${total} pruebas OK`);
process.exit(bad ? 1 : 0);
