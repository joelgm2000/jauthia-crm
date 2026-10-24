/**
 * Acceso a PostgreSQL (multi-cliente).
 *
 * Cada fila pertenece a un cliente (tenant_id) y TODAS las consultas filtran por él:
 * un cliente nunca puede leer ni escribir datos de otro. Las entidades del CRM se guardan
 * como documentos JSONB (misma forma que los modelos de /shared) con índices aparte.
 * Cada escritura emite un evento en `bus` para avisar en tiempo real solo a ese cliente.
 */
import { EventEmitter } from 'node:events';
import pg from 'pg';
import { CollectionName, RealtimeEvents } from '../../shared/api';
import { ChatMessage } from '../../shared/models';
import { config } from './config';
import { log } from './log';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: config.dbPoolMax });

// BIGINT (fechas en milisegundos) como número de JS.
pg.types.setTypeParser(20, (v) => Number(v));

export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Evento de tiempo real para los asesores conectados de ese cliente. */
export function emit<K extends keyof RealtimeEvents>(tenantId: string, event: K, payload: RealtimeEvents[K]): void {
  bus.emit('rt', tenantId, event, payload);
}

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_meta (id INT PRIMARY KEY, version INT NOT NULL);

CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'asesor')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL,
  -- Un super administrador no pertenece a ningún cliente; los demás siempre pertenecen a uno.
  CHECK ((role = 'superadmin') = (tenant_id IS NULL))
);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS conversations (
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS conversations_awaiting_idx ON conversations (((data->'bot'->>'awaitingSince')::bigint)) WHERE data->'bot' ? 'awaitingSince';
CREATE INDEX IF NOT EXISTS conversations_waiting_idx ON conversations (tenant_id, ((data->>'waitingSince')::bigint)) WHERE data->>'waitingSince' IS NOT NULL;

CREATE TABLE IF NOT EXISTS messages (
  tenant_id          TEXT NOT NULL,
  id                 TEXT NOT NULL,
  conversation_id    TEXT NOT NULL,
  created_at         BIGINT NOT NULL,
  channel_message_id TEXT,
  data               JSONB NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages (tenant_id, conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (tenant_id, channel_message_id) WHERE channel_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_pending_idx ON messages ((data->>'status')) WHERE data->>'status' IN ('pending', 'sending');

CREATE TABLE IF NOT EXISTS products  (tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, id TEXT NOT NULL, data JSONB NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (tenant_id, id));
CREATE TABLE IF NOT EXISTS templates (tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, id TEXT NOT NULL, data JSONB NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (tenant_id, id));
CREATE TABLE IF NOT EXISTS tasks     (tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, id TEXT NOT NULL, data JSONB NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (tenant_id, id));
CREATE TABLE IF NOT EXISTS channels  (tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, id TEXT NOT NULL, data JSONB NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (tenant_id, id));
CREATE TABLE IF NOT EXISTS settings  (tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, key TEXT NOT NULL, data JSONB NOT NULL, updated_at BIGINT NOT NULL, PRIMARY KEY (tenant_id, key));

-- Tokens de WhatsApp, Meta y Telegram de cada cliente, CIFRADOS (AES-256-GCM).
CREATE TABLE IF NOT EXISTS channel_secrets (
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL,
  data_enc   TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, channel)
);
`;

export async function migrate(): Promise<void> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_meta (id INT PRIMARY KEY, version INT NOT NULL)');
  const v = (await pool.query('SELECT version FROM schema_meta WHERE id = 1')).rows[0]?.version ?? 0;
  if (v < SCHEMA_VERSION) {
    const legacy = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'tenant_id'`);
    const hasOld = (await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations'`)).rowCount;
    if (hasOld && !legacy.rowCount) {
      // Versión 1 (un solo cliente, solo datos de prueba de desarrollo): se reemplaza.
      if (config.isProd) throw new Error('Base de datos de versión 1 en producción: haz una copia y migra manualmente.');
      log.warn('Actualizando la base de desarrollo a multi-cliente (se borran los datos de prueba anteriores)');
      await pool.query('DROP TABLE IF EXISTS messages, conversations, products, templates, tasks, channels, settings, users CASCADE');
    }
  }
  await pool.query(SCHEMA);
  await pool.query('INSERT INTO schema_meta (id, version) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version', [SCHEMA_VERSION]);
  log.info('Esquema de base de datos listo');
}

/** Ejecuta una función dentro de una transacción. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

type Q = Pick<pg.PoolClient, 'query'>;
const TABLES: Record<CollectionName, string> = { conversations: 'conversations', products: 'products', templates: 'templates', tasks: 'tasks', channels: 'channels' };

/** Quita undefined (JSON no los admite) y devuelve un objeto listo para JSONB. */
function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Dentro de una transacción los eventos esperan al COMMIT; fuera, salen de inmediato. */
function later(q: Q, fire: () => void): void {
  if (q === pool) fire();
  else pendingEmits(q).push(fire);
}

// ---------------------------------------------------------------------------
// Documentos (colecciones) — siempre con tenantId
// ---------------------------------------------------------------------------

