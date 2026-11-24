/**
 * Flujo de ventas parametrizado (EvoSport / JAUTHIA).
 * Todo lo que dice y decide el bot vive aquí como datos: se edita desde
 * la pantalla "Flujo del bot" y se guarda en PostgreSQL (tabla settings, clave "flow").
 */
import type { OptInConfig } from './optout';
import { ContactFields, StageDef, StageId } from './models';
import { DEFAULT_REQUIRED, RequiredDatum, SellerPersona } from './seller';
import type { CitasConfig } from './citas';

export type NodeKind = 'question' | 'recommend' | 'handoff';

/** Cómo interpretar una respuesta escrita (cuando el cliente no usa botones). */
export type ParseMode = 'name_city' | 'city' | 'number' | 'choice' | 'text';

export interface FlowOption {
  id: string;
  title: string;
  description?: string;
  /** Valor que se guarda en el campo. */
  value: string;
  /** Palabras que equivalen a elegir esta opción escribiendo. */
  synonyms?: string[];
  /** Nodo siguiente si se elige esta opción (si no, usa node.next). */
  next?: string;
}

export interface FlowNode {
  id: string;
  kind: NodeKind;
  /** Ruta a la que pertenece (para el editor): todas, cardio, fuerza… */
  route: string;
  title: string;
  message: string;
  /** buttons: hasta 3 botones; list: lista desplegable (hasta 10). */
  display?: 'buttons' | 'list' | 'text';
  listButton?: string;
  options?: FlowOption[];
  field?: keyof ContactFields | 'nombre_ciudad';
  parse?: ParseMode;
  /** Las opciones salen de las categorías del catálogo del cliente (en vez de escribirlas a mano). */
  optionsFrom?: 'categories';
  /** Se responde sola si el cliente ya lo dijo antes ("quiero paneles para mi finca"): el bot no la pregunta. */
  prefill?: boolean;
  next?: string;
}

export const TRIGGER_INTENTS = ['precio', 'compra', 'soporte', 'pago', 'humano'] as const;
export type TriggerIntent = (typeof TRIGGER_INTENTS)[number];

export interface KeywordTrigger {
  id: string;
  label: string;
  intent: TriggerIntent;
  keywords: string[];
  /** Pasa al asesor sin esperar a que elija. */
  handoff: boolean;
  /** Puntos que suma al puntaje de compra. */
  score: number;
  /** Etapa a la que mueve la conversación (si es más avanzada que la actual). */
  moveTo?: StageDef['id'];
}

/** Un mensaje de remarketing: se envía cuando el cliente lleva `afterHours` sin contestar. */
export interface FollowUpStep {
  afterHours: number;
  /** Texto con {nombre}, {producto}, {empresa}. */
  message: string;
  /** Imagen opcional: https://, una foto del catálogo o PRODUCT_IMAGE (la del producto que le interesa a cada cliente). */
  imageUrl?: string;
  /**
   * Plantilla aprobada de WhatsApp (id) para cuando pasaron más de 24 h desde el último mensaje del cliente:
   * WhatsApp no permite mensajes libres fuera de esa ventana. Sin plantilla, ese paso se omite en WhatsApp.
   */
  templateId?: string;
}

/** Valor especial de la imagen del remarketing: la foto del producto que le interesa a ESE cliente. */
export const PRODUCT_IMAGE = '@producto';

/** Remarketing automático cuando el cliente deja de contestar. */
export interface RemarketingConfig {
  enabled: boolean;
  /** Etapas en las que aplica. */
  stages: string[];
  /** También si un asesor ya tomó la conversación (bot en pausa). */
  withAdvisor: boolean;
  /** Horas después del último mensaje para pasar a Perdido (0 = nunca). */
  loseAfterHours: number;
}

export const DEFAULT_REMARKETING: RemarketingConfig = {
  enabled: true,
  stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'],
  withAdvisor: true,
  loseAfterHours: 24,
};

export interface FlowConfig {
  version: number;
  startNode: string;
  nodes: FlowNode[];
  triggers: KeywordTrigger[];
  followUps: FollowUpStep[];
  /** Opciones del remarketing (si falta, se usan las de DEFAULT_REMARKETING). */
  remarketing?: RemarketingConfig;
  /** Preguntas frecuentes: el bot responde y vuelve a la pregunta pendiente. */
  faqs?: FaqEntry[];
  /** Quién es el vendedor virtual (nombre, rol, tono, reglas y prompt). */
  persona?: SellerPersona;
  /** Citas en la tienda (y videollamada / domicilio para quien no puede venir). */
  citas?: CitasConfig;
  /** Pregunta de permiso para promociones (opt-in que exige WhatsApp). */
  optIn?: OptInConfig;
  /** Datos que el vendedor SIEMPRE debe conocer (y cuándo pedirlos). Si falta, se usan DEFAULT_REQUIRED. */
  required?: RequiredDatum[];
  messages: {
    handoff: string;
    showOthers: string;
    noMoreOptions: string;
    noneLiked: string;
    notUnderstood: string;
    productIntro: string;
    detailsCta: string;
    noPrices: string;
    /** Cuando dice "quiero comprar" sin decir qué. */
    askProduct?: string;
    /** Tras mostrar productos a quien quiere comprar. */
    chooseToBuy?: string;
    /** Tras mostrar productos a quien pide precio. */
    choosePriced?: string;
    /** Pedir nombre y ciudad cuando ya se saludó antes. */
    askNameAgain?: string;
    /** Saludo corto cuando el primer mensaje ya pide algo concreto. */
    greeting?: string;
    /** Para que elija un modelo del catálogo cuando falta el producto antes de pasar al asesor. */
    askWhichProduct?: string;
    /** Igual, pero con botones de los modelos que acaba de ver. */
    askWhichSeen?: string;
    /** Al recibir el nombre, antes de la siguiente pregunta ({nombre}). */
    nameAck?: string;
    /** Tras una pregunta frecuente, para volver a la pregunta pendiente. */
    backToFlow?: string;
    /** Traspaso por garantía / servicio técnico. */
    handoffSupport?: string;
    /** Traspaso cuando envía un comprobante de pago. */
    handoffPayment?: string;
    /** Traspaso cuando pide hablar con una persona. */
    handoffHuman?: string;
    /** Producto con opciones: "¿Qué {opcion} de {producto} quieres?". */
    askVariant?: string;
    /** Tras elegir un producto: "¿Quieres agregar otro?" ({pedido} = lista del pedido). */
    askMore?: string;
    /** Cuando quiere agregar otro producto al pedido. */
    addAnother?: string;
    /** Cuando un asesor le devuelve la conversación al bot y el cliente vuelve a escribir. */
    welcomeBack?: string;
  };
  /** Tras cada "Lo quiero", preguntar si quiere agregar otro producto antes de pasar al asesor (por defecto sí). */
  askMoreProducts?: boolean;
  /** Minutos sin respuesta a "¿agregar otro?" para pasar al asesor con lo que lleva (por defecto 15). */
  cartWaitMinutes?: number;
  /** Máximo de opciones por carrusel (el flujo pide 1 a 3). */
  maxOptions: number;
  /** Veces que el bot puede no entender antes de pasar al asesor. */
  maxRetries: number;
  /** Palabras que indican que es gimnasio / compra grande → prioridad alta. */
  priorityKeywords: string[];
}

