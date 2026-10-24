/**
 * Configuración del frontend.
 *
 * - demo: true  → todo funciona en el navegador con datos de ejemplo (sin servidor).
 * - demo: false → se conecta al backend (Express + PostgreSQL). En desarrollo, `ng serve`
 *   redirige /api, /webhooks y /socket.io a http://localhost:3000 (ver proxy.conf.json).
 */
export const environment = {
  demo: false,
  /** URL del backend. Vacío = mismo dominio (recomendado; en el VPS lo resuelve el proxy). */
  apiUrl: '',
};
