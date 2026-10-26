/**
 * Fotos y videos del catálogo que sube cada cliente, y fotos generadas con la IA de la plataforma.
 *
 *   POST /api/media              sube un archivo (cuerpo binario; JPG/PNG hasta 5 MB, MP4 hasta 16 MB)
 *   POST /api/media/generate     genera una foto nueva a partir de una del cliente (módulo "IA de imágenes")
 *   GET  /media/<cliente>/<archivo>   público: WhatsApp, Messenger y Telegram descargan desde aquí
 *
 * Seguridad: solo administradores; el tipo se comprueba por el contenido (no por el nombre); nombres al
 * azar en la carpeta del cliente; cupo de espacio por cliente; la IA solo parte de archivos del mismo cliente
 * y usa la clave del cliente (cifrada en channel_secrets) o, si no tiene, GEMINI_API_KEY de la plataforma.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express, { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AI_IMAGE_STYLES, AiImageStyle, canAdminTenant } from '../../shared/api';
import { HOUR } from '../../shared/time';
import { ApiError } from './auth';
import { config } from './config';
import { errorMessage, fetchJson } from './http';
import { log } from './log';
import { getAiKey } from './secrets';

const MB = 1024 * 1024;

/** Límites de WhatsApp: imagen 5 MB, video 16 MB (MP4). */
const KINDS = {
  jpg: { mime: 'image/jpeg', max: 5 * MB },
  png: { mime: 'image/png', max: 5 * MB },
  mp4: { mime: 'video/mp4', max: 16 * MB },
} as const;
type Ext = keyof typeof KINDS;

/** Tipo real del archivo según sus primeros bytes. */
function sniff(b: Buffer): Ext | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  return null;
}

const tenantDir = (tenantId: string) => path.join(config.mediaDir, tenantId);

async function usedBytes(tenantId: string): Promise<number> {
  const dir = tenantDir(tenantId);
  const files = await readdir(dir).catch(() => [] as string[]);
  const sizes = await Promise.all(files.map((f) => stat(path.join(dir, f)).then((s) => s.size, () => 0)));
  return sizes.reduce((a, b) => a + b, 0);
}

/** Guarda el archivo en la carpeta del cliente y devuelve su ruta pública. */
async function store(tenantId: string, data: Buffer): Promise<string> {
  const ext = sniff(data);
  if (!ext) throw new ApiError(415, 'Formato no permitido: sube fotos JPG o PNG, o videos MP4');
  if (data.length > KINDS[ext].max) throw new ApiError(413, `El archivo supera ${KINDS[ext].max / MB} MB (límite de WhatsApp)`);
  if ((await usedBytes(tenantId)) + data.length > config.mediaQuotaMb * MB) {
    throw new ApiError(413, `Se llenó el espacio para fotos y videos (${config.mediaQuotaMb} MB). Borra archivos que no uses.`);
  }
  await mkdir(tenantDir(tenantId), { recursive: true });
  const file = `${randomBytes(12).toString('hex')}.${ext}`;
  await writeFile(path.join(tenantDir(tenantId), file), data);
  return `/media/${tenantId}/${file}`;
}

/** Archivo del propio cliente a partir de su ruta pública (nunca de otro cliente ni fuera de la carpeta). */
async function readOwn(tenantId: string, url: string): Promise<{ data: Buffer; mime: string }> {
  const m = url.match(/^\/media\/([\w-]+)\/([a-f0-9]{24}\.(jpg|png))$/);
  if (!m || m[1] !== tenantId) throw new ApiError(400, 'Usa una foto subida a este catálogo');
  const data = await readFile(path.join(tenantDir(tenantId), m[2])).catch(() => null);
  if (!data) throw new ApiError(404, 'La foto ya no existe');
  return { data, mime: KINDS[m[3] as Ext].mime };
}

// ---------------------------------------------------------------------------
// IA de imágenes (Gemini)
// ---------------------------------------------------------------------------

const KEEP = 'Keep the product exactly as it is in the reference photo: same shape, colors, logos and proportions. Do not add any text, watermark or logo.';

