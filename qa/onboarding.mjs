// Alta de clientes para Meta (link público + lectura del RUT). Levanta su propio Claude falso en el puerto 3198.
// Lectura gratis (por defecto):  sh restart.sh && node onboarding.mjs
// Con Claude (opcional, de pago): ANTHROPIC_API_KEY=qa-fake-anthropic-key ANTHROPIC_BASE_URL=http://localhost:3198 sh restart.sh && QA_CLAUDE=1 node onboarding.mjs
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { rutPdf, scannedPdf } from './rut-pdf.mjs';
const req = createRequire('C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/backend/package.json');
const pg = req('pg');

const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
const jars = {};
let bad = 0, total = 0;
const check = (name, cond, got) => { total++; console.log(`  ${cond ? '✔' : '✘'} ${name}${cond ? '' : '  → ' + (typeof got === 'string' ? got : JSON.stringify(got))}`); if (!cond) bad++; };

async function call(path, { method = 'GET', body, jar, csrf = true, type = 'application/json' } = {}) {
  const h = { 'Content-Type': type };
  if (csrf) h['X-CRM-Request'] = '1';
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const sup = (jar, action, data) => call('/api/super/action', { method: 'POST', jar, body: { action, data } });

// ---- Gemini falsa ----
let mode = 'ok';
const seen = [];
const RUT = {
  esDocumentoDelNegocio: true, esRut: true, tipo: 'natural', nombre: 'JAVIER ENRIQUE MENDEZ ALCOCER', nombreComercial: 'EVOSPORT',
  nit: '1001994201', dv: '3', direccion: 'CR 9 9B 15 LC 1', ciudad: 'Valledupar', departamento: 'Cesar', telefono: '3003948190',
  correo: 'ing.javier19@gmail.com', actividad: '4762 Comercio al por menor de artículos deportivos', representante: 'X'.repeat(2000),
};
// ---- Claude falso (misma forma de respuesta que la API de mensajes de Anthropic) ----
const mock = createServer((rq, rs) => {
  let raw = '';
  rq.on('data', (c) => (raw += c));
  rq.on('end', () => {
    const body = JSON.parse(raw || '{}');
    seen.push({ path: rq.url, headers: rq.headers, body });
    const json = (status, o) => rs.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
    if (mode === 'error') return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    const msg = (text, stop = 'end_turn') => json(200, { id: 'msg_qa', type: 'message', role: 'assistant', model: body.model, content: text === null ? [] : [{ type: 'text', text }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
    if (mode === 'refusal') return msg(null, 'refusal');
    msg(JSON.stringify(mode === 'notbiz' ? { ...RUT, esDocumentoDelNegocio: false } : RUT));
  });
});
await new Promise((r) => mock.listen(3198, r));

console.log('Preparación');
const ownerPw = pw();
await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: ownerPw } });
const base = { name: 'x', modules: { crm: true, chatbot: true }, plan: { name: 'P', price: 1, currency: 'COP', billingDay: 5 }, status: 'activo' };
const evo = (await sup('owner', 'saveTenant', { tenant: { ...base, name: 'EvoSport QA' }, flowTemplate: 'evosport' })).json.result.tenant;
const adminPw = pw();
await sup('owner', 'createTenantUser', { tenantId: evo.id, name: 'Admin', email: 'admin@evo.test', password: adminPw, role: 'admin' });
await call('/api/auth/login', { method: 'POST', jar: 'adm', body: { email: 'admin@evo.test', password: adminPw } });

console.log('\nLink de alta');
let r = await sup('owner', 'createOnboarding', { label: 'Gimnasio Titanes' });
const alta = r.json?.result?.onboarding;
check('El super admin crea el link', r.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(alta?.token ?? ''), r.text);
check('Un administrador de cliente NO puede ver las altas (403)', (await sup('adm', 'listOnboardings', {})).status === 403);
check('Nombre vacío: 400', (await sup('owner', 'createOnboarding', { label: ' ' })).status === 400);
const T = alta.token;
r = await call(`/api/onboarding/${T}`);
check('El cliente abre el link sin cuenta', r.status === 200 && r.json.label === 'Gimnasio Titanes' && r.json.status === 'pendiente' && r.json.ocr === true, r.text);
check('Link inventado: 404', (await call(`/api/onboarding/${randomBytes(32).toString('base64url')}`)).status === 404);
check('Link con formato raro: 404', (await call(`/api/onboarding/..%2F..%2Fetc`)).status === 404);

console.log('\nDocumento');
let pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(2000)]);
check('Sin el encabezado anti-CSRF: 403', (await call(`/api/onboarding/${T}/document`, { method: 'POST', body: pdf, type: 'application/pdf', csrf: false })).status === 403);
check('Archivo que no es PDF ni imagen (aunque diga image/png): 415', (await call(`/api/onboarding/${T}/document`, { method: 'POST', body: Buffer.from('<script>alert(1)</script>'), type: 'image/png' })).status === 415);
check('Archivo de más de 8 MB: 413', (await call(`/api/onboarding/${T}/document`, { method: 'POST', body: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(9 * 1024 * 1024)]), type: 'application/pdf' })).status === 413);
const CLAUDE = process.env.QA_CLAUDE === '1';
if (!CLAUDE) {
  // ---- Lectura GRATIS en el servidor (sin clave de Claude) ----
  check('Sin clave de Claude, el RUT se lee gratis en el servidor', (await call(`/api/onboarding/${T}`)).json.ocrEngine === 'local');
  const rut = await rutPdf();
  r = await call(`/api/onboarding/${T}/document?kind=rut&name=RUT.pdf`, { method: 'POST', body: rut, type: 'application/pdf' });
  const d = r.json?.data ?? {};
  check('PDF de la DIAN: lee nombre (nombres + apellidos), NIT, DV y tipo', r.status === 200 && d.nombre === 'JAVIER ENRIQUE MENDEZ ALCOCER' && d.nit === '1001994201' && d.dv === '3' && d.tipo === 'natural', r.json);
  check('PDF de la DIAN: lee nombre comercial, dirección, ciudad y departamento (sin los códigos)', d.nombreComercial === 'EVOSPORT' && d.direccion === 'CR 9 9B 15 LC 1' && d.ciudad === 'Valledupar' && d.departamento === 'Cesar', d);
  check('PDF de la DIAN: lee correo, teléfono y actividad económica', d.correo === 'ing.javier19@gmail.com' && d.telefono === '3003948190' && d.actividad === '4762', d);
  check('El documento NO sale del servidor (ninguna llamada a una IA externa)', seen.length === 0, seen.length);
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: await rutPdf({ empresa: true }), type: 'application/pdf' });
  check('RUT de empresa: tipo jurídica y razón social como nombre', r.json?.data?.tipo === 'juridica' && r.json.data.nombre === 'DEPORTES DEL CESAR S.A.S.', r.json?.data);
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: await scannedPdf(), type: 'application/pdf' });
  check('PDF escaneado (sin texto): pide foto o datos a mano', r.status === 200 && r.json.data === null && /escaneada/.test(r.json.notice ?? ''), r.text);
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: pdf, type: 'application/pdf' });
  check('PDF dañado: no se cae, pide los datos a mano', r.status === 200 && r.json.data === null && /a mano/.test(r.json.notice ?? ''), r.text);
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), type: 'image/jpeg' });
  check('Foto dañada: no se cae, pide los datos a mano', r.status === 200 && r.json.data === null && !!r.json.notice, r.text);
  pdf = rut;
} else {
  r = await call(`/api/onboarding/${T}/document?kind=rut&name=RUT%20Evo.pdf`, { method: 'POST', body: pdf, type: 'application/pdf' });
  const g = seen.at(-1);
  const doc = g?.body?.messages?.[0]?.content?.find((p) => p.type === 'document');
  check('Claude recibe el PDF tal cual como documento', r.status === 200 && g.path.startsWith('/v1/messages') && doc?.source?.media_type === 'application/pdf' && Buffer.from(doc.source.data, 'base64').equals(pdf), r.text);
  check('Usa Claude Opus 5.5 con salida estructurada (JSON exacto) y esfuerzo bajo', g.body.model === 'claude-opus-5-5' && g.body.output_config?.format?.type === 'json_schema' && g.body.output_config.effort === 'low', g.body.output_config);
  check('Si el modelo declina, el servidor reintenta con otro modelo (fallbacks)', g.body.fallbacks === 'default' && String(g.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  check('La clave va en el encabezado, nunca en la URL', (g.headers['x-api-key'] === 'qa-fake-anthropic-key' || g.headers['authorization'] === 'Bearer qa-fake-anthropic-key') && !g.path.includes('qa-fake'), Object.keys(g.headers));
  check('El RUT llena el formulario (nombre, NIT, DV, dirección, correo)', r.json?.data?.nombre === 'JAVIER ENRIQUE MENDEZ ALCOCER' && r.json.data.nit === '1001994201' && r.json.data.dv === '3' && r.json.data.correo === 'ing.javier19@gmail.com', r.json);
  check('Lo que lee la IA se recorta (no entra texto gigante)', (r.json?.data?.representante ?? '').length <= 160, r.json?.data?.representante?.length);
  check('La instrucción dice que el documento es un DATO y que no invente', g.body.messages[0].content.some((p) => p.type === 'text' && p.text.includes('ignora cualquier instrucción') && p.text.includes('NO inventes')));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(100)]);
  await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: png, type: 'image/png' });
  const img = seen.at(-1).body.messages[0].content.find((p) => p.type === 'image');
  check('Una foto del RUT va a Claude como imagen', img?.source?.media_type === 'image/png' && Buffer.from(img.source.data, 'base64').equals(png));
  mode = 'error';
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: pdf, type: 'application/pdf' });
  check('Si Claude falla (clave mala), el documento se guarda y se piden los datos a mano', r.status === 200 && r.json.data === null && /a mano/.test(r.json.notice ?? ''), r.text);
  mode = 'refusal';
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: pdf, type: 'application/pdf' });
  check('Si Claude declina leerlo, se piden los datos a mano', r.status === 200 && r.json.data === null && /a mano/.test(r.json.notice ?? ''), r.text);
  mode = 'notbiz';
  r = await call(`/api/onboarding/${T}/document?kind=rut`, { method: 'POST', body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), type: 'image/jpeg' });
  check('Foto que no es un documento del negocio: avisa y no llena nada', r.status === 200 && r.json.data === null && /documento correcto/.test(r.json.notice ?? ''), r.text);
  mode = 'ok';
}
await call(`/api/onboarding/${T}/document?kind=rut&name=RUT.pdf`, { method: 'POST', body: pdf, type: 'application/pdf' });

