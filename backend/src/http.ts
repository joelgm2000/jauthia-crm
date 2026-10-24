/** Llamadas HTTP a las redes (Meta y Telegram): siempre con tiempo límite y sin filtrar tokens en los registros. */

export const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export function telegramUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

/** Respuesta JSON de las APIs de Meta/Telegram (solo los campos que usamos). */
export interface ApiJson {
  error?: { message?: string };
  description?: string;
  [key: string]: unknown;
}

export interface HttpResult<T = ApiJson> {
  ok: boolean;
  status: number;
  json: Partial<T> & ApiJson;
}

/** Oculta tokens en URLs antes de registrarlas. */
export function redactUrl(url: string): string {
  return url.replace(/access_token=[^&]+/, 'access_token=***').replace(/\/bot[^/]+\//, '/bot***/');
}

/** GET/POST con JSON. Nunca lanza por red caída o tiempo agotado: devuelve ok=false con el motivo. */
export async function fetchJson<T = ApiJson>(
  url: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; token?: string; timeoutMs?: number } = {},
): Promise<HttpResult<T>> {
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    const json = ((await res.json().catch(() => ({}))) ?? {}) as Partial<T> & ApiJson;
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: { error: { message: (e as Error).message } } as Partial<T> & ApiJson };
  }
}

/** Mensaje de error legible de una respuesta fallida. */
export function errorMessage(r: HttpResult<unknown>): string {
  return r.json.error?.message ?? r.json.description ?? (r.status ? `HTTP ${r.status}` : 'Sin respuesta');
}
