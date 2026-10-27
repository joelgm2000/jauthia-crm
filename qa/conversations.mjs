// Conversaciones de demostración del bot de EvoSport sobre la instancia de QA.
// Crea el cliente "EvoSport" (flujo y catálogo de ejemplo) y corre cada caso con el simulador del CRM.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const B = 'http://localhost:3100';
const OWNER = 'joelgarciamaestrejgm@gmail.com';
const jars = {};
async function call(path, { method = 'GET', body, jar } = {}) {
  const h = { 'Content-Type': 'application/json', 'X-CRM-Request': '1' };
  if (jar && jars[jar]) h.Cookie = jars[jar];
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = r.headers.get('set-cookie');
  if (set && jar) jars[jar] = set.split(';')[0];
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const act = async (action, data) => {
  const r = await call('/api/action', { method: 'POST', jar: 'adm', body: { action, data } });
  if (r.status !== 200) throw new Error(`${action} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.result;
};
const sup = (action, data) => call('/api/super/action', { method: 'POST', jar: 'owner', body: { action, data } });

const ownerFile = new URL('./.qa-owner', import.meta.url);
const ownerPw = existsSync(ownerFile) ? readFileSync(ownerFile, 'utf8') : randomBytes(12).toString('base64url') + 'Aa1';
if ((await call('/api/auth/setup', { method: 'POST', jar: 'owner', body: { name: 'Joel García', email: OWNER, password: ownerPw } })).status === 200) writeFileSync(ownerFile, ownerPw);
else await call('/api/auth/login', { method: 'POST', jar: 'owner', body: { email: OWNER, password: ownerPw } });

const base = { modules: { crm: true, chatbot: true }, plan: { name: 'CRM + Chatbot', price: 350000, currency: 'COP', billingDay: 5 }, status: 'activo' };
const tenant = (await sup('saveTenant', { tenant: { ...base, name: 'EvoSport', legalId: '900.123.456-7', city: 'Valledupar', address: 'Calle 16 # 9-45', contactName: 'Gerencia EvoSport', contactEmail: 'gerencia@evosport.test', contactPhone: '+57 300 000 0000' }, flowTemplate: 'evosport', sampleCatalog: true })).json.result.tenant;
await sup('saveTenant', { tenant: { ...base, name: 'Panadería La Espiga', city: 'Bogotá', modules: { crm: false, chatbot: true }, plan: { name: 'Solo chatbot', price: 150000, currency: 'COP', billingDay: 15 }, status: 'prueba' }, flowTemplate: 'generico' });
const adminPw = randomBytes(12).toString('base64url') + 'Aa1';
await sup('createTenantUser', { tenantId: tenant.id, name: 'Laura Asesora', email: 'laura@evosport.test', password: adminPw, role: 'admin' });
await call('/api/auth/login', { method: 'POST', jar: 'adm', body: { email: 'laura@evosport.test', password: adminPw } });
writeFileSync(new URL('./.qa-demo.json', import.meta.url), JSON.stringify({ tenant: tenant.id, email: 'laura@evosport.test', password: adminPw }));

const msgs = async (cid) => (await call(`/api/conversations/${cid}/messages`, { jar: 'adm' })).json.messages;
const conv = async (cid) => (await call('/api/bootstrap', { jar: 'adm' })).json.conversations.find((c) => c.id === cid);
const lastCards = (list) => [...list].reverse().find((m) => m.cards?.length)?.cards ?? [];

const SCENARIOS = [
  {
    key: 'caminadora', channel: 'whatsapp', name: 'María Fernanda',
    title: 'Caso reportado: "Quiero comprar una caminadora"',
    goal: 'El cliente debe ver los productos ANTES de pasar al asesor.',
    steps: [{ text: 'Hola' }, { text: 'Quiero comprar una caminadora' }, { text: 'María Fernanda, de Valledupar' }, { pick: 'sel', title: 'Lo quiero' }, { btn: 'qty_1', title: '1' }, { btn: 'cart_done', title: 'No, es todo' }],
    checks: [
      ['Muestra el carrusel de caminadoras con imagen, Ver detalles y Lo quiero', (s) => s.after[1].some((m) => m.type === 'carousel' && m.cards?.length)],
      ['No pasa al asesor apenas dice "quiero comprar"', (s) => s.convAt[1].botActive === true && !s.convAt[1].hot],
      ['Pide nombre y ciudad con la pregunta corta', (s) => s.after[1].some((m) => /cómo te llamas/i.test(m.text ?? ''))],
      ['Al tocar "Lo quiero" pide la cantidad (dato obligatorio) antes de pasar', (s) => s.after[3].some((m) => /Cuántas unidades/.test(m.text ?? '')) && s.convAt[3].botActive === true],
      ['Con la cantidad pregunta si le interesa otro producto, con su pedido', (s) => s.after[4].some((m) => /otros productos/.test(m.text ?? '') && /1 × Trotadora/.test(m.text) && m.buttons?.length === 2) && s.convAt[4].botActive === true],
      ['"No, es todo": pasa al asesor y queda 🔥 caliente', (s) => s.final.hot === true && s.final.botActive === false && s.final.fields?.cantidad === '1' && s.final.cart?.length === 1],
    ],
  },
  {
    key: 'sin-producto', channel: 'whatsapp', name: 'Ana Lucía',
    title: 'Quiere comprar pero no dice qué',
    goal: 'El bot pregunta qué producto quiere, muestra las categorías y lo guía hasta la recomendación.',
    steps: [{ text: 'quiero comprar un producto' }, { btn: 'cat_cardio', title: 'Cardio' }, { btn: 'sub_trotadora', title: 'Trotadora / caminadora' }, { text: 'peso 70 kg' }, { btn: 'modo_caminar', title: 'Solo caminar' }, { btn: 'cant_1', title: '1 equipo' }, { text: 'Ana Lucía de Valledupar' }, { btn: 'uso_hogar', title: 'Para la casa' }, { pick: 'det', title: 'Ver detalles' }],
    checks: [
      ['Responde "¿Qué producto te gustaría?" con la lista de categorías', (s) => s.after[0].some((m) => m.type === 'list' || m.buttons?.length)],
      ['No marca caliente en los primeros mensajes', (s) => !s.convAt[1].hot],
      ['Recomienda productos según peso y uso', (s) => s.all.some((m) => m.type === 'carousel')],
      ['"Ver detalles" envía la ficha técnica', (s) => s.after.at(-1).some((m) => m.type === 'product')],
    ],
  },
  {
    key: 'precio', channel: 'instagram', name: 'Carlos Ruiz',
    title: 'Caso reportado: pregunta el precio de entrada (Instagram)',
    goal: 'El bot lleva el control: saluda primero, muestra opciones, hace UNA pregunta a la vez, reconoce el nombre y califica hasta recomendar.',
    steps: [{ text: '¿Cuánto vale la trotadora?' }, { text: 'Carlos de Bosconia' }, { btn: 'uso_hogar', title: 'Para mi casa' }, { text: '80 kg' }, { btn: 'modo_trotar', title: 'Trotar' }, { btn: 'cant_1', title: '1' }, { pick: 'sel', title: 'Lo quiero' }, { text: 'no gracias' }],
    checks: [
      ['El saludo va primero, en el mismo mensaje', (s) => /^¡Hola!/.test(s.after[0][0]?.text ?? '')],
      ['Tras las opciones hace una sola pregunta (nombre y ciudad)', (s) => { const said = s.after[0].filter((m) => m.type !== 'carousel' && m.type !== 'note'); return said.length === 2 && /cómo te llamas/.test(said[1].text) && !/cómo te llamas/.test(said[0].text); }],
      ['Reconoce el nombre: "Mucho gusto, Carlos"', (s) => s.after[1].some((m) => /Mucho gusto, Carlos/.test(m.text ?? ''))],
      ['Califica (uso, peso, caminar/trotar) y recomienda según eso', (s) => s.after[5].some((m) => m.type === 'carousel')],
      ['Al elegir usa la cantidad que ya dijo y pregunta si quiere otro producto', (s) => s.after[6].some((m) => m.buttons?.some((b) => b.id === 'cart_done')) && !s.after[6].some((m) => /Cuántas unidades/.test(m.text ?? ''))],
      ['"No gracias": pasa al asesor como 🔥 caliente', (s) => s.final.hot === true && s.final.botActive === false],
    ],
  },
  {
    key: 'faq', channel: 'whatsapp', name: 'Diana Torres',
    title: 'Pregunta frecuente en medio de la calificación',
    goal: 'Si el cliente se sale del guion ("¿hacen envíos?"), el bot responde y retoma la pregunta pendiente.',
    steps: [{ text: 'Hola' }, { text: 'Diana de Valledupar' }, { text: '¿Hacen envíos a Bosconia?' }, { btn: 'uso_hogar', title: 'Para mi casa' }],
    checks: [
      ['Responde la pregunta de envíos', (s) => s.after[2].some((m) => /enviamos a toda Colombia/.test(m.text ?? ''))],
      ['Vuelve a la misma pregunta pendiente (casa o gimnasio)', (s) => s.after[2].some((m) => /sigamos/.test(m.text ?? '') && m.buttons?.length === 2)],
      ['No lo cuenta como "no entendí" y sigue el flujo', (s) => !s.all.some((m) => /no te entendí/i.test(m.text ?? '')) && s.after[3].some((m) => m.type === 'list')],
    ],
  },
  {
    key: 'vuelve-a-comprar', channel: 'messenger', name: 'Luis Mendoza',
    title: 'Ya vio las opciones y pide comprar un modelo (Messenger)',
    goal: 'Con productos ya vistos, pasa al asesor con el modelo de interés guardado y sin repetir el carrusel.',
    steps: [{ text: '¿Tienen caminadoras?' }, { text: 'Luis de Valledupar' }, { text: 'Quiero comprar la Vigor' }, { text: 'son dos' }],
    checks: [
      ['Pide la cantidad antes de pasar', (s) => s.after[2].some((m) => /Cuántas unidades/.test(m.text ?? ''))],
      ['Pasa al asesor', (s) => s.final.botActive === false],
      ['Guarda el modelo de interés', (s) => /vigor/i.test(s.final.fields?.modeloInteres ?? '')],
      ['No repite el carrusel al pasar', (s) => !s.after.at(-1).some((m) => m.type === 'carousel')],
    ],
  },
  {
    key: 'datos', channel: 'whatsapp', name: 'Pedro Gómez',
    title: 'Datos obligatorios antes de pasar al asesor',
    goal: 'El vendedor siempre debe saber nombre, ciudad, producto y cantidad: si falta alguno lo pregunta, uno a la vez, antes de pasar al asesor.',
    steps: [{ text: 'Hola' }, { text: 'Me llamo Pedro' }, { text: 'Bosconia' }, { text: '¿Tienen caminadoras?' }, { text: 'la quiero comprar' }, { pick: 'sel', title: 'Trotadora Latte' }, { text: 'dos' }, { text: 'listo, eso es todo' }],
    checks: [
      ['Se presenta como Sofía, la asesora virtual', (s) => /Soy Sofía/.test(s.after[0][0]?.text ?? '')],
      ['Dio el nombre sin ciudad: pide la ciudad enseguida', (s) => s.after[1].some((m) => /Desde qué ciudad/.test(m.text ?? ''))],
      ['Quiere comprar sin elegir modelo: le pide cuál, con botones de los que vio', (s) => s.after[4].some((m) => m.type === 'buttons' && m.buttons?.some((b) => /^sel_/.test(b.id)))],
      ['Elige el modelo: pide la cantidad', (s) => s.after[5].some((m) => /Cuántas unidades/.test(m.text ?? ''))],
      ['Con los 4 datos pasa al asesor', (s) => s.final.botActive === false && s.final.name === 'Pedro' && s.final.fields?.ciudad === 'Bosconia' && !!s.final.fields?.modeloInteres && s.final.fields?.cantidad === '2-3'],
    ],
  },
  {
    key: 'varios', channel: 'whatsapp', name: 'Camila Rojas',
    title: 'Quiere comprar varios productos',
    goal: 'Cada "Lo quiero" se suma al pedido (con su cantidad); al final pregunta si le interesa otro producto y, cuando dice que no, pasa al asesor con todo el pedido.',
    steps: [{ text: 'Hola, quiero una caminadora' }, { text: 'Camila de Valledupar' }, { pick: 'sel', title: 'Lo quiero' }, { btn: 'qty_1', title: '1' }, { btn: 'cart_more', title: 'Sí, ver otros' }, { btn: 'cat_peso', title: 'Peso libre' }, { text: 'mancuernas' }, { text: '2,5 a 10 kg, 4 pares' }, { btn: 'uso_hogar', title: 'Para mi casa' }, { pick: 'sel', title: 'Lo quiero' }, { btn: 'qty_4', title: '4 o más' }, { btn: 'cart_done', title: 'No, es todo' }],
    checks: [
      ['"Sí, ver otros" muestra las categorías sin perder el pedido', (s) => s.after[4].some((m) => m.type === 'list') && s.convAt[4].cart?.length === 1 && s.convAt[4].botActive === true],
      ['No repite nombre ni ciudad para el segundo producto', (s) => !s.after.slice(4).flat().some((m) => /cómo te llamas|qué ciudad/i.test(m.text ?? ''))],
      ['El segundo producto pide su propia cantidad', (s) => s.after[9].some((m) => /Cuántas unidades/.test(m.text ?? ''))],
      ['Muestra el pedido con los dos productos', (s) => s.after[10].some((m) => /1 × Trotadora/.test(m.text ?? '') && /4\+ × Mancuernas/.test(m.text))],
      ['Pasa al asesor con los dos productos, cada uno con su cantidad', (s) => s.final.botActive === false && s.final.cart?.length === 2 && s.final.cart[0].qty === '1' && s.final.cart[1].qty === '4+'],
      ['El valor estimado suma todo el pedido', (s) => s.final.value === s.final.cart?.[0]?.price + 4 * s.final.cart?.[1]?.price],
      ['La nota para el asesor lista el pedido completo', (s) => /Pedido: 1 × Trotadora .*, 4\+ × Mancuernas/.test(s.final.summary ?? '')],
    ],
  },
  {
    key: 'devuelto', channel: 'whatsapp', name: 'Andrés Polo',
    title: 'El asesor le devuelve la conversación al bot',
    goal: 'El bot recuerda todo (nombre, ciudad y pedido) y, cuando el cliente vuelve a escribir, le ofrece agregar otros productos.',
    steps: [{ text: 'Hola, busco una bicicleta de spinning' }, { text: 'Andrés de Valledupar' }, { pick: 'sel', title: 'Lo quiero' }, { btn: 'qty_1', title: '1' }, { btn: 'cart_done', title: 'No, es todo' }, { action: 'toggleBot' }, { text: 'gracias por la atención' }, { text: 'tienen mancuernas?' }],
    checks: [
      ['Primero pasa al asesor con el pedido', (s) => s.convAt[4].botActive === false && s.convAt[4].cart?.length === 1],
      ['Al reactivar el bot conserva nombre, ciudad y pedido', (s) => s.convAt[5].botActive === true && s.convAt[5].name === 'Andrés' && s.convAt[5].fields?.ciudad === 'Valledupar' && s.convAt[5].cart?.length === 1],
      ['Saluda de nuevo y ofrece otros productos (no dice "no te entendí")', (s) => s.after[6].some((m) => /de nuevo/.test(m.text ?? '') && m.type === 'list') && !s.after[6].some((m) => /no te entendí/i.test(m.text ?? ''))],
      ['Si pide otro producto ("¿tienen mancuernas?"), sigue con ese producto sin volver a preguntar la categoría', (s) => s.after[7].some((m) => /rango de peso/.test(m.text ?? '')) && !s.after[7].some((m) => m.type === 'list')],
    ],
  },
  {
    key: 'garantia', channel: 'webchat', name: 'Sofía Pérez',
    title: 'Garantía / servicio técnico (chat web)',
    goal: 'Detecta que es soporte y lo pasa a una persona.',
    steps: [{ text: 'Hola, compré una caminadora y no prende, necesito la garantía' }],
    checks: [
      ['Detecta soporte y lo pasa a una persona', (s) => s.final.botActive === false && s.final.intent?.type === 'soporte'],
      ['Responde como servicio al cliente (sin cotización ni carrusel)', (s) => s.after[0].some((m) => /servicio al cliente/.test(m.text ?? '')) && !s.after[0].some((m) => m.type === 'carousel' || /cotizaci/.test(m.text ?? ''))],
    ],
  },
  {
    key: 'pausa', channel: 'whatsapp', name: 'Jorge Daza',
    title: 'Asesor toma el chat y el cliente toca "Ver detalles"',
    goal: 'Con el bot en pausa la ficha técnica igual responde (es informativa).',
    steps: [{ text: '¿Tienen bicicletas de spinning?' }, { action: 'toggleBot' }, { pick: 'det', title: 'Ver detalles' }],
    checks: [['La ficha responde con el bot en pausa', (s) => s.final.botActive === false && s.after.at(-1).some((m) => m.type === 'product')]],
  },
  {
    key: 'seguridad', channel: 'webchat', name: 'Prueba seguridad',
    title: 'Mensaje malicioso (prueba de seguridad)',
    goal: 'Código HTML/JavaScript enviado por un cliente se muestra como texto y no se ejecuta.',
    steps: [{ text: "<script>alert('hackeado')</script><img src=x onerror=alert(1)> '; DROP TABLE messages;--" }],
    checks: [['Se guarda literal y la base sigue intacta', (s) => s.all.some((m) => m.direction === 'in' && m.text.includes('<script>'))]],
  },
];

const out = [];
for (const sc of SCENARIOS) {
  const c = (await act('createTestConversation', { channel: sc.channel, name: sc.name })).conversation;
  const after = [], convAt = [];
  let seen = 0;
  for (const st of sc.steps) {
    if (st.action) {
      await act(st.action, { conversationId: c.id });
    } else {
      let buttonId = st.btn;
      if (st.pick) buttonId = `${st.pick}_${lastCards(await msgs(c.id))[0]?.productId}`;
      if (st.pick === 'sel' && st.title && st.title !== 'Lo quiero') {
        const b = (await msgs(c.id)).flatMap((m) => m.buttons ?? []).find((x) => x.title === st.title && x.id.startsWith('sel_'));
        if (b) buttonId = b.id;
      }
      await act('simulateIncoming', { conversationId: c.id, ...(buttonId ? { buttonId, title: st.title } : { text: st.text }) });
    }
    const list = await msgs(c.id);
    after.push(list.slice(seen).filter((m) => m.direction === 'out'));
    seen = list.length;
    convAt.push(await conv(c.id));
    await new Promise((r) => setTimeout(r, 120));
  }
  const all = await msgs(c.id);
  const final = await conv(c.id);
  const s = { after, convAt, all, final };
  const checks = sc.checks.map(([name, fn]) => ({ name, pass: !!fn(s) }));
  console.log(`\n${sc.title}`);
  checks.forEach((k) => console.log(`  ${k.pass ? '✔' : '✘'} ${k.name}`));
  // Si algo falla, se muestra qué respondió el bot en cada paso.
  const brief = (m) => `${m.type}: ${(m.text ?? '').split('\n').join(' / ').slice(0, 110)} ${(m.buttons ?? []).map((b) => b.id).join(',')} ${(m.cards ?? []).map((x) => x.productId).join(',')}`;
  if (checks.some((k) => !k.pass)) after.forEach((a, i) => console.log('    paso', i, JSON.stringify(sc.steps[i]), '→', a.map(brief).join(' || ')));
  console.log(`  → etapa ${final.stage}, caliente ${final.hot}, puntaje ${final.score}, bot ${final.botActive ? 'activo' : 'pausado'}`);
  out.push({ ...sc, checks, id: c.id, messages: all, final: { stage: final.stage, hot: final.hot, score: final.score, botActive: final.botActive, fields: final.fields, intent: final.intent, name: final.name, cart: final.cart, value: final.value } });
}
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/conversations.json', import.meta.url), JSON.stringify({ tenant: tenant.id, scenarios: out }, null, 2));
