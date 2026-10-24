// Pruebas de seguridad contra la instancia AISLADA de QA (http://localhost:3100, modo producción).
// Uso: node security.mjs <etiqueta>   → escribe results/security-<etiqueta>.json
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/backend/package.json');
const reqFront = createRequire('C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/frontend/package.json');
const pg = req('pg');
const jwt = req('jsonwebtoken');
const { io } = reqFront('socket.io-client');

const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const label = process.argv[2] ?? 'run';
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
const jars = {};
const results = [];
let cat = '';
let ipSeq = 1;
// Cada grupo de pruebas sale con una IP distinta (X-Forwarded-For) solo si el servidor confía en el proxy.
const section = (name) => { cat = name; console.log('\n' + name); };

async function call(path, { method = 'GET', body, jar, csrf = true, headers = {}, raw = false } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (csrf) h['X-CRM-Request'] = '1';
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers, setCookie: set };
}
const act = (jar, action, data) => call('/api/action', { method: 'POST', jar, body: { action, data } });
const sup = (jar, action, data) => call('/api/super/action', { method: 'POST', jar, body: { action, data } });
function check(id, name, attack, expected, pass, got) {
  results.push({ id, category: cat, name, attack, expected, got: String(got ?? ''), pass: !!pass });
  console.log(`  ${pass ? '✔' : '✘'} ${id} ${name}${pass ? '' : '  → ' + got}`);
}
const sign = (secret, body) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

// ---------------------------------------------------------------------------
section('Preparación');
const ownerPw = pw(), adminPw = pw(), asesorPw = pw(), otherPw = pw(), sa2Pw = pw();
let r = await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: ownerPw } });
if (r.status !== 200) { console.log('setup falló', r.status, r.text); process.exit(1); }
const base = { modules: { crm: true, chatbot: true }, plan: { name: 'Completo', price: 300000, currency: 'COP', billingDay: 5 }, status: 'activo' };
const evo = (await sup('owner', 'saveTenant', { tenant: { ...base, name: 'EvoSport QA', city: 'Valledupar' }, flowTemplate: 'evosport', sampleCatalog: true })).json.result.tenant;
const pan = (await sup('owner', 'saveTenant', { tenant: { ...base, name: 'Panaderia QA' }, flowTemplate: 'generico' })).json.result.tenant;
await sup('owner', 'createTenantUser', { tenantId: evo.id, name: 'Admin Evo', email: 'admin@evo.test', password: adminPw, role: 'admin' });
await sup('owner', 'createTenantUser', { tenantId: evo.id, name: 'Asesora Evo', email: 'asesora@evo.test', password: asesorPw, role: 'asesor' });
await sup('owner', 'createTenantUser', { tenantId: pan.id, name: 'Admin Pan', email: 'admin@pan.test', password: otherPw, role: 'admin' });
await sup('owner', 'createSuperadmin', { name: 'Soporte', email: 'soporte@jauthia.test', password: sa2Pw });
const login = (jar, email, password, headers) => call('/api/auth/login', { method: 'POST', jar, body: { email, password }, headers });
await login('evo', 'admin@evo.test', adminPw);
await login('ase', 'asesora@evo.test', asesorPw);
await login('pan', 'admin@pan.test', otherPw);
await login('sa2', 'soporte@jauthia.test', sa2Pw);
const APP_SECRET = randomBytes(24).toString('hex');
const VERIFY = randomBytes(12).toString('hex');
const FAKE_TOKEN = 'EAAG' + randomBytes(30).toString('hex');
const TG_SECRET = randomBytes(16).toString('hex');
await act('evo', 'saveChannelSecrets', { channel: 'whatsapp', secrets: { accessToken: FAKE_TOKEN, appSecret: APP_SECRET, verifyToken: VERIFY } });
// Quitamos el token de acceso: así ningún mensaje de prueba sale hacia Meta.
await act('evo', 'saveChannelSecrets', { channel: 'whatsapp', secrets: { accessToken: '' } });
await act('evo', 'saveChannelSecrets', { channel: 'telegram', secrets: { webhookSecret: TG_SECRET } });
console.log('  clientes', evo.id, pan.id);

