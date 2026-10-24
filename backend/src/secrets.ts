/**
 * Tokens de las redes de cada cliente (WhatsApp, Messenger/Instagram, Telegram).
 *
 *  - Se guardan CIFRADOS en la tabla channel_secrets con AES-256-GCM (clave SECRETS_KEY del servidor).
 *  - Nunca se devuelven al navegador: la pantalla solo ve "guardado ••••1234".
 *  - Solo el administrador del cliente (o un super administrador) puede cambiarlos.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ChannelType } from '../../shared/models';
import { config } from './config';
import { pool } from './db';

/** Qué datos secretos pide cada canal. */
export const SECRET_FIELDS: Partial<Record<ChannelType, string[]>> = {
  whatsapp: ['accessToken', 'appSecret', 'verifyToken'],
  messenger: ['pageToken', 'appSecret', 'verifyToken'],
  instagram: ['pageToken', 'appSecret', 'verifyToken'],
  telegram: ['botToken', 'webhookSecret'],
};

export type ChannelSecrets = Record<string, string>;

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', config.secretsKey, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split(':');
  if (v !== 'v1') throw new Error('Formato de secreto desconocido');
  const d = createDecipheriv('aes-256-gcm', config.secretsKey, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

export async function getSecrets(tenantId: string, channel: ChannelType): Promise<ChannelSecrets> {
  const r = await pool.query('SELECT data_enc FROM channel_secrets WHERE tenant_id = $1 AND channel = $2', [tenantId, channel]);
  if (!r.rows[0]) return {};
  try {
    return JSON.parse(decrypt(r.rows[0].data_enc));
  } catch {
    // Clave SECRETS_KEY cambiada o dato dañado: se tratan como no configurados.
    return {};
  }
}

/** Guarda solo los campos enviados; un campo vacío ("") lo borra. */
export async function saveSecrets(tenantId: string, channel: ChannelType, patch: ChannelSecrets): Promise<void> {
  const allowed = SECRET_FIELDS[channel] ?? [];
  const cur = await getSecrets(tenantId, channel);
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) continue;
    if (v === '') delete cur[k];
    else cur[k] = v.trim();
  }
  await pool.query(
    `INSERT INTO channel_secrets (tenant_id, channel, data_enc, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, channel) DO UPDATE SET data_enc = EXCLUDED.data_enc, updated_at = EXCLUDED.updated_at`,
    [tenantId, channel, encrypt(JSON.stringify(cur)), Date.now()],
  );
}

/** Lo que ve el navegador: qué campos están guardados y sus últimos 4 caracteres. */
export async function secretsStatus(tenantId: string): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  for (const channel of Object.keys(SECRET_FIELDS) as ChannelType[]) {
    const s = await getSecrets(tenantId, channel);
    out[channel] = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, '••••' + v.slice(-4)]));
  }
  return out;
}
