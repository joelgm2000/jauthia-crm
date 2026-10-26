/**
 * Webhooks públicos de las redes, uno por cliente:
 *
 *  GET/POST /webhooks/:tenantId/whatsapp   WhatsApp Cloud API
 *  GET/POST /webhooks/:tenantId/meta       Messenger e Instagram
 *  POST     /webhooks/:tenantId/telegram   Bot de Telegram
 *  POST     /webhooks/:tenantId/webchat    Widget del sitio web (+ GET .../webchat/:sessionId/messages)
 *
 * Seguridad: Meta se valida con la firma X-Hub-Signature-256 usando la clave secreta de la app DE ESE
 * cliente, y Telegram con su secret_token. Sin esos secretos, en producción se rechaza todo.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { conversationId, webchatExternalId } from '../../shared/messages';
import { ChannelType, ChatMessage, Tenant } from '../../shared/models';
import { MINUTE } from '../../shared/time';
import { getTenant } from './auth';
import { config } from './config';
import { ingest, loadCtx, updateStatus } from './core';
import { fetchJson, GRAPH_URL, telegramUrl } from './http';
import { getDoc, pool } from './db';
import { log } from './log';
import { getSecrets } from './secrets';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
    hookTenant?: Tenant;
  }
}

function safeEqual(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Procesa cada elemento por separado: un mensaje con problemas no hace perder los demás del lote. */
async function each<T>(items: T[] | undefined, what: string, tenantId: string, fn: (item: T) => Promise<void>): Promise<void> {
  for (const item of items ?? []) {
    try {
      await fn(item);
    } catch (e) {
      log.error(`webhook ${what}`, { tenant: tenantId, error: (e as Error).message });
    }
  }
}

/** El cliente debe existir y no estar suspendido. */
async function tenantParam(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = String(req.params['tenantId'] ?? '');
  const t = /^[a-z0-9-]{3,60}$/.test(id) ? await getTenant(id) : null;
  if (!t || t.status === 'suspendido') {
    res.sendStatus(404);
    return;
  }
  req.hookTenant = t;
  next();
}

async function validMetaSignature(req: Request, channel: ChannelType): Promise<boolean> {
  const secret = (await getSecrets(req.hookTenant!.id, channel))['appSecret'];
  if (!secret) return !config.isProd; // solo para pruebas locales
  const sig = req.get('x-hub-signature-256') ?? '';
  const expected = 'sha256=' + createHmac('sha256', secret).update(req.rawBody ?? Buffer.alloc(0)).digest('hex');
  return safeEqual(sig, expected);
}

function verifyChallenge(channel: ChannelType) {
  return async (req: Request, res: Response) => {
    const token = (await getSecrets(req.hookTenant!.id, channel))['verifyToken'];
    const ok = !!token && req.query['hub.mode'] === 'subscribe' && safeEqual(String(req.query['hub.verify_token'] ?? ''), token);
    if (ok) res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    else res.sendStatus(403);
  };
}

export const webhooksRouter = Router();
// Anti-abuso: cuenta solo las peticiones RECHAZADAS (firma falsa, cliente inexistente…), por IP y por cliente.
// Los mensajes legítimos firmados por Meta nunca se frenan, aunque un cliente reciba miles por minuto
// (Meta envía los webhooks de todos los clientes desde pocas IPs). El chat web tiene su propio límite.
webhooksRouter.use(rateLimit({
  windowMs: MINUTE, limit: 3000, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? '') + '|' + (req.path.split('/')[1] ?? ''),
}));

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

webhooksRouter.get('/:tenantId/whatsapp', tenantParam, verifyChallenge('whatsapp'));
/** Lo mínimo que usamos del webhook de WhatsApp Cloud API. */
interface WaReply { id?: string; title?: string }
interface WaMessage {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  interactive?: { button_reply?: WaReply; list_reply?: WaReply };
  button?: { payload?: string; text?: string };
  [media: string]: unknown;
}
interface WaValue {
  statuses?: { id: string; status: string }[];
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMessage[];
}
interface WaBody { entry?: { changes?: { value?: WaValue }[] }[] }

const MEDIA_TYPES = ['image', 'document', 'audio', 'video', 'sticker'];

