// Estadísticas REALES de redes (APIs oficiales + búsqueda triple de cuentas) sobre una instancia de QA con APIs
// FALSAS de Meta, YouTube y Gemini (no gasta nada):
//   SOCIAL_GRAPH_URL=http://localhost:3198/graph YOUTUBE_API_URL=http://localhost:3198/yt AI_BASE_URL=http://localhost:3198 sh restart.sh && node social.mjs
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
function check(name, pass, got) {
  results.push({ name, pass: !!pass, got: String(got ?? '') });
  console.log(`  ${pass ? '✔' : '✘'} ${name}${pass ? '' : '  → ' + got}`);
}

// ---------------------------------------------------------------------------
// APIs falsas
// ---------------------------------------------------------------------------
const META = 'EAAQA' + randomBytes(24).toString('hex');
const YT = 'AIzaYT' + randomBytes(16).toString('hex');
const GEMINI = 'AIzaGM' + randomBytes(16).toString('hex');
const seen = [];
let igFollowers = 12500;
const iso = (d) => new Date(Date.UTC(2026, 9, d, 15)).toISOString();
const send = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
const mock = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const auth = req.headers.authorization ?? '';
    seen.push({ path: u.pathname, query: u.search, auth, body: raw });
    const fields = decodeURIComponent(u.searchParams.get('fields') ?? '');
    if (u.pathname.startsWith('/graph/')) {
      if (auth !== `Bearer ${META}`) return send(res, 400, { error: { code: 190, message: 'Invalid OAuth access token' } });
      const node = u.pathname.slice('/graph/'.length);
      if (node === 'me/accounts') return send(res, 200, { data: [{ id: 'page1' }, { id: 'page2', instagram_business_account: { id: '1789' } }] });
      if (node === '1789') {
        const user = fields.match(/business_discovery\.username\(([^)]+)\)/)?.[1];
        if (user === 'gymstore') {
          igFollowers += 150;
          return send(res, 200, { business_discovery: { username: 'gymstore', name: 'Gym Store Valledupar', followers_count: igFollowers, media_count: 340, media: { data: [
            { id: 'ig1', caption: 'Armando la caminadora en 60 segundos', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/AAA/', timestamp: iso(20), like_count: 940, comments_count: 61 },
            { id: 'ig2', caption: 'Promo de mancuernas', media_type: 'CAROUSEL_ALBUM', permalink: 'https://www.instagram.com/p/BBB/', timestamp: iso(17), comments_count: 12 },
            { id: 'ig3', caption: '<script>alert(1)</script> foto', media_type: 'IMAGE', permalink: 'javascript:alert(1)', timestamp: iso(14), like_count: 120, comments_count: 3 },
          ] } } });
        }
        if (user === 'evosport') return send(res, 200, { business_discovery: { username: 'evosport', followers_count: 4200, media_count: 80, media: { data: [{ id: 'ig9', caption: 'Entrega en Valledupar', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/EVO/', timestamp: iso(19), like_count: 85, comments_count: 4 }] } } });
        return send(res, 400, { error: { code: 110, error_subcode: 2207013, message: 'Invalid user id' } });
      }
      if (node === 'gymstorevalle') {
        if (fields.includes('posts')) return send(res, 400, { error: { code: 10, message: 'This endpoint requires the Page Public Content Access feature' } });
        return send(res, 200, { name: 'Gym Store', fan_count: 5400, followers_count: 5600 });
      }
      if (node === 'fitnesscosta') {
        return send(res, 200, { name: 'Fitness Costa', fan_count: 900, followers_count: 950, posts: { data: [
          { id: 'fb1', created_time: iso(18), message: 'Sorteo de una bicicleta', permalink_url: 'https://www.facebook.com/fitnesscosta/posts/1', shares: { count: 44 }, reactions: { summary: { total_count: 310 } }, comments: { summary: { total_count: 120 } } },
        ] } });
      }
      return send(res, 404, { error: { code: 803, message: 'Some of the aliases you requested do not exist' } });
    }
    if (u.pathname.startsWith('/yt/')) {
      if (u.searchParams.get('key') !== YT) return send(res, 400, { error: { code: 400, errors: [{ reason: 'keyInvalid' }] } });
      const what = u.pathname.slice(4);
      if (what === 'channels') {
        if (u.searchParams.get('forHandle') !== '@gymstore') return send(res, 200, { items: [] });
        return send(res, 200, { items: [{ snippet: { title: 'Gym Store TV' }, statistics: { subscriberCount: '2300', videoCount: '45' }, contentDetails: { relatedPlaylists: { uploads: 'UU123' } } }] });
      }
      if (what === 'playlistItems') return send(res, 200, { items: [{ contentDetails: { videoId: 'vid000001' } }, { contentDetails: { videoId: 'vid000002' } }] });
      if (what === 'videos') return send(res, 200, { items: [
        { id: 'vid000001', snippet: { title: 'Cómo elegir caminadora', publishedAt: iso(15) }, statistics: { viewCount: '18400', likeCount: '620', commentCount: '75' }, contentDetails: { duration: 'PT8M3S' } },
        { id: 'vid000002', snippet: { title: 'Rutina rápida', publishedAt: iso(21) }, statistics: { viewCount: '52000', likeCount: '2100', commentCount: '140' }, contentDetails: { duration: 'PT45S' } },
      ] });
    }
    if (u.pathname.includes(':generateContent')) {
      const prompt = JSON.parse(raw || '{}').contents?.[0]?.parts?.[0]?.text ?? '';
      const who = prompt.match(/perfiles OFICIALES de la empresa "([^"]+)"/)?.[1];
      if (who) {
        const v = prompt.includes(' · ') ? 2 : prompt.includes('redes sociales') ? 3 : 1;
        const found = who === 'EvoSport'
          ? { facebook: 'https://www.facebook.com/evosportco', tiktok: '@inventado_sin_enlace' }
          : who === 'Fitness Costa'
            ? { tiktok: v === 3 ? 'https://www.tiktok.com/@otra_cuenta' : 'https://www.tiktok.com/@fitnesscosta' }
            : {};
        return send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(found) }] } }] });
      }
      const answer = {
        summary: 'Los videos cortos de la competencia triplican la interacción.',
        insights: [{ title: 'Los Shorts ganan', detail: 'El Short de 45 s tiene 52.000 visitas.' }],
        winners: [
          { owner: 'Gym Store Valledupar', network: 'YouTube', url: 'https://www.youtube.com/watch?v=vid000002', why: 'Corto y directo', adapt: 'Graba una rutina de 45 s' },
          { owner: 'Inventado', network: 'TikTok', url: 'https://www.tiktok.com/@nadie/video/999', why: 'no existe', adapt: 'x' },
        ],
        socialScore: 50, channels: [{ network: 'Instagram', found: true, score: 55, audience: '1 millón de seguidores', frequency: '5 al día', strengths: [], weaknesses: [], quickWin: 'Más reels' }],
        tips: [{ expert: 'Gary Vaynerchuk', principle: 'Documenta', apply: 'Graba entregas' }],
      };
      return send(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    }
    send(res, 404, {});
  });
});
await new Promise((r) => mock.listen(3198, r));