// ---------------------------------------------------------------------------
section('1. Autenticación y sesiones');
r = await call('/api/bootstrap');
check('A01', 'API sin sesión', 'GET /api/bootstrap sin cookie', '401', r.status === 401, r.status);
r = await call('/api/action', { method: 'POST', jar: 'evo', csrf: false, body: { action: 'addNote', data: {} } });
check('A02', 'Protección CSRF', 'POST sin encabezado X-CRM-Request (como haría un sitio malicioso)', '403', r.status === 403, r.status);
const evoCookie = jars.evo;
const forged = jwt.sign({ sub: 'u_x', v: 0 }, 'clave-adivinada-por-el-atacante', { algorithm: 'HS256' });
r = await call('/api/bootstrap', { headers: { Cookie: 'crm_session=' + forged } });
check('A03', 'Token falsificado', 'Cookie JWT firmada con otra clave', '401', r.status === 401, r.status);
const parts = evoCookie.split('=')[1].split('.');
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ ...payload })).toString('base64url') + '.';
r = await call('/api/bootstrap', { headers: { Cookie: 'crm_session=' + none } });
check('A04', 'Token sin firma (alg: none)', 'JWT con algoritmo "none"', '401', r.status === 401, r.status);
const tampered = parts[0] + '.' + Buffer.from(JSON.stringify({ ...payload, t: pan.id })).toString('base64url') + '.' + parts[2];
r = await call('/api/bootstrap', { headers: { Cookie: 'crm_session=' + tampered } });
check('A05', 'Token alterado', 'Cambiar el cliente dentro del token sin volver a firmarlo', '401', r.status === 401, r.status);
const r1 = await login(null, 'admin@evo.test', 'ContraseñaIncorrecta1');
const r2 = await login(null, 'noexiste@evo.test', 'ContraseñaIncorrecta1');
check('A06', 'No revela qué correos existen', 'Login con correo real vs inexistente', 'Mismo 401 y mismo mensaje', r1.status === 401 && r2.status === 401 && r1.json?.error === r2.json?.error, `${r1.status}/${r2.status}`);
r = await call('/api/auth/login', { method: 'POST', body: { email: 'admin@evo.test', password: adminPw } });
const sc = r.setCookie ?? '';
check('A07', 'Cookie de sesión protegida', 'Revisar atributos de la cookie', 'HttpOnly; Secure; SameSite=Lax', /HttpOnly/i.test(sc) && /Secure/i.test(sc) && /SameSite=Lax/i.test(sc), sc.replace(/crm_session=[^;]+/, 'crm_session=…'));
await login('tmp', 'asesora@evo.test', asesorPw);
const oldTmp = jars.tmp;
await call('/api/auth/logout', { method: 'POST', jar: 'tmp' });
r = await call('/api/bootstrap', { headers: { Cookie: oldTmp } });
check('A08', 'Cerrar sesión invalida el token', 'Reusar la cookie después de cerrar sesión', '401', r.status === 401, r.status);
await login('ase', 'asesora@evo.test', asesorPw);
r = await call('/api/auth/setup', { method: 'POST', body: { name: 'Hacker', email: 'hacker@evil.test', password: pw() } });
check('A09', 'No se puede crear otro dueño', 'POST /api/auth/setup con otro correo', '403/409', [403, 409].includes(r.status), r.status);
r = await sup('owner', 'createTenantUser', { tenantId: evo.id, name: 'Débil', email: 'debil@evo.test', password: '123456', role: 'asesor' });
check('A10', 'Contraseñas débiles rechazadas', 'Crear usuario con contraseña "123456"', '400', r.status === 400, r.status);
let acct = [];
for (let i = 0; i < 11; i++) acct.push((await login(null, 'objetivo@evo.test', 'adivina' + i + 'xxxxx', { 'X-Forwarded-For': `100.64.${i}.${i + 1}` })).status);
check('A13', 'Bloqueo por cuenta (ataque distribuido)', '11 intentos contra el mismo correo desde 11 IPs distintas', '429 tras 10 intentos', acct[10] === 429 && acct[9] === 401, acct.slice(8).join(','));
let lastStatus = 0;
for (let i = 0; i < 22; i++) lastStatus = (await login(null, 'admin@evo.test', 'mal' + i + 'xxxxxxx')).status;
check('A11', 'Bloqueo por fuerza bruta', '22 intentos de contraseña desde la misma IP', '429 tras 20 intentos', lastStatus === 429, lastStatus);
r = await login(null, 'admin@evo.test', 'malxxxxxxxx', { 'X-Forwarded-For': `203.0.113.${ipSeq++}` });
check('A12', 'El bloqueo no se evade falsificando la IP', 'Mismo ataque con encabezado X-Forwarded-For inventado', '429', r.status === 429, r.status);

