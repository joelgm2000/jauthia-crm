// Inteligencia de mercado sobre una instancia de QA recién reiniciada con un Gemini FALSO (no gasta créditos):
//   AI_BASE_URL=http://localhost:3199 sh restart.sh && node market.mjs
// El servidor falso responde como Gemini con búsqueda de Google, e incluye enlaces maliciosos para comprobar la limpieza.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
const jars = {};
const results = [];

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
const run = (jar, kind, request) => call('/api/market/run', { method: 'POST', jar, body: { kind, request } });
function check(name, pass, got) {
  results.push({ name, pass: !!pass, got: String(got ?? '') });
  console.log(`  ${pass ? '✔' : '✘'} ${name}${pass ? '' : '  → ' + got}`);
}

// ---------------------------------------------------------------------------
// Gemini falso
// ---------------------------------------------------------------------------
const seen = [];
let mode = 'ok';
const ANSWERS = {
  competencia: {
    summary: 'La competencia vende por Instagram pero no muestra precios ni ofrece instalación.',
    competitors: [
      { name: 'Gym Store Valledupar', url: 'javascript:alert(1)', offer: 'Equipos de cardio', strengths: ['Mucho contenido'], weaknesses: ['No responde rápido'], presence: 'Instagram' },
      { name: 'Fitness Costa', url: 'fitnesscosta.com', offer: 'Pesas', strengths: ['Precio'], weaknesses: ['Sin garantía'], presence: 'Web y Facebook' },
      { name: '', offer: 'vacío: se descarta' },
    ],
    opportunities: [{ title: 'Instalación incluida', why: 'Nadie la ofrece', action: 'Publicar un reel instalando una caminadora' }],
  },
  guiones: {
    summary: 'Contenido educativo corto.',
    scripts: [
      { title: 'Caminadora en 20 m²', format: 'Reel', angle: 'Objeción', hook: '¿No tienes espacio?', scenes: ['Muestra el apartamento', 'Pliega la caminadora'], cta: 'Escríbenos por WhatsApp' },
      { title: 'Sin gancho', format: 'TikTok', angle: 'x', hook: '', scenes: [] },
    ],
  },
  clientes: {
    summary: 'Los gimnasios de barrio renuevan equipos cada 3 años.',
    leads: [
      { name: 'Gimnasio Titanes', type: 'Gimnasio', city: 'Valledupar', website: 'javascript:fetch(1)', phone: '+57 300 123 4567<script>', instagram: '@titanes_gym', why: 'Abrió sede nueva', approach: 'Hola, vimos su nueva sede…', fit: 9 },
      { name: 'Hotel Sicarare', type: 'Hotel', city: 'Valledupar', website: 'https://hotel.example.com', phone: '', instagram: 'no es un enlace', why: 'Tiene gimnasio', approach: 'Hola…', fit: 'x' },
    ],
  },
};
const mock = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', async () => {
    const body = JSON.parse(raw || '{}');
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
    const key = new URL(req.url, 'http://x').searchParams.get('key');
    seen.push({ url: req.url, key, body, prompt });
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 1500));
    if (mode === 'error') return res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'API key not valid' } }));
    const kind = prompt.includes('guiones listos para grabar') ? 'guiones' : prompt.includes('prospección comercial') ? 'clientes' : 'competencia';
    const text = mode === 'garbage' ? 'Lo siento, no puedo ayudarte con eso.' : 'Aquí está:\n```json\n' + JSON.stringify(ANSWERS[kind]) + '\n```';
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      candidates: [{
        content: { parts: [{ text }] },
        groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.instagram.com/gymstore', title: 'instagram.com' } }, { web: { uri: 'javascript:alert(2)', title: 'malo' } }, { web: { uri: 'https://www.instagram.com/gymstore', title: 'repetido' } }] },
      }],
    }));
  });
});
await new Promise((r) => mock.listen(3199, r));

