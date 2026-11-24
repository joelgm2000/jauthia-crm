/**
 * Archivos que mandan los clientes por el chat (fotos de recibos, PDF, comprobantes, audios, videos).
 *
 * Seguridad:
 *  - Se guardan CIFRADOS (AES-256-GCM) en la base: suelen tener datos personales.
 *  - Solo se descargan con sesión del mismo cliente: GET /api/files/:id (filtrado por tenant).
 *  - Ids al azar de 128 bits; tamaño máximo 16 MB.
 *  - Se sirven con nosniff y CSP "sandbox": un archivo malicioso no puede ejecutar código en el CRM.
 *  - El token de WhatsApp solo viaja del servidor a Meta; nunca al navegador ni a los registros.
 */
import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { ApiError } from './auth';
import { pool } from './db';
import { GRAPH_URL } from './http';
import { decrypt, encrypt } from './secrets';

export const MAX_FILE_BYTES = 16 * 1024 * 1024;

/** Tipos que el navegador puede mostrar dentro del CRM; el resto se descarga. */
const INLINE = /^(image\/(jpeg|png|webp|gif)|application\/pdf|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))$/;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
};

export interface StoredFile {
  url: string;
  name: string;
  mime: string;
  size: number;
}

function cleanName(name: string, mime: string): string {
  const base = name.replace(/[\\/\r\n"<>]/g, '').trim().slice(0, 120);
  return base || `archivo.${EXT[mime] ?? 'bin'}`;
}

/** Guarda el archivo cifrado y devuelve la ruta privada para verlo desde el CRM. */
export async function saveInboxFile(tenantId: string, conversationId: string, mime: string, name: string, bytes: Buffer): Promise<StoredFile> {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Archivo demasiado grande');
  const id = randomBytes(16).toString('hex');
  const safeMime = /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime.toLowerCase() : 'application/octet-stream';
  const file = { name: cleanName(name, safeMime), mime: safeMime, size: bytes.length };
  await pool.query(
    'INSERT INTO inbox_files (tenant_id, id, conversation_id, mime, name, size, data_enc, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [tenantId, id, conversationId, file.mime, file.name, file.size, encrypt(bytes.toString('base64')), Date.now()],
  );
  return { url: `/api/files/${id}`, ...file };
}

/** Descarga un archivo de WhatsApp Cloud API (dos pasos: pedir la URL temporal y bajarla con el token). */
export async function downloadWaMedia(token: string, mediaId: string): Promise<{ mime: string; bytes: Buffer }> {
  const auth = { Authorization: `Bearer ${token}` };
  const metaRes = await fetch(`${GRAPH_URL}/${encodeURIComponent(mediaId)}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
  const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string; file_size?: number };
  if (!metaRes.ok || !meta.url) throw new Error(`Meta no entregó el archivo (${metaRes.status})`);
  if ((meta.file_size ?? 0) > MAX_FILE_BYTES) throw new Error('Archivo demasiado grande');
  const bin = await fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
  if (!bin.ok) throw new Error(`No se pudo descargar el archivo (${bin.status})`);
  const bytes = Buffer.from(await bin.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Archivo demasiado grande');
  return { mime: (meta.mime_type ?? bin.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim(), bytes };
}

/** GET /api/files/:id — solo archivos del cliente de la sesión. */
export async function serveInboxFile(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id'] ?? '');
  if (!/^[a-f0-9]{32}$/.test(id)) throw new ApiError(400, 'id inválido');
  const r = await pool.query('SELECT mime, name, data_enc FROM inbox_files WHERE tenant_id = $1 AND id = $2', [req.tenant!.id, id]);
  const row = r.rows[0] as { mime: string; name: string; data_enc: string } | undefined;
  if (!row) throw new ApiError(404, 'Archivo no encontrado');
  const inline = INLINE.test(row.mime);
  res.set({
    'Content-Type': inline ? row.mime : 'application/octet-stream',
    'Content-Disposition': `${inline && req.query['download'] === undefined ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'X-Content-Type-Options': 'nosniff',
    // El visor de PDF de Chrome no abre con "sandbox"; los PDF no ejecutan código en el origen del CRM.
    'Content-Security-Policy': row.mime === 'application/pdf' ? "default-src 'none'; object-src 'self'" : "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    'Cache-Control': 'private, max-age=86400',
  });
  res.send(Buffer.from(decrypt(row.data_enc), 'base64'));
}

/** Al borrar una conversación se borran sus archivos. */
export async function deleteConversationFiles(tenantId: string, conversationId: string): Promise<void> {
  await pool.query('DELETE FROM inbox_files WHERE tenant_id = $1 AND conversation_id = $2', [tenantId, conversationId]);
}
