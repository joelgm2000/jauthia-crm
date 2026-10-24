/** Datos iniciales: catálogo EvoSport, plantillas de WhatsApp, canales y configuración. */
import { ChannelConfig, CrmSettings, Product, WaTemplate } from './models';

const img = (sub: string) => `/products/${sub}.svg`;

export const SEED_PRODUCTS: Product[] = [
  // Cardio
  {
    id: 'trot-latte', name: 'Trotadora Latte', category: 'cardio', subcategory: 'trotadora', line: 'hogar',
    keywords: ['trotadora', 'caminadora', 'caminador', 'banda', 'cinta', 'latte'], imageUrl: img('trotadora'),
    price: 1890000, availability: 'tienda', maxUserKg: 100, mode: 'caminar', active: true,
    description: 'Caminadora compacta y plegable, ideal para caminar en casa.',
    specs: [{ label: 'Motor', value: '1.5 HP' }, { label: 'Velocidad', value: '1 a 8 km/h' }, { label: 'Peso máx.', value: '100 kg' }, { label: 'Uso', value: 'Solo caminar' }],
  },
  {
    id: 'trot-vigor', name: 'Trotadora Vigor', category: 'cardio', subcategory: 'trotadora', line: 'hogar',
    keywords: ['trotadora', 'caminadora', 'caminador', 'banda', 'cinta', 'vigor'], imageUrl: img('trotadora'),
    price: 2490000, availability: 'tienda', maxUserKg: 100, mode: 'trotar', active: true,
    description: 'Trotadora para hogar con inclinación automática y 12 programas.',
    specs: [{ label: 'Motor', value: '2.0 HP' }, { label: 'Velocidad', value: '1 a 14 km/h' }, { label: 'Inclinación', value: 'Automática 12 niveles' }, { label: 'Peso máx.', value: '100 kg' }],
  },
  {
    id: 'trot-evoflex', name: 'Trotadora Evo Flex', category: 'cardio', subcategory: 'trotadora', line: 'hogar',
    keywords: ['trotadora', 'caminadora', 'caminador', 'banda', 'cinta', 'evo flex'], imageUrl: img('trotadora'),
    price: 3290000, availability: 'bodega', maxUserKg: 115, mode: 'trotar', active: true,
    description: 'Trotadora con amortiguación de 8 puntos, pantalla LCD y bluetooth.',
    specs: [{ label: 'Motor', value: '2.75 HP' }, { label: 'Velocidad', value: '1 a 16 km/h' }, { label: 'Banda', value: '50 x 140 cm' }, { label: 'Peso máx.', value: '115 kg' }],
  },
  {
    id: 'trot-shark', name: 'Trotadora Shark Pro', category: 'cardio', subcategory: 'trotadora', line: 'profesional',
    keywords: ['trotadora', 'caminadora', 'caminador', 'banda', 'cinta', 'shark'], imageUrl: img('trotadora'),
    price: 6990000, availability: 'bodega', maxUserKg: 130, mode: 'trotar', active: true,
    description: 'Trotadora semiprofesional para gimnasios y usuarios exigentes.',
    specs: [{ label: 'Motor', value: '4.0 HP AC' }, { label: 'Velocidad', value: '1 a 20 km/h' }, { label: 'Banda', value: '56 x 155 cm' }, { label: 'Peso máx.', value: '130 kg' }],
  },
  {
    id: 'elip-e300', name: 'Elíptica Evo E300', category: 'cardio', subcategory: 'eliptica', line: 'hogar',
    keywords: ['eliptica', 'elíptica', 'elipticas'], imageUrl: img('eliptica'),
    price: 1790000, availability: 'tienda', maxUserKg: 120, active: true,
    description: 'Elíptica magnética silenciosa, 8 niveles de resistencia.',
    specs: [{ label: 'Volante', value: '8 kg' }, { label: 'Resistencia', value: 'Magnética 8 niveles' }, { label: 'Peso máx.', value: '120 kg' }],
  },
  {
    id: 'elip-pro', name: 'Elíptica Pro X9', category: 'cardio', subcategory: 'eliptica', line: 'institucional',
    keywords: ['eliptica', 'elíptica', 'elipticas'], imageUrl: img('eliptica'),
    price: 4590000, availability: 'agotado', maxUserKg: 150, active: true,
    description: 'Elíptica institucional con volante de 14 kg y zancada de 50 cm.',
    specs: [{ label: 'Volante', value: '14 kg' }, { label: 'Zancada', value: '50 cm' }, { label: 'Peso máx.', value: '150 kg' }],
  },
  {
    id: 'spin-s20', name: 'Spinning Evo S20', category: 'cardio', subcategory: 'spinning', line: 'hogar',
    keywords: ['spinning', 'bicicleta', 'bici', 'cicla'], imageUrl: img('spinning'),
    price: 1290000, availability: 'tienda', maxUserKg: 120, active: true,
    description: 'Bicicleta de spinning con volante de 18 kg y freno de fieltro.',
    specs: [{ label: 'Volante', value: '18 kg' }, { label: 'Ajustes', value: 'Sillín y manubrio' }, { label: 'Peso máx.', value: '120 kg' }],
  },
  {
    id: 'spin-s50', name: 'Spinning Pro S50', category: 'cardio', subcategory: 'spinning', line: 'profesional',
    keywords: ['spinning', 'bicicleta', 'bici', 'cicla'], imageUrl: img('spinning'),
    price: 2690000, availability: 'bodega', maxUserKg: 150, active: true,
    description: 'Bicicleta de spinning profesional con resistencia magnética para salones.',
    specs: [{ label: 'Volante', value: '22 kg' }, { label: 'Resistencia', value: 'Magnética' }, { label: 'Peso máx.', value: '150 kg' }],
  },
  // Fuerza
  {
    id: 'multi-1500', name: 'Multigimnasio Evo 1500', category: 'fuerza', subcategory: 'multigimnasio', line: 'hogar',
    keywords: ['multigimnasio', 'multifuncional', 'gimnasio en casa'], imageUrl: img('multigimnasio'),
    price: 3890000, availability: 'tienda', minCeilingCm: 220, active: true,
    description: 'Multigimnasio con torre de 70 kg, pec deck, polea alta y baja.',
    specs: [{ label: 'Torre de peso', value: '70 kg' }, { label: 'Altura', value: '210 cm' }, { label: 'Techo mínimo', value: '2.20 m' }],
  },
  {
    id: 'multi-3000', name: 'Multigimnasio Pro 3000', category: 'fuerza', subcategory: 'multigimnasio', line: 'profesional',
    keywords: ['multigimnasio', 'multifuncional'], imageUrl: img('multigimnasio'),
    price: 8900000, availability: 'bodega', minCeilingCm: 240, active: true,
    description: 'Estación de 4 puestos para gimnasios, torres de 90 kg.',
    specs: [{ label: 'Puestos', value: '4' }, { label: 'Torres', value: '2 x 90 kg' }, { label: 'Techo mínimo', value: '2.40 m' }],
  },
  {
    id: 'jaula-4900', name: 'Jaula 4900', category: 'fuerza', subcategory: 'jaula', line: 'hogar',
    keywords: ['jaula', 'rack', 'power rack'], imageUrl: img('jaula'),
    price: 2990000, availability: 'tienda', minCeilingCm: 230, active: true,
    description: 'Jaula de potencia para hogar con barra de dominadas y safeties.',
    specs: [{ label: 'Altura', value: '220 cm' }, { label: 'Capacidad', value: '300 kg' }, { label: 'Techo mínimo', value: '2.30 m' }],
  },
  {
    id: 'jaula-raptor', name: 'Super Jaula Raptor', category: 'fuerza', subcategory: 'jaula', line: 'profesional',
    keywords: ['jaula', 'rack', 'raptor'], imageUrl: img('jaula'),
    price: 7490000, availability: 'agotado', minCeilingCm: 250, active: true,
    description: 'Jaula profesional con poleas, landmine y soportes olímpicos.',
    specs: [{ label: 'Altura', value: '240 cm' }, { label: 'Capacidad', value: '500 kg' }, { label: 'Techo mínimo', value: '2.50 m' }],
  },
  {
    id: 'smith-4900', name: 'Smith 4900', category: 'fuerza', subcategory: 'smith', line: 'institucional',
    keywords: ['smith', 'multipower'], imageUrl: img('smith'),
    price: 5290000, availability: 'bodega', minCeilingCm: 230, active: true,
    description: 'Máquina Smith con contrapeso y rieles lineales.',
    specs: [{ label: 'Altura', value: '225 cm' }, { label: 'Barra', value: 'Contrapesada' }, { label: 'Techo mínimo', value: '2.30 m' }],
  },
  {
    id: 'prensa-45', name: 'Prensa 45°', category: 'fuerza', subcategory: 'prensa', line: 'institucional',
    keywords: ['prensa', 'prensa de pierna'], imageUrl: img('prensa'),
    price: 4790000, availability: 'tienda', minCeilingCm: 200, active: true,
    description: 'Prensa de pierna a 45° con hack squat.',
    specs: [{ label: 'Carga máx.', value: '400 kg' }, { label: 'Techo mínimo', value: '2.00 m' }],
  },
  // Peso libre
  {
    id: 'manc-hex', name: 'Mancuernas hexagonales', category: 'peso-libre', subcategory: 'mancuernas', line: 'hogar',
    keywords: ['mancuerna', 'mancuernas', 'pesas'], imageUrl: img('mancuernas'),
    price: 18000, availability: 'tienda', active: true,
    description: 'Mancuernas hexagonales recubiertas en caucho. Precio por kg.',
    specs: [{ label: 'Rango', value: '2,5 a 40 kg' }, { label: 'Regla de pares', value: '2,5–10 kg: 4 pares · 12,5–17,5: 2 · 20+: 1' }],
  },
  {
    id: 'barra-olimpica', name: 'Barra olímpica 20 kg', category: 'peso-libre', subcategory: 'barras', line: 'institucional',
    keywords: ['barra', 'barras', 'barra olimpica'], imageUrl: img('barras'),
    price: 690000, availability: 'tienda', active: true,
    description: 'Barra olímpica de 2,20 m con rodamientos.',
    specs: [{ label: 'Peso', value: '20 kg' }, { label: 'Largo', value: '220 cm' }],
  },
  {
    id: 'barra-z', name: 'Barra Z', category: 'peso-libre', subcategory: 'barras', line: 'hogar',
    keywords: ['barra', 'barras', 'barra z'], imageUrl: img('barras'),
    price: 210000, availability: 'tienda', active: true,
    description: 'Barra Z para bíceps y tríceps.', specs: [{ label: 'Largo', value: '120 cm' }],
  },
  {
    id: 'discos-olimp', name: 'Discos olímpicos', category: 'peso-libre', subcategory: 'discos', line: 'institucional',
    keywords: ['disco', 'discos'], imageUrl: img('discos'),
    price: 14000, availability: 'bodega', active: true,
    description: 'Discos olímpicos de caucho. Precio por kg.', specs: [{ label: 'Agujero', value: '50 mm' }, { label: 'Pesos', value: '2,5 a 25 kg' }],
  },
  {
    id: 'banco-multi', name: 'Banco multiposición', category: 'peso-libre', subcategory: 'bancos', line: 'hogar',
    keywords: ['banco', 'bancos'], imageUrl: img('bancos'),
    price: 790000, availability: 'tienda', active: true,
    description: 'Banco plano, inclinado y declinado.', specs: [{ label: 'Posiciones', value: '7' }, { label: 'Capacidad', value: '250 kg' }],
  },
  // Accesorios
  { id: 'colchoneta', name: 'Colchoneta 1 cm', category: 'accesorios', subcategory: 'colchonetas', line: 'hogar', keywords: ['colchoneta', 'colchonetas', 'tapete', 'mat'], imageUrl: img('colchonetas'), price: 65000, availability: 'tienda', active: true, description: 'Colchoneta antideslizante.', specs: [{ label: 'Medidas', value: '180 x 60 x 1 cm' }] },
  { id: 'step', name: 'Step aeróbico', category: 'accesorios', subcategory: 'steps', line: 'hogar', keywords: ['step', 'steps'], imageUrl: img('steps'), price: 120000, availability: 'tienda', active: true, description: 'Step con 3 alturas.', specs: [{ label: 'Alturas', value: '10 / 15 / 20 cm' }] },
  { id: 'cuerda', name: 'Cuerda de saltar pro', category: 'accesorios', subcategory: 'cuerdas', line: 'hogar', keywords: ['cuerda', 'cuerdas', 'lazo'], imageUrl: img('cuerdas'), price: 45000, availability: 'tienda', active: true, description: 'Cuerda con rodamientos.', specs: [{ label: 'Largo', value: '3 m ajustable' }] },
  { id: 'piso-caucho', name: 'Piso de caucho 1 m²', category: 'accesorios', subcategory: 'piso', line: 'institucional', keywords: ['piso', 'caucho', 'piso de caucho'], imageUrl: img('piso'), price: 98000, availability: 'bodega', active: true, description: 'Loseta de caucho de alta densidad.', specs: [{ label: 'Espesor', value: '15 mm' }] },
];

