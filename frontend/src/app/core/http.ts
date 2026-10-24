import { environment } from '../../environments/environment';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/**
 * Petición al backend. La sesión viaja en una cookie httpOnly (el código no puede leerla)
 * y el encabezado X-CRM-Request protege contra CSRF.
 */
export async function api<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const res = await fetch(environment.apiUrl + path, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CRM-Request': '1' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* sin cuerpo */
  }
  if (!res.ok) throw new HttpError(res.status, json?.error ?? `Error ${res.status}`, json?.details);
  return json as T;
}
