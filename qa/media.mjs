// Fotos, videos e IA de imágenes del catálogo, sobre una instancia de QA recién reiniciada (sh restart.sh).
// Para probar la llamada a la IA sin gastar: arrancar con GEMINI_API_KEY=clave-falsa (Google la rechaza → 502).
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
const jars = {};
const results = [];

async function call(path, { method = 'GET', body, jar, csrf = true, type = 'application/json' } = {}) {
  const h = { 'Content-Type': type };
  if (csrf) h['X-CRM-Request'] = '1';
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString()); } catch {}
  return { status: r.status, json, buf, headers: r.headers };
}
const sup = (action, data) => call('/api/super/action', { method: 'POST', jar: 'owner', body: { action, data } });
const act = (jar, action, data) => call('/api/action', { method: 'POST', jar, body: { action, data } });
const upload = (jar, buf, type = 'image/jpeg', csrf = true) => call('/api/media', { method: 'POST', jar, body: buf, type, csrf });
const generate = (jar, data) => call('/api/media/generate', { method: 'POST', jar, body: data });
function check(name, pass, got) {
  results.push({ name, pass: !!pass, got: String(got ?? '') });
  console.log(`  ${pass ? '✔' : '✘'} ${name}${pass ? '' : '  → ' + got}`);
}

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(2000)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(2000)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), randomBytes(4000)]);

// ---------------------------------------------------------------------------
console.log('\nPreparación');
const ownerPw = pw(), adminPw = pw(), asesorPw = pw(), otherPw = pw();
await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: ownerPw } });
const base = { modules: { crm: true, chatbot: true }, plan: { name: 'Completo', price: 300000, currency: 'COP', billingDay: 5 }, status: 'activo' };
const evo = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport Media' }, flowTemplate: 'evosport', sampleCatalog: true })).json.result.tenant;
const pan = (await sup('saveTenant', { tenant: { ...base, name: 'Panaderia Media' }, flowTemplate: 'generico' })).json.result.tenant;
await sup('createTenantUser', { tenantId: evo.id, name: 'Admin', email: 'admin@media.test', password: adminPw, role: 'admin' });
await sup('createTenantUser', { tenantId: evo.id, name: 'Asesora', email: 'asesora@media.test', password: asesorPw, role: 'asesor' });
await sup('createTenantUser', { tenantId: pan.id, name: 'Otro', email: 'otro@media.test', password: otherPw, role: 'admin' });
const login = (jar, email, password) => call('/api/auth/login', { method: 'POST', jar, body: { email, password } });
await login('evo', 'admin@media.test', adminPw);
await login('ase', 'asesora@media.test', asesorPw);
await login('pan', 'otro@media.test', otherPw);
writeFileSync(new URL('./.qa-demo.json', import.meta.url), JSON.stringify({ tenant: evo.id, email: 'admin@media.test', password: adminPw }));

// ---------------------------------------------------------------------------
console.log('\nSubida');
let r = await upload('evo', JPG);
const jpgUrl = r.json?.url;
check('Admin sube una foto JPG', r.status === 200 && /^\/media\/[\w-]+\/[a-f0-9]{24}\.jpg$/.test(jpgUrl ?? ''), `${r.status} ${jpgUrl}`);
check('La foto queda en la carpeta de su cliente', jpgUrl?.startsWith(`/media/${evo.id}/`), jpgUrl);
r = await upload('evo', PNG, 'image/png');
check('Admin sube una foto PNG', r.status === 200 && r.json.url.endsWith('.png'), r.status);
r = await upload('evo', MP4, 'video/mp4');
const mp4Url = r.json?.url;
check('Admin sube un video MP4', r.status === 200 && mp4Url?.endsWith('.mp4'), r.status);

r = await call(jpgUrl);
check('La foto es pública (WhatsApp la descarga sin sesión)', r.status === 200 && r.buf.equals(JPG), r.status);
check('Se sirve como imagen y con nosniff', r.headers.get('content-type') === 'image/jpeg' && r.headers.get('x-content-type-options') === 'nosniff', r.headers.get('content-type'));
check('Permite que otras webs la muestren (CORP cross-origin)', r.headers.get('cross-origin-resource-policy') === 'cross-origin', r.headers.get('cross-origin-resource-policy'));
r = await call(mp4Url);
check('El video se sirve como video/mp4', r.status === 200 && r.headers.get('content-type') === 'video/mp4', r.headers.get('content-type'));

