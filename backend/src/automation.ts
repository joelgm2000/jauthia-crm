/**
 * Mensajes automáticos de cada cliente (requieren el módulo de chatbot):
 *
 *  - Remarketing: cuando el cliente deja de contestar, se le escribe según los pasos configurados
 *    (texto, imagen opcional y plantilla de WhatsApp para después de 24 h). Al final, pasa a Perdido.
 *  - Alertas de compra: cuando un lead llega a la etapa de compra, se avisa a los leads que aún no
 *    compran y dejaron de contestar ("Un cliente de Valledupar acaba de comprar…"). Nunca se dice quién.
 *
 * Las reglas (qué enviar y cuándo) son funciones puras en shared/flow-engine.ts; aquí solo se consulta
 * la base de datos y se guardan los mensajes, que luego envía el despachador.
 */
import { previewOf } from '../../shared/actions';
import { AutoContext, DEFAULT_SOCIAL_PROOF, followUpDue, interestProduct, socialProofDraft } from '../../shared/automation';
import { STAGE_ORDER } from '../../shared/flow';
import { CART_NODE, cartTimeout } from '../../shared/flow-engine';
import { materializeResult, noteMessage, outboundMessage } from '../../shared/messages';
import { Conversation, StageId } from '../../shared/models';
import { OutgoingDraft } from '../../shared/products';
import { HOUR, MINUTE } from '../../shared/time';
import { Ctx, loadCtx, notifyStageChange, STAGE_CHANGED } from './core';
import { bus, getDoc, insertMessage, patchDoc, pool, putDoc, txEmit } from './db';
import { log } from './log';
import { refreshStaleSocial } from './social';

function autoContext(ctx: Ctx, now: number): AutoContext {
  return { products: ctx.products, templates: ctx.templates, companyName: ctx.settings.companyName, now };
}

/** Guarda un mensaje automático (y/o una nota) y aplica el cambio a la conversación, todo en una transacción. */
async function saveAutomatic(
  tenantId: string,
  conv: Conversation,
  now: number,
  opts: { draft?: OutgoingDraft; author: string; note?: string; patch: Partial<Conversation> },
): Promise<void> {
  await txEmit(async (c) => {
    if (opts.draft) {
      await insertMessage(tenantId, outboundMessage(opts.draft, conv, 'bot', opts.author, now), c);
      opts.patch = { ...opts.patch, lastMessage: previewOf(opts.draft), lastMessageAt: now };
    }
    if (opts.note) await insertMessage(tenantId, noteMessage(conv.id, opts.note, now + 1), c);
    await patchDoc<Conversation>(tenantId, 'conversations', conv.id, opts.patch, c);
  });
}

// ---------------------------------------------------------------------------
// Pedido sin respuesta a "¿te interesa otro producto?"
// ---------------------------------------------------------------------------

/** Si venció la espera, pasa al asesor con el pedido. Devuelve true si lo hizo. */
async function closeStaleCart(tenantId: string, ctx: Ctx, convId: string, now: number): Promise<boolean> {
  const done = await txEmit(async (c) => {
    // Se relee con bloqueo: el cliente pudo contestar justo ahora.
    const conv = await getDoc<Conversation>(tenantId, 'conversations', convId, c, true);
    const res = conv && cartTimeout({ conv, flow: ctx.flow, products: ctx.products, settings: ctx.settings, now });
    if (!conv || !res) return null;
    const out = materializeResult(res, conv, noteMessage(conv.id, '', now), now);
    for (const m of [...out.replies, ...out.notes]) await insertMessage(tenantId, m, c);
    if (ctx.tenant.modules.crm) for (const task of out.tasks) await putDoc(tenantId, 'tasks', task, c);
    await patchDoc<Conversation>(tenantId, 'conversations', conv.id, { ...res.patch, lastMessage: out.lastMessage, lastMessageAt: out.lastMessageAt, waitingSince: now }, c);
    return { from: conv.stage, to: res.patch.stage };
  });
  if (done) notifyStageChange(tenantId, convId, done.from, done.to);
  return !!done;
}

// ---------------------------------------------------------------------------
// Remarketing
// ---------------------------------------------------------------------------

