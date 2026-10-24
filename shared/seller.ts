/**
 * El vendedor del bot: su "prompt" (quién es, cómo habla, qué reglas sigue) y los DATOS OBLIGATORIOS
 * que siempre debe conseguir antes de pasar el cliente a un asesor (p. ej. nombre, ciudad, producto y cantidad).
 *
 * El bot no usa IA: el motor (flow-engine.ts) cumple estas reglas con el flujo. El prompt describe ese
 * comportamiento en lenguaje natural; sirve de guía para el equipo y, si algún día se activa IA, de instrucción.
 */
import type { FlowConfig } from './flow';
import type { ContactFields, Conversation, CrmSettings } from './models';

/** Cómo habla el vendedor. "sobrio" quita los emojis de los mensajes del bot. */
export const SELLER_TONES = ['cercano', 'sobrio'] as const;
export type SellerTone = (typeof SELLER_TONES)[number];

export interface SellerPersona {
  /** Nombre del vendedor virtual (variable {bot} en los mensajes). */
  botName: string;
  /** Rol con el que se presenta: "asesora comercial virtual". */
  role: string;
  tone: SellerTone;
  /** Qué busca lograr en cada conversación. */
  objective: string;
  /** Reglas de conducta (también aparecen en el prompt). */
  rules: string[];
  /** Prompt completo del vendedor (se genera con buildSellerPrompt y se puede editar). */
  prompt: string;
}

/** Datos que el vendedor debe conocer. "producto" = modelo concreto elegido del catálogo. */
export type RequiredKey = 'nombre' | 'producto' | keyof ContactFields;

export interface RequiredDatum {
  key: RequiredKey;
  label: string;
  /** inicio: se pide al comenzar · antes_asesor: se exige antes de pasar al asesor. */
  when: 'inicio' | 'antes_asesor';
  /** Pregunta del flujo que lo pide (el producto se pide mostrando el catálogo). */
  nodeId?: string;
}

/** Etiquetas de los datos que se pueden exigir. */
export const REQUIRED_LABELS: Partial<Record<RequiredKey, string>> = {
  nombre: 'Nombre', ciudad: 'Ciudad', producto: 'Producto de interés', cantidad: 'Cantidad',
  uso: 'Uso (casa o negocio)', correo: 'Correo', cedula: 'Cédula', direccion: 'Dirección', formaPago: 'Forma de pago',
};

/** Valor que se guarda cuando el cliente dio su nombre pero no la ciudad. */
export const NO_CITY = '(sin ciudad)';

/** ¿Ya se conoce ese dato del cliente? */
export function isRequiredMet(conv: Pick<Conversation, 'name' | 'fields' | 'bot'>, key: RequiredKey): boolean {
  // El nombre cuenta cuando el cliente lo dijo (el del perfil del canal puede ser un apodo).
  // Conversaciones anteriores a esta regla: cuenta si ya respondió el saludo (nombre y ciudad).
  if (key === 'nombre') return conv.bot.nameGiven ?? (conv.name !== 'Cliente' && !!conv.fields.ciudad);
  if (key === 'producto') return !!conv.fields.modeloInteres;
  if (key === 'ciudad') return !!conv.fields.ciudad && conv.fields.ciudad !== NO_CITY;
  const v = conv.fields[key];
  return v !== undefined && v !== null && v !== '';
}

/** Primer dato obligatorio que falta (opcionalmente solo los de una etapa). */
export function missingRequired(conv: Pick<Conversation, 'name' | 'fields' | 'bot'>, required: RequiredDatum[], when?: RequiredDatum['when']): RequiredDatum | undefined {
  return required.find((r) => (!when || r.when === when) && !isRequiredMet(conv, r.key));
}

export const DEFAULT_REQUIRED: RequiredDatum[] = [
  { key: 'nombre', label: 'Nombre', when: 'inicio', nodeId: 'saludo' },
  { key: 'ciudad', label: 'Ciudad', when: 'inicio', nodeId: 'pedir_ciudad' },
  { key: 'producto', label: 'Producto de interés', when: 'antes_asesor' },
  { key: 'cantidad', label: 'Cantidad', when: 'antes_asesor', nodeId: 'pedir_cantidad' },
];

