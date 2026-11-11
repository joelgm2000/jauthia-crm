/* Prueba: el cliente se equivoca en su nombre/ciudad y luego lo corrige; gimnasio pasa al asesor. npx tsx shared/correction.check.ts */
import assert from 'node:assert/strict';
import { DEFAULT_FLOW, FlowConfig } from './flow';
import { EngineInput, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation } from './models';
import { parseCorrection, parseNameCity } from './parse';
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed';

const NOW = Date.UTC(2026, 9, 14, 15);

function run(script: EngineInput[], flow: FlowConfig = DEFAULT_FLOW) {
  let conv = newConversation('whatsapp', '573001112233', '', NOW);
  let last = { texts: [] as string[], notes: [] as string[] };
  for (const input of script) {
    const r = processIncoming({ conv, flow, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, input);
    conv = { ...conv, ...r.patch } as Conversation;
    last = { texts: r.replies.map((m) => m.text), notes: r.notes };
  }
  return { conv, ...last };
}

// --- Lectura de nombre y ciudad ---
assert.deepEqual(parseNameCity('Valledupar, Joel'), { name: 'Joel', city: 'Valledupar' }, 'al revés: se corrige solo');
assert.deepEqual(parseNameCity('Joel, Valledupar'), { name: 'Joel', city: 'Valledupar' });
assert.deepEqual(parseNameCity('Valledupar'), { city: 'Valledupar' }, 'solo la ciudad: no es un nombre');
assert.deepEqual(parseNameCity('Soy Mario de Valledupar'), { name: 'Mario', city: 'Valledupar' });
assert.deepEqual(parseNameCity('Pedro, Pueblito', ['Pueblito']), { name: 'Pedro', city: 'Pueblito' });
assert.deepEqual(parseCorrection('Me llamo Joel'), { name: 'Joel' });
assert.deepEqual(parseCorrection('No me llamo Valledupar, me llamo Joel'), { name: 'Joel' });
assert.deepEqual(parseCorrection('me llamo joel y soy de Bosconia'), { name: 'Joel', city: 'Bosconia' });
assert.deepEqual(parseCorrection('mi nombre es Ana María'), { name: 'Ana María' });
assert.deepEqual(parseCorrection('vivo en Santa Marta, quiero una trotadora'), { city: 'Santa Marta' });
assert.deepEqual(parseCorrection('soy de un gimnasio'), {}, '"soy de un…" no es una ciudad');
assert.deepEqual(parseCorrection('es para mi casa'), {});
assert.deepEqual(parseCorrection('Me llamo Valledupar'), {}, 'una ciudad no es un nombre');

// --- El caso de la prueba: "Valledupar, Joel" ya no confunde al bot ---
{
  const { conv, texts } = run([{ text: 'Hola' }, { text: 'Valledupar, Joel' }]);
  assert.equal(conv.name, 'Joel');
  assert.equal(conv.fields.ciudad, 'Valledupar');
  assert.ok(!conv.tags.includes('fuera-de-valledupar'));
  assert.ok(texts[0].startsWith('Mucho gusto, Joel'), texts[0]);
}

// --- Se equivocó (nombre y ciudad al revés en un formato que no reconocemos) y corrige después ---
{
  const { conv, texts, notes } = run([{ text: 'Hola' }, { text: 'Pueblito, Joel' }, { text: 'Me llamo Joel' }]);
  assert.equal(conv.name, 'Joel', 'toma el nombre corregido');
  assert.equal(conv.fields.ciudad, 'Pueblito', 'la ciudad era lo que había quedado como nombre');
  assert.ok(texts[0].startsWith('¡Gracias, Joel! Ya lo corregí'), texts[0]);
  assert.ok(texts[0].includes('¿El equipo es para tu casa o para un gimnasio o negocio?'), 'vuelve a la pregunta en la que iba');
  assert.ok(notes.some((n) => n.includes('corrigió sus datos')), 'el asesor ve la corrección');
  assert.equal(conv.bot.retries, 0, 'no cuenta como "no te entendí"');
}

// --- Corrige solo la ciudad: se quita o pone la etiqueta "fuera de Valledupar" ---
{
  const a = run([{ text: 'Hola' }, { text: 'Joel de Bosconia' }]);
  assert.ok(a.conv.tags.includes('fuera-de-valledupar'));
  const b = run([{ text: 'Hola' }, { text: 'Joel de Bosconia' }, { text: 'perdón, vivo en Valledupar' }]);
  assert.equal(b.conv.fields.ciudad, 'Valledupar');
  assert.ok(!b.conv.tags.includes('fuera-de-valledupar'), 'ya no está fuera de la zona');
  assert.ok(b.texts[0].includes('ya anoté que nos escribes desde Valledupar'), b.texts[0]);
}

// --- Gimnasio/negocio pasa al asesor enseguida, aunque el flujo guardado siga con más preguntas ---
{
  const old: FlowConfig = structuredClone(DEFAULT_FLOW);
  for (const n of old.nodes) for (const o of n.options ?? []) if (o.id === 'uso_negocio') o.next = 'categoria';
  const { conv, texts } = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { buttonId: 'uso_negocio' }], old);
  assert.equal(conv.botActive, false, 'el bot se pausa');
  assert.equal(conv.priority, 'alta');
  assert.ok(conv.tags.includes('gym'));
  assert.ok(!texts.some((t) => t.includes('Elige una categoría')), 'no sigue preguntando la categoría');
}

console.log('✔ Correcciones de nombre/ciudad y traspaso de gimnasio: OK');
