/**
 * Llamada de texto a Google Gemini con un reintento cuando Google está saturado,
 * y mensajes de error claros para el usuario (sin mostrar el error interno ni la clave).
 */
import { ApiError } from './auth';
import { config } from './config';
import { errorMessage, fetchJson, HttpResult } from './http';
import { log } from './log';

export interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
}

/** Saturado, límite por minuto o sin respuesta: vale la pena reintentar. */
const RETRYABLE = new Set([0, 429, 500, 502, 503, 504]);

export async function geminiGenerate(apiKey: string, body: unknown, timeoutMs: number, retryDelayMs = 2_000): Promise<HttpResult<GeminiResponse>> {
  const url = `${config.aiBaseUrl}/v1beta/models/${encodeURIComponent(config.aiTextModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let r = await fetchJson<GeminiResponse>(url, { body, timeoutMs });
  // Un segundo intento (sin contar los tiempos agotados largos, para no hacer esperar el doble).
  if (!r.ok && RETRYABLE.has(r.status) && !(r.status === 0 && /timeout|aborted/i.test(errorMessage(r)))) {
    await new Promise((res) => setTimeout(res, retryDelayMs));
    r = await fetchJson<GeminiResponse>(url, { body, timeoutMs });
  }
  return r;
}

/** Error para el usuario según lo que respondió Google; el detalle técnico solo va al registro del servidor. */
export function geminiError(r: HttpResult<GeminiResponse>, what: string): ApiError {
  const detail = errorMessage(r);
  log.warn(`${what}: la IA falló`, { status: r.status, error: detail });
  if (r.status === 400 && /api key|api_key/i.test(detail)) return new ApiError(502, 'Google rechazó la clave de la IA (Gemini). El administrador de la plataforma debe revisarla o cambiarla.');
  if (r.status === 401 || r.status === 403) return new ApiError(502, 'La clave de la IA (Gemini) no tiene permiso para usar este servicio. El administrador de la plataforma debe revisarla.');
  if (r.status === 429) return new ApiError(502, 'Se acabó por ahora la cuota de uso de la IA de Google. Espera unos minutos; si sigue pasando, revisa el plan o la facturación de la clave de Gemini.');
  if (r.status === 404) return new ApiError(502, 'El modelo de IA configurado no está disponible. El administrador de la plataforma debe revisar la configuración.');
  if (r.status === 0 && /timeout|aborted/i.test(detail)) return new ApiError(502, 'La IA tardó demasiado en responder. Intenta de nuevo.');
  if (r.status === 0 || r.status >= 500) return new ApiError(502, 'La IA de Google está saturada o no respondió. Intenta de nuevo en un momento.');
  return new ApiError(502, 'La IA no pudo responder. Intenta de nuevo.');
}
