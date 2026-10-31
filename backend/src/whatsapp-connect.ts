/**
 * Conectar WhatsApp sin pasos técnicos (asistente de la pantalla Canales):
 *
 *   GET  /api/channels/whatsapp/setup     si la plataforma tiene lista la app de Meta para conectar con un clic
 *   POST /api/channels/whatsapp/connect   termina la conexión con Meta ("Embedded Signup"), incluida la coexistencia
 *   POST /api/channels/whatsapp/test      envía un mensaje de prueba (plantilla hello_world) a un número
 *
 * Coexistencia: el negocio sigue usando la app de WhatsApp Business en su celular y el mismo número queda en la API.
 * Al conectar se piden a Meta los contactos y el historial (solo una vez, en las primeras 24 h); lo que el negocio
 * escriba desde el celular llega como "eco" y se muestra en la bandeja (el bot se pausa en ese chat).
 *
 * Todos los números conectados así reciben los webhooks en UNA sola dirección de la plataforma (/webhooks/whatsapp);
 * cada mensaje se entrega al cliente dueño de ese número (tenantByPhone).
 */
import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { canAdminTenant } from '../../shared/api';
import { newConversation, noteMessage, outboundMessage } from '../../shared/messages';
import { ChannelConfig, ChatMessage, Conversation } from '../../shared/models';
import { previewOf } from '../../shared/actions';
import { ApiError } from './auth';
import { config } from './config';
import { invalidateCtx } from './core';
import { getDoc, insertMessage, messageExists, patchDoc, pool, putDoc, txEmit } from './db';
import { errorMessage, fetchJson, GRAPH_URL } from './http';
import { log } from './log';
import { getSecrets, saveSecrets, setWhatsAppPin } from './secrets';

/** ¿La plataforma tiene lista su app de Meta para el asistente de un clic? */
export const metaSetupReady = () => !!(config.metaAppId && config.metaAppSecret && config.metaEsConfigId);

// ---------------------------------------------------------------------------
// ¿De qué cliente es este número? (webhook único de la plataforma)
// ---------------------------------------------------------------------------

export async function tenantByPhone(phoneNumberId: string): Promise<string | null> {
  const r = await pool.query(`SELECT tenant_id FROM channels WHERE id = 'whatsapp' AND data->>'phoneNumberId' = $1 LIMIT 1`, [phoneNumberId]);
  return r.rows[0]?.tenant_id ?? null;
}

export async function tenantsByWaba(wabaId: string): Promise<string[]> {
  const r = await pool.query(`SELECT tenant_id FROM channels WHERE id = 'whatsapp' AND data->>'wabaId' = $1`, [wabaId]);
  return r.rows.map((x) => x.tenant_id);
}

// ---------------------------------------------------------------------------
// Coexistencia: mensajes del celular, historial, contactos y avisos de Meta
// ---------------------------------------------------------------------------

const PHONE_NOTE = '📱 Respondiste desde el celular (WhatsApp Business): el bot queda en pausa en este chat.';

/** Conversación de ese cliente final (la crea si no existe, sin bot: la empezó el negocio o viene del historial). */
async function convFor(tenantId: string, waId: string, at: number, c: PoolClient): Promise<Conversation> {
  const template = newConversation('whatsapp', waId, '', at, '+' + waId);
  await c.query(`INSERT INTO conversations (tenant_id, id, data, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id, id) DO NOTHING`, [
    tenantId, template.id, JSON.parse(JSON.stringify({ ...template, botActive: false })), at,
  ]);
  return (await getDoc<Conversation>(tenantId, 'conversations', template.id, c, true))!;
}