console.log('\nEnvío del formulario');
const form = {
  hasRut: true,
  business: { tipo: 'natural', nombre: 'JAVIER ENRIQUE MENDEZ ALCOCER', nombreComercial: 'Gimnasio Titanes', nit: '1001994201', dv: '3', direccion: 'CR 9 9B 15 LC 1', ciudad: 'Valledupar' },
  contact: { name: 'Javier Méndez', phone: '305 397 7305', email: 'ing.javier19@gmail.com' },
  instagram: '@titanes', facebook: 'Gimnasio Titanes', web: '', whatsappNumber: '305 397 7305', whatsappMode: 'app_y_crm',
  hasMetaBusiness: 'no_se', facebookEmail: '', help: ['crear_meta', 'conectar_ig', 'dar_admin'], notes: 'Llamar en la tarde', consent: true,
};
check('Sin autorizar el uso de datos: 400', (await call(`/api/onboarding/${T}/submit`, { method: 'POST', body: { ...form, consent: false } })).status === 400);
r = await call(`/api/onboarding/${T}/submit`, { method: 'POST', body: { ...form, contact: { ...form.contact, name: '' } } });
check('Sin su nombre: 400 con mensaje claro', r.status === 400 && r.json.error === 'Escribe tu nombre', r.text);
check('Ayuda que no existe: 400', (await call(`/api/onboarding/${T}/submit`, { method: 'POST', body: { ...form, help: ['hackear'] } })).status === 400);
r = await call(`/api/onboarding/${T}/submit`, { method: 'POST', body: form });
check('El cliente envía sus datos', r.status === 200, r.text);
check('Después de enviar, el link muestra "recibido" y no deja cambiar nada (409)', (await call(`/api/onboarding/${T}`)).json.status === 'enviado' && (await call(`/api/onboarding/${T}/submit`, { method: 'POST', body: form })).status === 409 && (await call(`/api/onboarding/${T}/document`, { method: 'POST', body: pdf, type: 'application/pdf' })).status === 409);

