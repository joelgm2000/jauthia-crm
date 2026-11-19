/**
 * Alta de clientes para conectar Meta (WhatsApp, Instagram y Facebook).
 * JAUTHIA crea un link, el cliente lo abre sin cuenta, sube su RUT (la IA lo lee), confirma los datos
 * y dice en qué necesita ayuda. Todo queda cifrado y solo lo ven los super administradores.
 */

export const ONBOARDING_STATUSES = ['pendiente', 'enviado', 'revisado'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  pendiente: 'Esperando al cliente',
  enviado: 'Datos recibidos',
  revisado: 'Revisado',
};

/** Datos del negocio (los del RUT o los que escribe el cliente si no tiene RUT). */
export interface BusinessData {
  tipo?: 'natural' | 'juridica' | '';
  /** Persona natural: nombre completo del titular. Empresa: razón social. */
  nombre?: string;
  nombreComercial?: string;
  nit?: string;
  dv?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  telefono?: string;
  correo?: string;
  actividad?: string;
  representante?: string;
}

export const BUSINESS_FIELDS: { key: keyof Omit<BusinessData, 'tipo'>; label: string; hint?: string }[] = [
  { key: 'nombre', label: 'Nombre o razón social', hint: 'Tal como aparece en el RUT' },
  { key: 'nombreComercial', label: 'Nombre comercial', hint: 'Como te conocen tus clientes' },
  { key: 'nit', label: 'NIT o cédula' },
  { key: 'dv', label: 'Dígito de verificación (DV)' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'ciudad', label: 'Ciudad' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'telefono', label: 'Teléfono del RUT' },
  { key: 'correo', label: 'Correo del RUT' },
  { key: 'actividad', label: 'Actividad económica' },
  { key: 'representante', label: 'Representante legal', hint: 'Solo si es empresa' },
];

export const DOC_KINDS = ['rut', 'camara', 'recibo', 'otro'] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_LABEL: Record<DocKind, string> = {
  rut: 'RUT',
  camara: 'Certificado de Cámara de Comercio',
  recibo: 'Recibo de servicio público a nombre del negocio',
  otro: 'Otro documento',
};

export const WHATSAPP_MODES = ['app_y_crm', 'solo_crm', 'nuevo', 'no_se'] as const;
export type WhatsAppMode = (typeof WHATSAPP_MODES)[number];
export const WHATSAPP_MODE_LABEL: Record<WhatsAppMode, string> = {
  app_y_crm: 'Seguir usando WhatsApp en el celular y también en el CRM',
  solo_crm: 'Pasar el número solo al CRM',
  nuevo: 'Usar un número nuevo para el CRM',
  no_se: 'No sé, quiero que me asesoren',
};

export const HELP_OPTIONS = [
  { id: 'crear_meta', label: 'Crear mi cuenta de Meta Business (portafolio comercial)' },
  { id: 'instagram_pro', label: 'Pasar mi Instagram a cuenta profesional' },
  { id: 'conectar_ig', label: 'Conectar mi Instagram con mi página de Facebook' },
  { id: 'dar_admin', label: 'Darle acceso de administrador a JAUTHIA' },
  { id: 'whatsapp', label: 'Configurar mi número de WhatsApp' },
  { id: 'verificar', label: 'Verificar mi negocio ante Meta' },
] as const;
export type HelpOption = (typeof HELP_OPTIONS)[number]['id'];

export interface OnboardingForm {
  hasRut: boolean;
  business: BusinessData;
  contact: { name: string; phone: string; email: string };
  web?: string;
  instagram?: string;
  facebook?: string;
  whatsappNumber?: string;
  whatsappMode: WhatsAppMode;
  hasMetaBusiness: 'si' | 'no' | 'no_se';
  /** Correo del Facebook con el que administra su negocio (para invitarnos o invitarlo). */
  facebookEmail?: string;
  help: HelpOption[];
  notes?: string;
  consent: boolean;
}

export interface OnboardingDocInfo {
  name: string;
  mime: string;
  size: number;
  kind: DocKind;
  uploadedAt: number;
}

/** Lo que ve el super administrador. */
export interface OnboardingSummary {
  id: string;
  label: string;
  tenantId?: string;
  /** Parte final del link (/alta/TOKEN). Se guarda cifrada; solo la ven los super administradores. */
  token: string;
  status: OnboardingStatus;
  createdAt: number;
  expiresAt: number;
  submittedAt?: number;
  form?: OnboardingForm;
  /** Lo que la IA leyó del documento (antes de que el cliente lo corrigiera). */
  ocr?: BusinessData;
  doc?: OnboardingDocInfo;
}

/** Lo que ve el cliente al abrir el link (nada de datos guardados). */
export interface OnboardingPublic {
  label: string;
  status: OnboardingStatus;
  expired: boolean;
  /** Se puede leer el RUT automáticamente. */
  ocr: boolean;
  /** Quién lo lee: 'local' = gratis en el propio servidor; 'claude' = IA de Anthropic (si la plataforma puso la clave). */
  ocrEngine: 'local' | 'claude';
}

/** Respuesta al subir el documento. */
export interface OnboardingUpload {
  doc: OnboardingDocInfo;
  /** Datos leídos (null si no hay IA, si falló o si no era legible). */
  data: BusinessData | null;
  /** Aviso para el cliente (ej. "no parece un RUT"). */
  notice?: string;
}

/** Días que dura un link de alta. */
export const ONBOARDING_DAYS = 30;
/** Tamaño máximo del documento. */
export const ONBOARDING_MAX_MB = 8;