/** Mensaje que el negocio envió desde la app del celular (eco). Se muestra en la bandeja y pausa el bot. */
export async function ingestEcho(tenantId: string, e: { to: string; id: string; text: string; at: number }): Promise<void> {
  const id = `echo_${e.id.replace(/[^\w-]/g, '').slice(-60)}`;
  if (await messageExists(tenantId, id)) return;
  await txEmit(async (c) => {
    const conv = await convFor(tenantId, e.to, e.at, c);
    // "sent": ya salió desde el celular; el despachador no debe volver a enviarlo.
    const msg: ChatMessage = { ...outboundMessage({ type: 'text', text: e.text }, conv, 'asesor', 'Desde el celular', e.at, id), status: 'sent', channelMessageId: e.id };
    if (!(await insertMessage(tenantId, msg, c))) return;
    if (conv.botActive) await insertMessage(tenantId, noteMessage(conv.id, PHONE_NOTE, e.at + 1), c);
    await patchDoc<Conversation>(tenantId, 'conversations', conv.id, {
      lastMessage: previewOf(msg), lastMessageAt: e.at, botActive: false, waitingSince: e.at, unread: 0,
    }, c);
  });
}

export interface HistoryThread { id: string; messages?: { from?: string; id?: string; timestamp?: string; type?: string; text?: { body?: string } }[] }

/** Historial de chats de la app (hasta 6 meses). Se guarda sin pasar por el bot. Devuelve cuántos mensajes nuevos. */
export async function importHistory(tenantId: string, threads: HistoryThread[]): Promise<number> {
  let added = 0;
  for (const th of threads) {
    const waId = String(th.id ?? '').replace(/\D/g, '');
    const msgs = (th.messages ?? []).filter((m) => m.id && m.timestamp).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    if (!waId || !msgs.length) continue;
    await txEmit(async (c) => {
      const conv = await convFor(tenantId, waId, Number(msgs[0].timestamp) * 1000, c);
      let last: ChatMessage | null = null;
      for (const m of msgs) {
        const at = Number(m.timestamp) * 1000;
        const text = m.type === 'text' ? (m.text?.body ?? '').slice(0, 4000) : `[${m.type ?? 'mensaje'}]`;
        const inbound = String(m.from ?? '').replace(/\D/g, '') === waId;
        const id = `hist_${String(m.id).replace(/[^\w-]/g, '').slice(-60)}`;
        const msg: ChatMessage = inbound
          ? { id, conversationId: conv.id, direction: 'in', sender: 'cliente', type: 'text', text, createdAt: at, processed: true, channelMessageId: m.id }
          : { ...outboundMessage({ type: 'text', text }, conv, 'asesor', 'Historial de WhatsApp', at, id), status: 'sent', channelMessageId: m.id };
        if (await insertMessage(tenantId, msg, c)) {
          added++;
          last = msg;
        }
      }
      if (last && last.createdAt >= (conv.lastMessageAt ?? 0)) {
        await patchDoc<Conversation>(tenantId, 'conversations', conv.id, { lastMessage: previewOf(last), lastMessageAt: last.createdAt }, c);
      }
    });
  }
  return added;
}

/** Contactos guardados en la app: se usa su nombre en las conversaciones que aún no tienen uno. */
export async function syncContacts(tenantId: string, items: { contact?: { full_name?: string; phone_number?: string }; action?: string }[]): Promise<void> {
  for (const it of items) {
    const name = it.contact?.full_name?.trim().slice(0, 80);
    const waId = String(it.contact?.phone_number ?? '').replace(/\D/g, '');
    if (!name || !waId || it.action === 'remove') continue;
    const conv = await getDoc<Conversation>(tenantId, 'conversations', `whatsapp_${waId}`);
    if (conv && (!conv.name || conv.name === 'Cliente' || /^\+?\d+$/.test(conv.name))) {
      await txEmit((c) => patchDoc<Conversation>(tenantId, 'conversations', conv.id, { name }, c));
    }
  }
}

const NOTICES: Record<string, string> = {
  PARTNER_REMOVED: 'El negocio quitó a JAUTHIA de su cuenta de WhatsApp: el número ya no está conectado.',
  ACCOUNT_OFFBOARDED: 'El número se desconectó de la API desde la app de WhatsApp Business.',
  ACCOUNT_RECONNECTED: 'El número se volvió a conectar.',
  PRIMARY_INACTIVITY: 'Meta desconectó el número porque la app de WhatsApp Business del celular no se abrió en 14 días. Ábrela y vuelve a conectar.',
};

