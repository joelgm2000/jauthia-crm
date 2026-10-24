// Prueba de masividad: N clientes escriben por WhatsApp AL MISMO TIEMPO (webhooks firmados como los de Meta).
// Mide el tiempo desde que llega el mensaje hasta que la respuesta del bot aparece en el CRM (Socket.io).
// Uso: node load.mjs 50,200,500,1000
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const req = createRequire('C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/backend/package.json');
const reqFront = createRequire('C:/Users/JOEL/Documents/JAUTHIA CRM EvoSport/jauthia-crm/frontend/package.json');
const pg = req('pg');
const { io } = reqFront('socket.io-client');

const B = 'http://localhost:3100';
const LEVELS = (process.argv[2] ?? '50,200,500,1000').split(',').map(Number);
const pw = () => randomBytes(12).toString('base64url') + 'Aa1';
const jars = {};
async function call(path, { method = 'GET', body, jar, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-CRM-Request': '1', ...headers };
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const sup = (action, data) => call('/api/super/action', { method: 'POST', jar: 'owner', body: { action, data } });

// --- Preparación: dueño, cliente "EvoSport" con su catálogo y su flujo, admin conectado al CRM ---
const ownerPw = pw(), adminPw = pw();
// La clave del dueño de QA se guarda solo en el scratchpad para poder repetir la prueba sobre la misma base.
const ownerFile = new URL('./.qa-owner', import.meta.url);
const { existsSync, readFileSync } = await import('node:fs');
if ((await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel', email: 'joelgarciamaestrejgm@gmail.com', password: ownerPw } })).status === 200) writeFileSync(ownerFile, ownerPw);
else await call('/api/auth/login', { method: 'POST', jar: 'owner', body: { email: 'joelgarciamaestrejgm@gmail.com', password: existsSync(ownerFile) ? readFileSync(ownerFile, 'utf8') : '' } });
const runTag = Date.now().toString(36).slice(-4);
const base = { modules: { crm: true, chatbot: true }, plan: { name: 'Completo', price: 300000, currency: 'COP', billingDay: 5 }, status: 'activo' };
const tenant = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport Carga ' + runTag, city: 'Valledupar' }, flowTemplate: 'evosport', sampleCatalog: true })).json.result.tenant;
await sup('createTenantUser', { tenantId: tenant.id, name: 'Admin', email: `admin-${runTag}@carga.test`, password: adminPw, role: 'admin' });
await call('/api/auth/login', { method: 'POST', jar: 'adm', body: { email: `admin-${runTag}@carga.test`, password: adminPw } });
const APP_SECRET = randomBytes(24).toString('hex');
await call('/api/action', { method: 'POST', jar: 'adm', body: { action: 'saveChannelSecrets', data: { channel: 'whatsapp', secrets: { appSecret: APP_SECRET, verifyToken: randomBytes(8).toString('hex') } } } });

const waiting = new Map(); // conversationId → { inId, gotIn, resolve }
const sock = io(B, { path: '/socket.io', transports: ['websocket'], extraHeaders: { Cookie: jars.adm } });
await new Promise((res, rej) => { sock.on('connect', res); sock.on('connect_error', rej); });
let events = 0;
sock.on('message', ({ conversationId, message }) => {
  events++;
  const w = waiting.get(conversationId);
  if (!w) return;
  if (message.direction === 'in' && message.id === w.inId) w.gotIn = performance.now();
  else if (w.gotIn && message.direction === 'out' && message.sender === 'bot') { waiting.delete(conversationId); w.resolve(true); }
});

const SCRIPT = (n) => ['Hola, buenas tardes', `Me llamo Cliente ${n}, de Valledupar`, 'Quiero comprar una caminadora', 'Es para caminar en la casa'];
const sign = (body) => 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0);
const apiPid = (() => { try { return execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3100 -State Listen).OwningProcess"`).toString().trim(); } catch { return ''; } })();
const memMb = () => { try { return Math.round(Number(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${apiPid}).WorkingSet64"`).toString().trim()) / 1048576); } catch { return 0; } };

async function customer(level, i, stats) {
  const from = `57${String(300 + level).padStart(4, '0')}${String(i).padStart(6, '0')}`;
  const convId = `whatsapp_${from}`;
  for (const [turn, text] of SCRIPT(i + 1).entries()) {
    const wamid = `wamid.L${level}C${i}T${turn}`;
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
      messaging_product: 'whatsapp', metadata: { phone_number_id: '1' }, contacts: [{ wa_id: from, profile: { name: `Cliente ${i + 1}` } }],
      messages: [{ from, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });
    const replied = new Promise((resolve) => waiting.set(convId, { inId: 'in_' + wamid.replace(/[^\w-]/g, ''), gotIn: 0, resolve }));
    const t0 = performance.now();
    let status = 0;
    try {
      status = (await fetch(`${B}/webhooks/${tenant.id}/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sign(body) }, body })).status;
    } catch (e) { status = -1; stats.codes[e.cause?.code ?? e.message] = (stats.codes[e.cause?.code ?? e.message] ?? 0) + 1; stats.httpErrors--; }
    const tAck = performance.now() - t0;
    if (status !== 200) { stats.httpErrors++; waiting.delete(convId); stats.codes[status] = (stats.codes[status] ?? 0) + 1; return; }
    stats.acks.push(tAck);
    const ok = await Promise.race([replied, new Promise((r) => setTimeout(() => r(false), 30_000))]);
    if (!ok) { stats.timeouts++; waiting.delete(convId); return; }
    stats.lat.push(performance.now() - t0);
    stats.replied++;
  }
  stats.completed++;
}

const db = new pg.Client({ connectionString: 'postgresql://crm:qa_test_only@localhost:5544/crm_qa' });
await db.connect();
const runs = [];
for (const level of LEVELS) {
  const stats = { level, acks: [], lat: [], replied: 0, completed: 0, timeouts: 0, httpErrors: 0, codes: {} };
  const memBefore = memMb();
  let memPeak = memBefore;
  const memTimer = setInterval(() => { memPeak = Math.max(memPeak, memMb()); }, 2000);
  console.log(`\n▶ ${level} clientes simultáneos (${level * 4} mensajes)…`);
  const t0 = performance.now();
  await Promise.all(Array.from({ length: level }, (_, i) => customer(level, i, stats)));
  const secs = (performance.now() - t0) / 1000;
  clearInterval(memTimer);
  await new Promise((r) => setTimeout(r, 1500));
  const prefix = `whatsapp_57${String(300 + level).padStart(4, '0')}%`;
  const dbc = (await db.query(`SELECT count(DISTINCT conversation_id)::int convs,
      count(*) FILTER (WHERE data->>'direction' = 'in')::int ins,
      count(*) FILTER (WHERE data->>'sender' = 'bot')::int bots
      FROM messages WHERE tenant_id = $1 AND conversation_id LIKE $2`, [tenant.id, prefix])).rows[0];
  const stages = (await db.query(`SELECT data->>'stage' stage, count(*)::int n FROM conversations WHERE tenant_id = $1 AND id LIKE $2 GROUP BY 1 ORDER BY 2 DESC`, [tenant.id, prefix])).rows;
  stats.lat.sort((a, b) => a - b);
  stats.acks.sort((a, b) => a - b);
  const run = {
    level, messages: level * 4, seconds: +secs.toFixed(1), throughput: +((stats.replied) / secs).toFixed(1),
    replied: stats.replied, completed: stats.completed, timeouts: stats.timeouts, httpErrors: stats.httpErrors, codes: stats.codes,
    ackP50: Math.round(pct(stats.acks, 50)), ackP95: Math.round(pct(stats.acks, 95)),
    p50: Math.round(pct(stats.lat, 50)), p95: Math.round(pct(stats.lat, 95)), p99: Math.round(pct(stats.lat, 99)), max: Math.round(stats.lat.at(-1) ?? 0),
    db: dbc, stages, memBefore, memPeak,
  };
  runs.push(run);
  console.log(JSON.stringify(run));
}
sock.close();
await db.end();
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/load.json`, import.meta.url), JSON.stringify({ at: new Date().toISOString(), tenant: tenant.id, events, runs, script: SCRIPT('N') }, null, 2));
process.exit(0);
