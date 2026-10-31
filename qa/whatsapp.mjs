// Asistente de WhatsApp (conexión con Meta en un clic, coexistencia, webhook único, número de prueba) con un Meta FALSO:
//   META_APP_ID=1234567890 META_APP_SECRET=qa_app_secret_123 META_ES_CONFIG_ID=987654321 META_WEBHOOK_VERIFY_TOKEN=qa_verify_token_123 \
//   META_GRAPH_URL=http://localhost:3197/graph sh restart.sh && node whatsapp.mjs
import { createHmac, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const APP_SECRET = 'qa_app_secret_123';
const VERIFY = 'qa_verify_token_123';
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
let admPw = '';
const jars = {};
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(path, { method = 'GET', body, jar, headers = {}, raw } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-CRM-Request': '1', ...headers };
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const sup = (action, data) => call('/api/super/action', { method: 'POST', jar: 'owner', body: { action, data } });
const act = (jar, action, data) => call('/api/action', { method: 'POST', jar, body: { action, data } });
function check(name, pass, got) {
  results.push({ name, pass: !!pass });
  console.log(`  ${pass ? '✔' : '✘'} ${name}${pass ? '' : '  → ' + String(got ?? '').slice(0, 300)}`);
}

// ---------------------------------------------------------------------------
// Meta falso
// ---------------------------------------------------------------------------
const seen = [];
const TOKEN = 'EAAQA' + randomBytes(20).toString('hex');
const PHONES = {
  1020304050607: { id: '2020202020202', display_phone_number: '+57 300 000 0001', verified_name: 'EvoSport', is_on_biz_app: true, platform_type: 'CLOUD_API' },
  3030303030303: { id: '4040404040404', display_phone_number: '+57 300 000 0002', verified_name: 'Otra Empresa', is_on_biz_app: false, platform_type: 'CLOUD_API' },
};
const send = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
const mock = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const path = u.pathname.replace(/^\/graph\//, '');
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ method: req.method, path, query: u.search, auth: req.headers.authorization ?? '', body });
    if (path === 'oauth/access_token') {
      const q = u.searchParams;
      return q.get('client_secret') === APP_SECRET && q.get('code')?.startsWith('codigo-bueno') ? send(res, 200, { access_token: TOKEN }) : send(res, 400, { error: { message: 'Invalid verification code' } });
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: { message: 'bad token', code: 190 } });
    let m;
    if ((m = path.match(/^(\d+)\/phone_numbers$/))) return send(res, 200, { data: PHONES[m[1]] ? [PHONES[m[1]]] : [] });
    if (/^\d+\/subscribed_apps$/.test(path)) return send(res, 200, { success: true });
    if (/^\d+\/smb_app_data$/.test(path)) return send(res, 200, { request_id: 'req_' + body?.sync_type });
    if (/^\d+\/register$/.test(path)) return send(res, 200, { success: true });
    if (/^\d+\/messages$/.test(path)) {
      if (body?.to === '573009999999') return send(res, 400, { error: { message: '(#131030) Recipient phone number not in allowed list', code: 131030 } });
      return send(res, 200, { messages: [{ id: 'wamid.' + randomBytes(6).toString('hex') }] });
    }
    send(res, 404, { error: { message: 'not found' } });
  });
});
await new Promise((r) => mock.listen(3197, r));

// Webhook firmado como lo firma Meta (con la clave secreta de la app de la plataforma).
const hook = (payload, secret = APP_SECRET) => {
  const raw = JSON.stringify(payload);
  const sig = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  return call('/webhooks/whatsapp', { method: 'POST', raw, headers: { 'X-Hub-Signature-256': sig } });
};
const change = (field, value, wabaId = '1020304050607') => ({ object: 'whatsapp_business_account', entry: [{ id: wabaId, changes: [{ field, value }] }] });
const meta222 = { display_phone_number: '573000000001', phone_number_id: '2020202020202' };

