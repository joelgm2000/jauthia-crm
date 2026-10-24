/* Control de la conversación.  npx tsx shared/control.check.ts */
import { DEFAULT_FLOW } from './flow';
import { EngineInput, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation } from './models';
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed';

function run(title: string, steps: EngineInput[]): Conversation {
  console.log(`\n=== ${title}`);
  let c: Conversation = newConversation('instagram', 'x' + Math.random(), '', Date.now());
  for (const input of steps) {
    const r = processIncoming({ conv: c, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: Date.now() }, input);
    c = { ...c, ...r.patch } as Conversation;
    console.log('>', input.text ?? `[${input.buttonId}]`);
    r.replies.forEach((m) => console.log('   ', m.type.padEnd(8), (m.text || m.cards?.map((x) => x.title).join(', ') || '').replace(/\n/g, ' ⏎ '), m.buttons ? m.buttons.map((b) => `[${b.title}]`).join(' ') : ''));
  }
  console.log('→', c.name, c.stage, 'bot', c.botActive, 'hot', c.hot, JSON.stringify(c.fields));
  return c;
}
run('Caso Carlos: pregunta precio de entrada', [{ text: '¿Cuánto vale la trotadora?' }, { text: 'Carlos de Bosconia' }, { buttonId: 'uso_hogar' }, { text: '80 kg' }, { buttonId: 'modo_trotar' }, { buttonId: 'cant_1' }]);
run('Pregunta frecuente en medio de la calificación', [{ text: 'Hola' }, { text: 'Ana de Valledupar' }, { text: '¿hacen envíos a Bosconia?' }, { buttonId: 'uso_hogar' }]);
run('¿Tiene garantía? no pasa a soporte', [{ text: 'tienen caminadoras?' }, { text: 'tiene garantía?' }]);
run('Garantía real sí pasa a soporte', [{ text: 'compré una caminadora y no prende, necesito la garantía' }]);
run('Quiere comprar sin decir qué', [{ text: 'quiero comprar un producto' }]);
run('Hola normal', [{ text: 'Hola' }]);
run('Envío cuánto vale (FAQ, no cotización)', [{ text: 'hola cuánto vale el envío?' }]);

console.log('\n\n######## DATOS OBLIGATORIOS ########');
run('"Lo quiero" sin cantidad: la pide antes del asesor', [{ text: 'Hola' }, { text: 'Laura de Valledupar' }, { text: 'quiero ver caminadoras' }, { buttonId: 'sel_trot-vigor' }, { buttonId: 'qty_2' }]);
run('Da el nombre sin ciudad: pide la ciudad enseguida', [{ text: 'Hola' }, { text: 'Me llamo Pedro' }, { text: 'Bosconia' }]);
run('Quiere comprar sin elegir modelo: le pide que elija', [{ text: 'tienen caminadoras?' }, { text: 'Ana de Valledupar' }, { text: 'la quiero comprar ya' }, { buttonId: 'sel_trot-latte' }, { text: 'una' }]);
run('Pide hablar con una persona: pasa de inmediato', [{ text: 'hola, quiero hablar con un asesor' }]);
