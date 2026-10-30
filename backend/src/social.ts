/**
 * Estadísticas REALES de redes sociales del cliente y de su competencia (módulo de inteligencia de mercado).
 *
 *  - Instagram: Business Discovery de la API oficial de Meta (cuentas de empresa o creador).
 *  - Facebook: páginas públicas por la API oficial de Meta. Las publicaciones de páginas ajenas requieren que Meta
 *    apruebe "Page Public Content Access" en la app; sin ese permiso se leen los seguidores y las publicaciones
 *    se capturan a mano.
 *  - YouTube: YouTube Data API v3.
 *  - TikTok: no hay API oficial para ver cuentas ajenas → captura manual.
 *
 * Solo se consultan las cuentas que una persona escribió en el perfil del negocio (nunca se adivinan).
 * Los tokens se guardan cifrados (secrets.ts) y nunca llegan al navegador. Se guarda en settings, clave "social".
 */
import { NETWORK_LABEL, accountKey, API_NETWORKS, ManualCapture, normalizeHandle, SOCIAL_NETWORKS, SocialAccount, SocialConnections, SocialNetwork, SocialPost, SocialStatsData } from '../../shared/social';
import { BusinessProfile } from '../../shared/market';
import { Tenant } from '../../shared/models';
import { DAY, HOUR } from '../../shared/time';
import { getTenant } from './auth';
import { config } from './config';
import { pool } from './db';
import { fetchJson, HttpResult } from './http';
import { log } from './log';
import { getSocialKeys, setSocialKeys } from './secrets';

const SETTING_KEY = 'social';
/** Actualizaciones manuales por día y cliente (cada una consulta todas las cuentas). */
export const REFRESHES_PER_DAY = 8;
const POSTS = 15;
const KEEP_HISTORY = 60;

interface Stored {
  accounts: Record<string, SocialAccount>;
  lastRefresh?: number;
  /** Momentos de las últimas actualizaciones (para el tope diario). */
  refreshLog: number[];
}

async function load(tenantId: string): Promise<Stored> {
  const r = await pool.query('SELECT data FROM settings WHERE tenant_id = $1 AND key = $2', [tenantId, SETTING_KEY]);
  const d = r.rows[0]?.data as Partial<Stored> | undefined;
  return { accounts: d?.accounts ?? {}, lastRefresh: d?.lastRefresh, refreshLog: d?.refreshLog ?? [] };
}