console.log('\nSeguridad');
r = await upload('evo', Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg');
check('Rechaza HTML disfrazado de foto', r.status === 415, r.status);
r = await upload('evo', Buffer.from('GIF89a' + 'x'.repeat(100)), 'image/gif');
check('Rechaza formatos que WhatsApp no acepta (GIF)', r.status === 415, r.status);
r = await upload('evo', Buffer.concat([JPG, Buffer.alloc(5 * 1024 * 1024)]));
check('Rechaza fotos de más de 5 MB', r.status === 413, r.status);
r = await upload('evo', Buffer.concat([MP4, Buffer.alloc(16 * 1024 * 1024)]), 'video/mp4');
check('Rechaza videos de más de 16 MB', r.status === 413, r.status);
r = await upload('evo', Buffer.alloc(0));
check('Rechaza una subida vacía', r.status === 400, r.status);
r = await upload('ase', JPG);
check('Un asesor no puede subir archivos', r.status === 403, r.status);
r = await upload(undefined, JPG);
check('Sin sesión no se puede subir', r.status === 401, r.status);
r = await upload('evo', JPG, 'image/jpeg', false);
check('Sin el encabezado anti-CSRF no se puede subir', r.status === 403, r.status);
r = await call(`/media/${evo.id}/noexiste.jpg`);
check('Un archivo inexistente da 404', r.status === 404, r.status);
r = await call('/media/..%2f..%2fbackend%2f.env');
check('No se puede salir de la carpeta de archivos', r.status === 404 && !r.buf.toString().includes('JWT_SECRET'), r.status);
r = await call(`/media/${evo.id}/`);
check('No se puede listar la carpeta de un cliente', r.status === 404, r.status);

console.log('\nIA de imágenes');
r = await generate('evo', { imageUrl: jpgUrl, style: 'estudio' });
check('Sin el módulo de IA, el cliente no puede generar', r.status === 403, `${r.status} ${r.json?.error}`);
await sup('saveTenant', { tenant: { ...evo, modules: { ...evo.modules, aiImages: true } } });
await sup('saveTenant', { tenant: { ...pan, modules: { ...pan.modules, aiImages: true } } });
r = await generate('ase', { imageUrl: jpgUrl, style: 'estudio' });
check('Un asesor no puede generar con IA', r.status === 403, r.status);
r = await generate('evo', { imageUrl: jpgUrl, style: 'inventado' });
const keyed = r.status !== 503;
if (keyed) {
  check('Rechaza un estilo que no existe', r.status === 400, r.status);
  r = await generate('pan', { imageUrl: jpgUrl, style: 'estudio' });
  check('Otro cliente no puede usar las fotos de EvoSport', r.status === 400, `${r.status} ${r.json?.error}`);
  r = await generate('evo', { imageUrl: '/media/' + evo.id + '/../../backend/.env', style: 'estudio' });
  check('La IA no lee archivos fuera del catálogo', r.status === 400, r.status);
  r = await generate('evo', { imageUrl: mp4Url, style: 'estudio' });
  check('La IA solo parte de fotos (no de videos)', r.status === 400, r.status);
  r = await generate('evo', { imageUrl: jpgUrl, style: 'ambiente', extra: 'en un gimnasio' });
  check('Con el módulo activo llega hasta Google (clave falsa → error controlado)', r.status === 502 && !/key|AIza/i.test(r.json?.error ?? ''), `${r.status} ${r.json?.error}`);
} else {
  check('Sin clave de IA en el servidor responde "no configurada"', r.status === 503, r.status);
}

// ---------------------------------------------------------------------------
console.log('\nProducto con fotos y video en el chat');
const boot = (await call('/api/bootstrap', { jar: 'evo' })).json;
const p = { ...boot.products[0], imageUrl: jpgUrl, gallery: [jpgUrl.replace('.jpg', '.png')], videoUrl: mp4Url };
r = await act('evo', 'saveProduct', { product: p });
check('Se guarda el producto con galería y video', r.status === 200, `${r.status} ${JSON.stringify(r.json?.details)}`);
r = await act('evo', 'saveProduct', { product: { ...p, videoUrl: 'javascript:alert(1)' } });
check('No acepta URLs peligrosas en el video', r.status === 400, r.status);
const conv = (await act('evo', 'createTestConversation', { channel: 'whatsapp', name: 'Prueba' })).json.result.conversation;
await act('evo', 'simulateIncoming', { conversationId: conv.id, text: 'Hola' });
await act('evo', 'simulateIncoming', { conversationId: conv.id, buttonId: 'det_' + p.id, title: 'Ver detalles' });
const msgs = (await call(`/api/conversations/${conv.id}/messages`, { jar: 'evo' })).json.messages;
const vi = msgs.findIndex((m) => m.type === 'video' && m.videoUrl === mp4Url);
check('"Ver detalles" envía el video del producto', vi >= 0, msgs.map((m) => m.type).join(','));
check('…seguido de la ficha con "Lo quiero"', vi >= 0 && msgs[vi + 1]?.type === 'product' && msgs[vi + 1].buttons?.some((b) => b.title === 'Lo quiero'), msgs[vi + 1]?.type);

const ok = results.filter((x) => x.pass).length;
console.log(`\n${ok}/${results.length} correctas`);
writeFileSync(new URL('./results/media.json', import.meta.url), JSON.stringify(results, null, 2));
process.exit(ok === results.length ? 0 : 1);
