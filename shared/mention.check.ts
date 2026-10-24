/* Pruebas de conversación cortas.  npx tsx shared/mention.check.ts */
import { DEFAULT_FLOW } from './flow';
import { EngineInput, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation } from './models';
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed';

function run(title: string, steps: EngineInput[]): Conversation {
  console.log(`\n=== ${title}`);
  let c: Conversation = newConversation('webchat', 'x', '', Date.now());
  for (const input of steps) {
    const r = processIncoming({ conv: c, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: Date.now() }, input);
    c = { ...c, ...r.patch } as Conversation;
    console.log('>', input.text ?? `[${input.buttonId}]`, `  (caliente: ${c.hot}, puntaje ${c.score})`);
    r.replies.forEach((m) => console.log('  ', m.type.padEnd(8), (m.text || m.cards?.map((x) => x.title).join(', ') || '').slice(0, 70), m.buttons ? m.buttons.map((b) => `[${b.title}]`).join(' ') : ''));
  }
  console.log('→', c.name, c.stage, c.fields);
  return c;
}

run('Nombre + producto en el mismo mensaje', [{ text: 'Hola' }, { text: 'Soy Mario de Valledupar, tienen bicicletas de spinning?' }]);
run('Quiere comprar sin decir qué', [{ text: 'quiero comprar un producto' }, { buttonId: 'cat_cardio' }, { buttonId: 'sub_trotadora' }, { text: '70 kg' }, { buttonId: 'modo_caminar' }, { buttonId: 'cant_1' }, { text: 'Ana de Valledupar' }, { buttonId: 'uso_hogar' }]);
run('Elige rápido: no debe ser caliente en el 2.º mensaje', [{ text: 'tienen caminadoras?' }, { buttonId: 'sel_trot-vigor' }]);

run('Caso de la captura: quiere comprar una caminadora', [{ text: 'hola' }, { text: 'Quiero comprar una caminadora' }, { text: 'Ana de Valledupar' }, { buttonId: 'uso_hogar' }]);
run('Ya vio productos y vuelve a pedir comprar → asesor', [{ text: 'tienen caminadoras?' }, { text: 'Luis de Valledupar' }, { text: 'quiero comprar la vigor' }]);
run('Pide precio de entrada', [{ text: 'cuanto vale la trotadora?' }]);
const paused = run('Bot en pausa: Ver detalles igual responde', [{ text: 'tienen caminadoras?' }]);
const r = processIncoming({ conv: { ...paused, botActive: false }, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: Date.now() }, { buttonId: 'det_trot-vigor' });
console.log('  (pausa) respuestas:', r.replies.map((m) => `${m.type}:${m.header}`));
