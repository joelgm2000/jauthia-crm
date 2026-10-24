/**
 * Modelos compartidos entre el frontend (Angular) y el backend (Node/Express).
 * No importar nada de Angular ni de Node aquí: lo usan el frontend y el backend.
 */

export type ChannelType =
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'telegram'
  | 'tiktok'
  | 'webchat'
  | 'email';

export const CHANNEL_LABELS: Record<ChannelType, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  webchat: 'Chat web',
  email: 'Correo',
};

export type StageId =
  | 'nuevo'
  | 'calificando'
  | 'asesor'
  | 'cotizacion'
  | 'negociacion'
  | 'pago'
  | 'entrega'
  | 'ganado'
  | 'perdido';

export interface StageDef {
  id: StageId;
  name: string;
  actor: string;
  /** Regla de avance (texto mostrado en el tablero y configuración). */
  rule: string;
  color: string;
  /** Probabilidad base de cierre usada para el pronóstico. */
  probability: number;
}

/** Categoría del catálogo. Cada cliente define las suyas (ver CrmSettings.catalog). */
export type Category = string;

export const AVAILABILITIES = ['tienda', 'bodega', 'agotado'] as const;
export type Availability = (typeof AVAILABILITIES)[number];
export const PRODUCT_LINES = ['hogar', 'institucional', 'profesional'] as const;
export const USE_MODES = ['caminar', 'trotar'] as const;

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  category: Category;
  /** Tipo de producto dentro de la categoría (ej. trotadora, elíptica). */
  subcategory: string;
  /** Palabras que disparan este producto en el chat (ej: caminadora, trotadora, banda). */
  keywords: string[];
  imageUrl: string;
  price: number;
  /** Línea (gimnasios): hogar, institucional o profesional. */
  line?: (typeof PRODUCT_LINES)[number];
  availability: Availability;
  description: string;
  specs: ProductSpec[];
  /** Cardio: peso máximo del usuario en kg. */
  maxUserKg?: number;
  /** Cardio: uso permitido. */
  mode?: (typeof USE_MODES)[number];
  /** Fuerza: altura mínima de techo en cm. */
  minCeilingCm?: number;
  active: boolean;
}

/** Campos personalizados del CRM (sección 03 del flujo). */
export interface ContactFields {
  ciudad?: string;
  uso?: 'hogar' | 'negocio';
  categoria?: Category | 'no-sabe';
  subcategoria?: string;
  modeloInteres?: string;
  cantidad?: string;
  pesoUsuario?: number;
  modoUso?: 'caminar' | 'trotar';
  alturaTecho?: number;
  piso?: string;
  espacio?: string;
  usuarios?: string;
  rangoKg?: string;
  disponibilidad?: Availability;
  formaPago?: string;
  cedula?: string;
  correo?: string;
  direccion?: string;
}

export interface QuickButton {
  id: string;
  title: string;
  /** Descripción opcional (filas de lista de WhatsApp). */
  description?: string;
}

export interface ProductCard {
  productId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  buttons: QuickButton[];
}

export type MessageType =
  | 'text'
  | 'buttons'
  | 'list'
  | 'carousel'
  | 'product'
  | 'image'
  | 'note'
  | 'template';

export type Sender = 'cliente' | 'bot' | 'asesor' | 'sistema';

export interface ChatMessage {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  sender: Sender;
  type: MessageType;
  text: string;
  header?: string;
  footer?: string;
  imageUrl?: string;
  buttons?: QuickButton[];
  /** Título del botón que abre la lista (WhatsApp list message). */
  listButton?: string;
  cards?: ProductCard[];
  /** Si el mensaje entrante es la respuesta a un botón. */
  replyToButtonId?: string;
  createdAt: number;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  channelMessageId?: string;
  /** Plantilla aprobada de Meta: se envía como template (sirve fuera de la ventana de 24 h). */
  templateName?: string;
  templateParams?: string[];
  /** Inbound: ya lo procesó el motor del bot. */
  processed?: boolean;
  authorName?: string;
}

export type IntentType = 'producto' | 'precio' | 'compra' | 'soporte' | 'pago' | 'humano';

export interface IntentAlert {
  type: IntentType;
  text: string;
  productIds?: string[];
  at: number;
}

export interface BotState {
  nodeId: string;
  retries: number;
  shownProductIds: string[];
  lastProductIds: string[];
  /** Momento en que el bot quedó esperando respuesta a una pregunta del flujo. */
  awaitingSince?: number;
  /** Mensajes de remarketing ya enviados desde que el cliente dejó de contestar. */
  followUpStep: number;
  /** Mensajes recibidos del cliente (no se marca "caliente" en los primeros). */
  inboundCount?: number;
  /** El cliente nos dijo su nombre (el del perfil de WhatsApp/Instagram puede ser un apodo). */
  nameGiven?: boolean;
  /** Traspaso al asesor en espera: se hace apenas el cliente complete los datos obligatorios. */
  pendingHandoff?: { reason: string; intent?: IntentType } | null;
}