export const DEFAULT_PERSONA: SellerPersona = {
  botName: 'Asistente',
  role: 'asesor comercial virtual',
  tone: 'cercano',
  objective: 'Entender qué necesita el cliente, mostrarle los productos que mejor le sirven y pasarlo a un asesor con todos sus datos listos para cotizar.',
  rules: [
    'Nunca des precios ni descuentos: los envía el asesor en la cotización.',
    'Haz una sola pregunta por mensaje y espera la respuesta.',
    'Muestra siempre los productos antes de pasar al asesor.',
    'No inventes productos, precios ni tiempos de entrega que no estén en el catálogo.',
    'Si el cliente pide hablar con una persona o tiene un problema con su compra, pásalo de inmediato.',
  ],
  prompt: '',
};

/** Persona efectiva del flujo (completa los campos que falten con los valores por defecto). */
export function personaOf(flow: Pick<FlowConfig, 'persona'>): SellerPersona {
  return { ...DEFAULT_PERSONA, ...(flow.persona ?? {}) };
}

/** Datos obligatorios efectivos del flujo. */
export function requiredOf(flow: Pick<FlowConfig, 'required'>): RequiredDatum[] {
  return flow.required ?? DEFAULT_REQUIRED;
}

const list = (items: string[]) => items.map((x) => `- ${x}`).join('\n');

/**
 * Prompt del vendedor en lenguaje natural, armado con la configuración del flujo:
 * quién es, su objetivo, los datos obligatorios, cuándo pasa al asesor y sus reglas.
 */
export function buildSellerPrompt(flow: FlowConfig, settings: Pick<CrmSettings, 'companyName'>): string {
  const p = personaOf(flow);
  const req = requiredOf(flow);
  const start = req.filter((r) => r.when === 'inicio').map((r) => r.label.toLowerCase());
  const before = req.map((r) => r.label.toLowerCase());
  const empresa = settings.companyName || 'la empresa';
  const describe = (t: FlowConfig['triggers'][number]) => `${t.label} (${t.keywords.slice(0, 4).join(', ')}…)`;
  // Comprar o cotizar es una venta: espera los datos obligatorios. Soporte, pagos y "hablar con alguien" no esperan.
  const sale = flow.triggers.filter((t) => t.intent === 'compra' || t.intent === 'precio').map(describe);
  const immediate = flow.triggers.filter((t) => t.intent !== 'compra' && t.intent !== 'precio').map(describe);
  const faqs = (flow.faqs ?? []).map((f) => `${f.keywords.slice(0, 3).join(' / ')} → ${f.answer}`);
  return [
    `Eres ${p.botName}, ${p.role} de ${empresa}. Atiendes por WhatsApp, Instagram, Messenger y el chat web.`,
    `Tu objetivo: ${p.objective}`,
    `Tono: ${p.tone === 'cercano' ? 'cercano y amable, tuteando, con emojis moderados' : 'sobrio y profesional, sin emojis'}. Mensajes cortos.`,
    '',
    'Flujo de venta que siempre sigues:',
    `1. Saluda una sola vez y pide primero: ${start.join(' y ') || 'los datos del cliente'}.`,
    '2. Descubre qué producto le interesa con las preguntas del flujo y muéstrale opciones del catálogo (con foto, "Ver detalles" y "Lo quiero").',
    `3. Antes de pasar a un asesor SIEMPRE debes saber: ${before.join(', ')}. Si falta alguno, pregúntalo.`,
    '4. Cuando el cliente elige un producto ("Lo quiero") o pide comprar/cotizar y ya tienes esos datos, pásalo al asesor con un resumen.',
    '5. Si el cliente pregunta algo fuera del flujo, respóndelo y vuelve a la pregunta pendiente.',
    '',
    'Pasa al asesor (después de tener los datos obligatorios) cuando:',
    list(sale),
    '',
    'Pasa al asesor de inmediato, sin pedir más datos, cuando:',
    list(immediate),
    '',
    'Reglas:',
    list(p.rules),
    ...(faqs.length ? ['', 'Preguntas frecuentes:', list(faqs)] : []),
  ].join('\n');
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu;

/** Aplica el tono del vendedor a un texto del bot. */
export function applyTone(text: string, tone: SellerTone): string {
  return tone === 'sobrio' ? text.replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?])/g, '$1').trim() : text;
}