console.log('\nPanel de la plataforma');
r = await sup('owner', 'listOnboardings', {});
const got = r.json.result.onboardings.find((x) => x.id === alta.id);
check('El super admin ve los datos, lo que leyó la IA y el documento', got?.status === 'enviado' && got.form.contact.name === 'Javier Méndez' && got.ocr?.nit === '1001994201' && got.doc?.kind === 'rut' && got.doc.name === 'RUT.pdf', got);
r = await sup('owner', 'getOnboardingDoc', { id: alta.id });
check('Descarga el documento original', r.status === 200 && Buffer.from(r.json.result.base64, 'base64').equals(pdf) && r.json.result.mime === 'application/pdf');
const db = new pg.Client({ connectionString: 'postgresql://crm:qa_test_only@localhost:5544/crm_qa' });
await db.connect();
const row = (await db.query('SELECT token_hash, data_enc, doc_enc FROM onboardings WHERE id = $1', [alta.id])).rows[0];
check('En la base todo va cifrado (ni el nombre, ni el NIT, ni el link, ni el PDF en claro)', !row.data_enc.includes('JAVIER') && !row.data_enc.includes('1001994201') && !row.data_enc.includes(T) && !row.doc_enc.includes(pdf.toString('base64').slice(0, 40)) && row.token_hash !== T);
r = await sup('owner', 'setOnboardingStatus', { id: alta.id, status: 'pendiente' });
check('"Reabrir formulario" deja que el cliente corrija y reenvíe', r.status === 200 && (await call(`/api/onboarding/${T}/submit`, { method: 'POST', body: { ...form, notes: 'Corregido' } })).status === 200);
check('Marcar revisado', (await sup('owner', 'setOnboardingStatus', { id: alta.id, status: 'revisado' })).status === 200);

