/**
 * Reglas de negocio de las acciones del asesor (cambiar etapa, pausar bot, editar campos…).
 * Son funciones puras: el backend las usa para validar y aplicar cambios,
 * y el modo demo del navegador las usa para simular el mismo comportamiento.
 */
import { canBeHot, stageDef } from './flow';
import { OutgoingDraft } from './products';
import { ContactFields, Conversation, StageId } from './models';

/** Campos del contacto que un asesor puede editar. */
export const EDITABLE_FIELDS = [
  'ciudad', 'uso', 'categoria', 'subcategoria', 'modeloInteres', 'cantidad', 'pesoUsuario', 'modoUso',
  'alturaTecho', 'piso', 'espacio', 'usuarios', 'rangoKg', 'disponibilidad', 'formaPago', 'cedula', 'correo', 'direccion',
] as const satisfies readonly (keyof ContactFields)[];

/** Propiedades de la conversación que un asesor puede cambiar directamente. */
export interface ConversationEdit {
  name?: string;
  fields?: ContactFields;
  tags?: string[];
  priority?: 'alta' | 'normal';
  assignedTo?: string | null;
  value?: number;
  clearIntent?: boolean;
  markRead?: boolean;
}

export function applyEdit(conv: Conversation, edit: ConversationEdit): Partial<Conversation> {
  const patch: Partial<Conversation> = {};
  if (edit.name !== undefined) patch.name = edit.name.trim().slice(0, 80) || conv.name;
  if (edit.fields) {
    const fields: ContactFields = {};
    for (const k of EDITABLE_FIELDS) {
      const v = edit.fields[k];
      if (v !== undefined && v !== null && v !== '') (fields as Record<string, unknown>)[k] = v;
    }
    patch.fields = fields;
  }
  if (edit.tags) patch.tags = [...new Set(edit.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  if (edit.priority) patch.priority = edit.priority;
  if (edit.assignedTo !== undefined) patch.assignedTo = edit.assignedTo;
  if (edit.value !== undefined) patch.value = Math.max(0, Math.round(edit.value));
  if (edit.clearIntent) patch.intent = null;
  if (edit.markRead) patch.unread = 0;
  return patch;
}

export function stageChange(conv: Conversation, stage: StageId, hotThreshold: number, now: number, by: string): { patch: Partial<Conversation>; note: string } | null {
  if (conv.stage === stage) return null;
  const to = stageDef(stage);
  const score = stage === 'perdido' ? 0 : Math.max(to?.probability ?? 0, conv.score);
  const hot = canBeHot(stage) && score >= hotThreshold;
  return {
    patch: { stage, stageChangedAt: now, score, hot, ...(stage === 'perdido' || stage === 'ganado' ? { botActive: false } : {}) },
    note: `Etapa: ${stageDef(conv.stage)?.name} → ${to?.name} (por ${by})`,
  };
}

export const BOT_PAUSED_NOTE = '🙋 Un asesor tomó la conversación (bot en pausa)';
export const BOT_RESUMED_NOTE = '🤖 Bot reactivado';

export function botToggle(conv: Conversation): { patch: Partial<Conversation>; note: string } {
  const botActive = !conv.botActive;
  if (!botActive) return { patch: { botActive }, note: BOT_PAUSED_NOTE };
  // El bot conserva todo lo que sabe (nombre, ciudad, respuestas y pedido) y retoma desde las opciones.
  // Tras un traspaso, cuando el cliente vuelva a escribir le ofrece agregar más productos al pedido.
  const afterHandoff = conv.bot.nodeId === 'handoff';
  const bot = { ...conv.bot, retries: 0, pendingHandoff: null, ...(afterHandoff ? { nodeId: 'recomendar', resumed: true } : {}) };
  // Venta cerrada o perdida: lo que pida ahora es un pedido nuevo.
  const closed = conv.stage === 'ganado' || conv.stage === 'perdido';
  return { patch: { botActive, bot, ...(closed ? { cart: [] } : {}) }, note: BOT_RESUMED_NOTE };
}

/** Cambios en la conversación cuando el asesor envía un mensaje. */
export function agentMessagePatch(conv: Conversation, draft: OutgoingDraft, now: number, pauseBot: boolean): Partial<Conversation> {
  const awaiting = ['asesor', 'cotizacion', 'calificando'].includes(conv.stage);
  const productIds = draft.cards?.map((c) => c.productId) ?? [];
  return {
    lastMessage: previewOf(draft),
    lastMessageAt: now,
    unread: 0,
    // El asesor escribió: el reloj del remarketing arranca de nuevo desde ahora.
    waitingSince: now,
    // Si el asesor escribe texto libre, el bot se pausa para no interrumpir.
    // (Con carruseles o fichas sigue activo para responder a "Ver detalles").
    ...(pauseBot ? { botActive: false } : {}),
    bot: {
      ...conv.bot,
      awaitingSince: awaiting ? now : conv.bot.awaitingSince,
      followUpStep: 0,
      ...(productIds.length
        ? { lastProductIds: productIds, shownProductIds: [...new Set([...conv.bot.shownProductIds, ...productIds])] }
        : {}),
    },
  };
}

export function previewOf(d: Pick<OutgoingDraft, 'type' | 'text' | 'cards' | 'header'>): string {
  if (d.type === 'carousel') return `🛍️ Carrusel: ${d.cards?.map((c) => c.title).join(', ')}`;
  if (d.type === 'product') return `📦 ${d.header ?? 'Ficha de producto'}`;
  if (d.type === 'template') return `📄 ${d.header ?? d.text}`;
  return d.text.replace(/[*_~]/g, '');
}