async function save(tenantId: string, s: Stored): Promise<void> {
  await pool.query(
    `INSERT INTO settings (tenant_id, key, data, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [tenantId, SETTING_KEY, JSON.parse(JSON.stringify(s)), Date.now()],
  );
}

// ---------------------------------------------------------------------------
// Cuentas a medir: las del perfil del negocio (las suyas y las de cada competidor)
// ---------------------------------------------------------------------------

interface Wanted {
  network: SocialNetwork;
  handle: string;
  owner: string;
  isSelf: boolean;
}

export const SELF = 'Tu negocio';

export function wantedAccounts(profile: BusinessProfile | undefined): Wanted[] {
  const out = new Map<string, Wanted>();
  const add = (owner: string, isSelf: boolean, refs: Partial<Record<SocialNetwork, string | undefined>>) => {
    for (const network of SOCIAL_NETWORKS) {
      const handle = normalizeHandle(network, refs[network]);
      if (handle && !out.has(accountKey(network, handle))) out.set(accountKey(network, handle), { network, handle, owner, isSelf });
    }
  };
  if (profile) {
    add(SELF, true, profile);
    for (const c of profile.competitors ?? []) add(c.name, false, c);
  }
  return [...out.values()];
}

function view(w: Wanted, stored: SocialAccount | undefined): SocialAccount {
  return { ...(stored ?? { posts: [], history: [] }), key: accountKey(w.network, w.handle), network: w.network, handle: w.handle, owner: w.owner, isSelf: w.isSelf };
}

// ---------------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------------

/** Cuentas de Instagram detectadas a partir del token de la plataforma (en memoria). */
const platformIgUser = new Map<string, string>();

async function keysFor(tenantId: string): Promise<{ metaToken: string; youtubeKey: string; igUserId?: string; own: boolean }> {
  const k = await getSocialKeys(tenantId);
  const own = !!k.metaToken;
  const metaToken = k.metaToken || config.metaSocialToken;
  return { metaToken, youtubeKey: k.youtubeKey || config.youtubeApiKey, igUserId: own ? k.igUserId : platformIgUser.get(metaToken), own };
}

export async function connections(tenantId: string): Promise<SocialConnections> {
  const k = await keysFor(tenantId);
  return { meta: !!k.metaToken, youtube: !!k.youtubeKey };
}

// ---------------------------------------------------------------------------
// Lectores oficiales
// ---------------------------------------------------------------------------

class SocialError extends Error {}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};
const https = (u: unknown): string | undefined => (typeof u === 'string' && /^https:\/\/[^\s"<>]+$/.test(u) && u.length < 500 ? u : undefined);
const clip = (s: unknown, n = 300) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const time = (s: unknown) => {
  const t = typeof s === 'string' ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

interface MetaError { error?: { message?: string; code?: number; error_subcode?: number } }
const metaErr = (r: HttpResult<unknown>) => (r.json as MetaError).error ?? {};

async function graph<T>(path: string, token: string): Promise<HttpResult<T & MetaError>> {
  return fetchJson<T & MetaError>(`${config.socialGraphUrl}/${path}`, { token, timeoutMs: 20_000 });
}

/** Cuenta de Instagram de empresa conectada al token (desde ella se consultan las demás). */
async function resolveIgUser(token: string): Promise<string> {
  const r = await graph<{ data?: { instagram_business_account?: { id?: string } }[] }>('me/accounts?fields=instagram_business_account&limit=100', token);
  if (!r.ok) throw new SocialError(metaErr(r).code === 190 ? 'El token de Meta venció o no es válido' : 'El token de Meta no tiene acceso a páginas de Facebook');
  const id = r.json.data?.find((p) => p.instagram_business_account?.id)?.instagram_business_account?.id;
  if (!id) throw new SocialError('El token de Meta no tiene una cuenta de Instagram de empresa conectada a una página de Facebook');
  return id;
}

interface IgMedia { id?: string; caption?: string; media_type?: string; media_product_type?: string; permalink?: string; timestamp?: string; like_count?: number; comments_count?: number }
interface IgDiscovery { business_discovery?: { username?: string; name?: string; followers_count?: number; media_count?: number; media?: { data?: IgMedia[] } } }

async function fetchInstagram(handle: string, igUserId: string, token: string): Promise<Partial<SocialAccount>> {
  const fields = `business_discovery.username(${handle}){username,name,followers_count,media_count,media.limit(${POSTS}){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`;
  const r = await graph<IgDiscovery>(`${encodeURIComponent(igUserId)}?fields=${encodeURIComponent(fields)}`, token);
  if (!r.ok) {
    const e = metaErr(r);
    if (e.code === 190) throw new SocialError('El token de Meta venció o no es válido');
    if (e.code === 4 || e.code === 17 || e.code === 32) throw new SocialError('Meta limitó las consultas por ahora; intenta más tarde');
    throw new SocialError('No se encontró la cuenta o no es de empresa o creador (Instagram solo muestra esas)');
  }
  const d = r.json.business_discovery ?? {};
  const kind = (m: IgMedia) => (m.media_product_type === 'REELS' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrusel' : m.media_type === 'VIDEO' ? 'Video' : 'Foto');
  return {
    name: clip(d.name, 120) || undefined,
    followers: num(d.followers_count),
    postsCount: num(d.media_count),
    posts: (d.media?.data ?? []).map((m): SocialPost => ({
      id: String(m.id ?? ''), url: https(m.permalink), date: time(m.timestamp), kind: kind(m), caption: clip(m.caption),
      // Si la cuenta oculta los me gusta, Meta no envía el dato: queda vacío (nunca 0 inventado).
      likes: num(m.like_count), comments: num(m.comments_count),
    })).filter((p) => p.id),
  };
}

interface FbPost { id?: string; created_time?: string; message?: string; permalink_url?: string; shares?: { count?: number }; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }
interface FbPage { name?: string; fan_count?: number; followers_count?: number; posts?: { data?: FbPost[] } }

async function fetchFacebook(handle: string, token: string): Promise<Partial<SocialAccount> & { postsUnavailable?: boolean }> {
  const base = 'name,fan_count,followers_count';
  const full = `${base},posts.limit(${POSTS}){id,created_time,message,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)}`;
  const page = (d: FbPage) => ({ name: clip(d.name, 120) || undefined, followers: num(d.followers_count) ?? num(d.fan_count) });
  const r = await graph<FbPage>(`${encodeURIComponent(handle)}?fields=${encodeURIComponent(full)}`, token);
  if (r.ok) {
    return {
      ...page(r.json),
      posts: (r.json.posts?.data ?? []).map((p): SocialPost => ({
        id: String(p.id ?? ''), url: https(p.permalink_url), date: time(p.created_time), kind: 'Publicación', caption: clip(p.message),
        likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count) ?? 0,
      })).filter((p) => p.id),
    };
  }
  if (metaErr(r).code === 190) throw new SocialError('El token de Meta venció o no es válido');
  // Sin el permiso de contenido público, Meta igual deja ver los datos básicos de la página.
  const basic = await graph<FbPage>(`${encodeURIComponent(handle)}?fields=${base}`, token);
  if (basic.ok) return { ...page(basic.json), posts: [], postsUnavailable: true };
  throw new SocialError('No se encontró la página de Facebook o Meta no permite leerla');
}

interface YtList<T> { items?: T[]; error?: { code?: number; errors?: { reason?: string }[] } }
interface YtChannel { snippet?: { title?: string }; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }
interface YtVideo { id?: string; snippet?: { title?: string; publishedAt?: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }; contentDetails?: { duration?: string } }

async function yt<T>(path: string, key: string): Promise<YtList<T>> {
  const r = await fetchJson<YtList<T>>(`${config.youtubeApiUrl}/${path}&key=${encodeURIComponent(key)}`, { timeoutMs: 20_000 });
  if (!r.ok) {
    const reason = r.json.error?.errors?.[0]?.reason ?? '';
    if (/quota/i.test(reason)) throw new SocialError('Se acabó la cuota diaria de YouTube; intenta mañana');
    if (/key/i.test(reason) || r.status === 400) throw new SocialError('La clave de YouTube no es válida');
    throw new SocialError('YouTube no respondió');
  }
  return r.json;
}

const seconds = (iso = '') => {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};

async function fetchYoutube(handle: string, key: string): Promise<Partial<SocialAccount>> {
  const by = handle.startsWith('@') ? `forHandle=${encodeURIComponent(handle)}` : `id=${encodeURIComponent(handle)}`;
  const ch = (await yt<YtChannel>(`channels?part=snippet,statistics,contentDetails&${by}`, key)).items?.[0];
  if (!ch) throw new SocialError('No se encontró el canal de YouTube');
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  const ids = uploads
    ? ((await yt<{ contentDetails?: { videoId?: string } }>(`playlistItems?part=contentDetails&maxResults=${POSTS}&playlistId=${encodeURIComponent(uploads)}`, key)).items ?? [])
        .map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x && /^[\w-]{6,20}$/.test(x))
    : [];
  const videos = ids.length ? (await yt<YtVideo>(`videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}`, key)).items ?? [] : [];
  return {
    name: clip(ch.snippet?.title, 120) || undefined,
    followers: ch.statistics?.hiddenSubscriberCount ? undefined : num(ch.statistics?.subscriberCount),
    postsCount: num(ch.statistics?.videoCount),
    posts: videos.filter((v) => v.id).map((v): SocialPost => ({
      id: v.id!, url: `https://www.youtube.com/watch?v=${v.id}`, date: time(v.snippet?.publishedAt), kind: seconds(v.contentDetails?.duration) <= 60 ? 'Short' : 'Video',
      caption: clip(v.snippet?.title), views: num(v.statistics?.viewCount), likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount),
    })),
  };
}