export const SEED_TEMPLATES: WaTemplate[] = [
  {
    id: 'tpl_bienvenida', name: 'bienvenida_evosport', category: 'MARKETING', kind: 'buttons', language: 'es',
    header: 'EvoSport', body: '¡Hola {{1}}! 👋 Gracias por escribir a EvoSport. ¿Qué equipo estás buscando?',
    footer: 'Máquinas de gimnasio · Valledupar',
    buttons: [{ id: 'cat_cardio', title: 'Cardio' }, { id: 'cat_fuerza', title: 'Fuerza' }, { id: 'cat_peso', title: 'Peso libre' }],
    status: 'APPROVED',
  },
  {
    id: 'tpl_carrusel_trot', name: 'carrusel_trotadoras', category: 'MARKETING', kind: 'carousel', language: 'es',
    body: 'Estas son nuestras trotadoras más vendidas 🏃 Toca *Ver detalles* para ver la ficha técnica.',
    buttons: [], productIds: ['trot-latte', 'trot-vigor', 'trot-evoflex'], status: 'APPROVED',
  },
  {
    id: 'tpl_ficha', name: 'ficha_producto', category: 'MARKETING', kind: 'product', language: 'es',
    body: 'Te comparto la ficha de {{1}}. ¿Te gustaría que una asesora te envíe la cotización con tu descuento?',
    buttons: [{ id: 'quiero_cotizacion', title: 'Quiero cotización' }, { id: 'more_options', title: 'Ver otras opciones' }],
    productIds: ['trot-evoflex'], status: 'APPROVED',
  },
  {
    id: 'tpl_cotizacion', name: 'cotizacion_enviada', category: 'UTILITY', kind: 'buttons', language: 'es',
    header: 'Tu cotización está lista 📄',
    body: 'Hola {{1}}, te enviamos la cotización de {{2}} con tu descuento. Pagando en efectivo o transferencia tienes 15 a 20 % de descuento.',
    footer: 'Envío e instalación gratis en Valledupar',
    buttons: [{ id: 'pagar', title: 'Quiero pagar' }, { id: 'apartar', title: 'Apartar' }, { id: 'asesor', title: 'Hablar con asesora' }],
    status: 'APPROVED',
  },
  {
    id: 'tpl_seguimiento', name: 'seguimiento_24h', category: 'MARKETING', kind: 'buttons', language: 'es',
    body: '¿Pudiste revisar la propuesta de EvoSport? Si quieres, te ayudo a elegir o ajustar la cotización.',
    buttons: [{ id: 'more_options', title: 'Ver otras opciones' }, { id: 'asesor', title: 'Hablar con asesora' }],
    status: 'APPROVED',
  },
  {
    id: 'tpl_remarketing', name: 'remarketing_evosport', category: 'MARKETING', kind: 'buttons', language: 'es',
    body: 'Hola {{1}} 👋 ¿Aún te interesa {{2}}? Esta semana tenemos descuento especial pagando en efectivo o transferencia.',
    footer: 'Responde este mensaje y una asesora te atiende',
    buttons: [{ id: 'asesor', title: 'Sí, me interesa' }, { id: 'more_options', title: 'Ver otras opciones' }],
    status: 'PENDING',
  },
  {
    id: 'tpl_pago', name: 'pago_confirmado', category: 'UTILITY', kind: 'text', language: 'es',
    header: '✅ Pago confirmado',
    body: '¡Gracias {{1}}! Recibimos tu pago. Te enviaremos la factura electrónica a {{2}} y coordinaremos la entrega e instalación.',
    buttons: [], status: 'APPROVED',
  },
];

