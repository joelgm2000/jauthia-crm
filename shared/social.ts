/**
 * Estadísticas REALES de redes sociales (del cliente y de su competencia), parte de la inteligencia de mercado.
 *
 *  - Instagram: API oficial de Meta (Business Discovery) con el token de Meta del cliente o de la plataforma.
 *  - Facebook: API oficial de Meta (páginas públicas; las publicaciones requieren que Meta apruebe
 *    "Page Public Content Access" en la app).
 *  - YouTube: API oficial de Google (YouTube Data API v3).
 *  - TikTok (y cualquier red sin API disponible): captura manual de una persona.
 * Cada cifra guarda su fuente y fecha. La IA solo interpreta estos números: nunca los inventa.
 */

export const SOCIAL_NETWORKS = ['instagram', 'facebook', 'youtube', 'tiktok'] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const NETWORK_LABEL: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

/** Redes que se leen solas con una API oficial (las demás, a mano). */
export const API_NETWORKS: SocialNetwork[] = ['instagram', 'facebook', 'youtube'];

export interface SocialPost {
  id: string;
  url?: string;
  /** Fecha de publicación (ms). */
  date: number;
  /** Reel, Video, Short, Foto, Carrusel, Publicación… */
  kind: string;
  caption: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

export interface SocialAccount {
  /** "instagram:gymstore" */
  key: string;
  network: SocialNetwork;
  handle: string;
  /** "Tu negocio" o el nombre del competidor. */
  owner: string;
  isSelf: boolean;
  name?: string;
  followers?: number;
  /** Publicaciones totales de la cuenta. */
  postsCount?: number;
  source?: 'api' | 'manual';
  /** Cuándo se leyeron (o capturaron) los datos. */
  fetchedAt?: number;
  /** Quién los capturó a mano. */
  by?: string;
  posts: SocialPost[];
  /** Seguidores a lo largo del tiempo (para ver el crecimiento). */
  history: { at: number; followers: number }[];
  /** Por qué no se pudieron leer (cuenta privada, no es de empresa, permiso de Meta pendiente…). */
  error?: string;
}

export interface SocialConnections {
  /** Token de Meta: Instagram y Facebook. */
  meta: boolean;
  youtube: boolean;
}

/** Respuesta de GET /api/market/social. */
export interface SocialStatsData {
  accounts: SocialAccount[];
  connections: SocialConnections;
  lastRefresh?: number;
  refreshesLeft: number;
}

/** Captura manual de una cuenta (PUT /api/market/social/manual). */
export interface ManualCapture {
  network: SocialNetwork;
  handle: string;
  followers?: number;
  posts: Omit<SocialPost, 'id'>[];
}

const PATTERNS: Record<SocialNetwork, RegExp[]> = {
  instagram: [/instagram\.com\/([A-Za-z0-9._]{1,30})/i, /^@?([A-Za-z0-9._]{1,30})$/],
  tiktok: [/tiktok\.com\/@([A-Za-z0-9._]{2,24})/i, /^@?([A-Za-z0-9._]{2,24})$/],
  facebook: [/facebook\.com\/profile\.php\?id=(\d{5,25})/i, /facebook\.com\/(?:pg\/)?([A-Za-z0-9.-]{2,80})/i, /^@?([A-Za-z0-9.-]{2,80})$/],
  youtube: [/youtube\.com\/(@[A-Za-z0-9._-]{3,30})/i, /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/i, /^(@[A-Za-z0-9._-]{3,30})$/, /^(UC[A-Za-z0-9_-]{22})$/],
};
const NOT_HANDLES = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'watch', 'share', 'groups', 'pages', 'video', 'login']);

/** Usuario de la cuenta a partir de "@usuario" o de su enlace (null si no se reconoce). */
export function normalizeHandle(network: SocialNetwork, raw: string | undefined): string | null {
  const v = (raw ?? '').trim().replace(/[?#].*$/, (m) => (m.startsWith('?id=') ? m : '')).replace(/\/+$/, '');
  if (!v) return null;
  for (const re of PATTERNS[network]) {
    const m = v.match(re);
    if (m && !NOT_HANDLES.has(m[1].toLowerCase())) return network === 'youtube' ? m[1] : m[1].toLowerCase();
  }
  return null;
}

export const accountKey = (network: SocialNetwork, handle: string) => `${network}:${handle.toLowerCase()}`;

/** Interacciones de una publicación (me gusta + comentarios + compartidos). */
export const interactions = (p: SocialPost) => (p.likes ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);

/** Promedio de un dato en las publicaciones que lo tienen (undefined si ninguna). */
export function avg(posts: SocialPost[], f: (p: SocialPost) => number | undefined): number | undefined {
  const vals = posts.map(f).filter((x): x is number => typeof x === 'number');
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : undefined;
}

/** Interacción promedio por publicación sobre los seguidores, en % (undefined sin datos). */
export function engagementRate(a: Pick<SocialAccount, 'followers' | 'posts'>): number | undefined {
  if (!a.followers || !a.posts.length) return undefined;
  const per = avg(a.posts, (p) => (p.likes === undefined && p.comments === undefined ? undefined : interactions(p)));
  return per === undefined ? undefined : Math.round((per / a.followers) * 10000) / 100;
}

/** Publicaciones por semana según las fechas de las últimas publicaciones. */
export function postsPerWeek(posts: SocialPost[]): number | undefined {
  if (posts.length < 2) return undefined;
  const dates = posts.map((p) => p.date).sort((a, b) => a - b);
  const weeks = (dates[dates.length - 1] - dates[0]) / (7 * 86_400_000);
  return weeks > 0 ? Math.round((posts.length / weeks) * 10) / 10 : undefined;
}

/** Cambio de seguidores frente a la medición anterior. */
export function followersDelta(a: Pick<SocialAccount, 'history'>): { diff: number; since: number } | undefined {
  const h = a.history;
  if (h.length < 2) return undefined;
  const last = h[h.length - 1];
  const prev = h[h.length - 2];
  return { diff: last.followers - prev.followers, since: prev.at };
}