/** Estilos que ofrece la interfaz. */
const AI_STYLES: Record<AiImageStyle, string> = {
  estudio: `Professional e-commerce photo of this product on a clean pure white studio background, soft natural shadow, sharp focus, centered, square format. ${KEEP}`,
  ambiente: `Realistic lifestyle photo of this product placed in a bright, modern and tidy setting where it is normally used, natural daylight, shallow depth of field, square format. ${KEEP}`,
  publicidad: `Eye-catching advertising image of this product with dramatic lighting and a bold smooth gradient background, premium look, empty space around it for a headline, square format. ${KEEP}`,
};

const generateSchema = z.object({
  imageUrl: z.string().max(200),
  style: z.enum(AI_IMAGE_STYLES),
  /** Indicación adicional del cliente (ej. "en un gimnasio con espejos"). */
  extra: z.string().max(300).optional(),
});

interface GeminiPart { text?: string; inlineData?: { mimeType?: string; data?: string } }
interface GeminiResponse { candidates?: { content?: { parts?: GeminiPart[] } }[] }

async function generateImage(apiKey: string, source: { data: Buffer; mime: string }, prompt: string): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.aiImageModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const r = await fetchJson<GeminiResponse>(url, {
    body: {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: source.mime, data: source.data.toString('base64') } }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    },
    timeoutMs: 120_000,
  });
  if (!r.ok) {
    log.warn('IA de imágenes falló', { status: r.status, error: errorMessage(r) });
    throw new ApiError(502, 'La IA no pudo generar la imagen. Intenta de nuevo en un momento.');
  }
  const img = r.json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!img) throw new ApiError(502, 'La IA no devolvió una imagen. Prueba con otra foto o con otro estilo.');
  return Buffer.from(img, 'base64');
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!canAdminTenant(req.user!.role)) throw new ApiError(403, 'Solo un administrador puede subir archivos');
  next();
}

// Generar cuesta dinero a la plataforma: tope por cliente.
const aiLimiter = rateLimit({
  windowMs: HOUR, limit: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'ai:' + req.tenant!.id,
  message: { error: 'Llegaste al límite de 30 imágenes por hora. Intenta más tarde.' },
});

export const mediaRouter = Router();
mediaRouter.use(requireAdmin);

mediaRouter.post('/', express.raw({ type: () => true, limit: KINDS.mp4.max }), async (req, res) => {
  const data = req.body;
  if (!Buffer.isBuffer(data) || !data.length) throw new ApiError(400, 'No llegó ningún archivo');
  const url = await store(req.tenant!.id, data);
  log.info('archivo subido', { tenant: req.tenant!.id, bytes: data.length });
  res.json({ url });
});

mediaRouter.post('/generate', aiLimiter, async (req, res) => {
  const tenant = req.tenant!;
  if (!tenant.modules.aiImages) throw new ApiError(403, 'Este cliente no tiene activada la IA de imágenes');
  // Primero la clave propia del cliente (la pone el super administrador); si no tiene, la de la plataforma.
  const apiKey = (await getAiKey(tenant.id)) || config.geminiApiKey;
  if (!apiKey) throw new ApiError(503, 'La IA de imágenes no está configurada: falta la clave API de este cliente');
  const p = generateSchema.safeParse(req.body ?? {});
  if (!p.success) throw new ApiError(400, 'Datos inválidos');
  const source = await readOwn(tenant.id, p.data.imageUrl);
  const prompt = AI_STYLES[p.data.style] + (p.data.extra?.trim() ? ` Additional instructions from the customer: ${p.data.extra.trim()}` : '');
  const url = await store(tenant.id, await generateImage(apiKey, source, prompt));
  log.info('imagen generada con IA', { tenant: tenant.id, style: p.data.style });
  res.json({ url });
});

/** Archivos públicos (las redes los descargan sin sesión). Nombres al azar: no se pueden adivinar ni listar. */
export const serveMedia = express.static(config.mediaDir, {
  maxAge: '30d', immutable: true, index: false, dotfiles: 'deny',
  setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
});