export const SEED_CHANNELS: ChannelConfig[] = [
  { id: 'whatsapp', enabled: true, connected: false, botEnabled: true, accountName: 'EvoSport WhatsApp Business' },
  { id: 'instagram', enabled: true, connected: false, botEnabled: true, accountName: '@evosport' },
  { id: 'messenger', enabled: true, connected: false, botEnabled: true, accountName: 'EvoSport Colombia' },
  { id: 'telegram', enabled: false, connected: false, botEnabled: true },
  { id: 'tiktok', enabled: false, connected: false, botEnabled: false },
  { id: 'webchat', enabled: true, connected: true, botEnabled: true, accountName: 'Widget del sitio web' },
  { id: 'email', enabled: false, connected: false, botEnabled: false },
];

export const SEED_SETTINGS: CrmSettings = {
  companyName: 'EvoSport',
  freeShippingCity: 'Valledupar',
  hotThreshold: 70,
  minMessagesForHot: 3,
  catalog: {
    gymFilters: true,
    currency: 'COP',
    categories: [
      { id: 'cardio', name: 'Cardio', subcategories: ['trotadora', 'eliptica', 'spinning'] },
      { id: 'fuerza', name: 'Máquinas de fuerza', subcategories: ['multigimnasio', 'jaula', 'smith', 'prensa'] },
      { id: 'peso-libre', name: 'Peso libre', subcategories: ['mancuernas', 'barras', 'discos', 'bancos'] },
      { id: 'accesorios', name: 'Accesorios', subcategories: ['colchonetas', 'steps', 'cuerdas', 'piso'] },
    ],
  },
  hours: {
    timezone: 'America/Bogota',
    days: {
      '0': [],
      '1': ['08:30-12:30', '14:30-18:30'],
      '2': ['08:30-12:30', '14:30-18:30'],
      '3': ['08:30-12:30', '14:30-18:30'],
      '4': ['08:30-12:30', '14:30-18:30'],
      '5': ['08:30-12:30', '14:30-18:30'],
      '6': ['09:00-17:00'],
    },
    outOfHoursMessage: '🕑 Nuestro horario es L a V de 8:30 a 12:30 y 2:30 a 6:30, sábados de 9:00 a 5:00. Una asesora te escribe a primera hora.',
  },
  advisors: [
    { id: 'adv_laura', name: 'Laura Gómez', email: 'laura@evosport.co', active: true },
    { id: 'adv_diana', name: 'Diana Ríos', email: 'diana@evosport.co', active: true },
  ],
  discounts: [
    { label: 'Efectivo o transferencia', value: '15 a 20 %' },
    { label: 'Tarjeta', value: '10 %' },
    { label: 'Compras grandes', value: 'hasta 18 %' },
    { label: '2 o más productos', value: 'descuento adicional' },
    { label: 'Apartar (agotado/preventa)', value: 'anticipo 10 a 40 %, plan separe hasta 3 cuotas' },
    { label: 'Envío e instalación', value: 'Gratis en Valledupar; fuera se cotiza aparte' },
    { label: 'Garantía', value: '1 año por defectos de fábrica; mantenimiento cada 4 meses (hogar)' },
  ],
};