/** Aviso de Meta sobre la cuenta (desconexión, reconexión…): se muestra en Canales. */
export async function accountNotice(wabaId: string, event: string): Promise<void> {
  const text = NOTICES[event];
  if (!text) return;
  for (const tenantId of await tenantsByWaba(wabaId)) {
    const ch = await getDoc<ChannelConfig>(tenantId, 'channels', 'whatsapp');
    if (!ch) continue;
    const connected = event === 'ACCOUNT_RECONNECTED' ? true : ch.connected && !['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED', 'PRIMARY_INACTIVITY'].includes(event) ? ch.connected : false;
    await txEmit((c) => putDoc(tenantId, 'channels', { ...ch, connected, metaNotice: { at: Date.now(), text } }, c));
    invalidateCtx(tenantId);
    log.warn('Aviso de Meta sobre WhatsApp', { tenant: tenantId, event });
  }
}

// ---------------------------------------------------------------------------
// Conexión con un clic (Embedded Signup)
// ---------------------------------------------------------------------------

interface PhoneInfo { id?: string; display_phone_number?: string; verified_name?: string; is_on_biz_app?: boolean; platform_type?: string }

const graph = <T>(path: string, token: string, body?: unknown) => fetchJson<T>(`${GRAPH_URL}/${path}`, { token, body, timeoutMs: 20_000 });

async function exchangeCode(code: string): Promise<string> {
  const q = new URLSearchParams({ client_id: config.metaAppId, client_secret: config.metaAppSecret, code });
  const r = await fetchJson<{ access_token?: string }>(`${GRAPH_URL}/oauth/access_token?${q}`, { timeoutMs: 20_000 });
  if (!r.ok || !r.json.access_token) {
    log.warn('WhatsApp: no se pudo canjear el código de Meta', { status: r.status, error: errorMessage(r) });
    throw new ApiError(502, 'Meta no aceptó la conexión (el código venció o ya se usó). Vuelve a tocar "Conectar con Meta".');
  }
  return r.json.access_token;
}

export interface ConnectResult {
  channel: ChannelConfig;
  coexistence: boolean;
  /** Coexistencia: si se pidieron contactos e historial a Meta. */
  sync?: { contacts: boolean; history: boolean };
}

async function connectWhatsApp(tenantId: string, d: { code: string; wabaId: string; phoneNumberId?: string; appOnboarding?: boolean }): Promise<ConnectResult> {
  const token = await exchangeCode(d.code);
  // El número: el que Meta indicó o el primero de la cuenta (con sus datos de coexistencia).
  const phones = await graph<{ data?: PhoneInfo[] }>(`${encodeURIComponent(d.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type`, token);
  if (!phones.ok) throw new ApiError(502, 'Meta no dejó leer el número de WhatsApp de esa cuenta.');
  const phone = (phones.json.data ?? []).find((p) => p.id === d.phoneNumberId) ?? phones.json.data?.[0];
  if (!phone?.id) throw new ApiError(400, 'Esa cuenta de WhatsApp no tiene un número. Termina el registro en la ventana de Meta.');
  const other = await tenantByPhone(phone.id);
  if (other && other !== tenantId) throw new ApiError(409, 'Ese número ya está conectado a otra empresa de la plataforma.');
  const coexistence = !!(d.appOnboarding || phone.is_on_biz_app);

  // Los mensajes de esa cuenta llegan al webhook de la plataforma.
  const sub = await graph<{ success?: boolean }>(`${encodeURIComponent(d.wabaId)}/subscribed_apps`, token, {});
  if (!sub.ok) throw new ApiError(502, 'Meta no permitió conectar los mensajes de esa cuenta. Intenta de nuevo.');

  const secrets: Record<string, string> = { accessToken: token };
  let sync: ConnectResult['sync'];
  if (coexistence) {
    // Coexistencia: el número sigue en la app (no se registra); se piden contactos e historial (una sola vez).
    const ask = async (type: string) => (await graph(`${encodeURIComponent(phone.id!)}/smb_app_data`, token, { messaging_product: 'whatsapp', sync_type: type })).ok;
    sync = { contacts: await ask('smb_app_state_sync'), history: await ask('history') };
  } else {
    // Número nuevo en la API: se registra con un PIN de verificación en dos pasos (se guarda cifrado).
    const pin = String(randomInt(100000, 999999));
    const reg = await graph(`${encodeURIComponent(phone.id)}/register`, token, { messaging_product: 'whatsapp', pin });
    if (!reg.ok) log.warn('WhatsApp: registro del número', { tenant: tenantId, error: errorMessage(reg) });
    await setWhatsAppPin(tenantId, pin);
  }
  await saveSecrets(tenantId, 'whatsapp', secrets);
  const prev = (await getDoc<ChannelConfig>(tenantId, 'channels', 'whatsapp')) ?? { id: 'whatsapp', enabled: true, connected: false, botEnabled: true };
  const channel: ChannelConfig = {
    ...prev, enabled: true, connected: true, phoneNumberId: phone.id, wabaId: d.wabaId, connectionMode: 'meta', coexistence,
    accountName: `${phone.verified_name ?? 'WhatsApp'} (${phone.display_phone_number ?? ''})`.trim(),
    ...(coexistence ? { syncRequestedAt: Date.now() } : {}), metaNotice: undefined,
  };
  await txEmit((c) => putDoc(tenantId, 'channels', JSON.parse(JSON.stringify(channel)), c));
  invalidateCtx(tenantId);
  log.info('WhatsApp conectado con Meta', { tenant: tenantId, coexistence, sync });
  return { channel, coexistence, sync };
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!canAdminTenant(req.user!.role)) throw new ApiError(403, 'Solo un administrador puede conectar WhatsApp');
  next();
}