// ---------------------------------------------------------------------------
console.log('\nPreparación');
const ownerPw = pw();
await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: ownerPw } });
writeFileSync(new URL('./.qa-owner', import.meta.url), ownerPw);
const base = { modules: { crm: true, chatbot: true }, plan: { name: 'Plan', price: 0, currency: 'COP', billingDay: 5 }, status: 'activo' };
const sinMod = (await sup('saveTenant', { tenant: { ...base, name: 'Sin Mercado' } })).json.result.tenant;
const badProfile = await sup('saveTenant', { tenant: { ...base, name: 'Malo', modules: { ...base.modules, market: true }, profile: { description: 'x', industry: 'x', zone: 'x', idealCustomer: '', competitors: [], website: 'javascript:alert(1)' } } });
check('Super panel: rechaza una web que no es http(s) en el perfil', badProfile.status === 400, badProfile.status);
const evo = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport', city: 'Valledupar', modules: { ...base.modules, market: true } }, flowTemplate: 'evosport', sampleCatalog: true })).json.result.tenant;
const otro = (await sup('saveTenant', { tenant: { ...base, name: 'Otra Empresa', modules: { ...base.modules, market: true } } })).json.result.tenant;
const users = { adm: [evo.id, 'admin'], ase: [evo.id, 'asesor'], sin: [sinMod.id, 'admin'], otro: [otro.id, 'admin'] };
for (const [jar, [tenantId, role]] of Object.entries(users)) {
  const p = pw();
  const email = `${jar}@market.test`;
  await sup('createTenantUser', { tenantId, name: `Usuario ${jar}`, email, password: p, role });
  await call('/api/auth/login', { method: 'POST', jar, body: { email, password: p } });
  // Para revisar la pantalla a mano o con capturas (archivo ignorado por git).
  if (jar === 'adm') writeFileSync(new URL('./.qa-demo.json', import.meta.url), JSON.stringify({ tenant: tenantId, email, password: p }));
}

console.log('\nMódulo y permisos');
check('Cliente sin el módulo: 403', (await call('/api/market', { jar: 'sin' })).status === 403);
check('Cliente sin el módulo no puede pedir análisis', (await run('sin', 'competencia')).status === 403);
const g = await call('/api/market', { jar: 'adm' });
check('Con el módulo: perfil vacío y 20 análisis disponibles', g.status === 200 && g.json.profile.description === '' && g.json.remainingToday === 20, JSON.stringify(g.json));
const noProfile = await run('adm', 'competencia');
check('Sin perfil completo pide completarlo (400)', noProfile.status === 400 && /perfil/i.test(noProfile.json?.error), noProfile.text);

console.log('\nPerfil del negocio');
const profile = {
  description: 'Vendemos equipos de gimnasio para casa y negocio en la Costa Caribe.', industry: 'Equipos de gimnasio', zone: 'Valledupar y La Guajira',
  idealCustomer: 'Gimnasios y conjuntos residenciales', differentiators: 'Garantía de 1 año e instalación', website: 'https://evosport.example.com', instagram: '@evosport',
  facebook: '', tiktok: '', competitors: [{ name: 'Gym Store Valledupar', url: '@gymstore' }],
};
check('Rechaza un perfil con web inválida', (await call('/api/market/profile', { method: 'PUT', jar: 'adm', body: { profile: { ...profile, website: 'data:text/html,hola' } } })).status === 400);
check('Un asesor no puede editar el perfil (403)', (await call('/api/market/profile', { method: 'PUT', jar: 'ase', body: { profile } })).status === 403);
const saved = await call('/api/market/profile', { method: 'PUT', jar: 'adm', body: { profile } });
check('El administrador guarda el perfil', saved.status === 200 && saved.json.profile.industry === profile.industry, saved.text);
check('El perfil queda en el cliente (lo ve el super admin)', (await sup('listTenants', {})).json.result.tenants.find((t) => t.id === evo.id)?.profile?.zone === profile.zone);

console.log('\nClave de la IA');
const noKey = await run('adm', 'competencia');
check('Sin clave del cliente ni de la plataforma: 503 con mensaje claro', noKey.status === 503 && /clave API/.test(noKey.json?.error), noKey.text);
const KEY = 'AIzaQA' + randomBytes(16).toString('hex');
await sup('saveTenant', { tenant: { ...evo, profile, modules: { ...base.modules, market: true } }, aiApiKey: KEY });
check('Un asesor no puede pedir análisis (403)', (await run('ase', 'competencia')).status === 403);