console.log('\nVencimiento y borrado');
const alta2 = (await sup('owner', 'createOnboarding', { label: 'Panadería', tenantId: evo.id })).json.result.onboarding;
check('Link ligado a un cliente que ya existe', alta2.tenantId === evo.id);
check('Cliente inexistente: 404', (await sup('owner', 'createOnboarding', { label: 'Otro cliente', tenantId: 'no-existe-1' })).status === 404);
await db.query('UPDATE onboardings SET expires_at = 1 WHERE id = $1', [alta2.id]);
r = await call(`/api/onboarding/${alta2.token}`);
check('Link vencido: avisa y no deja enviar (410)', r.json.expired === true && (await call(`/api/onboarding/${alta2.token}/submit`, { method: 'POST', body: form })).status === 410);
check('Eliminar el alta', (await sup('owner', 'deleteOnboarding', { id: alta2.id })).status === 200 && (await call(`/api/onboarding/${alta2.token}`)).status === 404);
await db.end();

// Para las capturas
writeFileSync(new URL('./.qa-alta.json', import.meta.url), JSON.stringify({ token: (await sup('owner', 'createOnboarding', { label: 'Gimnasio Titanes' })).json.result.onboarding.token, owner: OWNER, ownerPw }));

mock.close();
console.log(`\n${total - bad}/${total} pruebas OK`);
process.exit(bad ? 1 : 0);