export async function getDoc<T>(tenantId: string, col: CollectionName, id: string, q: Q = pool, forUpdate = false): Promise<T | null> {
  const r = await q.query(`SELECT data FROM ${TABLES[col]} WHERE tenant_id = $1 AND id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [tenantId, id]);
  return r.rows[0]?.data ?? null;
}

export async function listDocs<T>(tenantId: string, col: CollectionName, q: Q = pool): Promise<T[]> {
  const r = await q.query(`SELECT data FROM ${TABLES[col]} WHERE tenant_id = $1`, [tenantId]);
  return r.rows.map((x) => x.data);
}

export async function putDoc<T extends { id: string }>(tenantId: string, col: CollectionName, item: T, q: Q = pool): Promise<void> {
  const data = clean(item);
  await q.query(
    `INSERT INTO ${TABLES[col]} (tenant_id, id, data, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [tenantId, item.id, data, Date.now()],
  );
  later(q, () => emit(tenantId, 'upsert', { col, item: data }));
}

/** Mezcla superficial de campos: solo cambia las claves enviadas. */
export async function patchDoc<T>(tenantId: string, col: CollectionName, id: string, patch: Partial<T>, q: Q = pool): Promise<T | null> {
  const r = await q.query(`UPDATE ${TABLES[col]} SET data = data || $3::jsonb, updated_at = $4 WHERE tenant_id = $1 AND id = $2 RETURNING data`, [tenantId, id, clean(patch), Date.now()]);
  const item = r.rows[0]?.data ?? null;
  if (item) later(q, () => emit(tenantId, 'upsert', { col, item }));
  return item;
}

export async function removeDoc(tenantId: string, col: CollectionName, id: string, q: Q = pool): Promise<void> {
  await q.query(`DELETE FROM ${TABLES[col]} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
  later(q, () => emit(tenantId, 'remove', { col, id }));
}

// ---------------------------------------------------------------------------
// Ajustes por cliente
// ---------------------------------------------------------------------------

export async function getSetting<T>(tenantId: string, key: 'general' | 'flow'): Promise<T | null> {
  const r = await pool.query('SELECT data FROM settings WHERE tenant_id = $1 AND key = $2', [tenantId, key]);
  return r.rows[0]?.data ?? null;
}

export async function putSetting(tenantId: string, key: 'general' | 'flow', data: unknown, emitEvent = true): Promise<void> {
  const d = clean(data);
  await pool.query(
    `INSERT INTO settings (tenant_id, key, data, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [tenantId, key, d, Date.now()],
  );
  if (emitEvent) emit(tenantId, 'setting', { key, data: d });
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Inserta un mensaje. Devuelve false si ya existía (reintento de webhook). */
export async function insertMessage(tenantId: string, m: ChatMessage, q: Q = pool): Promise<boolean> {
  const data = clean(m);
  const r = await q.query(
    `INSERT INTO messages (tenant_id, id, conversation_id, created_at, channel_message_id, data) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, id) DO NOTHING`,
    [tenantId, m.id, m.conversationId, m.createdAt, m.channelMessageId ?? null, data],
  );
  if (!r.rowCount) return false;
  later(q, () => {
    emit(tenantId, 'message', { conversationId: m.conversationId, message: data });
    if (m.direction === 'out' && m.status === 'pending') bus.emit('outbound', tenantId, m.id);
  });
  return true;
}

export async function messageExists(tenantId: string, id: string, q: Q = pool): Promise<boolean> {
  const r = await q.query('SELECT 1 FROM messages WHERE tenant_id = $1 AND id = $2', [tenantId, id]);
  return !!r.rowCount;
}

export async function patchMessage(tenantId: string, id: string, patch: Partial<ChatMessage>): Promise<void> {
  const r = await pool.query(
    `UPDATE messages SET data = data || $3::jsonb, channel_message_id = COALESCE($4, channel_message_id) WHERE tenant_id = $1 AND id = $2 RETURNING conversation_id`,
    [tenantId, id, clean(patch), patch.channelMessageId ?? null],
  );
  if (r.rows[0]) emit(tenantId, 'messagePatch', { conversationId: r.rows[0].conversation_id, id, patch });
}

export async function listMessages(tenantId: string, conversationId: string, limit = 300): Promise<ChatMessage[]> {
  const r = await pool.query(
    `SELECT data FROM (SELECT data, created_at FROM messages WHERE tenant_id = $1 AND conversation_id = $2 ORDER BY created_at DESC LIMIT $3) t ORDER BY created_at`,
    [tenantId, conversationId, limit],
  );
  return r.rows.map((x) => x.data);
}

// ---------------------------------------------------------------------------
// Eventos dentro de transacciones: se emiten solo después del COMMIT.
// ---------------------------------------------------------------------------

const txEmits = new WeakMap<object, (() => void)[]>();
function pendingEmits(q: Q): (() => void)[] {
  let l = txEmits.get(q);
  if (!l) txEmits.set(q, (l = []));
  return l;
}

/** Transacción que emite los eventos de tiempo real al confirmar. */
export async function txEmit<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  let client: pg.PoolClient | null = null;
  try {
    const r = await tx(async (c) => {
      client = c;
      return fn(c);
    });
    // Solo tras el COMMIT se avisa a los navegadores.
    (client ? txEmits.get(client) : undefined)?.forEach((f) => f());
    return r;
  } finally {
    // Si hubo ROLLBACK, los eventos pendientes se descartan (la conexión se reutiliza).
    if (client) txEmits.delete(client);
  }
}