export async function runRemarketing(now = Date.now()): Promise<void> {
  const r = await pool.query(
    `SELECT c.tenant_id, c.data FROM conversations c JOIN tenants t ON t.id = c.tenant_id
     WHERE (c.data ? 'waitingSince' AND c.data->>'waitingSince' IS NOT NULL OR c.data->'bot' ? 'awaitingSince')
       AND t.data->>'status' <> 'suspendido' AND (t.data->'modules'->>'chatbot')::boolean`,
  );
  for (const row of r.rows) {
    const tenantId: string = row.tenant_id;
    const conv = row.data as Conversation;
    // Una conversación con problemas no detiene el remarketing de las demás.
    try {
      const ctx = await loadCtx(tenantId);
      if (conv.bot?.nodeId === CART_NODE && (await closeStaleCart(tenantId, ctx, conv.id, now))) continue;
      const action = followUpDue(conv, ctx.flow, autoContext(ctx, now));
      if (!action) continue;
      await saveAutomatic(tenantId, conv, now, { draft: action.message, author: 'Remarketing', note: action.note, patch: action.patch });
      notifyStageChange(tenantId, conv.id, conv.stage, action.patch.stage);
    } catch (e) {
      log.error('remarketing', { tenantId, conversation: conv.id, error: (e as Error).message });
    }
  }
}

// ---------------------------------------------------------------------------
// Alertas de compra ("prueba social")
// ---------------------------------------------------------------------------

export async function sendSaleAlerts(tenantId: string, buyerId: string, from: StageId, to: StageId, now = Date.now()): Promise<number> {
  const ctx = await loadCtx(tenantId);
  const cfg = { ...DEFAULT_SOCIAL_PROOF, ...(ctx.settings.socialProof ?? {}) };
  if (!cfg.enabled || !ctx.tenant.modules.chatbot) return 0;
  // Solo al LLEGAR a la etapa de compra (no al moverse dentro o hacia atrás).
  if (to !== cfg.triggerStage || STAGE_ORDER[from] >= STAGE_ORDER[to]) return 0;
  const buyer = await getDoc<Conversation>(tenantId, 'conversations', buyerId);
  if (!buyer) return 0;
  const product = interestProduct(buyer, ctx.products);
  const category = cfg.sameCategoryOnly ? product?.category ?? buyer.fields.categoria ?? null : null;

  // Los chats de prueba solo avisan a chats de prueba: una venta simulada nunca le escribe a un cliente real.
  const r = await pool.query(
    `SELECT data FROM conversations
     WHERE tenant_id = $1 AND id <> $2
       AND data->>'stage' = ANY($3)
       AND (data->>'waitingSince')::bigint <= $4
       AND COALESCE((data->>'lastAlertAt')::bigint, 0) <= $5
       AND COALESCE((data->>'simulated')::boolean, false) = $6
       AND ($7::text IS NULL OR data->'fields'->>'categoria' = $7)
     ORDER BY (data->>'score')::int DESC
     LIMIT $8`,
    [tenantId, buyerId, cfg.stages, now - cfg.inactiveHours * HOUR, now - cfg.cooldownHours * HOUR, !!buyer.simulated, category, cfg.maxRecipients],
  );
  const ax = autoContext(ctx, now);
  let sent = 0;
  let skipped = 0;
  for (const row of r.rows) {
    const lead = row.data as Conversation;
    const out = socialProofDraft(cfg, buyer, lead, product, ax);
    if (!out.draft) {
      skipped++;
      continue;
    }
    try {
      await saveAutomatic(tenantId, lead, now, {
        draft: out.draft, author: 'Alerta de compra', note: `📣 Alerta de compra enviada (${product?.name ?? 'venta'})`, patch: { lastAlertAt: now },
      });
      sent++;
    } catch (e) {
      log.error('alerta de compra', { tenantId, conversation: lead.id, error: (e as Error).message });
    }
  }
  const detail = skipped ? ` · ${skipped} omitidos por la ventana de 24 h` : '';
  await txEmit((c) => insertMessage(tenantId, noteMessage(buyerId, `📣 Alerta de compra enviada a ${sent} cliente(s)${detail}`, now), c));
  log.info('Alertas de compra', { tenantId, buyerId, sent, skipped });
  return sent;
}

/** Arranca el remarketing periódico y escucha los cambios de etapa para las alertas de compra. */
export function startAutomation(): void {
  bus.on(STAGE_CHANGED, (tenantId: string, convId: string, from: StageId, to: StageId) => {
    sendSaleAlerts(tenantId, convId, from, to).catch((e) => log.error('alertas de compra', e));
  });
  const tick = () => runRemarketing().catch((e) => log.error('remarketing', e));
  setInterval(tick, 5 * MINUTE);
  // Estadísticas reales de redes: se vuelven a leer solas una vez por semana.
  setInterval(() => refreshStaleSocial().catch((e) => log.error('estadísticas de redes', e)), HOUR);
}