const id = z.string().regex(/^\d{5,25}$/);
const connectSchema = z.object({ code: z.string().min(10).max(2000), wabaId: id, phoneNumberId: id.optional(), appOnboarding: z.boolean().optional() });
const testSchema = z.object({ to: z.string().max(30) });

export const waConnectRouter = Router();
waConnectRouter.use(requireAdmin);

waConnectRouter.get('/setup', (_req, res) => {
  res.json({
    ready: metaSetupReady(),
    appId: metaSetupReady() ? config.metaAppId : undefined,
    configId: metaSetupReady() ? config.metaEsConfigId : undefined,
    graphVersion: GRAPH_URL.match(/v\d+\.\d+/)?.[0] ?? 'v23.0',
  });
});

waConnectRouter.post('/connect', async (req, res) => {
  if (!metaSetupReady()) throw new ApiError(503, 'La conexión con un clic aún no está configurada en la plataforma. Usa el modo de prueba o la configuración manual.');
  const p = connectSchema.safeParse(req.body ?? {});
  if (!p.success) throw new ApiError(400, 'Datos de Meta incompletos. Vuelve a tocar "Conectar con Meta".');
  res.json(await connectWhatsApp(req.tenant!.id, p.data));
});

waConnectRouter.post('/test', async (req, res) => {
  const p = testSchema.safeParse(req.body ?? {});
  const to = p.success ? p.data.to.replace(/\D/g, '') : '';
  if (to.length < 8 || to.length > 15) throw new ApiError(400, 'Escribe el número con código de país, ej. 57 300 123 4567');
  const t = req.tenant!.id;
  const ch = await getDoc<ChannelConfig>(t, 'channels', 'whatsapp');
  const token = (await getSecrets(t, 'whatsapp'))['accessToken'];
  if (!ch?.phoneNumberId || !token) throw new ApiError(400, 'Primero guarda el Phone Number ID y el token');
  // hello_world viene aprobada en toda cuenta nueva de Meta (y es la única que admite el número de prueba al inicio).
  const r = await graph<{ messages?: { id?: string }[] }>(`${encodeURIComponent(ch.phoneNumberId)}/messages`, token, {
    messaging_product: 'whatsapp', to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } },
  });
  if (!r.ok) {
    const msg = errorMessage(r);
    const hint = /recipient|allowed list|131030/i.test(msg) ? ' Con el número de prueba, agrega primero ese celular como destinatario en Meta.' : '';
    throw new ApiError(502, `Meta no envió el mensaje: ${msg}.${hint}`);
  }
  log.info('WhatsApp: mensaje de prueba enviado', { tenant: t });
  res.json({ ok: true });
});