// ---------------------------------------------------------------------------
section('2. Roles y permisos');
r = await act('ase', 'saveChannelSecrets', { channel: 'whatsapp', secrets: { accessToken: 'robado' } });
check('R01', 'Asesor no cambia tokens de canales', 'Asesor llama saveChannelSecrets', '403', r.status === 403, r.status);
r = await act('ase', 'createUser', { name: 'Intruso', email: 'intruso@evo.test', password: pw(), role: 'admin' });
check('R02', 'Asesor no crea usuarios', 'Asesor intenta crearse un admin', '403', r.status === 403, r.status);
r = await sup('evo', 'listTenants', {});
check('R03', 'Admin de cliente no entra al panel de plataforma', 'Admin llama /api/super/action', '403', r.status === 403, r.status);
r = await sup('sa2', 'createSuperadmin', { name: 'Otro', email: 'otro@jauthia.test', password: pw() });
check('R04', 'Solo el dueño nombra super administradores', 'Un super admin que no es el dueño intenta crear otro', '403', r.status === 403, r.status);
r = await act('evo', 'createUser', { name: 'Escala', email: 'escala@evo.test', password: pw(), role: 'superadmin' });
check('R05', 'Admin no puede crear super administradores', 'createUser con role "superadmin"', '400', r.status === 400, r.status);
const panUsers = (await sup('owner', 'listTenantUsers', { tenantId: pan.id })).json.result.users;
r = await act('evo', 'updateUser', { id: panUsers[0].id, password: pw() });
check('R06', 'Admin no toca usuarios de otro cliente', 'Admin de EvoSport cambia la clave del admin de Panadería', '404', r.status === 404, r.status);
r = await act('ase', 'updateUser', { id: 'x', role: 'admin' });
check('R07', 'Asesor no se sube de rol', 'Asesor llama updateUser role=admin', '403', r.status === 403, r.status);

// ---------------------------------------------------------------------------
section('3. Aislamiento entre clientes (multi-empresa)');
r = await act('evo', 'createTestConversation', { channel: 'whatsapp', name: 'Cliente secreto' });
const cid = r.json.result.conversation.id;
await act('evo', 'simulateIncoming', { conversationId: cid, text: 'Quiero comprar una caminadora' });
r = await call(`/api/conversations/${cid}/messages`, { jar: 'pan' });
check('I01', 'Otro cliente no lee conversaciones ajenas', 'Panadería pide los mensajes de un chat de EvoSport', 'Lista vacía', (r.json?.messages ?? []).length === 0, `${(r.json?.messages ?? []).length} mensajes`);
r = await act('pan', 'addNote', { conversationId: cid, text: 'hola' });
check('I02', 'Otro cliente no escribe en conversaciones ajenas', 'Panadería agrega una nota al chat de EvoSport', '404', r.status === 404, r.status);
r = await act('pan', 'setStage', { conversationId: cid, stage: 'ganado' });
check('I03', 'Otro cliente no mueve leads ajenos', 'Panadería mueve el lead de EvoSport a Ganado', '404', r.status === 404, r.status);
const bp = (await call('/api/bootstrap', { jar: 'pan' })).json;
check('I04', 'Datos de arranque solo del propio cliente', 'Bootstrap de Panadería', '0 productos y 0 chats de EvoSport', bp.products.length === 0 && !bp.conversations.some((c) => c.id === cid), `${bp.products.length} productos`);
const sockA = io(B, { path: '/socket.io', transports: ['websocket'], extraHeaders: { Cookie: jars.evo } });
const sockB = io(B, { path: '/socket.io', transports: ['websocket'], extraHeaders: { Cookie: jars.pan } });
const sockX = io(B, { path: '/socket.io', transports: ['websocket'], reconnection: false });
const gotA = [], gotB = [];
sockA.onAny((e) => gotA.push(e));
sockB.onAny((e) => gotB.push(e));
const xErr = await new Promise((res) => { sockX.on('connect_error', (e) => res(e.message)); sockX.on('connect', () => res('connected')); setTimeout(() => res('timeout'), 4000); });
check('I05', 'Tiempo real exige sesión', 'Conectar al socket sin cookie', 'Rechazado', xErr !== 'connected', xErr);
await new Promise((res) => setTimeout(res, 800));
await act('evo', 'simulateIncoming', { conversationId: cid, text: 'hola' });
await new Promise((res) => setTimeout(res, 1200));
check('I06', 'Tiempo real separado por cliente', 'Evento de EvoSport con un usuario de Panadería conectado', 'Solo EvoSport lo recibe', gotA.length > 0 && gotB.length === 0, `EvoSport ${gotA.length} / Panadería ${gotB.length}`);
sockA.close(); sockB.close(); sockX.close();

