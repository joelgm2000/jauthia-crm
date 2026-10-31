/**
 * Inteligencia de mercado (módulo opcional de cada cliente):
 *  - Competencia: qué hace cada competidor, sus fortalezas y debilidades, y dónde enfocarse que ellos no.
 *  - Guiones: ideas de videos y publicaciones para el nicho, con gancho, escenas y llamado a la acción.
 *  - Clientes potenciales: negocios reales que podrían comprarle, con sus datos públicos y un mensaje de primer contacto.
 *  - Redes sociales: auditoría de sus redes con puntajes, recomendaciones de grandes referentes del marketing,
 *    pilares de contenido y un plan de 30 días.
 * La IA investiga en internet (búsqueda de Google) a partir del perfil del negocio.
 */

export const MARKET_KINDS = ['competencia', 'estadisticas', 'redes', 'guiones', 'clientes'] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];

export const MARKET_KIND_LABEL: Record<MarketKind, string> = {
  competencia: 'Competencia y oportunidades',
  redes: 'Análisis de redes sociales',
  estadisticas: 'Estadísticas reales de redes',
  guiones: 'Ideas de guiones',
  clientes: 'Clientes potenciales',
};

export interface Competitor {
  name: string;
  /** Sitio web. */
  url?: string;
  /** Cuentas confirmadas por una persona (de aquí salen las estadísticas reales). */
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  /** Redes cuya cuenta encontró la IA (confirmada en 3 búsquedas distintas). */
  autoFound?: ('instagram' | 'facebook' | 'tiktok')[];
}

/** Lo que la IA necesita saber del negocio (lo llena el super admin o el administrador del cliente). */
export interface BusinessProfile {
  /** Qué vende, a quién y cómo (2 a 5 frases). */
  description: string;
  /** Nicho o industria ("equipos de gimnasio"). */
  industry: string;
  /** Ciudades o zona donde vende / despacha. */
  zone: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  /** Cliente ideal ("gimnasios, conjuntos residenciales y hogares que entrenan en casa"). */
  idealCustomer: string;
  /** Qué los hace diferentes (garantía, envío gratis, financiación…). */
  differentiators?: string;
  competitors: Competitor[];
}

export const EMPTY_PROFILE: BusinessProfile = { description: '', industry: '', zone: '', idealCustomer: '', competitors: [] };

/** Qué falta del perfil para poder investigar (vacío = listo). */
export function profileMissing(p: BusinessProfile | undefined): string[] {
  const miss: string[] = [];
  if (!p?.description?.trim()) miss.push('la descripción del negocio');
  if (!p?.industry?.trim()) miss.push('el nicho o industria');
  if (!p?.zone?.trim()) miss.push('la zona donde vende');
  return miss;
}

export interface MarketSource {
  title: string;
  url: string;
}

export interface CompetitorInsight {
  name: string;
  url?: string;
  /** Qué ofrecen y a quién. */
  offer: string;
  strengths: string[];
  weaknesses: string[];
  /** Dónde están presentes (Instagram, TikTok, web, Google Maps…) y cómo comunican. */
  presence: string;
  /** Qué hace para atraer clientes (anuncios, promociones, sorteos, reseñas, colaboraciones…). */
  tactics?: string[];
  /** Sus publicaciones o videos que mejor funcionaron (con las cifras públicas que se vieron). */
  topContent?: TopContent[];
}

/** Video o publicación destacada de un competidor. Las cifras son las públicas que se encontraron (texto, ej. "12 mil"). */
export interface TopContent {
  title: string;
  network: string;
  url?: string;
  views?: string;
  likes?: string;
  comments?: string;
  /** Por qué funcionó y cómo adaptarlo. */
  why: string;
}

export const LEVELS = ['alto', 'medio', 'bajo'] as const;
export type Level = (typeof LEVELS)[number];

/** Algo que la competencia no está haciendo bien y el cliente puede aprovechar. */
export interface Opportunity {
  title: string;
  why: string;
  /** Acción concreta para esta semana. */
  action: string;
  /** Qué tanto puede mover las ventas. */
  impact?: Level;
  /** Qué tanto trabajo cuesta. */
  effort?: Level;
}

/** Comparación en un aspecto (precio, contenido, atención…): puntaje de 1 a 10 del cliente y de cada competidor. */
export interface Comparison {
  dimension: string;
  scores: { name: string; score: number }[];
}

