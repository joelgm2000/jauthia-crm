/**
 * Conversaciones de ejemplo para el modo demo. Se generan ejecutando el motor
 * real del bot con guiones de chat, así el demo muestra exactamente lo que haría en producción.
 */
import { previewOf, stageChange } from '@shared/actions';
import { DEFAULT_FLOW, PURCHASED_STAGES } from '@shared/flow';
import { EngineInput, processIncoming } from '@shared/flow-engine';
import { newId } from '@shared/ids';
import { materializeResult, newConversation, noteMessage } from '@shared/messages';
import { ChannelType, ChatMessage, Conversation, CrmTask, StageId } from '@shared/models';
import { SEED_PRODUCTS, SEED_SETTINGS } from '@shared/seed';
import { HOUR, MINUTE } from '@shared/time';

interface Script {
  channel: ChannelType;
  id: string;
  name: string;
  phone?: string;
  hoursAgo: number;
  steps: (EngineInput & { title?: string })[];
  agent?: string[];
  stage?: StageId;
  client?: string[];
  unread?: number;
}

const SCRIPTS: Script[] = [
  {
    channel: 'whatsapp', id: '573014567890', name: '', phone: '+57 301 456 7890', hoursAgo: 0.3, unread: 1,
    steps: [
      { text: 'Hola buenas tardes, tienen caminadoras?' },
      { text: 'Carmen de Villanueva, La Guajira' },
      { buttonId: 'uso_hogar', title: '🏠 Para mi casa' },
      { text: '75 kg' },
      { buttonId: 'modo_caminar', title: '🚶 Caminar' },
      { buttonId: 'cant_1', title: '1' },
      { buttonId: 'det_trot-evoflex', title: 'Ver detalles' },
      { buttonId: 'sel_trot-evoflex', title: 'Lo quiero' },
      { text: 'Quiero pagar con tarjeta' },
    ],
  },
  {
    channel: 'instagram', id: 'ig_88123', name: '', hoursAgo: 1.2, unread: 2,
    steps: [
      { text: 'Hola! precio de las bicicletas de spinning?' },
    ],
  },
  {
    channel: 'whatsapp', id: '573157778899', name: '', phone: '+57 315 777 8899', hoursAgo: 2.5,
    steps: [
      { text: 'Buenas' },
      { text: 'Jorge Martínez, Valledupar' },
      { text: 'Es para mi gimnasio, vamos a montar uno nuevo' },
      { buttonId: 'cat_fuerza', title: 'Máquinas de fuerza' },
      { buttonId: 'sub_jaula', title: 'Jaula' },
      { text: '2,60 m' },
      { buttonId: 'piso_si', title: 'Sí, primer piso' },
      { buttonId: 'usr_6', title: 'Más de 5' },
    ],
  },
  {
    channel: 'messenger', id: 'fb_55321', name: '', hoursAgo: 5,
    steps: [{ text: 'hola' }, { text: 'Me llamo Andrea, desde Bogotá' }, { buttonId: 'uso_hogar', title: '🏠 Para mi casa' }],
  },
  {
    channel: 'whatsapp', id: '573209991122', name: '', phone: '+57 320 999 1122', hoursAgo: 26,
    steps: [
      { text: 'Hola' },
      { text: 'Luis Pérez de Valledupar' },
      { buttonId: 'uso_hogar', title: '🏠 Para mi casa' },
      { buttonId: 'cat_peso', title: 'Peso libre' },
      { buttonId: 'sub_manc', title: 'Mancuernas' },
      { text: 'De 2,5 a 10 kg, 4 pares' },
      { buttonId: 'sel_manc-hex', title: 'Lo quiero' },
    ],
    agent: ['Hola Luis, soy Diana de EvoSport 😊 Te envío la cotización de las mancuernas con 18 % de descuento pagando por transferencia.'],
    stage: 'cotizacion',
  },
  {
    channel: 'whatsapp', id: '573006665544', name: '', phone: '+57 300 666 5544', hoursAgo: 30,
    steps: [
      { text: 'Buenos días, necesito una elíptica' },
      { text: 'Marta, Aguachica' },
      { buttonId: 'uso_hogar', title: '🏠 Para mi casa' },
      { text: '68' },
      { buttonId: 'modo_caminar', title: '🚶 Caminar' },
      { buttonId: 'cant_1', title: '1' },
      { buttonId: 'sel_elip-e300', title: 'Lo quiero' },
    ],
    agent: ['Marta, la Elíptica Evo E300 te queda con 15 % de descuento en efectivo. ¿Quieres apartarla con un anticipo?'],
    client: ['Sí, la quiero apartar. Puedo pagar en 3 cuotas?'],
    stage: 'negociacion',
  },
  {
    channel: 'telegram', id: 'tg_1201', name: '', hoursAgo: 50,
    steps: [{ text: 'Hola' }, { text: 'Ricardo de Santa Marta' }, { buttonId: 'uso_negocio', title: 'Gimnasio/negocio' }, { buttonId: 'cat_cardio', title: 'Cardio' }, { buttonId: 'sub_spinning', title: 'Spinning' }, { text: '90 kilos' }, { buttonId: 'modo_trotar', title: '🏃 Trotar' }, { buttonId: 'cant_4', title: '4 o más' }],
  },
  {
    channel: 'webchat', id: 'web_7781', name: '', hoursAgo: 72,
    steps: [{ text: 'Hola, busco colchonetas para un salón de yoga' }, { text: 'Paola, Valledupar' }],
    agent: ['¡Hola Paola! Ya te enviamos la cotización de 20 colchonetas al correo 📩'],
    client: ['Listo, ya pagué. Te envío el comprobante'],
    stage: 'pago',
  },
  {
    channel: 'instagram', id: 'ig_99001', name: '', hoursAgo: 120,
    steps: [{ text: 'Hola tienen jaulas?' }, { text: 'Camilo de Valledupar' }, { buttonId: 'uso_hogar', title: '🏠 Para mi casa' }],
    agent: ['Camilo, la Jaula 4900 quedó instalada. ¡Gracias por tu compra! 💪'],
    stage: 'ganado',
  },
  {
    channel: 'messenger', id: 'fb_44110', name: '', hoursAgo: 220,
    steps: [{ text: 'info de trotadoras' }, { text: 'Sofía de Riohacha' }],
    stage: 'perdido',
  },
];