export interface FaqEntry {
  id: string;
  /** Palabras o frases que activan la respuesta. */
  keywords: string[];
  answer: string;
}

export const STAGES: StageDef[] = [
  { id: 'nuevo', name: 'Nuevo lead', actor: 'Bot', rule: 'Entra el primer mensaje.', color: '#64748b', probability: 5 },
  { id: 'calificando', name: 'Calificando', actor: 'Bot', rule: 'Responde ciudad, uso y equipo.', color: '#0ea5e9', probability: 15 },
  { id: 'asesor', name: 'Calificado · asesor asignado', actor: 'Asesor', rule: 'El cliente elige una opción de las fichas, o el bot no puede seguir.', color: '#8b5cf6', probability: 35 },
  { id: 'cotizacion', name: 'Cotización enviada', actor: 'Asesor', rule: 'Se envía el PDF con el descuento.', color: '#f59e0b', probability: 50 },
  { id: 'negociacion', name: 'Negociación o apartado', actor: 'Asesor', rule: 'Pide descuento, separa con anticipo o elige plan de cuotas.', color: '#f97316', probability: 70 },
  { id: 'pago', name: 'Pago confirmado', actor: 'Asesor', rule: 'Llega el comprobante y sale la factura electrónica.', color: '#10b981', probability: 95 },
  { id: 'entrega', name: 'Entrega e instalación', actor: 'Logística', rule: 'Equipo instalado. Se cierra como Ganado.', color: '#14b8a6', probability: 98 },
  { id: 'ganado', name: 'Ganado', actor: '—', rule: 'Venta cerrada.', color: '#16a34a', probability: 100 },
  { id: 'perdido', name: 'Perdido', actor: 'Automático o asesor', rule: 'Sin respuesta tras el seguimiento, o dice que no.', color: '#ef4444', probability: 0 },
];

export const STAGE_ORDER = Object.fromEntries(STAGES.map((s, i) => [s.id, i])) as Record<StageId, number>;

/** Definición de una etapa (nombre, color, probabilidad). */
export function stageDef(id: StageId | undefined): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

/** Etapas cerradas: ya no cuentan en el embudo activo ni se marcan calientes. */
export const CLOSED_STAGES: readonly StageId[] = ['ganado', 'perdido'];
/** Etapas en las que el cliente ya compró. */
export const PURCHASED_STAGES: readonly StageId[] = ['pago', 'entrega', 'ganado'];

export function isClosed(id: StageId): boolean {
  return CLOSED_STAGES.includes(id);
}

/** Solo un lead abierto que aún no compra puede estar "a punto de comprar". */
export function canBeHot(id: StageId): boolean {
  return !isClosed(id) && !PURCHASED_STAGES.includes(id);
}

/** Valor del embudo ponderado por la probabilidad de compra de cada lead (solo leads abiertos). */
export function weightedValue(convs: { stage: StageId; value: number; score: number }[]): number {
  return convs.filter((c) => !isClosed(c.stage)).reduce((sum, c) => sum + ((c.value || 0) * c.score) / 100, 0);
}

