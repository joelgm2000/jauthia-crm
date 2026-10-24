/**
 * Núcleo del backend:
 *  - Configuración de cada cliente en caché (flujo, catálogo, plantillas, canales, equipo).
 *  - Entrada de mensajes: ejecuta el motor del bot dentro de una transacción (con bloqueo de la
 *    conversación) y guarda todo en PostgreSQL. Las respuestas quedan "pending" y las envía dispatcher.ts.
 */
import { DEFAULT_FLOW, FlowConfig } from '../../shared/flow';
import { EngineInput, processIncoming } from '../../shared/flow-engine';
import { newId } from '../../shared/ids';
import { materializeResult, newConversation } from '../../shared/messages';
import { Advisor, ChannelConfig, ChannelType, ChatMessage, Conversation, CrmSettings, Product, StageId, Tenant, WaTemplate } from '../../shared/models';
import { SEED_SETTINGS } from '../../shared/seed';
import { getTenant } from './auth';
import { bus, emit, getDoc, getSetting, insertMessage, listDocs, messageExists, patchDoc, patchMessage, pool, putDoc, txEmit } from './db';
import { log } from './log';

// ---------------------------------------------------------------------------
// Configuración de cada cliente en caché (60 s)
// ---------------------------------------------------------------------------

export interface Ctx {
  tenant: Tenant;
  flow: FlowConfig;
  settings: CrmSettings;
  products: Product[];
  templates: WaTemplate[];
  channels: Map<string, ChannelConfig>;
  at: number;
}
const cache = new Map<string, Ctx>();

export function invalidateCtx(tenantId: string): void {
  cache.delete(tenantId);
}

/**
 * Asesores = usuarios reales del cliente. El bot reparte las conversaciones calificadas en rotación
 * entre los asesores activos (si aún no hay asesores, entre los administradores activos).
 */
export async function teamAdvisors(tenantId: string): Promise<Advisor[]> {
  const r = await pool.query(`SELECT id, name, email, role FROM users WHERE tenant_id = $1 AND active ORDER BY created_at`, [tenantId]);
  const asesores = r.rows.filter((u) => u.role === 'asesor');
  return (asesores.length ? asesores : r.rows).map((u) => ({ id: u.id, name: u.name, email: u.email, active: true }));
}

/** Ajustes generales del cliente con la lista de asesores tomada de sus usuarios. */
export async function settingsWithTeam(tenantId: string): Promise<CrmSettings> {
  const s = await getSetting<CrmSettings>(tenantId, 'general');
  return { ...SEED_SETTINGS, ...(s ?? {}), advisors: await teamAdvisors(tenantId) };
}

/** Avisa a los navegadores de ese cliente que cambió el equipo. */
export async function publishTeam(tenantId: string): Promise<void> {
  invalidateCtx(tenantId);
  emit(tenantId, 'setting', { key: 'general', data: await settingsWithTeam(tenantId) });
}

export async function loadCtx(tenantId: string): Promise<Ctx> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const tenant = await getTenant(tenantId);
  if (!tenant) throw new Error('Cliente inexistente: ' + tenantId);
  const [flow, settings, products, templates, channels] = await Promise.all([
    getSetting<FlowConfig>(tenantId, 'flow'),
    settingsWithTeam(tenantId),
    listDocs<Product>(tenantId, 'products'),
    listDocs<WaTemplate>(tenantId, 'templates'),
    listDocs<ChannelConfig>(tenantId, 'channels'),
  ]);
  const ctx: Ctx = {
    tenant,
    flow: { ...DEFAULT_FLOW, ...(flow ?? {}) },
    settings,
    products,
    templates,
    channels: new Map(channels.map((c) => [c.id, c])),
    at: Date.now(),
  };
  cache.set(tenantId, ctx);
  return ctx;
}

/** Evento que escuchan las automatizaciones (alertas de compra) cuando una conversación cambia de etapa. */
export const STAGE_CHANGED = 'stageChanged';

export function notifyStageChange(tenantId: string, conversationId: string, from: StageId, to: StageId | undefined): void {
  if (to && from !== to) bus.emit(STAGE_CHANGED, tenantId, conversationId, from, to);
}

// ---------------------------------------------------------------------------
// Entrada de mensajes
// ---------------------------------------------------------------------------