/** Auditoría de una red social del cliente. */
export interface SocialChannelAudit {
  /** Instagram, TikTok, Facebook, sitio web, Google (perfil de empresa)… */
  network: string;
  url?: string;
  /** ¿Se encontró la cuenta? */
  found: boolean;
  /** Puntaje estimado de 0 a 100. */
  score: number;
  /** Seguidores u otro dato público (texto tal como se encontró). */
  audience?: string;
  /** Frecuencia de publicación observada. */
  frequency?: string;
  strengths: string[];
  weaknesses: string[];
  /** Lo primero que debe cambiar en esta red. */
  quickWin: string;
}

/** Recomendación basada en un referente del marketing (principio parafraseado, no cita textual). */
export interface ExpertTip {
  expert: string;
  principle: string;
  /** Cómo aplicarlo en este negocio. */
  apply: string;
}

/** Pilar de contenido: tema recurrente y qué parte de las publicaciones ocupa. */
export interface ContentPillar {
  name: string;
  /** Porcentaje de las publicaciones (los pilares suman 100). */
  share: number;
  ideas: string[];
}

export interface PlanWeek {
  week: string;
  focus: string;
  actions: string[];
}

/** Hallazgo de la IA sobre las estadísticas reales. */
export interface StatsInsight {
  title: string;
  detail: string;
}

/** Publicación real que funcionó y cómo adaptarla (url = la de la publicación medida). */
export interface Winner {
  owner: string;
  network: string;
  url: string;
  why: string;
  adapt: string;
}

export interface Kpi {
  name: string;
  /** Meta a 30 días. */
  target: string;
}

export interface ScriptIdea {
  title: string;
  /** Reel, TikTok, historia, carrusel, post… */
  format: string;
  /** Dolor, beneficio, objeción, prueba social, educativo, tendencia… */
  angle: string;
  /** Lo que se dice o se ve en los primeros 3 segundos. */
  hook: string;
  /** Escenas o líneas del guion, en orden. */
  scenes: string[];
  cta: string;
}

/** Negocio que podría comprarle al cliente (solo datos públicos de la empresa). */
export interface Lead {
  name: string;
  /** Tipo de negocio ("gimnasio", "hotel"…). */
  type: string;
  city: string;
  website?: string;
  phone?: string;
  instagram?: string;
  /** Por qué podría comprar. */
  why: string;
  /** Mensaje sugerido para el primer contacto. */
  approach: string;
  /** Qué tan buen prospecto es (1 a 5). */
  fit: number;
  /** Una segunda búsqueda independiente confirmó que el negocio existe. */
  verified?: boolean;
  /** Por dato: "ok" = lo encontraron las dos búsquedas; "once" = solo una (sin confirmar). */
  checks?: Partial<Record<LeadField, 'ok' | 'once'>>;
  /** El sitio web respondió cuando el servidor lo abrió. */
  webOnline?: boolean;
}

export type LeadField = 'website' | 'phone' | 'instagram';

export interface MarketReport {
  id: string;
  kind: MarketKind;
  createdAt: number;
  /** Nombre de quien lo pidió. */
  by: string;
  /** Indicación adicional que escribió el usuario. */
  request?: string;
  summary: string;
  competitors?: CompetitorInsight[];
  opportunities?: Opportunity[];
  comparison?: Comparison[];
  /** Redes sociales: puntaje general (0 a 100). */
  socialScore?: number;
  channels?: SocialChannelAudit[];
  tips?: ExpertTip[];
  pillars?: ContentPillar[];
  plan?: PlanWeek[];
  kpis?: Kpi[];
  /** Estadísticas reales: lo que interpreta la IA de los números medidos. */
  insights?: StatsInsight[];
  winners?: Winner[];
  scripts?: ScriptIdea[];
  leads?: Lead[];
  /** Clientes potenciales que la segunda búsqueda no pudo confirmar (se descartaron). */
  discarded?: number;
  /** Páginas que consultó la IA. */
  sources: MarketSource[];
}

/** Respuesta de GET /api/market. */
export interface MarketData {
  profile: BusinessProfile;
  reports: MarketReport[];
  /** Análisis que aún puede pedir hoy. */
  remainingToday: number;
}