// ---------------------------------------------------------------------------
section('4. Tokens y datos sensibles');
const be = (await call('/api/bootstrap', { jar: 'evo' }));
check('S01', 'Tokens nunca llegan al navegador', 'Buscar el appSecret/verifyToken en la respuesta del CRM', 'No aparecen', !be.text.includes(APP_SECRET) && !be.text.includes(VERIFY), be.text.includes(APP_SECRET) ? 'filtrado' : 'enmascarado');
const db = new pg.Client({ connectionString: 'postgresql://crm:qa_test_only@localhost:5544/crm_qa' });
await db.connect();
const raw = JSON.stringify((await db.query('SELECT * FROM channel_secrets')).rows);
check('S02', 'Tokens cifrados en la base de datos', 'Leer la tabla channel_secrets directamente', 'Solo texto cifrado AES-256-GCM', raw.length > 20 && !raw.includes(APP_SECRET) && !raw.includes(VERIFY), raw.includes(APP_SECRET) ? 'en claro' : 'cifrado');
const hashes = (await db.query('SELECT password_hash FROM users')).rows.map((x) => x.password_hash);
check('S03', 'Contraseñas con hash bcrypt', 'Leer la tabla users', 'Hash $2 (bcrypt costo 12), nunca texto', hashes.every((h) => /^\$2[aby]\$12\$/.test(h)), hashes[0]?.slice(0, 7) + '…');
r = await call('/api/action', { method: 'POST', jar: 'evo', body: '{"action": "addNote", "data": {', headers: {} });
check('S04', 'Errores sin detalles internos', 'Enviar JSON roto', '400 sin rastro del código', r.status === 400 && !/at |node_modules|\.ts:/.test(r.text), `${r.status} ${r.text.slice(0, 60)}`);

// ---------------------------------------------------------------------------
section('5. Webhooks de WhatsApp, Telegram y chat web');
const waBody = (id, text, from = '573001112233') => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'QA' } }], messages: [{ from, id, type: 'text', text: { body: text } }] } }] }] });
let body = waBody('wamid.sec1', 'hola');
r = await call(`/webhooks/${evo.id}/whatsapp`, { method: 'POST', csrf: false, body });
check('W01', 'WhatsApp sin firma rechazado', 'Mensaje falso sin X-Hub-Signature-256', '401', r.status === 401, r.status);
r = await call(`/webhooks/${evo.id}/whatsapp`, { method: 'POST', csrf: false, body, headers: { 'X-Hub-Signature-256': sign('otra-clave', body) } });
check('W02', 'WhatsApp con firma falsa rechazado', 'Firma calculada con otra clave', '401', r.status === 401, r.status);
r = await call(`/webhooks/${evo.id}/whatsapp`, { method: 'POST', csrf: false, body, headers: { 'X-Hub-Signature-256': sign(APP_SECRET, body) } });
check('W03', 'WhatsApp con firma válida aceptado', 'Mensaje firmado con la clave de la app del cliente', '200', r.status === 200, r.status);
await call(`/webhooks/${evo.id}/whatsapp`, { method: 'POST', csrf: false, body, headers: { 'X-Hub-Signature-256': sign(APP_SECRET, body) } });
await new Promise((res) => setTimeout(res, 800));
const dup = (await db.query(`SELECT count(*)::int n FROM messages WHERE tenant_id = $1 AND id = 'in_wamidsec1'`, [evo.id])).rows[0].n;
check('W04', 'Reintentos de Meta no duplican mensajes', 'Mismo mensaje enviado 2 veces', '1 mensaje guardado', dup === 1, dup);
body = waBody('wamid.sec2', 'hola');
r = await call(`/webhooks/${pan.id}/whatsapp`, { method: 'POST', csrf: false, body, headers: { 'X-Hub-Signature-256': sign(APP_SECRET, body) } });
check('W05', 'Firma de un cliente no sirve en otro', 'Mensaje firmado con la clave de EvoSport enviado a Panadería', '401', r.status === 401, r.status);
r = await call(`/webhooks/${evo.id}/whatsapp?hub.mode=subscribe&hub.verify_token=adivinado&hub.challenge=123`, { csrf: false });
check('W06', 'Verificación de webhook con token errado', 'GET con hub.verify_token incorrecto', '403', r.status === 403, r.status);
r = await call(`/webhooks/${evo.id}/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=987`, { csrf: false });
check('W07', 'Verificación de webhook correcta', 'GET con el token del cliente', '200 y eco del challenge', r.status === 200 && r.text === '987', `${r.status} ${r.text}`);
r = await call(`/webhooks/${evo.id}/telegram`, { method: 'POST', csrf: false, body: { message: { chat: { id: 1 }, message_id: 1, text: 'hola' } } });
check('W08', 'Telegram sin token secreto rechazado', 'POST sin X-Telegram-Bot-Api-Secret-Token', '401', r.status === 401, r.status);
r = await call(`/webhooks/..%2F..%2Fetc/whatsapp`, { method: 'POST', csrf: false, body: '{}' });
check('W09', 'Cliente inexistente / ruta manipulada', 'Webhook con id "../../etc"', '404', r.status === 404, r.status);
r = await call(`/webhooks/${evo.id}/webchat`, { method: 'POST', csrf: false, body: { sessionId: 'corto', text: 'hola' } });
check('W10', 'Chat web valida la sesión', 'sessionId inválido', '400', r.status === 400, r.status);
r = await call(`/webhooks/${evo.id}/webchat/${'a'.repeat(20)}/messages`, { csrf: false, headers: { Origin: 'https://sitio-del-cliente.test' } });
check('W11', 'Chat web sin cookies entre dominios', 'CORS del widget', 'Allow-Origin sin credenciales', !r.headers.get('access-control-allow-credentials'), r.headers.get('access-control-allow-origin'));
let spam = 0;
const sid = 'spam' + randomBytes(10).toString('hex');
for (let i = 0; i < 25; i++) spam = (await call(`/webhooks/${evo.id}/webchat`, { method: 'POST', csrf: false, body: { sessionId: sid, text: 'spam ' + i } })).status;
check('W12', 'Anti-spam en el chat web', '25 mensajes en un minuto desde la misma IP', '429', spam === 429, spam);
r = await call(`/webhooks/${evo.id}/webchat`, { method: 'POST', csrf: false, body: { sessionId: sid, text: 'spam' }, headers: { 'X-Forwarded-For': `198.51.100.${ipSeq++}` } });
check('W13', 'Anti-spam no se evade falsificando la IP', 'Mismo spam con X-Forwarded-For inventado', '429', r.status === 429, r.status);

