/* Prueba de citas: npx tsx shared/citas.check.ts */
import assert from 'node:assert/strict';
import { citaLabel, DEFAULT_CITAS, localToUtc, openDays, parseDay, parseTime, slotsFor } from './citas';
import { DEFAULT_FLOW, FlowConfig } from './flow';
import { EngineInput, EngineResult, processIncoming } from './flow-engine';
import { newConversation } from './messages';
import { Conversation, CrmTask } from './models';
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed';

// Miércoles 14 de octubre de 2026, 10:00 a. m. en Bogotá.
const NOW = Date.UTC(2026, 9, 14, 15);
const TZ = SEED_SETTINGS.hours.timezone;
const flow: FlowConfig = { ...structuredClone(DEFAULT_FLOW), citas: { ...structuredClone(DEFAULT_CITAS), enabled: true, address: 'Calle 16 # 10-20, Valledupar' } };

// --- Funciones de fechas ---
assert.equal(localToUtc('2026-10-14', 15 * 60, TZ), Date.UTC(2026, 9, 14, 20));
assert.equal(citaLabel(Date.UTC(2026, 9, 14, 20), TZ), 'miércoles 14 de octubre, 3:00 pm');
const days = openDays(SEED_SETTINGS, NOW, 7);
assert.equal(days[0].title, 'Hoy');
assert.equal(days[1].title, 'Mañana');
assert.ok(!days.some((d) => d.key === '2026-10-18'), 'el domingo está cerrado');
// Hoy a las 10:00 ya pasaron las 8:30 y 9:30 (y 10:30 queda a menos de 30 min? no: 10:30 sí está).
assert.deepEqual(slotsFor(SEED_SETTINGS, '2026-10-14', NOW).slice(0, 2), [10 * 60 + 30, 11 * 60 + 30]);
assert.equal(parseDay('el viernes', days, '2026-10-14'), '2026-10-16');
assert.equal(parseDay('mañana en la tarde', days, '2026-10-14'), '2026-10-15');
assert.equal(parseDay('pasado mañana', days, '2026-10-14'), '2026-10-16');
assert.equal(parseDay('en la mañana', days, '2026-10-14'), undefined);
assert.equal(parseTime('a las 3'), 15 * 60);
assert.equal(parseTime('3:30 pm'), 15 * 60 + 30);
assert.equal(parseTime('10 de la mañana'), 10 * 60);
assert.equal(parseTime('el 15', true), undefined);
assert.equal(parseTime('mañana a las 4', true), 16 * 60);

