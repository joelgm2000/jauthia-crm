/** Construcción de mensajes y conversaciones: misma forma en el backend y en el modo demo. */
import { previewOf } from './actions';
import type { EngineResult } from './flow-engine';
import { newId } from './ids';
import { ChannelType, ChatMessage, Conversation, CrmTask, Sender } from './models';
import { OutgoingDraft } from './products';
import { hash } from './text';

/** Id de la conversación de un contacto en un canal (estable: el mismo contacto = la misma conversación). */
export function conversationId(channel: ChannelType, externalId: string): string {
  return `${channel}_${externalId}`.replace(/[^\w-]/g, '');
}

/** Id externo de un visitante del chat web a partir de la sesión del widget. */
export function webchatExternalId(sessionId: string): string {
  return 'web_' + sessionId;
}

export const AVATAR_COLORS = ['#f97316', '#0ea5e9', '#8b5cf6', '#10b981', '#ec4899', '#eab308', '#14b8a6', '#6366f1'];

/** Conversación nueva de un contacto de cualquier canal. */
export function newConversation(
  channel: ChannelType,
  externalId: string,
  name: string,
  now: number,
  phone?: string,
): Conversation {
  const color = AVATAR_COLORS[Math.abs(hash(externalId)) % AVATAR_COLORS.length];
  return {
    id: conversationId(channel, externalId),
    channel,
    externalId,
    name: name || 'Cliente',
    phone,
    avatarColor: color,
    stage: 'nuevo',
    stageChangedAt: now,
    botActive: true,
    bot: { nodeId: '', retries: 0, shownProductIds: [], lastProductIds: [], followUpStep: 0, nameGiven: false },
    fields: {},
    tags: [],
    priority: 'normal',
    score: 5,
    hot: false,
    intent: null,
    summary: '',
    assignedTo: null,
    value: 0,
    lastMessage: '',
    lastMessageAt: now,
    unread: 0,
    createdAt: now,
  };
}

/** Nota interna (solo la ve el equipo). */
export function noteMessage(conversationId: string, text: string, at = Date.now(), id = newId('n')): ChatMessage {
  return { id, conversationId, direction: 'out', sender: 'sistema', type: 'note', text, createdAt: at };
}

/**
 * Estado inicial de un mensaje saliente: los chats de prueba y el chat web se entregan en la misma
 * petición ("sent"); el resto queda "pending" hasta que el despachador lo envía al canal.
 */
export function initialStatus(conv: Pick<Conversation, 'simulated' | 'channel'>): ChatMessage['status'] {
  return conv.simulated || conv.channel === 'webchat' ? 'sent' : 'pending';
}

/** Mensaje saliente listo para guardar. */
export function outboundMessage(
  draft: OutgoingDraft,
  conv: Pick<Conversation, 'id' | 'simulated' | 'channel'>,
  sender: Exclude<Sender, 'cliente'>,
  authorName: string,
  at: number,
  id = newId('m'),
): ChatMessage {
  return { ...draft, id, conversationId: conv.id, direction: 'out', sender, createdAt: at, status: initialStatus(conv), authorName };
}

/** Conversación del simulador ("Probar bot"): nunca se envía a un canal real. */
export function newTestConversation(channel: ChannelType, name: string | undefined, now: number): Conversation {
  return { ...newConversation(channel, newId('sim'), name || 'Cliente de prueba', now, '+57 300 000 0000'), simulated: true };
}

/**
 * Convierte el resultado del motor en lo que se guarda: respuestas del bot (con hora consecutiva),
 * notas internas, tareas y la vista previa de la conversación. Igual en el backend y en el modo demo.
 */
export function materializeResult(
  res: Pick<EngineResult, 'replies' | 'notes' | 'tasks'>,
  conv: Pick<Conversation, 'id' | 'simulated' | 'channel'>,
  inbound: ChatMessage,
  now: number,
  authorName = 'Bot',
): { replies: ChatMessage[]; notes: ChatMessage[]; tasks: CrmTask[]; lastMessage: string; lastMessageAt: number } {
  let t = now + 1;
  const replies = res.replies.map((r) => outboundMessage(r, conv, 'bot', authorName, t++));
  const notes = res.notes.map((n) => noteMessage(conv.id, n, t++));
  const tasks = res.tasks.map((task) => ({ ...task, id: newId('t'), createdAt: now }));
  const last = replies[replies.length - 1] ?? inbound;
  return { replies, notes, tasks, lastMessage: previewOf(last), lastMessageAt: last.createdAt };
}