{
  const fb = waBody('wamid.flood', 'flood');
  const codes = [];
  for (let k = 0; k < 31; k++) codes.push(...await Promise.all(Array.from({ length: 100 }, () => fetch(`${B}/webhooks/${evo.id}/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign('falsa', fb) }, body: fb }).then((x) => x.status))));
  const okBody = waBody('wamid.afterflood', 'hola');
  const after = (await call(`/webhooks/${evo.id}/whatsapp`, { method: 'POST', csrf: false, body: okBody, headers: { 'X-Hub-Signature-256': sign(APP_SECRET, okBody) } })).status;
  check('W14', 'Inundación de webhooks falsos se bloquea', '3.100 webhooks con firma falsa en segundos', '429 tras 3.000 rechazos', codes.includes(429) && codes.filter((c) => c === 401).length <= 3000, `${codes.filter((c) => c === 401).length}×401, ${codes.filter((c) => c === 429).length}×429 (mensaje legítimo después: ${after})`);
}

// ---------------------------------------------------------------------------
section('6. Inyección y datos maliciosos');
r = await login(null, "' OR '1'='1' --@x.co", "' OR '1'='1");
check('J01', 'Inyección SQL en el login', `Correo ' OR '1'='1' --`, '400/401/429, sin acceso', [400, 401, 429].includes(r.status) && !r.setCookie, r.status);
r = await call(`/api/conversations/${encodeURIComponent("x' OR '1'='1")}/messages`, { jar: 'evo' });
check('J02', 'Inyección SQL en la URL', "id de conversación x' OR '1'='1", '400', r.status === 400, r.status);
const evil = "Robert'); DROP TABLE messages;-- <script>alert('xss')</script><img src=x onerror=alert(1)>";
await act('evo', 'simulateIncoming', { conversationId: cid, text: evil });
const stored = (await call(`/api/conversations/${cid}/messages`, { jar: 'evo' })).json.messages;
const tables = (await db.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_name = 'messages'`)).rows[0].n;
check('J03', 'Texto malicioso se guarda como texto', 'Mensaje con DROP TABLE + <script> + onerror', 'Guardado literal, tablas intactas', tables === 1 && stored.some((m) => m.text === evil), tables === 1 ? 'tablas intactas' : 'tabla borrada');
r = await call('/api/action', { method: 'POST', jar: 'evo', body: { action: '__proto__', data: {} } });
const r3 = await call('/api/action', { method: 'POST', jar: 'evo', body: { action: 'constructor', data: {} } });
check('J04', 'Acciones inventadas / prototype pollution', 'action "__proto__" y "constructor"', '400', r.status === 400 && r3.status === 400, `${r.status}/${r3.status}`);
r = await act('evo', 'saveProduct', { product: { id: 'p1', name: 'X', price: 'gratis', admin: true } });
check('J05', 'Validación estricta de datos', 'Producto con precio de texto y campos extra', '400', r.status === 400, r.status);
r = await act('evo', 'saveProduct', { product: { id: 'px', name: 'Phish', category: 'cardio', subcategory: 't', keywords: [], imageUrl: 'javascript:alert(1)', price: 1, availability: 'tienda', description: '', specs: [], active: true } });
check('J06', 'URLs peligrosas rechazadas', 'Imagen de producto "javascript:alert(1)"', '400', r.status === 400, r.status);
r = await call('/api/action', { method: 'POST', jar: 'evo', body: JSON.stringify({ action: 'addNote', data: { conversationId: cid, text: 'x'.repeat(1_200_000) } }) });
check('J07', 'Cuerpos gigantes rechazados', 'Petición de 1,2 MB', '413', r.status === 413, r.status);
r = await call('/products/..%2F..%2F..%2Fbackend%2F.env', { csrf: false });
const r4 = await call('/products/../../backend/.env', { csrf: false });
check('J08', 'Sin acceso a archivos del servidor', 'Path traversal hacia backend/.env', 'Sin contenido del .env', !/JWT_SECRET|SECRETS_KEY/.test(r.text + r4.text), `${r.status}/${r4.status}`);
await db.end();

// ---------------------------------------------------------------------------
section('7. Encabezados HTTP y CORS');
r = await call('/', { csrf: false });
const hd = r.headers;
check('H01', 'Política de contenido (CSP)', 'Encabezado Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'", /default-src 'self'/.test(hd.get('content-security-policy') ?? '') && /frame-ancestors 'none'/.test(hd.get('content-security-policy') ?? ''), (hd.get('content-security-policy') ?? '').slice(0, 50));
check('H02', 'Anti clickjacking y sniffing', 'X-Frame-Options / X-Content-Type-Options', 'SAMEORIGIN / nosniff', !!hd.get('x-frame-options') && hd.get('x-content-type-options') === 'nosniff', `${hd.get('x-frame-options')} / ${hd.get('x-content-type-options')}`);
check('H03', 'No revela la tecnología', 'Encabezado X-Powered-By', 'Ausente', !hd.get('x-powered-by'), hd.get('x-powered-by') ?? 'ausente');
r = await call('/api/auth/status', { headers: { Origin: 'https://sitio-malicioso.test' } });
check('H04', 'CORS cerrado para otros sitios', 'Petición a la API desde https://sitio-malicioso.test', 'Sin Access-Control-Allow-Origin', !r.headers.get('access-control-allow-origin'), r.headers.get('access-control-allow-origin') ?? 'ausente');

// ---------------------------------------------------------------------------
section('8. Suspensión por falta de pago');
await sup('owner', 'saveTenant', { tenant: { ...pan, status: 'suspendido' } });
r = await call('/api/bootstrap', { jar: 'pan' });
check('P01', 'Sesión abierta se corta al suspender', 'Usuario de Panadería con sesión activa', '401', r.status === 401, r.status);
r = await login(null, 'admin@pan.test', otherPw);
check('P02', 'Login bloqueado al suspender', 'Admin de Panadería intenta entrar', '402 o 429', [402, 429].includes(r.status), r.status);
r = await call(`/webhooks/${pan.id}/webchat`, { method: 'POST', csrf: false, body: { sessionId: 'x'.repeat(20), text: 'hola' }, headers: { 'X-Forwarded-For': '192.0.2.77' } });
check('P03', 'Canales apagados al suspender', 'Mensaje entrante al cliente suspendido', '404 o 429', [404, 429].includes(r.status), r.status);

const passed = results.filter((x) => x.pass).length;
console.log(`\n${passed}/${results.length} pruebas superadas`);
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/security-${label}.json`, import.meta.url), JSON.stringify({ label, at: new Date().toISOString(), passed, total: results.length, results, tenants: { evo: evo.id, pan: pan.id } }, null, 2));
process.exit(0);
