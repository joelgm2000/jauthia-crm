// "No me escriban más" por la API real: el bot confirma, se marca el chat y el servidor bloquea las plantillas.
// Uso: sh restart.sh && node optout.mjs
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
const base = { modules: { crm: true, chatbot: true }, plan: { name: 'P', price: 1, currency: 'COP', billingDay: 5 }, status: 'activo' };
const evo = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport QA' }, flowTemplate: 'evosport' })).json.result.tenant;
const apw = pw();
await sup('createTenantUser', { tenantId: evo.id, name: 'Admin', email: 'admin@evo.test', password: apw, role: 'admin' });
await call('/api/auth/login', { method: 'POST', jar: 'adm', body: { email: 'admin@evo.test', password: apw } });

console.log('Opt-out por la API');
const conv = (await act('createTestConversation', { channel: 'whatsapp', name: 'Ana' })).json.result.conversation;
await act('simulateIncoming', { conversationId: conv.id, text: 'Hola' });
await act('simulateIncoming', { conversationId: conv.id, text: 'Ya no me escriban más, gracias' });
const boot = (await call('/api/bootstrap', { jar: 'adm' })).json;
const c = boot.conversations.find((x) => x.id === conv.id);
check('El chat queda marcado "no contactar"', !!c.optOutAt && c.tags.includes('no-contactar'), c);
const msgs = (await call(`/api/conversations/${conv.id}/messages`, { jar: 'adm' })).json.messages;
check('El bot le confirma que no le escribirán más', msgs.some((m) => m.sender === 'bot' && m.text.includes('no te enviaremos más mensajes')));
check('El asesor ve la nota', msgs.some((m) => m.type === 'note' && m.text.includes('pidió no recibir más mensajes')));
let r = await act('sendMessage', { conversationId: conv.id, draft: { type: 'template', text: 'Promo', templateName: 'promo' } });
check('El servidor bloquea enviarle plantillas (409)', r.status === 409 && r.json.error.includes('pidió no recibir'), r.text);
r = await act('sendMessage', { conversationId: conv.id, draft: { type: 'text', text: 'Entendido, cualquier cosa aquí estamos' } });
check('Responderle un mensaje normal sí se puede (él escribió)', r.status === 200, r.text);
r = await act('editConversation', { conversationId: conv.id, edit: { optOut: false } });
const c2 = (await call('/api/bootstrap', { jar: 'adm' })).json.conversations.find((x) => x.id === conv.id);
check('Si el cliente lo autoriza, el asesor puede quitar el bloqueo', r.status === 200 && !c2.optOutAt && !c2.tags.includes('no-contactar'), c2);

console.log(`\n${total - bad}/${total} pruebas OK`);
process.exit(bad ? 1 : 0);