/** Texto y botón de un mensaje de WhatsApp, sea texto, botón, lista, plantilla o archivo. */
function readWaMessage(m: WaMessage): { text: string; buttonId?: string; isMedia: boolean } {
  if (m.type === 'text') return { text: m.text?.body ?? '', isMedia: false };
  if (m.type === 'interactive') {
    const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
    return { text: r?.title ?? '', buttonId: r?.id, isMedia: false };
  }
  if (m.type === 'button') return { text: m.button?.text ?? '', buttonId: m.button?.payload, isMedia: false }; // respuesta rápida de una plantilla
  if (MEDIA_TYPES.includes(m.type)) return { text: (m[m.type] as { caption?: string } | undefined)?.caption || `[${m.type}]`, isMedia: true };
  return { text: `[${m.type}]`, isMedia: false };
}

webhooksRouter.post('/:tenantId/whatsapp', tenantParam, async (req, res) => {
  if (!(await validMetaSignature(req, 'whatsapp'))) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200); // Respondemos rápido: Meta reintenta si tardamos.
  const t = req.hookTenant!.id;
  const body = (req.body ?? {}) as WaBody;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      await each(v.statuses, 'whatsapp (estado)', t, (st) => updateStatus(t, st.id, (st.status === 'failed' ? 'failed' : st.status) as ChatMessage['status']));
      const names = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      await each(v.messages, 'whatsapp', t, async (m) => {
        const { text, buttonId, isMedia } = readWaMessage(m);
        await ingest(t, { channel: 'whatsapp', externalId: String(m.from), name: names.get(m.from), phone: '+' + m.from, channelMessageId: m.id, text: text.slice(0, 4000), buttonId, isMedia });
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Messenger + Instagram
// ---------------------------------------------------------------------------

async function metaProfileName(token: string | undefined, id: string, isIg: boolean): Promise<string | undefined> {
  if (!token) return undefined;
  const fields = isIg ? 'name,username' : 'first_name,last_name';
  const r = await fetchJson<{ name?: string; username?: string; first_name?: string; last_name?: string }>(`${GRAPH_URL}/${encodeURIComponent(id)}?fields=${fields}`, { token });
  if (!r.ok) return undefined;
  const j = r.json;
  return isIg ? j.name || j.username : [j.first_name, j.last_name].filter(Boolean).join(' ') || undefined;
}

webhooksRouter.get('/:tenantId/meta', tenantParam, async (req, res) => {
  // Messenger e Instagram comparten URL: vale el token de verificación de cualquiera de los dos.
  const t = req.hookTenant!.id;
  const tokens = [(await getSecrets(t, 'messenger'))['verifyToken'], (await getSecrets(t, 'instagram'))['verifyToken']].filter(Boolean) as string[];
  const got = String(req.query['hub.verify_token'] ?? '');
  if (req.query['hub.mode'] === 'subscribe' && tokens.some((x) => safeEqual(got, x))) res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
  else res.sendStatus(403);
});
/** Lo mínimo que usamos del webhook de Messenger/Instagram. */
interface MetaEvent {
  sender?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; quick_reply?: { payload?: string }; attachments?: { type: string }[] };
  postback?: { payload?: string; title?: string };
}
interface MetaBody { object?: string; entry?: { id?: string; messaging?: MetaEvent[] }[] }

webhooksRouter.post('/:tenantId/meta', tenantParam, async (req, res) => {
  const body = (req.body ?? {}) as MetaBody;
  const isIg = body.object === 'instagram';
  const channel: ChannelType = isIg ? 'instagram' : 'messenger';
  if (!(await validMetaSignature(req, channel))) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  const t = req.hookTenant!.id;
  const token = (await getSecrets(t, channel))['pageToken'];
  for (const entry of body.entry ?? []) {
    await each(entry.messaging, 'meta', t, async (ev) => {
      const sender = ev.sender?.id;
      if (!sender || ev.message?.is_echo || sender === entry.id) return;
      let text = ev.message?.text ?? '';
      let buttonId = ev.message?.quick_reply?.payload;
      let isMedia = false;
      if (ev.postback) {
        buttonId = ev.postback.payload;
        text = ev.postback.title ?? '';
      }
      if (!text && ev.message?.attachments?.length) {
        isMedia = true;
        text = `[${ev.message.attachments[0].type}]`;
      }
      if (!text && !buttonId) return;
      const exists = await getDoc(t, 'conversations', conversationId(channel, sender));
      await ingest(t, {
        channel, externalId: sender, name: exists ? undefined : await metaProfileName(token, sender, isIg),
        channelMessageId: ev.message?.mid ?? `${sender}_${ev.timestamp}`, text: text.slice(0, 4000), buttonId, isMedia,
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

/** Lo mínimo que usamos de una actualización de Telegram. */
interface TgUser { first_name?: string; last_name?: string }
interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: unknown[];
  document?: unknown;
  reply_markup?: { inline_keyboard?: { text: string; callback_data?: string }[][] };
}
interface TgUpdate { message?: TgMessage; callback_query?: { id: string; data?: string; from?: TgUser; message?: TgMessage } }

webhooksRouter.post('/:tenantId/telegram', tenantParam, async (req, res) => {
  const t = req.hookTenant!.id;
  const s = await getSecrets(t, 'telegram');
  const got = req.get('x-telegram-bot-api-secret-token') ?? '';
  const ok = s['webhookSecret'] ? safeEqual(got, s['webhookSecret']) : !config.isProd;
  if (!ok) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200);
  const u = (req.body ?? {}) as TgUpdate;
  try {
    const q = u.callback_query;
    if (q?.message) {
      // Quita el "cargando" del botón en Telegram.
      if (s['botToken']) await fetchJson(telegramUrl(s['botToken'], 'answerCallbackQuery'), { body: { callback_query_id: q.id } });
      const title = q.message.reply_markup?.inline_keyboard?.flat().find((b) => b.callback_data === q.data)?.text;
      await ingest(t, { channel: 'telegram', externalId: String(q.message.chat.id), name: q.from?.first_name, channelMessageId: `cb_${q.id}`, text: title ?? q.data ?? '', buttonId: q.data });
    } else if (u.message) {
      const m = u.message;
      await ingest(t, {
        channel: 'telegram', externalId: String(m.chat.id), name: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' '),
        channelMessageId: `${m.chat.id}_${m.message_id}`, text: String(m.text ?? m.caption ?? (m.photo ? '[imagen]' : '[mensaje]')).slice(0, 4000),
        isMedia: !!m.photo || !!m.document,
      });
    }
  } catch (e) {
    log.error('webhook telegram', { tenant: t, error: (e as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Chat web: POST { sessionId, name?, text?, buttonId?, title? } → mensajes para pintar
// ---------------------------------------------------------------------------

const webchatLimiter = rateLimit({ windowMs: MINUTE, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiados mensajes, espera un momento' } });
const pollLimiter = rateLimit({ windowMs: MINUTE, limit: 40, standardHeaders: true, legacyHeaders: false });

function forWidget(m: ChatMessage) {
  const { id, direction, type, text, header, footer, imageUrl, videoUrl, buttons, cards, listButton, createdAt } = m;
  return { id, direction, type, text, header, footer, imageUrl, videoUrl, buttons, cards, listButton, createdAt };
}

webhooksRouter.post('/:tenantId/webchat', webchatLimiter, tenantParam, async (req, res) => {
  const t = req.hookTenant!.id;
  const { sessionId, name, text, buttonId, title } = req.body ?? {};
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(sessionId) || (!text && !buttonId)) {
    res.status(400).json({ error: 'sessionId (16-64 caracteres) y text o buttonId son obligatorios' });
    return;
  }
  const ctx = await loadCtx(t);
  if (ctx.channels.get('webchat')?.enabled === false) {
    res.status(403).json({ error: 'El chat web está desactivado' });
    return;
  }
  const out = await ingest(t, {
    channel: 'webchat',
    externalId: webchatExternalId(sessionId),
    name: typeof name === 'string' ? name.slice(0, 80) : undefined,
    text: String(title ?? text ?? '').slice(0, 2000),
    buttonId: typeof buttonId === 'string' ? buttonId.slice(0, 64) : undefined,
  });
  // Al widget solo le enviamos lo necesario para pintar el mensaje (nada interno).
  res.json({ messages: [out.inbound, ...out.replies].filter(Boolean).map((m) => forWidget(m!)) });
});

/** Mensajes nuevos de la conversación del widget (respuestas del asesor desde el CRM). */
webhooksRouter.get('/:tenantId/webchat/:sessionId/messages', pollLimiter, tenantParam, async (req, res) => {
  const sessionId = String(req.params['sessionId'] ?? '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(sessionId)) {
    res.status(400).json({ error: 'sessionId inválido' });
    return;
  }
  const after = Math.max(0, Number(req.query['after']) || 0);
  const r = await pool.query(
    `SELECT data FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND created_at > $3 AND data->>'type' <> 'note' ORDER BY created_at LIMIT 100`,
    [req.hookTenant!.id, conversationId('webchat', webchatExternalId(sessionId)), after],
  );
  res.json({ messages: r.rows.map((x) => forWidget(x.data)) });
});