export interface Conversation {
  id: string;
  channel: ChannelType;
  /** Id externo del contacto en el canal (wa_id, PSID, IGSID, chat_id…). */
  externalId: string;
  name: string;
  phone?: string;
  avatarColor: string;
  stage: StageId;
  stageChangedAt: number;
  botActive: boolean;
  bot: BotState;
  fields: ContactFields;
  tags: string[];
  priority: 'alta' | 'normal';
  /** 0-100. Probabilidad estimada de compra. */
  score: number;
  hot: boolean;
  intent?: IntentAlert | null;
  summary?: string;
  assignedTo?: string | null;
  value: number;
  lastMessage: string;
  lastMessageAt: number;
  unread: number;
  createdAt: number;
  /** Conversación creada desde el simulador: nunca se envía al canal real. */
  simulated?: boolean;
  /** Último mensaje del cliente (ventana de 24 h de WhatsApp/Meta). */
  lastInboundAt?: number;
  /** Desde cuándo le escribimos y el cliente no contesta (reloj del remarketing). Vacío = el cliente habló último. */
  waitingSince?: number | null;
  /** Última alerta de compra recibida (para no saturar al cliente). */
  lastAlertAt?: number;
}

export interface CrmTask {
  id: string;
  conversationId: string;
  title: string;
  detail: string;
  dueAt: number;
  done: boolean;
  priority: 'alta' | 'normal';
  assignedTo?: string | null;
  createdAt: number;
}

export const TEMPLATE_CATEGORIES = ['MARKETING', 'UTILITY', 'AUTHENTICATION'] as const;
export const TEMPLATE_KINDS = ['text', 'buttons', 'carousel', 'product'] as const;
export const TEMPLATE_STATUSES = ['APPROVED', 'PENDING', 'REJECTED', 'LOCAL'] as const;

export interface WaTemplate {
  id: string;
  name: string;
  category: (typeof TEMPLATE_CATEGORIES)[number];
  kind: (typeof TEMPLATE_KINDS)[number];
  language: string;
  header?: string;
  imageUrl?: string;
  body: string;
  footer?: string;
  buttons: QuickButton[];
  productIds?: string[];
  status: (typeof TEMPLATE_STATUSES)[number];
}

export interface ChannelConfig {
  id: ChannelType;
  enabled: boolean;
  connected: boolean;
  /** Datos no secretos (los tokens van en variables de entorno del servidor). */
  accountName?: string;
  phoneNumberId?: string;
  /** Id de la cuenta de WhatsApp Business (opcional, para plantillas). */
  wabaId?: string;
  pageId?: string;
  igAccountId?: string;
  botUsername?: string;
  botEnabled: boolean;
}

export interface Advisor {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export interface BusinessHours {
  /** 0 = domingo … 6 = sábado. Cada día: lista de rangos 'HH:MM-HH:MM'. */
  days: Record<string, string[]>;
  timezone: string;
  outOfHoursMessage: string;
}

export interface CrmSettings {
  companyName: string;
  freeShippingCity: string;
  hours: BusinessHours;
  advisors: Advisor[];
  discounts: { label: string; value: string }[];
  /** Puntaje desde el cual un lead se marca como "a punto de comprar". */
  hotThreshold: number;
  /** Mensajes mínimos del cliente antes de poder marcarlo "caliente" (por defecto 3). */
  minMessagesForHot?: number;
  /** Catálogo configurable por cliente. */
  catalog?: CatalogConfig;
  /** Alertas de compra ("prueba social") a los leads que dejaron de contestar. */
  socialProof?: SocialProofConfig;
}

/**
 * Cuando alguien compra, se avisa a los leads que aún no compran y dejaron de contestar:
 * "🔥 Alguien de Valledupar acaba de comprar la Trotadora Vigor…". Nunca se revela quién compró.
 */
export interface SocialProofConfig {
  enabled: boolean;
  /** Etapa que cuenta como compra. */
  triggerStage: 'pago' | 'ganado';
  /** Horas sin contestar para recibir la alerta. */
  inactiveHours: number;
  /** Etapas del embudo que reciben la alerta. */
  stages: StageId[];
  /** Solo a quienes buscaban la misma categoría del producto comprado. */
  sameCategoryOnly: boolean;
  /** Horas mínimas entre dos alertas al mismo cliente. */
  cooldownHours: number;
  /** Máximo de clientes avisados por cada venta. */
  maxRecipients: number;
  /** Texto con {nombre}, {producto}, {ciudad_comprador}, {empresa}. */
  message: string;
  /** Adjunta la foto del producto comprado. */
  includeImage: boolean;
  /** Plantilla aprobada para WhatsApp cuando pasaron más de 24 h desde el último mensaje del cliente. */
  templateId?: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  /** Tipos de producto de esta categoría (ej. trotadora, elíptica). */
  subcategories: string[];
}

export interface CatalogConfig {
  categories: CatalogCategory[];
  /** Muestra los filtros de gimnasio (peso máximo, caminar/trotar, techo mínimo). */
  gymFilters: boolean;
  /** Moneda para mostrar precios (COP, USD…). */
  currency: string;
}

// ---------------------------------------------------------------------------
// Plataforma multi-cliente
// ---------------------------------------------------------------------------

export const TENANT_STATUSES = ['activo', 'prueba', 'suspendido'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export interface TenantModules {
  /** Bandeja omnicanal, embudo, contactos, tareas y resumen. */
  crm: boolean;
  /** Bot con flujo personalizado, catálogo y plantillas. */
  chatbot: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  legalId?: string;
  address?: string;
  city?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  modules: TenantModules;
  plan: { name: string; price: number; currency: string; billingDay: number };
  status: TenantStatus;
  trialEndsAt?: number | null;
  nextDueAt?: number | null;
  notes?: string;
  createdAt: number;
}
