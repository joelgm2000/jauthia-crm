/** Catálogo en el chat: recomendación, tarjetas del carrusel, ficha técnica y detección de productos. */
import { Availability, ChatMessage, Conversation, Product, ProductCard } from './models';
import { includesWord, normalize } from './text';

/** Mensaje saliente antes de guardarse (sin id, conversación ni fecha). */
export type OutgoingDraft = Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt' | 'direction' | 'sender'>;

/** Prefijos de los botones que entiende el bot. */
export const BTN = {
  details: 'det_',
  select: 'sel_',
  more: 'more_options',
  none: 'none_liked',
} as const;

export const AVAIL_LABEL: Record<Availability, string> = {
  tienda: 'Disponible en tienda (entrega inmediata)',
  bodega: 'Disponible en bodega (5 a 7 días hábiles)',
  agotado: 'Agotado · se puede apartar',
};

const AVAIL_ORDER: Record<Availability, number> = { tienda: 0, bodega: 1, agotado: 2 };

/** Hasta `max` productos que cumplen lo que contó el cliente (disponibles y más económicos primero). */
export function recommend(conv: Conversation, products: Product[], max: number, exclude: string[] = []): Product[] {
  const f = conv.fields;
  return products
    .filter((p) => p.active && !exclude.includes(p.id))
    .filter((p) => !f.categoria || f.categoria === 'no-sabe' || p.category === f.categoria)
    .filter((p) => !f.subcategoria || p.subcategory === f.subcategoria)
    .filter((p) => !(f.pesoUsuario && p.maxUserKg && p.maxUserKg < f.pesoUsuario))
    .filter((p) => !(f.modoUso === 'trotar' && p.mode === 'caminar'))
    .filter((p) => !(f.alturaTecho && p.minCeilingCm && p.minCeilingCm > f.alturaTecho))
    .filter((p) => !(f.uso === 'hogar' && p.line === 'profesional' && f.categoria === 'fuerza'))
    .sort((a, b) => AVAIL_ORDER[a.availability] - AVAIL_ORDER[b.availability] || a.price - b.price)
    .slice(0, max);
}

/** Tarjeta del carrusel: imagen, "Ver detalles" y (opcional) "Lo quiero". */
export function productCard(p: Product, withSelect = true): ProductCard {
  const subtitle = [p.maxUserKg ? `Soporta ${p.maxUserKg} kg` : '', p.mode === 'caminar' ? 'Solo caminar' : '', AVAIL_LABEL[p.availability]]
    .filter(Boolean)
    .join(' · ');
  return {
    productId: p.id,
    title: p.name,
    subtitle,
    imageUrl: p.imageUrl,
    buttons: [
      { id: BTN.details + p.id, title: 'Ver detalles' },
      ...(withSelect ? [{ id: BTN.select + p.id, title: 'Lo quiero' }] : []),
    ],
  };
}

/** Ficha técnica del producto con "Lo quiero" (el pie lleva el nombre del negocio). */
export function productDetail(p: Product, companyName = ''): OutgoingDraft {
  const specs = p.specs.map((s) => `• *${s.label}:* ${s.value}`).join('\n');
  return {
    type: 'product',
    header: p.name,
    imageUrl: p.imageUrl,
    text: `${p.description}\n\n${specs}\n\n📦 ${AVAIL_LABEL[p.availability]}`,
    footer: companyName ? `${companyName} · Garantía 1 año` : 'Garantía 1 año',
    buttons: [
      { id: BTN.select + p.id, title: 'Lo quiero' },
      { id: BTN.more, title: 'Ver otras opciones' },
    ],
  };
}

/** Productos mencionados en un texto libre ("¿tienen caminadoras?"). */
export function detectProducts(text: string, products: Product[]): Product[] {
  const t = normalize(text);
  return products.filter((p) => p.active && p.keywords.some((k) => includesWord(t, k)));
}
