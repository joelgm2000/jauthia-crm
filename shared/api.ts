/**
 * Contrato de la API del backend.
 *   POST /api/action        acciones del cliente (asesor / administrador del cliente)
 *   POST /api/super/action  acciones de la plataforma (super administrador)
 * El frontend NUNCA escribe en la base de datos: toda escritura pasa por estas acciones,
 * que el backend valida (esquema + rol + cliente del usuario) antes de aplicarlas.
 */
import { ConversationEdit } from './actions';
import { FlowConfig } from './flow';
import { OutgoingDraft } from './products';
import { ChannelConfig, ChannelType, Conversation, CrmSettings, CrmTask, Product, StageId, Tenant, TenantModules, WaTemplate } from './models';

/**
 * superadmin: dueño o socio de la plataforma (no pertenece a ningún cliente).
 * admin: administrador de un cliente.  asesor: atiende chats de un cliente.
 */
export type Role = 'superadmin' | 'admin' | 'asesor';
/** Roles dentro de un cliente. */
export const TENANT_ROLES = ['admin', 'asesor'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];
/** Largo mínimo de contraseña (backend y formularios). */
export const PASSWORD_MIN = 10;
/** Estilos de la IA de imágenes del catálogo. */
export const AI_IMAGE_STYLES = ['estudio', 'ambiente', 'publicidad'] as const;
export type AiImageStyle = (typeof AI_IMAGE_STYLES)[number];

/** ¿Puede configurar el cliente? (su administrador o un super administrador). */
export function canAdminTenant(role: Role | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}

export interface CrmUserInfo {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
  /** Cliente al que pertenece (null para super administradores). */
  tenantId: string | null;
  /** El dueño de la plataforma: el único que nombra super administradores. */
  isOwner?: boolean;
}

/** Respuesta de /api/auth/me: el usuario y el cliente que está viendo. */
export interface SessionInfo {
  user: CrmUserInfo;
  /** Cliente activo: el propio, o el que un super administrador está gestionando. */
  tenant: Tenant | null;
}

export interface ApiActions {
  // ---- Asesor ----
  sendMessage: { req: { conversationId: string; draft: OutgoingDraft; pauseBot?: boolean }; res: { id: string } };
  addNote: { req: { conversationId: string; text: string }; res: { id: string } };
  setStage: { req: { conversationId: string; stage: StageId }; res: void };
  toggleBot: { req: { conversationId: string }; res: void };
  editConversation: { req: { conversationId: string; edit: ConversationEdit }; res: void };
  createTestConversation: { req: { channel: ChannelType; name?: string }; res: { conversation: Conversation } };
  simulateIncoming: { req: { conversationId: string; text?: string; buttonId?: string; title?: string }; res: void };
  saveTask: { req: { task: CrmTask }; res: void };
  toggleTask: { req: { id: string }; res: void };
  removeTask: { req: { id: string }; res: void };
  // ---- Administrador del cliente ----
  deleteConversation: { req: { conversationId: string }; res: void };
  saveProduct: { req: { product: Product }; res: void };
  removeProduct: { req: { id: string }; res: void };
  saveTemplate: { req: { template: WaTemplate }; res: void };
  removeTemplate: { req: { id: string }; res: void };
  saveChannel: { req: { channel: ChannelConfig }; res: void };
  /** Tokens de la red: se guardan cifrados y nunca se devuelven. "" borra un campo. */
  saveChannelSecrets: { req: { channel: ChannelType; secrets: Record<string, string> }; res: { status: Record<string, string> } };
  /** Prueba la conexión con la red usando los datos guardados. */
  testChannel: { req: { channel: ChannelType }; res: { ok: boolean; message: string } };
  saveSettings: { req: { settings: CrmSettings }; res: void };
  saveFlow: { req: { flow: FlowConfig }; res: void };
  seedDefaults: { req: Record<string, never>; res: void };
  listUsers: { req: Record<string, never>; res: { users: CrmUserInfo[] } };
  createUser: { req: { name: string; email: string; password: string; role: TenantRole }; res: { user: CrmUserInfo } };
  updateUser: { req: { id: string; name?: string; role?: TenantRole; active?: boolean; password?: string }; res: void };
  deleteUser: { req: { id: string }; res: void };
}