// ---------------------------------------------------------------------------
console.log('\nPreparación');
const ownerPw = pw();
let admPw = '';
await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: OWNER, password: ownerPw } });
const base = { modules: { crm: true, chatbot: true, market: true }, plan: { name: 'Plan', price: 0, currency: 'COP', billingDay: 5 }, status: 'activo' };
const profile = {
  description: 'Equipos de gimnasio', industry: 'Fitness', zone: 'Valledupar', idealCustomer: 'Gimnasios', competitors: [
    { name: 'Gym Store Valledupar', instagram: 'https://www.instagram.com/gymstore/', facebook: 'https://www.facebook.com/gymstorevalle', youtube: '@gymstore', tiktok: '@gymstore' },
    { name: 'Fitness Costa', instagram: '@personal_acc', facebook: 'facebook.com/fitnesscosta' },
  ],
  instagram: '@evosport', tiktok: '@evosport',
};
const evo = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport', profile }, aiApiKey: GEMINI })).json.result.tenant;
const otro = (await sup('saveTenant', { tenant: { ...base, name: 'Otro' } })).json.result.tenant;
for (const [jar, tenantId, role] of [['adm', evo.id, 'admin'], ['ase', evo.id, 'asesor'], ['otro', otro.id, 'admin']]) {
  const p = pw();
  await sup('createTenantUser', { tenantId, name: `Usuario ${jar}`, email: `${jar}@social.test`, password: p, role });
  await call('/api/auth/login', { method: 'POST', jar, body: { email: `${jar}@social.test`, password: p } });
  if (jar === 'adm') admPw = p;
}

console.log('\nCuentas y claves');
let g = await call('/api/market/social', { jar: 'adm' });
check('Mide solo las cuentas escritas en el perfil (2 del negocio + 6 de competidores)', g.json?.accounts?.length === 8, g.json?.accounts?.map((a) => a.key).join(' '));
check('Sin claves: conexiones apagadas', g.json?.connections?.meta === false && g.json?.connections?.youtube === false);
check('Actualizar sin claves: 503 con mensaje claro', (await call('/api/market/social/refresh', { method: 'POST', jar: 'adm', body: {} })).status === 503);
check('Token de Meta con formato inválido: 400', (await sup('saveTenant', { tenant: { ...evo, profile }, socialKeys: { metaToken: 'abc<script>' } })).status === 400);
await sup('saveTenant', { tenant: { ...evo, profile }, socialKeys: { metaToken: META, youtubeKey: YT } });
const list = await sup('listTenants', {});
const row = list.json.result.tenants.find((t) => t.id === evo.id);
check('El panel solo sabe que están guardadas (nunca las ve)', row.socialKeysSaved.meta && row.socialKeysSaved.youtube && !list.text.includes(META) && !list.text.includes(YT));