export const DEFAULT_FLOW: FlowConfig = {
  version: 1,
  startNode: 'saludo',
  maxOptions: 3,
  maxRetries: 2,
  priorityKeywords: ['gimnasio', 'gym', 'negocio', 'varias', 'mayorista', 'conjunto', 'club', 'hotel', 'empresa'],
  nodes: [
    {
      id: 'saludo', kind: 'question', route: 'todas', title: 'Saludo',
      message: '¡Hola! 👋 Soy {bot}, asesora virtual de EvoSport. ¿Cómo te llamas y desde qué ciudad nos escribes?',
      display: 'text', field: 'nombre_ciudad', parse: 'name_city', next: 'uso',
    },
    {
      id: 'uso', kind: 'question', route: 'todas', title: 'Uso',
      message: '¿El equipo es para tu casa o para un gimnasio o negocio?',
      display: 'buttons', field: 'uso', parse: 'choice', next: 'equipo',
      options: [
        { id: 'uso_hogar', title: '🏠 Para mi casa', value: 'hogar', synonyms: ['casa', 'hogar', 'personal', 'apartamento'] },
        { id: 'uso_negocio', title: '🏋️ Gimnasio/negocio', value: 'negocio', next: 'handoff', synonyms: ['gimnasio', 'gym', 'negocio', 'empresa', 'club', 'conjunto'] },
      ],
    },
    {
      id: 'equipo', kind: 'question', route: 'todas', title: 'Equipo',
      message: '¿Qué estás buscando? Elige una categoría 👇',
      display: 'list', listButton: 'Ver categorías', field: 'categoria', parse: 'choice',
      options: [
        { id: 'cat_cardio', title: 'Cardio', description: 'Trotadora, elíptica, spinning', value: 'cardio', next: 'cardio_tipo', synonyms: ['cardio', 'trotadora', 'caminadora', 'eliptica', 'elíptica', 'spinning', 'bicicleta'] },
        { id: 'cat_fuerza', title: 'Máquinas de fuerza', description: 'Multigimnasio, jaula, Smith, prensa', value: 'fuerza', next: 'fuerza_tipo', synonyms: ['fuerza', 'multigimnasio', 'jaula', 'smith', 'prensa', 'maquina'] },
        { id: 'cat_peso', title: 'Peso libre', description: 'Mancuernas, barras, discos, bancos', value: 'peso-libre', next: 'pl_tipo', synonyms: ['peso libre', 'mancuernas', 'barras', 'discos', 'banco', 'pesas'] },
        { id: 'cat_acc', title: 'Accesorios', description: 'Colchonetas, steps, cuerdas, piso', value: 'accesorios', next: 'acc_tipo', synonyms: ['accesorios', 'colchoneta', 'step', 'cuerda', 'piso'] },
        { id: 'cat_nosabe', title: 'No sé / otro', description: 'Necesito orientación', value: 'no-sabe', next: 'handoff', synonyms: ['no se', 'no sé', 'otro', 'orientacion', 'ayuda'] },
      ],
    },
    // ---------- Cardio ----------
    {
      id: 'cardio_tipo', kind: 'question', route: 'cardio', title: 'Tipo de cardio',
      message: '¡Buena elección! ¿Qué equipo de cardio te interesa?',
      display: 'buttons', field: 'subcategoria', parse: 'choice', next: 'cardio_peso',
      options: [
        { id: 'sub_trotadora', title: 'Trotadora', value: 'trotadora', synonyms: ['trotadora', 'caminadora', 'banda', 'cinta', 'caminador'] },
        { id: 'sub_eliptica', title: 'Elíptica', value: 'eliptica', synonyms: ['eliptica', 'elíptica'] },
        { id: 'sub_spinning', title: 'Spinning', value: 'spinning', synonyms: ['spinning', 'bicicleta', 'bici'] },
      ],
    },
    {
      id: 'cardio_peso', kind: 'question', route: 'cardio', title: 'Peso del usuario',
      message: '¿Cuánto pesa la persona que la usará? (en kg)',
      display: 'text', field: 'pesoUsuario', parse: 'number', next: 'cardio_modo',
    },
    {
      id: 'cardio_modo', kind: 'question', route: 'cardio', title: 'Caminar o trotar',
      message: '¿La quieres para caminar o para trotar?',
      display: 'buttons', field: 'modoUso', parse: 'choice', next: 'cardio_cantidad',
      options: [
        { id: 'modo_caminar', title: '🚶 Caminar', value: 'caminar', synonyms: ['caminar', 'camina'] },
        { id: 'modo_trotar', title: '🏃 Trotar', value: 'trotar', synonyms: ['trotar', 'correr', 'trote'] },
      ],
    },
    {
      id: 'cardio_cantidad', kind: 'question', route: 'cardio', title: 'Cantidad',
      message: '¿Cuántas unidades necesitas?',
      display: 'buttons', field: 'cantidad', parse: 'choice', next: 'recomendar',
      options: [
        { id: 'cant_1', title: '1', value: '1', synonyms: ['una', 'uno', '1'] },
        { id: 'cant_2', title: '2 a 3', value: '2-3', synonyms: ['dos', 'tres', '2', '3'] },
        { id: 'cant_4', title: '4 o más', value: '4+', synonyms: ['cuatro', 'varias', '4', '5', '6', '10'] },
      ],
    },
    // ---------- Fuerza ----------
    {
      id: 'fuerza_tipo', kind: 'question', route: 'fuerza', title: 'Tipo de máquina',
      message: '¿Qué máquina de fuerza buscas?',
      display: 'list', listButton: 'Ver máquinas', field: 'subcategoria', parse: 'choice', next: 'fuerza_techo',
      options: [
        { id: 'sub_multi', title: 'Multigimnasio', value: 'multigimnasio', synonyms: ['multigimnasio', 'multi', 'multifuncional'] },
        { id: 'sub_jaula', title: 'Jaula', value: 'jaula', synonyms: ['jaula', 'rack'] },
        { id: 'sub_smith', title: 'Smith', value: 'smith', synonyms: ['smith'] },
        { id: 'sub_prensa', title: 'Prensa', value: 'prensa', synonyms: ['prensa', 'pierna'] },
      ],
    },
    {
      id: 'fuerza_techo', kind: 'question', route: 'fuerza', title: 'Altura del techo',
      message: 'Para recomendarte bien necesito saber la altura del techo donde irá la máquina. ¿Cuánto mide? (ej: 2.40 m)',
      display: 'text', field: 'alturaTecho', parse: 'number', next: 'fuerza_piso',
    },
    {
      id: 'fuerza_piso', kind: 'question', route: 'fuerza', title: 'Piso',
      message: '¿Será en un primer piso?',
      display: 'buttons', field: 'piso', parse: 'choice', next: 'fuerza_usuarios',
      options: [
        { id: 'piso_si', title: 'Sí, primer piso', value: 'primer piso', synonyms: ['si', 'sí', 'primer', 'primero'] },
        { id: 'piso_no', title: 'No, otro piso', value: 'otro piso', synonyms: ['no', 'segundo', 'tercer', 'otro'] },
      ],
    },
    {
      id: 'fuerza_usuarios', kind: 'question', route: 'fuerza', title: 'Usuarios',
      message: '¿Cuántas personas la usarán?',
      display: 'buttons', field: 'usuarios', parse: 'choice', next: 'recomendar',
      options: [
        { id: 'usr_1', title: '1 a 2', value: '1-2', synonyms: ['1', '2', 'yo', 'solo', 'pareja'] },
        { id: 'usr_3', title: '3 a 5', value: '3-5', synonyms: ['3', '4', '5', 'familia'] },
        { id: 'usr_6', title: 'Más de 5', value: '6+', synonyms: ['muchas', 'mas', 'más', 'gimnasio'] },
      ],
    },
    // ---------- Peso libre ----------
    {
      id: 'pl_tipo', kind: 'question', route: 'peso-libre', title: 'Tipo de peso libre',
      message: '¿Qué necesitas de peso libre?',
      display: 'list', listButton: 'Ver opciones', field: 'subcategoria', parse: 'choice', next: 'pl_rango',
      options: [
        { id: 'sub_manc', title: 'Mancuernas', value: 'mancuernas', synonyms: ['mancuerna', 'mancuernas'] },
        { id: 'sub_barras', title: 'Barras', description: 'Olímpica 20 kg, Z, romana, 150 cm', value: 'barras', synonyms: ['barra', 'barras'] },
        { id: 'sub_discos', title: 'Discos', description: 'Estándar u olímpicos', value: 'discos', synonyms: ['disco', 'discos'] },
        { id: 'sub_bancos', title: 'Bancos', value: 'bancos', synonyms: ['banco', 'bancos'] },
      ],
    },
    {
      id: 'pl_rango', kind: 'question', route: 'peso-libre', title: 'Rango de kg',
      message: '¿Qué rango de peso buscas? (de 2,5 a 40 kg) y ¿cuántos pares?',
      display: 'text', field: 'rangoKg', parse: 'text', next: 'recomendar',
    },
    // ---------- Accesorios ----------
    {
      id: 'acc_tipo', kind: 'question', route: 'accesorios', title: 'Producto',
      message: '¿Qué accesorio necesitas?',
      display: 'list', listButton: 'Ver accesorios', field: 'subcategoria', parse: 'choice', next: 'acc_cantidad',
      options: [
        { id: 'sub_colch', title: 'Colchonetas', value: 'colchonetas', synonyms: ['colchoneta', 'tapete', 'mat'] },
        { id: 'sub_step', title: 'Steps', value: 'steps', synonyms: ['step', 'steps'] },
        { id: 'sub_cuerda', title: 'Cuerdas', value: 'cuerdas', synonyms: ['cuerda', 'lazo'] },
        { id: 'sub_piso', title: 'Piso de caucho', value: 'piso', synonyms: ['piso', 'caucho'] },
      ],
    },
    {
      id: 'acc_cantidad', kind: 'question', route: 'accesorios', title: 'Cantidad',
      message: '¿Cuántas unidades necesitas?',
      display: 'text', field: 'cantidad', parse: 'text', next: 'recomendar',
    },
    // ---------- Recomendación y traspaso ----------
    // ---------- Preguntas básicas (datos obligatorios) ----------
    {
      id: 'pedir_ciudad', kind: 'question', route: 'basicas', title: 'Ciudad',
      message: '¿Desde qué ciudad nos escribes? 📍',
      display: 'text', field: 'ciudad', parse: 'city',
    },
    {
      id: 'pedir_cantidad', kind: 'question', route: 'basicas', title: 'Cantidad',
      message: '¿Cuántas unidades necesitas?',
      display: 'buttons', field: 'cantidad', parse: 'choice',
      options: [
        { id: 'qty_1', title: '1', value: '1', synonyms: ['una', 'uno', '1', 'solo una', 'solo uno'] },
        { id: 'qty_2', title: '2 a 3', value: '2-3', synonyms: ['dos', 'tres', '2', '3'] },
        { id: 'qty_4', title: '4 o más', value: '4+', synonyms: ['cuatro', 'varias', 'varios', '4', '5', '6', '10'] },
      ],
    },
    {
      id: 'recomendar', kind: 'recommend', route: 'todas', title: 'Recomendación (1 a 3 opciones)',
      message: 'Con lo que me contaste, estas son las opciones que mejor te sirven 👇',
    },
    {
      id: 'handoff', kind: 'handoff', route: 'todas', title: 'Traspaso al asesor',
      message: 'Ya tengo todo lo que necesito. Una asesora te enviará la cotización con tu descuento mayorista. 🙌',
    },
  ],
  triggers: [
    { id: 't_precio', label: 'Pide precio, descuento o cotización', intent: 'precio', handoff: true, score: 20, keywords: ['precio', 'cuanto vale', 'cuánto vale', 'cuanto cuesta', 'cuánto cuesta', 'valor', 'descuento', 'cotizacion', 'cotización', 'catalogo con precios', 'catálogo'] },
    { id: 't_compra', label: 'Quiere comprar, apartar o pagar', intent: 'compra', handoff: true, score: 35, moveTo: 'negociacion', keywords: ['comprar', 'la compro', 'lo compro', 'la quiero', 'lo quiero', 'apartar', 'separar', 'pagar', 'cuotas', 'plan separe', 'anticipo', 'abono'] },
    { id: 't_pago', label: 'Envía comprobante de pago', intent: 'pago', handoff: true, score: 50, moveTo: 'pago', keywords: ['comprobante', 'ya pague', 'ya pagué', 'ya transferi', 'ya transferí', 'consignacion', 'consignación', 'soporte de pago'] },
    { id: 't_soporte', label: 'Garantía, servicio técnico, financiación o Addi', intent: 'soporte', handoff: true, score: 10, keywords: ['garantia', 'garantía', 'servicio tecnico', 'servicio técnico', 'financiacion', 'financiación', 'addi', 'credito', 'crédito', 'tarjeta'] },
    { id: 't_humano', label: 'Pide hablar con una persona', intent: 'humano', handoff: true, score: 5, keywords: ['asesor', 'asesora', 'humano', 'persona', 'hablar con alguien', 'llamar', 'llamada'] },
  ],
  // Remarketing: dentro de las primeras 24 h se puede escribir libre (con imagen); después, WhatsApp exige plantilla.
  followUps: [
    { afterHours: 2, message: '{nombre}, ¿pudiste ver las opciones que te envié? 😊 Si quieres te ayudo a elegir la ideal o te envío la cotización.' },
    { afterHours: 20, message: 'Hola {nombre} 👋 Esta semana tenemos descuento pagando en efectivo o transferencia, y envío gratis en Valledupar. ¿Te ayudo con tu {producto}?', imageUrl: PRODUCT_IMAGE },
    { afterHours: 72, message: 'Última consulta, {nombre}: ¿aún te interesa tu {producto}? Si prefieres, una asesora te llama para resolver tus dudas.' },
  ],
  remarketing: { enabled: true, stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'], withAdvisor: true, loseAfterHours: 48 },
  persona: {
    botName: 'Sofía',
    role: 'asesora comercial virtual',
    tone: 'cercano',
    objective: 'Entender qué equipo de gimnasio necesita el cliente (para su casa o su negocio), mostrarle los que mejor le sirven según su peso, espacio y uso, y pasarlo a una asesora con todos sus datos listos para cotizar con descuento mayorista.',
    rules: [
      'Nunca des precios ni descuentos: los precios cambian cada mes y los envía la asesora en la cotización.',
      'Haz una sola pregunta por mensaje y espera la respuesta.',
      'Muestra siempre los productos antes de pasar a la asesora.',
      'Recomienda solo equipos que soporten el peso del usuario y quepan en su espacio (altura del techo).',
      'No inventes productos, precios ni tiempos de entrega que no estén en el catálogo.',
      'Si el cliente tiene un problema de garantía o pide hablar con una persona, pásalo de inmediato.',
    ],
    prompt: '',
  },
  required: DEFAULT_REQUIRED,
  faqs: [
    { id: 'faq_envios', keywords: ['envio', 'envío', 'envian', 'envían', 'domicilio', 'despacho', 'despachan', 'hacen envios', 'llega a'], answer: '🚚 Sí, enviamos a toda Colombia. En Valledupar el envío y la instalación son gratis; para otras ciudades se cotiza aparte.' },
    { id: 'faq_horario', keywords: ['horario', 'a que hora', 'a qué hora', 'abren', 'cierran', 'atienden'], answer: '🕑 Atendemos de lunes a viernes de 8:30 a 12:30 y de 2:30 a 6:30, y los sábados de 9:00 a 5:00.' },
    { id: 'faq_garantia_tiempo', keywords: ['cuanto tiempo de garantia', 'cuánto tiempo de garantía', 'tiene garantia', 'tiene garantía', 'traen garantia'], answer: '🛡️ La garantía depende de cada equipo: la ves en la ficha (toca *Ver detalles*) y la asesora te la confirma.' },
  ],
  messages: {
    greeting: '¡Hola! 👋 Soy {bot}, asesora virtual de EvoSport.',
    nameAck: 'Mucho gusto, {nombre} 😊',
    backToFlow: 'Ahora sí, sigamos 😊',
    handoff: 'Ya tengo todo lo que necesito. Una asesora te enviará la cotización con tu descuento mayorista. Mientras tanto, mira estas opciones.',
    showOthers: 'Claro, te muestro otras opciones que también te pueden servir.',
    noMoreOptions: 'Ya te mostré todas las opciones que tengo para ti. Te paso con una asesora para buscarte la ideal.',
    noneLiked: 'Entiendo 😊. Cuéntame qué no te convenció (tamaño, precio, motor…) y te busco algo más a tu medida. También puedo pedirle a una asesora que te contacte.',
    notUnderstood: 'Perdona, no te entendí bien. ¿Me lo puedes decir de otra forma o elegir una opción?',
    productIntro: '¡Claro! Mira lo que tenemos 👇',
    detailsCta: '¿Te gusta esta opción?',
    noPrices: 'Los precios cambian cada mes, por eso una asesora te enviará la cotización con tu descuento mayorista.',
    askProduct: '¡Con gusto te ayudo! 😊 ¿Qué producto te gustaría?',
  },
};

/**
 * Flujo genérico para clientes que no son gimnasios.
 * Las opciones de "¿Qué te interesa?" salen de las categorías del catálogo de cada cliente,
 * y {empresa} se reemplaza por el nombre del negocio.
 */
export const GENERIC_FLOW: FlowConfig = {
  version: 1,
  startNode: 'saludo',
  maxOptions: 3,
  maxRetries: 2,
  priorityKeywords: ['empresa', 'mayorista', 'al por mayor', 'varias unidades', 'distribuidor'],
  nodes: [
    {
      id: 'saludo', kind: 'question', route: 'todas', title: 'Saludo',
      message: '¡Hola! 👋 Soy {bot}, el asistente virtual de {empresa}. ¿Cómo te llamas y desde qué ciudad nos escribes?',
      display: 'text', field: 'nombre_ciudad', parse: 'name_city', next: 'interes',
    },
    {
      id: 'interes', kind: 'question', route: 'todas', title: 'Qué le interesa',
      message: '¿Qué te gustaría ver? Elige una opción 👇',
      display: 'list', listButton: 'Ver opciones', field: 'categoria', parse: 'choice', optionsFrom: 'categories', next: 'cantidad',
    },
    {
      id: 'cantidad', kind: 'question', route: 'todas', title: 'Cantidad',
      message: '¿Cuántas unidades necesitas?',
      display: 'text', field: 'cantidad', parse: 'text', next: 'recomendar',
    },
    // ---------- Preguntas básicas (datos obligatorios) ----------
    {
      id: 'pedir_ciudad', kind: 'question', route: 'basicas', title: 'Ciudad',
      message: '¿Desde qué ciudad nos escribes? 📍',
      display: 'text', field: 'ciudad', parse: 'city',
    },
    {
      id: 'pedir_cantidad', kind: 'question', route: 'basicas', title: 'Cantidad',
      message: '¿Cuántas unidades necesitas?',
      display: 'buttons', field: 'cantidad', parse: 'choice',
      options: [
        { id: 'qty_1', title: '1', value: '1', synonyms: ['una', 'uno', '1', 'solo una', 'solo uno'] },
        { id: 'qty_2', title: '2 a 3', value: '2-3', synonyms: ['dos', 'tres', '2', '3'] },
        { id: 'qty_4', title: '4 o más', value: '4+', synonyms: ['cuatro', 'varias', 'varios', '4', '5', '6', '10'] },
      ],
    },
    {
      id: 'recomendar', kind: 'recommend', route: 'todas', title: 'Recomendación (1 a 3 opciones)',
      message: 'Estas son las opciones que tenemos para ti 👇',
    },
    {
      id: 'handoff', kind: 'handoff', route: 'todas', title: 'Traspaso al asesor',
      message: 'Perfecto, ya tengo lo que necesito. Un asesor de {empresa} te escribe en breve. 🙌',
    },
  ],
  triggers: [
    { id: 't_precio', label: 'Pide precio o cotización', intent: 'precio', handoff: true, score: 20, keywords: ['precio', 'cuanto vale', 'cuánto vale', 'cuanto cuesta', 'cuánto cuesta', 'valor', 'cotizacion', 'cotización', 'descuento'] },
    { id: 't_compra', label: 'Quiere comprar o pagar', intent: 'compra', handoff: true, score: 35, moveTo: 'negociacion', keywords: ['comprar', 'lo compro', 'la compro', 'lo quiero', 'la quiero', 'pagar', 'separar', 'apartar'] },
    { id: 't_pago', label: 'Envía comprobante de pago', intent: 'pago', handoff: true, score: 50, moveTo: 'pago', keywords: ['comprobante', 'ya pague', 'ya pagué', 'ya transferi', 'ya transferí', 'consignacion', 'consignación'] },
    { id: 't_soporte', label: 'Garantía, devoluciones o crédito', intent: 'soporte', handoff: true, score: 10, keywords: ['garantia', 'garantía', 'devolucion', 'devolución', 'credito', 'crédito', 'financiacion', 'financiación'] },
    { id: 't_humano', label: 'Pide hablar con una persona', intent: 'humano', handoff: true, score: 5, keywords: ['asesor', 'asesora', 'humano', 'persona', 'hablar con alguien', 'llamar'] },
  ],
  followUps: [
    { afterHours: 2, message: '{nombre}, ¿pudiste ver lo que te envié? 😊 Si quieres te ayudo a elegir.' },
    { afterHours: 20, message: 'Hola {nombre} 👋 ¿Sigues interesado en tu {producto}? Te puedo mostrar otras opciones.', imageUrl: PRODUCT_IMAGE },
    { afterHours: 72, message: 'Última consulta, {nombre}: ¿aún te interesa? Si prefieres, un asesor te llama.' },
  ],
  remarketing: { enabled: true, stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'], withAdvisor: true, loseAfterHours: 48 },
  persona: { botName: 'Asistente', role: 'asesor comercial virtual', tone: 'cercano', objective: 'Entender qué necesita el cliente, mostrarle los productos que mejor le sirven y pasarlo a un asesor con sus datos listos.', rules: ['Nunca des precios ni descuentos: los envía el asesor.', 'Haz una sola pregunta por mensaje.', 'Muestra siempre los productos antes de pasar al asesor.'], prompt: '' },
  required: DEFAULT_REQUIRED,
  faqs: [],
  messages: {
    greeting: '¡Hola! 👋 Soy {bot}, el asistente virtual de {empresa}.',
    nameAck: 'Mucho gusto, {nombre} 😊',
    backToFlow: 'Ahora sí, sigamos 😊',
    handoff: 'Perfecto, ya tengo lo que necesito. Un asesor de {empresa} te escribe en breve. Mientras tanto, mira estas opciones.',
    showOthers: 'Claro, te muestro otras opciones.',
    noMoreOptions: 'Ya te mostré todas las opciones que tengo. Te paso con un asesor.',
    noneLiked: 'Entiendo 😊. Cuéntame qué buscas exactamente y te ayudo, o le pido a un asesor que te contacte.',
    notUnderstood: 'Perdona, no te entendí bien. ¿Me lo puedes decir de otra forma o elegir una opción?',
    productIntro: '¡Claro! Mira lo que tenemos 👇',
    detailsCta: '¿Te gusta esta opción?',
    noPrices: 'Un asesor te confirma el precio y la disponibilidad en un momento.',
    askProduct: '¡Con gusto te ayudo! 😊 ¿Qué te gustaría?',
  },
};

/**
 * Energía solar (TECSOLAR). Flujometría sacada de sus conversaciones reales de Kommo:
 * el asesor siempre pide 1) vivienda, empresa o zona rural, 2) ubicación y 3) el recibo de luz (foto o NIC)
 * para cotizar gratis. No hay catálogo de paneles: cada proyecto se cotiza a la medida; los reflectores sí
 * tienen precio fijo y se muestran desde el catálogo (categoría "reflectores").
 */
export const SOLAR_FLOW: FlowConfig = {
  version: 1,
  startNode: 'saludo',
  maxOptions: 3,
  maxRetries: 2,
  priorityKeywords: [],
  nodes: [
    {
      id: 'saludo', kind: 'question', route: 'todas', title: 'Saludo',
      message: '¡Hola! 👋 Soy {bot}, el asistente virtual de {empresa} ☀️. Te ayudo con tu cotización de energía solar, totalmente gratis. ¿Cómo te llamas y desde qué ciudad o municipio nos escribes?',
      display: 'text', field: 'nombre_ciudad', parse: 'name_city', next: 'interes',
    },
    {
      id: 'interes', kind: 'question', route: 'todas', title: 'Qué le interesa',
      message: '¿Qué te gustaría cotizar? 👇',
      display: 'buttons', field: 'categoria', parse: 'choice', prefill: true, next: 'propiedad',
      options: [
        { id: 'int_paneles', title: '☀️ Paneles solares', value: 'paneles', next: 'propiedad', synonyms: ['panel', 'paneles', 'energia solar', 'energía solar', 'sistema solar', 'fotovoltaico', 'plan separe', 'ahorrar', 'factura', 'cotizar', 'cotizacion', 'cotización', 'instalar', 'vivienda', 'casa', 'empresa', 'negocio', 'finca'] },
        { id: 'int_reflectores', title: '💡 Reflectores', value: 'reflectores', next: 'recomendar', synonyms: ['reflector', 'reflectores', 'lampara', 'lámpara', 'iluminacion', 'iluminación'] },
        { id: 'int_otro', title: '💬 Otra consulta', value: 'no-sabe', next: 'handoff', synonyms: ['otro', 'otra', 'ya soy cliente'] },
      ],
    },
    {
      id: 'propiedad', kind: 'question', route: 'paneles', title: 'Tipo de propiedad',
      message: '¿El sistema sería para una vivienda, una empresa o una zona rural?',
      display: 'buttons', field: 'tipoPropiedad', parse: 'choice', prefill: true, next: 'gasto',
      options: [
        { id: 'prop_vivienda', title: '🏠 Vivienda', value: 'vivienda', synonyms: ['vivienda', 'casa', 'hogar', 'apartamento', 'residencia'] },
        { id: 'prop_empresa', title: '🏢 Empresa/negocio', value: 'empresa', synonyms: ['empresa', 'negocio', 'local', 'comercio', 'oficina', 'bodega', 'colegio', 'hotel', 'clinica', 'clínica'] },
        { id: 'prop_rural', title: '🌾 Finca/zona rural', value: 'finca', synonyms: ['finca', 'rural', 'vereda', 'campo', 'parcela', 'hacienda'] },
      ],
    },
    {
      id: 'gasto', kind: 'question', route: 'paneles', title: 'Pago de luz al mes',
      message: '¿Cuánto pagas de luz al mes, más o menos? Si lo sabes, también me sirve tu consumo en kWh.',
      display: 'list', listButton: 'Ver rangos', field: 'gastoLuz', parse: 'text', next: 'recibo',
      options: [
        { id: 'gas_1', title: 'Menos de $300.000', value: 'menos de $300.000' },
        { id: 'gas_2', title: '$300.000 a $600.000', value: '$300.000 a $600.000' },
        { id: 'gas_3', title: '$600.000 a $1.000.000', value: '$600.000 a $1.000.000' },
        { id: 'gas_4', title: 'Más de $1.000.000', value: 'más de $1.000.000' },
        { id: 'gas_5', title: 'No sé', value: 'no sabe' },
      ],
    },
    {
      id: 'recibo', kind: 'question', route: 'paneles', title: 'Recibo de luz o NIC',
      message: '📸 Para hacerte una cotización precisa, envíame una foto de tu recibo de luz (por delante y por detrás) o el número NIC de tu contrato. Si no lo tienes a mano, escribe *después*.',
      display: 'text', field: 'recibo', parse: 'text', next: 'pago',
    },
    {
      id: 'pago', kind: 'question', route: 'paneles', title: 'Forma de pago',
      message: '¿Cómo te gustaría pagar tu sistema?',
      display: 'buttons', field: 'formaPago', parse: 'choice', next: 'handoff',
      options: [
        { id: 'pag_contado', title: 'De contado', value: 'contado', synonyms: ['contado', 'efectivo', 'de una'] },
        { id: 'pag_cuotas', title: 'Financiado', value: 'financiado', synonyms: ['financiado', 'financiar', 'financiacion', 'financiación', 'credito', 'crédito', 'cuotas', 'cesantias', 'cesantías', 'banco'] },
        { id: 'pag_separe', title: 'Plan Separe', value: 'plan separe', synonyms: ['plan separe', 'separe', 'separar', 'apartar'] },
      ],
    },
    {
      id: 'recomendar', kind: 'recommend', route: 'reflectores', title: 'Reflectores (1 a 3 opciones)',
      message: 'Estos son nuestros reflectores solares 👇 Funcionan con energía solar y se encienden solos en la noche.',
    },
    {
      id: 'handoff', kind: 'handoff', route: 'todas', title: 'Traspaso al asesor',
      message: '¡Listo! 🙌 Ya tengo lo necesario. Un asesor de {empresa} revisa tu consumo y te envía tu cotización gratis y sin compromiso.',
    },
  ],
  triggers: [
    { id: 't_precio', label: 'Pregunta el precio', intent: 'precio', handoff: false, score: 15, keywords: ['precio', 'cuanto vale', 'cuánto vale', 'cuanto cuesta', 'cuánto cuesta', 'valor', 'cuanto sale', 'cuánto sale'] },
    { id: 't_compra', label: 'Quiere contratar o pagar', intent: 'compra', handoff: true, score: 35, moveTo: 'negociacion', keywords: ['contratar', 'firmar el contrato', 'hagamos el negocio', 'como pago', 'cómo pago'] },
    { id: 't_pago', label: 'Envía comprobante de pago', intent: 'pago', handoff: true, score: 50, moveTo: 'pago', keywords: ['comprobante', 'ya pague', 'ya pagué', 'ya transferi', 'ya transferí', 'consignacion', 'consignación'] },
    { id: 't_soporte', label: 'Garantía o falla de su sistema', intent: 'soporte', handoff: true, score: 10, keywords: ['garantia', 'garantía', 'falla', 'dano', 'daño', 'no funciona', 'no prende', 'reparacion', 'reparación', 'ya soy cliente'] },
    { id: 't_humano', label: 'Pide una persona, una llamada o la visita', intent: 'humano', handoff: true, score: 5, keywords: ['asesor', 'asesora', 'humano', 'persona', 'hablar con alguien', 'llamar', 'llamada', 'llamen', 'llamenme', 'llámenme', 'agendar visita', 'agendar la visita'] },
  ],
  followUps: [
    { afterHours: 2, message: '{nombre}, ¿pudiste buscar tu recibo de luz? 📸 Con una foto (o el NIC) te hacemos la cotización gratis.' },
    { afterHours: 20, message: 'Hola {nombre} ☀️ Lo que hoy pagas de luz puede convertirse en tu inversión. ¿Seguimos con tu cotización gratis? Solo envíanos la foto del recibo o el NIC.' },
    { afterHours: 72, message: 'Última consulta, {nombre}: ¿aún te interesa tu sistema solar? Si prefieres, un asesor te llama para resolver tus dudas.' },
  ],
  remarketing: { enabled: true, stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'], withAdvisor: true, loseAfterHours: 72 },
  persona: {
    botName: 'Sol',
    role: 'asistente virtual de energía solar',
    tone: 'cercano',
    objective: 'Conseguir los datos que el asesor necesita para cotizar gratis un sistema de energía solar (tipo de propiedad, ubicación, cuánto paga de luz y el recibo o el NIC) y pasar al cliente con un asesor con todo listo.',
    rules: [
      'Nunca des precios de proyectos: dependen del consumo y los envía el asesor en la cotización.',
      'Haz una sola pregunta por mensaje y espera la respuesta.',
      'Pide siempre la foto del recibo de luz (por delante y por detrás) o el NIC: es lo que permite cotizar.',
      'Nunca pidas la cédula ni datos de tarjetas por chat.',
      'No prometas porcentajes de ahorro, tiempos ni equipos que no confirme el asesor.',
      'Si pide una llamada, una visita técnica o tiene una falla en su sistema, pásalo de inmediato al asesor.',
    ],
    prompt: '',
  },
  required: [
    { key: 'nombre', label: 'Nombre', when: 'inicio', nodeId: 'saludo' },
    { key: 'ciudad', label: 'Ciudad', when: 'inicio', nodeId: 'pedir_ciudad' },
  ],
  faqs: [
    { id: 'faq_precio', keywords: ['precio', 'cuanto vale', 'cuánto vale', 'cuanto cuesta', 'cuánto cuesta', 'cuanto sale', 'cuánto sale', 'costo'], answer: '💡 El valor depende de tu consumo de energía: por eso te pedimos el recibo de luz. Con él, un asesor te envía la cotización gratis y sin compromiso.' },
    { id: 'faq_separe', keywords: ['plan separe'], answer: '📌 Con el *Plan Separe* apartas tu proyecto con el 10% del valor y empezamos el trámite ante el operador de red. Luego completas hasta el 60% en 4 meses para iniciar la construcción, y el 40% final lo pagas en cuotas sin intereses.' },
    { id: 'faq_pago', keywords: ['financiacion', 'financiación', 'financian', 'financiamiento', 'credito', 'crédito', 'formas de pago', 'forma de pago', 'cuota inicial', 'cesantias', 'cesantías'], answer: '💳 Tienes varias opciones: pagar el 50% al firmar y el resto en cuotas sin intereses con nosotros, apartar tu proyecto con el *Plan Separe* (desde el 10%), o financiarlo con tu banco o con tus cesantías. El asesor te explica cuál te conviene.' },
    { id: 'faq_tramites', keywords: ['operador de red', 'afinia', 'tramite', 'trámite', 'tramites', 'trámites', 'permisos', 'contador', 'medidor', 'retie'], answer: '📄 Nosotros nos encargamos de los trámites ante el operador de red. El cambio de medidor y la certificación toman normalmente de 3 a 6 meses.' },
    { id: 'faq_mantenimiento', keywords: ['mantenimiento', 'mantenimientos'], answer: '🔧 Te obsequiamos el primer mantenimiento preventivo anual de tu sistema.' },
    { id: 'faq_baterias', keywords: ['bateria', 'batería', 'baterias', 'baterías', 'hibrido', 'híbrido', 'aislado'], answer: '🔋 Normalmente recomendamos un sistema interconectado a la red para toda la casa, porque los sistemas con baterías (híbridos o aislados) cuestan bastante más. Si necesitas baterías, el asesor te cotiza las dos opciones.' },
    { id: 'faq_visita', keywords: ['visita tecnica', 'visita técnica', 'sin compromiso'], answer: '🏠 La cotización es gratis y sin compromiso. En la visita técnica revisamos tu techo y tu instalación para ajustar la propuesta.' },
  ],
  messages: {
    greeting: '¡Hola! 👋 Soy {bot}, el asistente virtual de {empresa} ☀️.',
    nameAck: 'Mucho gusto, {nombre} 😊',
    backToFlow: 'Ahora sí, sigamos 😊',
    handoff: '¡Listo! 🙌 Ya le pasé tus datos a un asesor de {empresa}: te escribe en breve. Recuerda que la cotización es gratis y sin compromiso.',
    askNameAgain: 'Para ayudarte con tu cotización, ¿cómo te llamas y desde qué ciudad o municipio nos escribes?',
    handoffHuman: 'Con gusto 😊 Un asesor de {empresa} te contacta en breve.',
    handoffSupport: 'Entiendo. Le paso tu caso a un asesor de {empresa} para que te ayude de inmediato.',
    showOthers: 'Claro, te muestro otras opciones.',
    noMoreOptions: 'Ya te mostré todas las opciones que tengo. Te paso con un asesor.',
    noneLiked: 'Entiendo 😊. Cuéntame qué buscas exactamente y te ayudo, o le pido a un asesor que te contacte.',
    notUnderstood: 'Perdona, no te entendí bien. ¿Me lo puedes decir de otra forma o elegir una opción?',
    productIntro: '¡Claro! Mira lo que tenemos 👇',
    detailsCta: '¿Te gusta esta opción?',
    noPrices: 'El valor depende de tu consumo de energía: un asesor te envía la cotización gratis.',
    askProduct: '¡Con gusto te ayudo! 😊 ¿Qué te gustaría cotizar?',
  },
};

/** Plantillas de flujo que se pueden asignar al crear un cliente. */
export const FLOW_TEMPLATES = {
  evosport: { name: 'Gimnasio / máquinas (EvoSport)', flow: DEFAULT_FLOW },
  generico: { name: 'Genérico (cualquier negocio)', flow: GENERIC_FLOW },
  solar: { name: 'Energía solar (TECSOLAR)', flow: SOLAR_FLOW },
} satisfies Record<string, { name: string; flow: FlowConfig }>;
export type FlowTemplateId = keyof typeof FLOW_TEMPLATES;
export const FLOW_TEMPLATE_IDS = Object.keys(FLOW_TEMPLATES) as [FlowTemplateId, ...FlowTemplateId[]];
