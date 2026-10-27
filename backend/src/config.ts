/** Configuración del servidor, leída de variables de entorno (archivo backend/.env). */
import 'dotenv/config';
import path from 'node:path';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Falta la variable de entorno ${name} (ver backend/.env.example)`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgresql://crm:crm_dev_local@localhost:5433/jauthia_crm'),
  /** Clave para firmar las sesiones. En producción es obligatoria y larga. */
  jwtSecret: (() => {
    const s = required('JWT_SECRET', isProd ? undefined : 'dev-only-secret-change-me-dev-only-secret');
    if (isProd && s.length < 32) throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    return s;
  })(),
  /**
   * Clave con la que se cifran los tokens de WhatsApp/Meta/Telegram de cada cliente en la base de datos.
   * 32 bytes en base64:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   * ¡Guárdala bien! Si se pierde, hay que volver a pegar los tokens de todos los clientes.
   */
  secretsKey: (() => {
    const raw = required('SECRETS_KEY', isProd ? undefined : 'ZGV2LW9ubHktc2VjcmV0cy1rZXktMzItYnl0ZXMhISE=');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('SECRETS_KEY debe ser de 32 bytes en base64');
    return key;
  })(),
  /** Conexiones simultáneas a PostgreSQL (más = más mensajes en paralelo; PostgreSQL admite 100 por defecto). */
  dbPoolMax: Math.max(2, Number(process.env.DB_POOL_MAX ?? 20)),
  /** Correo del dueño de la plataforma: el único que puede nombrar super administradores. */
  ownerEmail: (process.env.PLATFORM_OWNER_EMAIL ?? '').trim().toLowerCase(),
  /** Orígenes que pueden llamar a la API (el frontend). Separados por coma. */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:4200').split(',').map((s) => s.trim()).filter(Boolean),
  /** Sitios donde se puede pegar el widget de chat web ("*" = cualquiera). */
  webchatOrigins: (process.env.WEBCHAT_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean),
  /** URL pública del servidor (https). Para las imágenes del catálogo y para registrar webhooks. */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
  /**
   * ¿Hay un proxy (Caddy/Nginx) delante? Número de saltos de confianza para leer la IP real de X-Forwarded-For.
   * Vacío = no se confía en el encabezado (si no, cualquiera inventaría su IP y evadiría los bloqueos).
   */
  trustProxy: (() => {
    const v = (process.env.TRUST_PROXY ?? '').trim();
    if (!v || v === 'false' || v === '0') return false;
    return /^\d+$/.test(v) ? Number(v) : v;
  })() as boolean | number | string,
  /** Carpeta donde se guardan las fotos y videos que suben los clientes (una subcarpeta por cliente). */
  mediaDir: process.env.MEDIA_DIR || path.resolve('media'),
  /** Espacio máximo por cliente para fotos y videos, en MB. */
  mediaQuotaMb: Number(process.env.MEDIA_QUOTA_MB ?? 1024),
  /** Clave de Google AI Studio (Gemini) de la plataforma, para generar fotos de producto. Vacía = IA apagada. */
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  /** Modelo de Gemini que edita y genera imágenes. */
  /** Dirección de la API de Gemini (solo se cambia para pruebas con un servidor falso). */
  aiBaseUrl: (process.env.AI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, ''),
  aiImageModel: process.env.AI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  /** Modelo de Gemini que investiga en internet para la inteligencia de mercado (con búsqueda de Google). */
  aiTextModel: process.env.AI_TEXT_MODEL || 'gemini-2.5-flash',
  /** Análisis de inteligencia de mercado que puede pedir cada cliente por día. */
  marketDailyLimit: Math.max(1, Number(process.env.MARKET_DAILY_LIMIT ?? 20)),
  /** Carpeta con el build del frontend para servirlo desde el mismo servidor (opcional). */
  frontendDir: process.env.FRONTEND_DIR ?? '',
};
