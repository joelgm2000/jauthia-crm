/* Un saludo repetido no es "no te entendí". npx tsx shared/greeting.check.ts */
import assert from 'node:assert/strict';
import { DEFAULT_FLOW, SOLAR_FLOW } from './flow';
import { processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation } from './models';
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed';

const NOW = Date.UTC(2026, 10, 24, 15);
for (const flow of [DEFAULT_FLOW, SOLAR_FLOW]) {
  let conv = newConversation('whatsapp', 'CO.1884811385984903', 'Joel García', NOW);
  const say = (text: string) => {
    const r = processIncoming({ conv, flow, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, { text });
    conv = { ...conv, ...r.patch } as Conversation;
    return r.replies.map((m) => m.text);
  };
  say('Hola');
  for (const s of ['Hola', 'Buenas tardes', 'hola!!']) {
    const t = say(s);
    assert.ok(!t.some((x) => x.includes('no te entendí')), `${s} → ${t.join(' | ')}`);
    assert.ok(t.some((x) => x.includes('cómo te llamas')), t.join(' | '));
  }
  assert.ok(say('Joel, Valledupar').some((x) => x.includes('Mucho gusto, Joel')));
}
console.log('✔ Saludo repetido: OK');
