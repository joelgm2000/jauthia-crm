/**
 * Inteligencia de mercado (módulo opcional de cada cliente):
 *  - Competencia: qué hace cada competidor, sus fortalezas y debilidades, y dónde enfocarse que ellos no.
 *  - Guiones: ideas de videos y publicaciones para el nicho, con gancho, escenas y llamado a la acción.
 *  - Clientes potenciales: negocios reales que podrían comprarle, con sus datos públicos y un mensaje de primer contacto.
 * La IA investiga en internet (búsqueda de Google) a partir del perfil del negocio.
 */

export const MARKET_KINDS = ['competencia', 'guiones', 'clientes'] as const;
export type MarketKind = (typeof MARKET_KINDS)[number];

export const MARKET_KIND_LABEL: Record<MarketKind, string> = {
  competencia: 'Competencia y oportunidades',
  guiones: 'Ideas de guiones',
  clientes: 'Clientes potenciales',
};

export interface Competitor {
  name: string;
  /** Web o red social principal. */
  url?: string;
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
}

/** Algo que la competencia no está haciendo bien y el cliente puede aprovechar. */
export interface Opportunity {
  title: string;
  why: string;
  /** Acción concreta para esta semana. */
  action: string;
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
}

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
  scripts?: ScriptIdea[];
  leads?: Lead[];
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