// --- Conversaciones ---
function chat(script: EngineInput[], f = flow, start?: Partial<Conversation>): { conv: Conversation; last: EngineResult; tasks: CrmTask[]; all: string[] } {
  let conv = { ...newConversation('whatsapp', '573001112233', '', NOW), ...start } as Conversation;
  let last!: EngineResult;
  const tasks: CrmTask[] = [];
  const all: string[] = [];
  for (const input of script) {
    last = processIncoming({ conv, flow: f, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, input);
    conv = { ...conv, ...last.patch } as Conversation;
    tasks.push(...(last.tasks as CrmTask[]));
    for (const r of last.replies) all.push(`${r.text} ${(r.buttons ?? []).map((b) => `[${b.id}|${b.title}]`).join(' ')}`);
  }
  return { conv, last, tasks, all };
}

// 1) Pide cita escribiendo, elige el día con la lista y la hora con texto.
{
  const { conv, tasks, all } = chat([
    { text: 'Hola' },
    { text: 'Ana de Valledupar' },
    { text: '¿Puedo pasar por la tienda a verla?' },
    { buttonId: 'cdia_2026-10-16' },
    { text: 'a las 3' },
  ]);
  assert.ok(all.some((t) => t.includes('¿Qué día quieres tu cita')), 'pregunta el día');
  assert.ok(all.some((t) => t.includes('[cita_no|No puedo ir]')), 'ofrece "No puedo ir"');
  assert.ok(all.some((t) => t.includes('Tu cita quedó para el viernes 16 de octubre a las 3:00 pm') && t.includes('Calle 16')), all.join('\n'));
  assert.equal(conv.cita?.status, 'agendada');
  assert.equal(conv.cita?.at, Date.UTC(2026, 9, 16, 20));
  assert.equal(conv.botActive, false);
  assert.equal(conv.stage, 'asesor');
  assert.ok(tasks.some((t) => t.title === 'Cita en la tienda: Ana' && t.dueAt === conv.cita!.at));
}

// 2) Día y hora en un solo mensaje.
{
  const { conv } = chat([{ text: 'Hola, quiero agendar una cita' }, { text: 'mañana a las 10 de la mañana' }]);
  assert.equal(conv.cita?.at, localToUtc('2026-10-15', 10 * 60, TZ));
}

// 3) Hora fuera del horario: vuelve a preguntar.
{
  const { conv, all } = chat([{ text: 'quiero agendar' }, { buttonId: 'cdia_2026-10-16' }, { text: 'a la 1 pm' }]);
  assert.equal(conv.cita, undefined);
  assert.ok(all.some((t) => t.includes('A esa hora no podemos atenderte')));
}

// 4) No puede ir: videollamada agendada.
{
  const { conv, tasks, all } = chat([{ text: 'quiero agendar una cita' }, { buttonId: 'cita_no' }, { buttonId: 'cita_vllamada' }, { buttonId: 'vdia_2026-10-15' }, { buttonId: 'vhora_2026-10-15_1630' }]);
  assert.ok(all.some((t) => t.includes('[cita_video|🎬 Ver video]') && t.includes('[cita_domicilio|🚚 A domicilio]')));
  assert.equal(conv.cita?.kind, 'videollamada');
  assert.ok(all.some((t) => t.includes('Tu videollamada quedó para el jueves 15 de octubre a las 4:30 pm')), all.join('\n'));
  assert.ok(tasks.some((t) => t.title.startsWith('Videollamada:')));
}

// 5) "Me queda lejos" → alternativas; domicilio pasa al asesor.
{
  const { conv, tasks, all } = chat([{ text: 'Hola' }, { text: 'Luis de Bosconia' }, { text: 'me queda muy lejos ir' }, { buttonId: 'cita_domicilio' }]);
  assert.ok(all.some((t) => t.includes('cita_videollamada') || t.includes('cita_vllamada')));
  assert.ok(conv.tags.includes('domicilio'));
  assert.equal(conv.botActive, false);
  assert.ok(tasks.some((t) => t.title.startsWith('Coordinar entrega a domicilio')));
}

// 6) Video: con video del producto lo envía; sin video, pasa a la asesora para que lo grabe.
{
  const withVideo = SEED_PRODUCTS.map((p) => (p.id === 'trot-latte' ? { ...p, videoUrl: 'https://example.com/latte.mp4' } : p));
  let conv = newConversation('whatsapp', '573001112299', '', NOW);
  conv = { ...conv, bot: { ...conv.bot, nodeId: 'recomendar', lastProductIds: ['trot-latte'] } };
  const r = processIncoming({ conv, flow, products: withVideo, settings: SEED_SETTINGS, now: NOW }, { buttonId: 'cita_video' });
  assert.ok(r.replies.some((m) => m.type === 'video' && m.videoUrl === 'https://example.com/latte.mp4'));
  const r2 = processIncoming({ conv, flow, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, { buttonId: 'cita_video' });
  assert.ok(r2.replies.some((m) => m.text.includes('Una asesora te envía un video')));
  assert.equal(r2.patch.botActive, false);
}

// 7) Al pasar al asesor se ofrece "Agendar cita", y el botón funciona con el bot en pausa.
{
  const { conv, all } = chat([{ text: 'Hola' }, { text: 'Ana de Valledupar' }, { buttonId: 'uso_negocio' }]);
  assert.equal(conv.botActive, false, 'gimnasio pasa enseguida al asesor');
  assert.ok(all.some((t) => t.includes('[cita_start|📅 Agendar cita]')));
  const r = processIncoming({ conv, flow, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, { buttonId: 'cita_start' });
  assert.equal(r.replies[0].type, 'list');
  assert.equal(r.patch.bot?.nodeId, 'handoff', 'con el bot en pausa no cambia la pregunta');
  const r2 = processIncoming({ conv, flow, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: NOW }, { buttonId: 'chora_2026-10-15_0930' });
  assert.equal(r2.patch.cita?.at, localToUtc('2026-10-15', 9 * 60 + 30, TZ));
}

// 8) Cancela: vuelve a la pregunta en la que iba.
{
  const { conv, all } = chat([{ text: 'Hola' }, { text: 'Ana de Valledupar' }, { text: 'quiero sacar cita' }, { text: 'no gracias' }]);
  assert.equal(conv.bot.nodeId, 'uso');
  assert.ok(all.at(-1)!.includes('uso_hogar'));
}

// 9) Citas apagadas: "cita" no hace nada especial ni se ofrece el botón.
{
  const { all } = chat([{ text: 'Hola' }, { text: 'Ana de Valledupar' }, { buttonId: 'uso_negocio' }], DEFAULT_FLOW);
  assert.ok(!all.some((t) => t.includes('cita_start')));
}

// 10) Garantía por producto.
{
  const prods = SEED_PRODUCTS.map((p) => (p.id === 'trot-latte' ? { ...p, warranty: '6 meses' } : p));
  let conv = newConversation('whatsapp', '573001112277', '', NOW);
  conv = { ...conv, bot: { ...conv.bot, nodeId: 'recomendar', lastProductIds: ['trot-latte'] } };
  const r = processIncoming({ conv, flow, products: prods, settings: SEED_SETTINGS, now: NOW }, { text: '¿cuánto tiempo de garantía tiene?' });
  assert.ok(r.replies[0].text.includes('Trotadora Latte tiene 6 meses de garantía'), r.replies[0].text);
}

console.log('citas OK');