console.log('\nLectura con las APIs oficiales');
check('Un asesor no puede actualizar (403)', (await call('/api/market/social/refresh', { method: 'POST', jar: 'ase', body: {} })).status === 403);
const r1 = await call('/api/market/social/refresh', { method: 'POST', jar: 'adm', body: {} });
const acc = (k) => r1.json?.data?.accounts?.find((a) => a.key === k);
check('Actualiza: 5 cuentas leídas y 1 con problema', r1.status === 200 && r1.json.ok === 5 && r1.json.failed === 1, r1.text.slice(0, 200));
const ig = acc('instagram:gymstore');
check('Instagram: seguidores y publicaciones reales', ig?.followers === 12650 && ig.postsCount === 340 && ig.posts.length === 3 && !!ig.fetchedAt, JSON.stringify(ig)?.slice(0, 200));
check('Instagram: Reel con me gusta y comentarios', ig?.posts[0].kind === 'Reel' && ig.posts[0].likes === 940 && ig.posts[0].comments === 61);
check('Instagram: me gusta ocultos quedan vacíos (no 0 inventado)', ig?.posts[1].likes === undefined && ig.posts[1].comments === 12);
check('Instagram: enlace javascript: descartado', ig?.posts[2].url === undefined);
check('Instagram personal: mensaje claro de que no es de empresa', /no es de empresa/.test(acc('instagram:personal_acc')?.error ?? ''), acc('instagram:personal_acc')?.error);
check('Detecta sola la cuenta de Instagram del token', seen.some((s) => s.path === '/graph/me/accounts'));
check('El token de Meta va en el encabezado, nunca en la URL', seen.filter((s) => s.path.startsWith('/graph/')).every((s) => s.auth === `Bearer ${META}` && !s.query.includes(META)));
const fb1 = acc('facebook:gymstorevalle');
check('Facebook sin permiso de contenido: seguidores reales y aviso del permiso de Meta', fb1?.followers === 5600 && fb1.posts.length === 0 && /Page Public Content Access/.test(fb1.error ?? ''), JSON.stringify(fb1));
const fb2 = acc('facebook:fitnesscosta');
check('Facebook con permiso: reacciones, comentarios y compartidos', fb2?.posts[0]?.likes === 310 && fb2.posts[0].comments === 120 && fb2.posts[0].shares === 44);
const yt = acc('youtube:@gymstore');
check('YouTube: suscriptores y visitas reales; Short detectado', yt?.followers === 2300 && yt.posts.find((p) => p.id === 'vid000002')?.views === 52000 && yt.posts.find((p) => p.id === 'vid000002')?.kind === 'Short', JSON.stringify(yt)?.slice(0, 200));
check('TikTok no se consulta (no hay forma gratuita)', !acc('tiktok:gymstore')?.fetchedAt);
check('Ya no existe la captura a mano', (await call('/api/market/social/manual', { method: 'PUT', jar: 'adm', body: { network: 'tiktok', handle: '@gymstore', posts: [] } })).status === 404);

console.log('\nSegunda lectura de la API');
const r2 = await call('/api/market/social/refresh', { method: 'POST', jar: 'adm', body: {} });
const ig2 = r2.json?.data?.accounts?.find((a) => a.key === 'instagram:gymstore');
check('Guarda el historial de seguidores (para ver el crecimiento)', ig2?.history?.length >= 2 && ig2.history.at(-1).followers === 12800, JSON.stringify(ig2?.history));
check('Une las lecturas: actualiza las cifras sin duplicar publicaciones', ig2?.posts?.length === 3, ig2?.posts?.length);
check('Quedan 6 actualizaciones de API hoy', r2.json?.data?.refreshesLeft === 6, r2.json?.data?.refreshesLeft);