export function buildDemo(now: number): { conversations: Conversation[]; messages: ChatMessage[]; tasks: CrmTask[] } {
  const conversations: Conversation[] = [];
  const messages: ChatMessage[] = [];
  const tasks: CrmTask[] = [];

  for (const s of SCRIPTS) {
    let t = now - s.hoursAgo * HOUR - s.steps.length * 90_000;
    let conv = newConversation(s.channel, s.id, s.name, t, s.phone);
    conv.simulated = true;
    const push = (m: Omit<ChatMessage, 'id' | 'conversationId'>) => messages.push({ ...m, id: newId('m'), conversationId: conv.id });

    for (const step of s.steps) {
      const inbound: ChatMessage = { id: newId('m'), conversationId: conv.id, direction: 'in', sender: 'cliente', type: 'text', text: step.title ?? step.text ?? '', replyToButtonId: step.buttonId, createdAt: t, processed: true };
      messages.push(inbound);
      const r = processIncoming({ conv, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: t }, step);
      conv = { ...conv, ...r.patch };
      const out = materializeResult(r, conv, inbound, t + 4000);
      messages.push(...out.replies.map((m) => ({ ...m, status: 'read' as const })), ...out.notes);
      tasks.push(...out.tasks);
      t = out.lastMessageAt + MINUTE;
    }
    for (const a of s.agent ?? []) {
      push({ direction: 'out', sender: 'asesor', type: 'text', text: a, createdAt: (t += 600_000), status: 'read', authorName: 'Diana Ríos' });
      conv.botActive = false;
    }
    for (const c of s.client ?? []) {
      push({ direction: 'in', sender: 'cliente', type: 'text', text: c, createdAt: (t += 300_000), processed: true });
      const r = processIncoming({ conv, flow: DEFAULT_FLOW, products: SEED_PRODUCTS, settings: SEED_SETTINGS, now: t }, { text: c });
      conv = { ...conv, ...r.patch };
      r.notes.forEach((n) => messages.push(noteMessage(conv.id, n, (t += 10))));
    }
    if (s.stage) {
      const change = stageChange(conv, s.stage, SEED_SETTINGS.hotThreshold, t, 'Diana Ríos');
      conv = { ...conv, ...change?.patch, botActive: false };
      if (s.stage === 'perdido') messages.push(noteMessage(conv.id, 'Sin respuesta tras el remarketing: pasa a Perdido', (t += 10)));
    }
    if (!conv.value) {
      const p = SEED_PRODUCTS.find((x) => conv.bot.lastProductIds.includes(x.id));
      conv.value = p ? (p.price < 100000 ? p.price * 40 : p.price) : 0;
    }
    const mine = messages.filter((m) => m.conversationId === conv.id && m.sender !== 'sistema');
    const last = mine[mine.length - 1];
    conv.lastMessage = last ? previewOf(last) : '';
    conv.lastMessageAt = last?.createdAt ?? t;
    conv.unread = s.unread ?? 0;
    // Fechas de tareas: relativas a ahora.
    tasks.filter((x) => x.conversationId === conv.id).forEach((x) => (x.done = conv.stage === 'perdido' || PURCHASED_STAGES.includes(conv.stage)));
    conversations.push(conv);
  }
  return { conversations, messages, tasks };
}