// ---------------------------------------------------------------------------
// Actualizar y consultar
// ---------------------------------------------------------------------------

function pushHistory(a: SocialAccount, now: number): void {
  if (a.followers === undefined) return;
  const last = a.history[a.history.length - 1];
  // Una medición cada 12 h como mínimo (o si cambió la cifra), para ver el crecimiento sin llenar el historial.
  if (!last || last.followers !== a.followers || now - last.at > 12 * HOUR) a.history = [...a.history, { at: now, followers: a.followers }].slice(-KEEP_HISTORY);
}

/** Lee todas las cuentas con API disponible. Devuelve cuántas se leyeron y cuántas fallaron. */
export async function refreshSocial(tenant: Tenant, now = Date.now()): Promise<{ ok: number; failed: number }> {
  const stored = await load(tenant.id);
  const keys = await keysFor(tenant.id);
  let igUserId = keys.igUserId;
  let igProblem = '';
  let ok = 0;
  let failed = 0;
  for (const w of wantedAccounts(tenant.profile)) {
    if (!API_NETWORKS.includes(w.network)) continue;
    const key = accountKey(w.network, w.handle);
    const prev = view(w, stored.accounts[key]);
    if ((w.network === 'youtube' && !keys.youtubeKey) || (w.network !== 'youtube' && !keys.metaToken)) continue;
    try {
      let got: Partial<SocialAccount> & { postsUnavailable?: boolean };
      if (w.network === 'instagram') {
        if (igProblem) throw new SocialError(igProblem);
        if (!igUserId) {
          try {
            igUserId = await resolveIgUser(keys.metaToken);
          } catch (e) {
            igProblem = (e as Error).message;
            throw e;
          }
          if (keys.own) await setSocialKeys(tenant.id, { igUserId });
          else platformIgUser.set(keys.metaToken, igUserId);
        }
        got = await fetchInstagram(w.handle, igUserId, keys.metaToken);
      } else if (w.network === 'facebook') {
        got = await fetchFacebook(w.handle, keys.metaToken);
      } else {
        got = await fetchYoutube(w.handle, keys.youtubeKey);
      }
      const { postsUnavailable, ...data } = got;
      // Sin permiso de publicaciones en Facebook se conservan las capturadas a mano.
      const keepManual = postsUnavailable && prev.source === 'manual' && prev.posts.length;
      const next: SocialAccount = {
        ...prev, ...data, posts: keepManual ? prev.posts : data.posts ?? [], source: keepManual ? 'manual' : 'api', fetchedAt: now, by: keepManual ? prev.by : undefined,
        error: postsUnavailable ? 'Seguidores: dato real de Meta. Meta aún no autoriza leer las publicaciones de páginas ajenas (permiso "Page Public Content Access"); puedes capturarlas a mano.' : undefined,
      };
      pushHistory(next, now);
      stored.accounts[key] = next;
      ok++;
    } catch (e) {
      const msg = e instanceof SocialError ? e.message : 'No se pudo leer la cuenta';
      if (!(e instanceof SocialError)) log.warn('estadísticas de redes', { tenant: tenant.id, account: key, error: (e as Error).message });
      stored.accounts[key] = { ...prev, error: msg };
      failed++;
    }
  }
  stored.lastRefresh = now;
  stored.refreshLog = [...stored.refreshLog.filter((t) => now - t < DAY), now];
  await save(tenant.id, stored);
  log.info('Estadísticas de redes actualizadas', { tenant: tenant.id, ok, failed });
  return { ok, failed };
}