export interface Incoming {
  channel: ChannelType;
  externalId: string;
  name?: string;
  phone?: string;
  /** Id del mensaje en el canal: evita procesar dos veces los reintentos del webhook. */
  channelMessageId?: string;
  text: string;
  buttonId?: string;
  isMedia?: boolean;
  imageUrl?: string;
}

/** Guarda el mensaje entrante de un cliente y ejecuta su bot. */
export async function ingest(tenantId: string, inc: Incoming): Promise<{ conversationId: string; inbound?: ChatMessage; replies: ChatMessage[] }> {
  const ctx = await loadCtx(tenantId);
  const now = Date.now();
  const template = newConversation(inc.channel, inc.externalId, inc.name ?? '', now, inc.phone);
  const inId = inc.channelMessageId ? `in_${inc.channelMessageId.replace(/[^\w-]/g, '').slice(-60)}` : newId('in_');
  // Sin módulo de chatbot, el bot no responde: solo se guardan los mensajes para la bandeja.
  const botAllowed = ctx.tenant.modules.chatbot && ctx.channels.get(inc.channel)?.botEnabled !== false;

  if (inc.channelMessageId && (await messageExists(tenantId, inId))) {
    log.info('Mensaje duplicado ignorado', { tenantId, inId });
    return { conversationId: template.id, replies: [] };
  }

  const out = await txEmit(async (c) => {
    await c.query(`INSERT INTO conversations (tenant_id, id, data, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, id) DO NOTHING`, [
      tenantId,
      template.id,
      JSON.parse(JSON.stringify({ ...template, botActive: botAllowed })),
      now,
    ]);
    const stored = (await getDoc<Conversation>(tenantId, 'conversations', template.id, c, true))!;
    const conv = botAllowed ? stored : { ...stored, botActive: false };

    const res = processIncoming(
      { conv, flow: ctx.flow, products: ctx.products, settings: ctx.settings, now },
      { text: inc.text, buttonId: inc.buttonId, isMedia: inc.isMedia } satisfies EngineInput,
    );

    const inbound: ChatMessage = {
      id: inId, conversationId: conv.id, direction: 'in', sender: 'cliente', type: inc.isMedia && inc.imageUrl ? 'image' : 'text',
      text: inc.text, imageUrl: inc.imageUrl, replyToButtonId: inc.buttonId, channelMessageId: inc.channelMessageId, createdAt: now, processed: true,
    };
    if (!(await insertMessage(tenantId, inbound, c))) return { conversationId: conv.id, inbound: undefined, replies: [] as ChatMessage[], stageFrom: undefined, stageTo: undefined };

    const out = materializeResult(res, conv, inbound, now);
    for (const m of [...out.replies, ...out.notes]) await insertMessage(tenantId, m, c);
    if (ctx.tenant.modules.crm) for (const task of out.tasks) await putDoc(tenantId, 'tasks', task, c);

    await patchDoc<Conversation>(tenantId, 'conversations', conv.id, {
      ...res.patch,
      name: inc.name && (!conv.name || conv.name === 'Cliente') ? inc.name : res.patch.name ?? conv.name,
      lastMessage: out.lastMessage,
      lastMessageAt: out.lastMessageAt,
      unread: (conv.unread || 0) + 1,
      lastInboundAt: now,
      // Si el bot respondió, ahora esperamos al cliente (reloj del remarketing); si no, el cliente habló último.
      waitingSince: out.replies.length ? now : null,
    }, c);
    return { conversationId: conv.id, inbound, replies: out.replies, stageFrom: stored.stage, stageTo: res.patch.stage };
  });
  notifyStageChange(tenantId, out.conversationId, out.stageFrom ?? 'nuevo', out.stageTo);
  return { conversationId: out.conversationId, inbound: out.inbound, replies: out.replies };
}

/** Actualiza el estado (entregado/leído) de un mensaje enviado. */
export async function updateStatus(tenantId: string, channelMessageId: string, status: ChatMessage['status']): Promise<void> {
  const r = await pool.query('SELECT id FROM messages WHERE tenant_id = $1 AND channel_message_id = $2 LIMIT 1', [tenantId, channelMessageId]);
  if (r.rows[0]) await patchMessage(tenantId, r.rows[0].id, { status });
}