// ---------------------------------------------------------------------------
console.log('\nPreparación');
await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: pw() } });
const base = { modules: { crm: true, chatbot: true }, plan: { name: 'Plan', price: 0, currency: 'COP', billingDay: 5 }, status: 'activo' };
const evo = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport' }, flowTemplate: 'evosport', sampleCatalog: true })).json.result.tenant;
const otra = (await sup('saveTenant', { tenant: { ...base, name: 'Otra Empresa' } })).json.result.tenant;
const prueba = (await sup('saveTenant', { tenant: { ...base, name: 'Prueba' } })).json.result.tenant;
for (const [jar, tenantId, role] of [['adm', evo.id, 'admin'], ['ase', evo.id, 'asesor'], ['otra', otra.id, 'admin'], ['prueba', prueba.id, 'admin']]) {
  const p = pw();
  await sup('createTenantUser', { tenantId, name: `Usuario ${jar}`, email: `${jar}@wa.test`, password: p, role });
  await call('/api/auth/login', { method: 'POST', jar, body: { email: `${jar}@wa.test`, password: p } });
  if (jar === 'adm') admPw = p;
}

console.log('\nAsistente: conexión con un clic');
const setup = await call('/api/channels/whatsapp/setup', { jar: 'adm' });
check('La plataforma tiene lista la conexión con Meta (id de la app y configuración)', setup.json?.ready === true && setup.json.appId === '1234567890' && setup.json.configId === '987654321', setup.text);
check('No expone la clave secreta de la app', !setup.text.includes(APP_SECRET));
check('Un asesor no puede conectar WhatsApp (403)', (await call('/api/channels/whatsapp/setup', { jar: 'ase' })).status === 403);
check('Datos incompletos de Meta: 400', (await call('/api/channels/whatsapp/connect', { method: 'POST', jar: 'adm', body: { code: 'codigo-bueno-1' } })).status === 400);
check('Código vencido o falso: 502 con mensaje claro', (await call('/api/channels/whatsapp/connect', { method: 'POST', jar: 'adm', body: { code: 'codigo-malo-123', wabaId: '1020304050607' } })).json?.error?.includes('Vuelve a tocar'));

const c1 = await call('/api/channels/whatsapp/connect', { method: 'POST', jar: 'adm', body: { code: 'codigo-bueno-evo', wabaId: '1020304050607', appOnboarding: true } });
check('Conecta el número de la app de WhatsApp Business (coexistencia)', c1.status === 200 && c1.json.coexistence === true && c1.json.channel.phoneNumberId === '2020202020202' && c1.json.channel.connectionMode === 'meta' && c1.json.channel.connected, c1.text);
check('Pide a Meta los contactos y el historial (una vez cada uno)', c1.json?.sync?.contacts && c1.json.sync.history && seen.filter((x) => x.path === '2020202020202/smb_app_data').map((x) => x.body.sync_type).join() === 'smb_app_state_sync,history');
check('Con coexistencia NO registra el número (sigue en la app)', !seen.some((x) => x.path === '2020202020202/register'));
check('Conecta los mensajes de esa cuenta al webhook de la plataforma', seen.some((x) => x.path === '1020304050607/subscribed_apps' && x.method === 'POST'));
check('El canje del código usa la clave secreta solo en el servidor', seen.some((x) => x.path === 'oauth/access_token') && !c1.text.includes(TOKEN));
const boot = await call('/api/bootstrap', { jar: 'adm' });
check('El token queda cifrado (el navegador solo ve "guardado ••••")', boot.json?.secrets?.whatsapp?.accessToken?.startsWith('••••') && !boot.text.includes(TOKEN));
check('El canal aparece conectado en la bandeja', boot.json?.channels?.find((x) => x.id === 'whatsapp')?.coexistence === true);
check('Otra empresa no puede conectar el mismo número (409)', (await call('/api/channels/whatsapp/connect', { method: 'POST', jar: 'otra', body: { code: 'codigo-bueno-otra', wabaId: '1020304050607' } })).status === 409);