export async function socialData(tenant: Tenant, now = Date.now()): Promise<SocialStatsData> {
  const stored = await load(tenant.id);
  const accounts = wantedAccounts(tenant.profile).map((w) => view(w, stored.accounts[accountKey(w.network, w.handle)]));
  return {
    accounts,
    connections: await connections(tenant.id),
    lastRefresh: stored.lastRefresh,
    refreshesLeft: Math.max(0, REFRESHES_PER_DAY - stored.refreshLog.filter((t) => now - t < DAY).length),
  };
}

/** Guarda lo que una persona copió de una red (TikTok, o Facebook mientras Meta no autorice las publicaciones). */
export async function saveManual(tenant: Tenant, cap: ManualCapture, by: string, now = Date.now()): Promise<SocialAccount> {
  const w = wantedAccounts(tenant.profile).find((x) => x.network === cap.network && x.handle === normalizeHandle(cap.network, cap.handle));
  if (!w) throw new SocialError(`Primero agrega esa cuenta de ${NETWORK_LABEL[cap.network]} en el perfil del negocio`);
  const stored = await load(tenant.id);
  const key = accountKey(w.network, w.handle);
  const prev = view(w, stored.accounts[key]);
  const next: SocialAccount = {
    ...prev, followers: cap.followers ?? prev.followers, source: 'manual', by, fetchedAt: now, error: undefined,
    posts: cap.posts.map((p, i) => ({ ...p, id: `m${i}-${p.date}` })).sort((a, b) => b.date - a.date),
  };
  pushHistory(next, now);
  stored.accounts[key] = next;
  await save(tenant.id, stored);
  return next;
}

export { SocialError };

/** Actualización automática semanal de los clientes con el módulo y alguna clave conectada. */
export async function refreshStaleSocial(now = Date.now()): Promise<void> {
  const r = await pool.query(`SELECT id FROM tenants WHERE (data->'modules'->>'market')::boolean AND data->>'status' <> 'suspendido'`);
  for (const row of r.rows) {
    try {
      const tenant = await getTenant(row.id);
      if (!tenant || !wantedAccounts(tenant.profile).length) continue;
      const s = await load(tenant.id);
      const c = await connections(tenant.id);
      if ((!c.meta && !c.youtube) || (s.lastRefresh && now - s.lastRefresh < 7 * DAY)) continue;
      await refreshSocial(tenant, now);
    } catch (e) {
      log.error('estadísticas de redes (semanal)', { tenant: row.id, error: (e as Error).message });
    }
  }
}