console.log('\nBuscar cuentas con IA (3 búsquedas por empresa)');
const before0 = seen.length;
const dsc = await call('/api/market/social/discover', { method: 'POST', jar: 'adm', body: {} });
const searches = seen.slice(before0).filter((x) => x.path.includes(':generateContent'));
check('Busca 3 veces cada empresa a la que le falta alguna cuenta (EvoSport y Fitness Costa)', dsc.status === 200 && dsc.json.searched === 2 && searches.length === 6, `${dsc.status} ${searches.length} ${dsc.text.slice(0, 200)}`);
check('Las 3 búsquedas son distintas y usan la búsqueda de Google', new Set(searches.map((x) => JSON.parse(x.body).contents[0].parts[0].text.match(/«(.+)»/)?.[1])).size === 6 && searches.every((x) => JSON.parse(x.body).tools));
check('Cuenta que aparece en las 3 búsquedas: confirmada y guardada en el perfil', dsc.json?.confirmed?.length === 1 && dsc.json.confirmed[0].handle === 'evosportco' && dsc.json.profile.facebook === 'evosportco', JSON.stringify(dsc.json?.confirmed));
check('Cuenta que aparece en 2 de 3: queda por confirmar (no se guarda sola)', dsc.json?.doubtful?.length === 1 && dsc.json.doubtful[0].handle === 'fitnesscosta' && dsc.json.doubtful[0].votes === 2 && !dsc.json.profile.competitors.find((c) => c.name === 'Fitness Costa').tiktok);
check('"@usuario" sin enlace real se descarta (no se adivina)', !JSON.stringify(dsc.json).includes('inventado'));
const acc2 = await call('/api/market/social/accept', { method: 'POST', jar: 'adm', body: { owner: 'Fitness Costa', network: 'tiktok', handle: 'fitnesscosta' } });
check('"Es correcta": la cuenta dudosa se agrega y queda marcada como encontrada por IA', acc2.status === 200 && acc2.json.profile.competitors.find((c) => c.name === 'Fitness Costa')?.autoFound?.includes('tiktok'));
check('Las cuentas nuevas pasan a medirse', (await call('/api/market/social', { jar: 'adm' })).json?.accounts?.some((a) => a.key === 'tiktok:fitnesscosta'));

console.log('\nInterpretación con IA (sin búsqueda, solo números reales)');
const before = seen.length;
const st = await call('/api/market/run', { method: 'POST', jar: 'adm', body: { kind: 'estadisticas' } });
const ai = seen.slice(before).find((s) => s.path.includes(':generateContent'));
const aiBody = JSON.parse(ai?.body ?? '{}');
check('Genera la interpretación', st.status === 200 && st.json.report.insights.length === 1, st.text.slice(0, 200));
check('No usa la búsqueda de Google (solo los datos medidos)', !aiBody.tools);
const prompt = aiBody.contents?.[0]?.parts?.[0]?.text ?? '';
check('Le pasa las cifras reales con su fuente (52000 visitas de YouTube, 940 me gusta de Instagram)', prompt.includes('visitas 52000') && prompt.includes('me gusta 940') && prompt.includes('API oficial'));
check('Descarta publicaciones que la IA inventó (solo enlaces medidos)', st.json?.report?.winners?.length === 1 && st.json.report.winners[0].url.endsWith('vid000002'), JSON.stringify(st.json?.report?.winners));
const rdr = await call('/api/market/run', { method: 'POST', jar: 'adm', body: { kind: 'redes' } });
const rdPrompt = JSON.parse(seen.at(-1).body).contents[0].parts[0].text;
check('Redes: solo las cuentas del perfil y sin cifras de la IA', rdPrompt.includes('SOLO las cuentas que aparecen en el perfil') && rdPrompt.includes('NO des cifras'));
check('Redes: seguidores tomados del dato real (no "1 millón" de la IA)', rdr.json?.report?.channels?.[0]?.audience === '4.200 seguidores (dato real)' && !rdr.text.includes('millón'), rdr.json?.report?.channels?.[0]?.audience);

console.log('\nAislamiento');
const other = await call('/api/market/social', { jar: 'otro' });
check('Otro cliente no ve las estadísticas de EvoSport', other.status === 200 && other.json.accounts.length === 0 && !JSON.stringify(other.json).includes('gymstore'));
check('El asesor puede ver las estadísticas', (await call('/api/market/social', { jar: 'ase' })).json?.accounts?.length >= 8);
const boot = await call('/api/bootstrap', { jar: 'adm' });
check('Los tokens nunca viajan al navegador', !boot.text.includes(META) && !boot.text.includes(YT) && !(await call('/api/market/social', { jar: 'adm' })).text.includes(META));

mock.close();
const ok = results.filter((r) => r.pass).length;
console.log(`\n${ok}/${results.length} pruebas OK`);
writeFileSync(new URL('./results/social.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), ok, total: results.length, results }, null, 2));
writeFileSync(new URL('./.qa-demo.json', import.meta.url), JSON.stringify({ tenant: evo.id, email: 'adm@social.test', password: admPw }));
process.exit(ok === results.length ? 0 : 1);
