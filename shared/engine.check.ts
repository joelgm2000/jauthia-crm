/* Prueba rápida del motor: npx tsx shared/engine.check.ts */
import { DEFAULT_FLOW } from './flow';
import { botToggle } from './actions';
import { followUpDue } from './automation';
import { EngineInput, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation } from './models';
import { SEED_PRODUCTS, SEED_SETTINGS, SEED_TEMPLATES } from './seed';

function chat(script: EngineInput[]): Conversation {
  let conv = newConversation('whatsapp', '573001112233', '', Date.UTC(2026, 9, 14, 15));
  for (const input of script) {
    const r = processIncoming({ conv, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: Date.UTC(2026, 9, 14, 15) }, input);
    conv = { ...conv, ...r.patch } as Conversation;
    console.log(`\n👤 ${input.text ?? '[btn ' + input.buttonId + ']'}`);
    for (const m of r.replies) {
      const extra = m.buttons?.map((b) => `[${b.title}]`).join(' ') ?? '';
      const cards = m.cards?.map((c) => `{${c.title}}`).join(' ') ?? '';
      console.log(`🤖 (${m.type}) ${m.header ? m.header + ' | ' : ''}${m.text.split('\n')[0]} ${extra} ${cards}`);
    }
    r.notes.forEach((n) => console.log('   📝', n));
    r.tasks.forEach((t) => console.log('   ✅ tarea:', t.title, '-', t.detail));
  }
  console.log('\nETAPA', conv.stage, 'SCORE', conv.score, 'HOT', conv.hot, 'TAGS', conv.tags, 'FIELDS', conv.fields);
  return conv;
}

chat([
  { text: 'Hola buenas, tienen caminadoras?' },
  { text: 'Soy Carmen de Villanueva, La Guajira' },
  { buttonId: 'uso_hogar' },
  { text: '75 kilos' },
  { text: 'caminar' },
  { buttonId: 'cant_1' },
  { buttonId: 'det_trot-evoflex' },
  { buttonId: 'sel_trot-evoflex' },
]);

console.log('\n================ FUERZA + precio');
chat([{ text: 'buenas' }, { text: 'Juan, Valledupar' }, { text: 'es para un gimnasio' }, { buttonId: 'cat_fuerza' }, { text: 'jaula' }, { text: '2.40' }, { text: 'si' }, { text: 'mas de 5' }, { buttonId: 'more_options' }, { text: 'cuanto vale la jaula?' }]);

console.log('\n================ no entiende');
const lost = chat([{ text: 'hola' }, { text: 'Ana de Bogotá' }, { text: 'asdf' }, { text: 'qwer' }]);
const c2 = chat([{ text: 'hola' }, { text: 'Pedro de Cali' }, { buttonId: 'uso_hogar' }, { buttonId: 'cat_peso' }, { text: 'mancuernas' }, { text: '2,5 a 10 kg, 4 pares' }, { buttonId: 'none_liked' }]);
let t = Date.UTC(2026, 9, 14, 15);
// Remarketing en WhatsApp: libre dentro de 24 h; después necesita plantilla aprobada.
let conv: Conversation = { ...c2, channel: 'whatsapp', lastInboundAt: t, waitingSince: t };
const tpl = SEED_TEMPLATES[0];
const flow = { ...DEFAULT_FLOW, followUps: DEFAULT_FLOW.followUps.map((f, i) => (i === 1 ? { ...f, imageUrl: '/products/trotadora.svg' } : i === 2 ? { ...f, templateId: tpl.id } : f)) };
for (const h of [3, 21, 73, 200]) {
  const a = followUpDue(conv, flow, { products: SEED_PRODUCTS, templates: SEED_TEMPLATES.map((x) => ({ ...x, status: 'APPROVED' as const })), companyName: 'EvoSport', now: t + h * 3600e3 });
  console.log(h, 'h →', a?.note, a?.message ? `[${a.message.type}${a.message.templateName ? ' ' + a.message.templateName : ''}${a.message.imageUrl ? ' + imagen' : ''}] ${a.message.text}` : '');
  if (a) conv = { ...conv, ...a.patch } as Conversation;
}
void lost;

console.log('\n================ pedido con varios productos');
const multi = chat([
  { text: 'Hola buenas, tienen caminadoras?' },
  { text: 'Soy Carmen de Villanueva, La Guajira' },
  { buttonId: 'uso_hogar' },
  { text: '75 kilos' },
  { text: 'caminar' },
  { buttonId: 'cant_1' },
  { buttonId: 'sel_trot-evoflex' },
  { buttonId: 'cart_more' },
  { buttonId: 'cat_peso' },
  { text: 'mancuernas' },
  { text: '2,5 a 10 kg, 4 pares' },
]);
let mc: Conversation = multi;
const step = (input: EngineInput) => {
  const r = processIncoming({ conv: mc, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: Date.UTC(2026, 9, 14, 15) }, input);
  mc = { ...mc, ...r.patch } as Conversation;
  console.log(`\n👤 ${input.text ?? '[btn ' + input.buttonId + ']'}`);
  r.replies.forEach((m) => console.log(`🤖 (${m.type}) ${m.text.replace(/\n/g, ' / ')} ${m.buttons?.map((b) => `[${b.title}]`).join(' ') ?? ''} ${m.cards?.map((c) => `{${c.title}}`).join(' ') ?? ''}`));
  r.tasks.forEach((t) => console.log('   ✅ tarea:', t.title, '-', t.detail));
  return r;
};
const pesas = SEED_PRODUCTS.find((p) => p.id === multi.bot.lastProductIds[0])!;
step({ buttonId: 'sel_' + pesas.id });
step({ buttonId: 'qty_2' });
step({ text: 'no, eso es todo gracias' });
console.log('CART', mc.cart, 'VALUE', mc.value, 'BOT', mc.botActive, 'STAGE', mc.stage);


console.log('\n================ asesor devuelve el bot');

mc = { ...mc, ...botToggle(mc).patch } as Conversation;
step({ text: 'hola, gracias por la atención' });
console.log('CART tras devolver', mc.cart?.map((i) => i.name), 'NODE', mc.bot.nodeId);