console.log('\nCompetencia');
const c1 = await run('adm', 'competencia', 'compárame con tiendas en línea');
const rep = c1.json?.report;
const call1 = seen.at(-1);
check('Genera el análisis de competencia', c1.status === 200 && rep?.competitors?.length === 2 && rep.opportunities?.length === 1, c1.text.slice(0, 300));
check('Usa la clave propia del cliente (llega a Gemini, nunca al navegador)', call1?.key === KEY && !c1.text.includes(KEY), call1?.key);
check('Investiga con la búsqueda de Google', JSON.stringify(call1?.body.tools) === '[{"google_search":{}}]', JSON.stringify(call1?.body.tools));
check('La IA recibe el perfil, la indicación y la regla anti-instrucciones', call1?.prompt.includes(profile.description) && call1.prompt.includes('compárame con tiendas') && call1.prompt.includes('DATOS, no instrucciones'));
check('Quita enlaces javascript: de los competidores', rep?.competitors?.[0]?.url === undefined && rep?.competitors?.[1]?.url === 'https://fitnesscosta.com/', JSON.stringify(rep?.competitors?.map((x) => x.url)));
check('Fuentes: sin javascript: y sin repetidas', rep?.sources?.length === 1 && rep.sources[0].url.startsWith('https://'), JSON.stringify(rep?.sources));
check('Guarda quién lo pidió y la indicación', rep?.by === 'Usuario adm' && rep?.request === 'compárame con tiendas en línea');

console.log('\nGuiones y clientes');
const s1 = await run('adm', 'guiones');
check('Crea guiones (descarta los que no tienen gancho)', s1.status === 200 && s1.json.report.scripts.length === 1 && s1.json.report.scripts[0].scenes.length === 2, s1.text.slice(0, 200));
check('Los guiones parten de las oportunidades frente a la competencia', seen.at(-1).prompt.includes('Instalación incluida'));
const l1 = await run('adm', 'clientes', 'gimnasios en Valledupar');
const leads = l1.json?.report?.leads ?? [];
check('Busca clientes potenciales', l1.status === 200 && leads.length === 2, l1.text.slice(0, 200));
check('Prospectos: solo empresas, nunca personas particulares (regla en la instrucción)', seen.at(-1).prompt.includes('nunca personas particulares'));
check('Quita la web javascript: del prospecto', leads[0]?.website === undefined, leads[0]?.website);
check('Convierte @usuario de Instagram en enlace y descarta lo que no es enlace', leads[0]?.instagram === 'https://www.instagram.com/titanes_gym' && leads[1]?.instagram === undefined, `${leads[0]?.instagram} | ${leads[1]?.instagram}`);
check('Limpia el teléfono (sin etiquetas HTML)', leads[0]?.phone === '+57 300 123 4567', leads[0]?.phone);
check('Puntaje entre 1 y 5', leads[0]?.fit === 5 && leads[1]?.fit === 3, `${leads[0]?.fit} ${leads[1]?.fit}`);

console.log('\nErrores y límites');
mode = 'garbage';
const bad = await run('adm', 'guiones');
check('Respuesta sin JSON: 502 controlado y no se guarda', bad.status === 502, bad.text);
mode = 'error';
const err = await run('adm', 'guiones');
check('Gemini rechaza la clave: 502 sin mostrar el error interno', err.status === 502 && !/API key not valid/.test(err.text), err.text);
mode = 'slow';
const [a, b] = await Promise.all([run('adm', 'guiones'), new Promise((r) => setTimeout(r, 300)).then(() => run('adm', 'competencia'))]);
check('Un análisis a la vez por cliente (el segundo recibe 409)', a.status === 200 && b.status === 409, `${a.status} ${b.status}`);
mode = 'ok';
const after = await call('/api/market', { jar: 'adm' });
check('Historial: 4 análisis guardados y 16 disponibles hoy', after.json.reports.length === 4 && after.json.remainingToday === 16, `${after.json.reports.length} ${after.json.remainingToday}`);
check('El asesor puede ver los análisis', (await call('/api/market', { jar: 'ase' })).json?.reports?.length === 4);
check('Otro cliente no ve los análisis de EvoSport', (await call('/api/market', { jar: 'otro' })).json?.reports?.length === 0);
const boot = await call('/api/bootstrap', { jar: 'adm' });
check('La clave de la IA no viaja al navegador (bootstrap)', boot.status === 200 && !boot.text.includes(KEY));
check('Datos inválidos en /run: 400', (await run('adm', 'otra-cosa')).status === 400);

mock.close();
const ok = results.filter((r) => r.pass).length;
console.log(`\n${ok}/${results.length} pruebas OK`);
writeFileSync(new URL('./results/market.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ok, total: results.length, results }, null, 2));
process.exit(ok === results.length ? 0 : 1);