export type ApiAction = keyof ApiActions;

export const ADMIN_ACTIONS: ApiAction[] = [
  'deleteConversation', 'saveProduct', 'removeProduct', 'saveTemplate', 'removeTemplate', 'saveChannel',
  'saveChannelSecrets', 'testChannel', 'saveSettings', 'saveFlow', 'seedDefaults', 'listUsers', 'createUser', 'updateUser', 'deleteUser',
];

/** Acciones que solo existen si el cliente contrató el módulo. */
export const MODULE_ACTIONS: Partial<Record<ApiAction, keyof TenantModules>> = {
  setStage: 'crm',
  saveTask: 'crm',
  toggleTask: 'crm',
  removeTask: 'crm',
  saveFlow: 'chatbot',
  simulateIncoming: 'chatbot',
};

// ---------------------------------------------------------------------------
// Super administrador (plataforma)
// ---------------------------------------------------------------------------

export interface TenantSummary extends Tenant {
  users: number;
  conversations: number;
  lastActivityAt: number | null;
}

export interface SuperActions {
  listTenants: { req: Record<string, never>; res: { tenants: TenantSummary[] } };
  saveTenant: { req: { tenant: Tenant; flowTemplate?: 'evosport' | 'generico'; sampleCatalog?: boolean }; res: { tenant: Tenant } };
  deleteTenant: { req: { id: string; confirmName: string }; res: void };
  listTenantUsers: { req: { tenantId: string }; res: { users: CrmUserInfo[] } };
  createTenantUser: { req: { tenantId: string; name: string; email: string; password: string; role: TenantRole }; res: { user: CrmUserInfo } };
  /** Entra a gestionar un cliente (null = volver al panel de la plataforma). */
  enterTenant: { req: { tenantId: string | null }; res: { tenant: Tenant | null } };
  listSuperadmins: { req: Record<string, never>; res: { users: CrmUserInfo[] } };
  /** Solo el dueño de la plataforma. */
  createSuperadmin: { req: { name: string; email: string; password: string }; res: { user: CrmUserInfo } };
  /** Solo el dueño de la plataforma. */
  removeSuperadmin: { req: { id: string }; res: void };
}

export type SuperAction = keyof SuperActions;
export const OWNER_ACTIONS: SuperAction[] = ['createSuperadmin', 'removeSuperadmin'];

// ---------------------------------------------------------------------------
// Tiempo real y carga inicial
// ---------------------------------------------------------------------------

export type CollectionName = 'conversations' | 'products' | 'templates' | 'tasks' | 'channels';

export interface RealtimeEvents {
  upsert: { col: CollectionName; item: { id: string } };
  remove: { col: CollectionName; id: string };
  setting: { key: 'general' | 'flow'; data: unknown };
  message: { conversationId: string; message: import('./models').ChatMessage };
  messagePatch: { conversationId: string; id: string; patch: Partial<import('./models').ChatMessage> };
}

/** Respuesta de GET /api/bootstrap: todo lo que la interfaz necesita al cargar. */
export interface BootstrapData {
  tenant: Tenant;
  conversations: Conversation[];
  products: Product[];
  templates: WaTemplate[];
  tasks: CrmTask[];
  channels: ChannelConfig[];
  settings: CrmSettings | null;
  flow: FlowConfig | null;
  /** Qué tokens están guardados por canal (enmascarados). Solo para administradores. */
  secrets: Record<string, Record<string, string>>;
  /** URL pública del servidor para mostrar los webhooks. */
  publicBaseUrl: string;
}
