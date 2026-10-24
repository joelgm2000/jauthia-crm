/**
 * Despachador de mensajes salientes (bot, asesores y automatizaciones): toma cada mensaje "pending"
 * y lo envía al canal con los tokens cifrados de ESE cliente. Reintenta los que quedaron a medias.
 */
import { initialStatus } from '../../shared/messages';
import { ChatMessage, Conversation } from '../../shared/models';
import { MINUTE } from '../../shared/time';
import { sendToChannel } from './channels';
import { config } from './config';
import { loadCtx } from './core';
import { bus, getDoc, patchMessage, pool } from './db';
import { log } from './log';
import { getSecrets } from './secrets';


async function dispatch(tenantId: string, id: string): Promise<void> {
  // Toma el mensaje de forma atómica para no enviarlo dos veces.
  const r = await pool.query(
    `UPDATE messages SET data = jsonb_set(data, '{status}', '"sending"') WHERE tenant_id = $1 AND id = $2 AND data->>'status' = 'pending' RETURNING data`,
    [tenantId, id],
  );
  const msg = r.rows[0]?.data as ChatMessage | undefined;
  if (!msg) return;
  const conv = await getDoc<Conversation>(tenantId, 'conversations', msg.conversationId);
  if (!conv) return;
  if (initialStatus(conv) === 'sent') {
    await patchMessage(tenantId, id, { status: 'sent' });
    return;
  }
  const ctx = await loadCtx(tenantId);
  try {
    const wa = conv.channel === 'whatsapp' ? await getSecrets(tenantId, 'whatsapp') : {};
    const meta = conv.channel === 'messenger' || conv.channel === 'instagram' ? await getSecrets(tenantId, conv.channel) : {};
    const tg = conv.channel === 'telegram' ? await getSecrets(tenantId, 'telegram') : {};
    const channelMessageId = await sendToChannel(conv, msg, {
      whatsappToken: wa['accessToken'],
      phoneNumberId: ctx.channels.get('whatsapp')?.phoneNumberId,
      pageToken: meta['pageToken'],
      telegramToken: tg['botToken'],
      publicBaseUrl: config.publicBaseUrl,
    });
    await patchMessage(tenantId, id, { status: 'sent', ...(channelMessageId ? { channelMessageId } : {}) });
  } catch (e) {
    log.error('No se pudo enviar el mensaje', { tenantId, id, error: (e as Error).message });
    await patchMessage(tenantId, id, { status: 'failed' });
  }
}

export function startDispatcher(): void {
  bus.on('outbound', (tenantId: string, id: string) => void dispatch(tenantId, id).catch((e) => log.error('dispatch', e)));
  const sweep = async () => {
    // Un envío que quedó en "sending" más de 5 minutos (p. ej. se reinició el servidor) se reintenta.
    await pool.query(`UPDATE messages SET data = jsonb_set(data, '{status}', '"pending"') WHERE data->>'status' = 'sending' AND created_at < $1`, [Date.now() - 5 * MINUTE]);
    const r = await pool.query(`SELECT tenant_id, id FROM messages WHERE data->>'status' = 'pending' ORDER BY created_at LIMIT 500`);
    // Un mensaje que falla no detiene el resto.
    for (const row of r.rows) await dispatch(row.tenant_id, row.id).catch((e) => log.error('dispatch', e));
  };
  sweep().catch((e) => log.error('sweep', e));
  setInterval(() => sweep().catch((e) => log.error('sweep', e)), 60_000);
}