const c2 = await call('/api/channels/whatsapp/connect', { method: 'POST', jar: 'otra', body: { code: 'codigo-bueno-otra2', wabaId: '3030303030303' } });
const reg = seen.find((x) => x.path === '4040404040404/register');
check('Número nuevo (sin app): lo registra en la API con un PIN de 6 dígitos', c2.status === 200 && c2.json.coexistence === false && /^\d{6}$/.test(reg?.body?.pin ?? ''), c2.text);
const boot2 = await call('/api/bootstrap', { jar: 'otra' });
check('El PIN nunca se muestra (ni en parte)', !JSON.stringify(boot2.json?.secrets ?? {}).includes('pin') && !boot2.text.includes(reg?.body?.pin));

console.log('\nWebhook único de la plataforma');
const v1 = await call(`/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=12345`);
check('Meta verifica el webhook con el token de la plataforma', v1.status === 200 && v1.text === '12345');
check('Token de verificación equivocado: 403', (await call('/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1')).status === 403);
check('Mensaje sin firma de Meta: 401', (await call('/webhooks/whatsapp', { method: 'POST', body: change('messages', {}) })).status === 401);
check('Firma falsa: 401', (await hook(change('messages', {}), 'otra_clave')).status === 401);
const inbound = change('messages', { messaging_product: 'whatsapp', metadata: meta222, contacts: [{ wa_id: '573001112233', profile: { name: 'Carlos' } }], messages: [{ from: '573001112233', id: 'wamid.in1', timestamp: '1793000000', type: 'text', text: { body: 'Hola, tienen caminadoras?' } }] });
check('Mensaje firmado: aceptado', (await hook(inbound)).status === 200);
await sleep(800);
const convs = async (jar) => (await call('/api/bootstrap', { jar })).json.conversations;
let carlos = (await convs('adm')).find((c) => c.externalId === '573001112233');
check('Llega a la empresa dueña del número (EvoSport) y el bot responde', !!carlos && carlos.name === 'Carlos' && carlos.botActive === true && carlos.stage !== 'nuevo', JSON.stringify(carlos)?.slice(0, 200));
check('No le llega a la otra empresa', !(await convs('otra')).some((c) => c.externalId === '573001112233'));
check('Número que no es de ningún cliente: se ignora sin error', (await hook(change('messages', { metadata: { phone_number_id: '9090909090909' }, messages: [{ from: '1', id: 'x', type: 'text', text: { body: 'x' } }] }))).status === 200);

console.log('\nCoexistencia: lo que pasa en el celular');
const sentBefore = seen.filter((x) => x.path === '2020202020202/messages').length;
await hook(change('smb_message_echoes', { messaging_product: 'whatsapp', metadata: meta222, message_echoes: [{ from: '573000000001', to: '573001112233', id: 'wamid.echo1', timestamp: '1793000100', type: 'text', text: { body: 'Hola Carlos, te atiendo yo 😊' } }] }));
await sleep(800);
const msgs = async (jar, id) => (await call(`/api/conversations/${id}/messages`, { jar })).json.messages;
let m1 = await msgs('adm', carlos.id);
const echo = m1.find((x) => x.text === 'Hola Carlos, te atiendo yo 😊');
check('Lo que el negocio responde desde el celular aparece en la bandeja', echo?.direction === 'out' && echo.sender === 'asesor' && echo.authorName === 'Desde el celular', JSON.stringify(echo));
check('…y no se vuelve a enviar (ya salió del celular)', echo?.status === 'sent' && seen.filter((x) => x.path === '2020202020202/messages').length === sentBefore);
carlos = (await convs('adm')).find((c) => c.id === carlos.id);
check('El bot se pausa en ese chat para no interrumpir al dueño', carlos.botActive === false && m1.some((x) => x.type === 'note' && /celular/.test(x.text)));
await hook(change('smb_message_echoes', { metadata: meta222, message_echoes: [{ to: '573001112233', id: 'wamid.echo1', timestamp: '1793000100', type: 'text', text: { body: 'Hola Carlos, te atiendo yo 😊' } }] }));
await sleep(400);
check('El mismo eco repetido por Meta no se duplica', (await msgs('adm', carlos.id)).filter((x) => x.text === 'Hola Carlos, te atiendo yo 😊').length === 1);

