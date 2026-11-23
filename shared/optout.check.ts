/* Prueba: "no me escriban más" se respeta de inmediato (política de Meta). npx tsx shared/optout.check.ts */
import assert from 'node:assert/strict';
import { applyEdit } from './actions';
import { autoDraft, followUpDue } from './automation';
import { DEFAULT_FLOW, FlowConfig } from './flow';
import { EngineInput, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation } from './models';
import { isOptOut } from './optout';
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed';
import { requiredOf } from './seller';
import { HOUR } from './time';

const NOW = Date.UTC(2026, 9, 14, 15);

function run(script: EngineInput[]) {
  let conv = newConversation('whatsapp', '573001112233', '', NOW);
  let last = { texts: [] as string[], notes: [] as string[] };
  for (const input of script) {
    const r = processIncoming({ conv, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, input);
    conv = { ...conv, ...r.patch } as Conversation;
    last = { texts: r.replies.map((m) => m.text), notes: r.notes };
  }
  return { conv, ...last };
}

// Frases
for (const s of ['STOP', 'Baja', 'No me escriban más', 'dejen de escribirme por favor', 'no quiero recibir más mensajes', 'quiero darme de baja', 'borren mi número', 'no me vuelvan a llamar']) assert.ok(isOptOut(s), s);
for (const s of ['no me escribieron', 'para la casa', 'no me interesa esa, muéstrame otra', 'me pueden escribir mañana', 'no me llegó el mensaje']) assert.ok(!isOptOut(s), s);

// El bot confirma, marca y avisa al asesor
const { conv, texts, notes } = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { text: 'No me escriban más por favor' }]);
assert.ok(conv.optOutAt, 'queda marcado');
assert.ok(conv.tags.includes('no-contactar'));
assert.equal(texts.length, 1);
assert.ok(texts[0].includes('no te enviaremos más mensajes'), texts[0]);
assert.ok(notes.some((n) => n.includes('pidió no recibir más mensajes')));

// Con el bot en pausa (lo atiende un asesor) también se respeta
const paused = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { buttonId: 'uso_negocio' }, { text: 'STOP' }]);
assert.equal(paused.conv.botActive, false);
assert.ok(paused.conv.optOutAt);

// Sin remarketing ni alertas
const flow: FlowConfig = { ...structuredClone(DEFAULT_FLOW), remarketing: { ...(DEFAULT_FLOW.remarketing ?? {}), enabled: true } as FlowConfig['remarketing'] };
const waiting = { ...conv, waitingSince: NOW - 50 * HOUR } as Conversation;
const ax = { products: SEED_PRODUCTS, templates: [], companyName: 'EvoSport', now: NOW };
assert.equal(followUpDue(waiting, flow, ax), null, 'no hay remarketing');
assert.ok(autoDraft(waiting, ax, 'Hola {nombre}', undefined, undefined).skipped?.includes('pidió no recibir'), 'ni mensajes automáticos');

// El asesor puede quitarlo solo si el cliente lo autoriza
const back = applyEdit(conv, { optOut: false });
assert.equal(back.optOutAt, null);
assert.ok(!back.tags?.includes('no-contactar'));

// El bot nunca pide la cédula (aunque un flujo viejo la tenga como obligatoria)
const old: FlowConfig = { ...structuredClone(DEFAULT_FLOW), required: [{ key: 'cedula', label: 'Cédula', when: 'antes_asesor' }, { key: 'nombre', label: 'Nombre', when: 'inicio' }] };
assert.deepEqual(requiredOf(old).map((r) => r.key), ['nombre']);

// ---- Permiso para promociones (opt-in) ----
// Al pasar al asesor (gimnasio) el bot pregunta UNA vez, solo en WhatsApp.
const gym = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { buttonId: 'uso_negocio' }]);
assert.ok(gym.texts.some((t) => t.includes('¿Te avisamos por aquí de ofertas')), gym.texts.join(' | '));
assert.ok(gym.conv.bot.optInAsked);
const yes = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { buttonId: 'uso_negocio' }, { buttonId: 'optin_si' }]);
assert.ok(yes.conv.optInAt, 'aceptó (aunque el bot esté en pausa con el asesor)');
assert.ok(yes.conv.tags.includes('acepta-promociones'));
assert.ok(yes.texts[0].includes('escribe STOP'));
const no = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { buttonId: 'uso_negocio' }, { buttonId: 'optin_no' }]);
assert.ok(!no.conv.optInAt);
// Fuera de las 24 h: sin permiso no sale la plantilla; con permiso sí
const tpl: import('./models').WaTemplate = { id: 't1', name: 'promo', category: 'MARKETING', kind: 'text', status: 'APPROVED', language: 'es', body: 'Hola {{1}}', buttons: [] };
const ax2 = { ...ax, templates: [tpl] };
const old24 = (c: Conversation) => ({ ...c, lastInboundAt: NOW - 30 * HOUR }) as Conversation;
assert.ok(autoDraft(old24(no.conv), ax2, 'Hola', undefined, 't1').skipped?.includes('no ha aceptado recibir promociones'));
assert.equal(autoDraft(old24(yes.conv), ax2, 'Hola', undefined, 't1').draft?.type, 'template');
// Dentro de las 24 h se le puede responder normal (la conversación la abrió él)
assert.equal(autoDraft({ ...no.conv, lastInboundAt: NOW - HOUR } as Conversation, ax2, 'Hola', undefined, 't1').draft?.type, 'text');
// Si después pide la baja, se pierde el permiso
const later = run([{ text: 'Hola' }, { text: 'Joel, Valledupar' }, { buttonId: 'uso_negocio' }, { buttonId: 'optin_si' }, { text: 'ya no me escriban' }]);
assert.ok(later.conv.optOutAt && !later.conv.optInAt && !later.conv.tags.includes('acepta-promociones'));

console.log('✔ Opt-out, permiso de promociones y datos sensibles: OK');