const history = change('history', { messaging_product: 'whatsapp', metadata: meta222, history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: '573004445566', messages: [
  { from: '573004445566', id: 'wamid.h1', timestamp: '1780000000', type: 'text', text: { body: '¿Me envían la cotización?' } },
  { from: '573000000001', id: 'wamid.h2', timestamp: '1780000300', type: 'text', text: { body: 'Claro, ya te la envío' } },
  { from: '573004445566', id: 'wamid.h3', timestamp: '1780000600', type: 'image' },
] }] }] });
await hook(history);
await sleep(800);
const old = (await convs('adm')).find((c) => c.externalId === '573004445566');
const hm = old ? await msgs('adm', old.id) : [];
check('Trae el historial de chats de la app (cliente y negocio)', hm.length === 3 && hm[0].direction === 'in' && hm[1].direction === 'out' && hm[2].text === '[image]', JSON.stringify(hm.map((x) => [x.direction, x.text])));
check('Los chats del historial no despiertan al bot (los atiende el negocio)', old?.botActive === false && !hm.some((x) => x.sender === 'bot'));
await hook(history);
await sleep(400);
check('El historial repetido no se duplica', (await msgs('adm', old.id)).length === 3);

await hook(change('smb_app_state_sync', { messaging_product: 'whatsapp', metadata: meta222, state_sync: [{ type: 'contact', contact: { full_name: 'Doña Marta Pérez', phone_number: '573004445566' }, action: 'add' }] }));
await sleep(400);
check('Usa el nombre del contacto guardado en el celular', (await convs('adm')).find((c) => c.externalId === '573004445566')?.name === 'Doña Marta Pérez');

await hook(change('account_update', { phone_number: '573000000001', event: 'PRIMARY_INACTIVITY' }));
await sleep(400);
const wa = (await call('/api/bootstrap', { jar: 'adm' })).json.channels.find((x) => x.id === 'whatsapp');
check('Si Meta desconecta el número (14 días sin abrir la app), Canales lo avisa', wa?.connected === false && /14 días/.test(wa.metaNotice?.text ?? ''), JSON.stringify(wa));

console.log('\nModo prueba (número de prueba de Meta)');
await act('prueba', 'saveChannel', { channel: { id: 'whatsapp', enabled: true, connected: false, botEnabled: true, phoneNumberId: '5050505050505', connectionMode: 'test' } });
await act('prueba', 'saveChannelSecrets', { channel: 'whatsapp', secrets: { accessToken: TOKEN, pin: '000000' } });
check('El cliente no puede escribir el PIN por su cuenta', !JSON.stringify((await call('/api/bootstrap', { jar: 'prueba' })).json.secrets).includes('pin'));
const t1 = await call('/api/channels/whatsapp/test', { method: 'POST', jar: 'prueba', body: { to: '+57 300 123 4567' } });
const tsent = seen.filter((x) => x.path === '5050505050505/messages').at(-1);
check('Envía el mensaje de prueba (plantilla hello_world) al número escrito', t1.status === 200 && tsent?.body?.to === '573001234567' && tsent.body.template?.name === 'hello_world', t1.text);
const t2 = await call('/api/channels/whatsapp/test', { method: 'POST', jar: 'prueba', body: { to: '57 300 999 9999' } });
check('Si el celular no está en la lista de prueba de Meta, lo explica', t2.status === 502 && /destinatario en Meta/.test(t2.json?.error ?? ''), t2.text);
check('Número mal escrito: 400', (await call('/api/channels/whatsapp/test', { method: 'POST', jar: 'prueba', body: { to: '123' } })).status === 400);
check('Modo prueba se guarda como tal', (await call('/api/bootstrap', { jar: 'prueba' })).json.channels.find((x) => x.id === 'whatsapp')?.connectionMode === 'test');

mock.close();
const ok = results.filter((r) => r.pass).length;
console.log(`\n${ok}/${results.length} pruebas OK`);
writeFileSync(new URL('./results/whatsapp.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ok, total: results.length, results }, null, 2));
writeFileSync(new URL('./.qa-demo.json', import.meta.url), JSON.stringify({ tenant: evo.id, email: 'adm@wa.test', password: admPw }));
process.exit(ok === results.length ? 0 : 1);
