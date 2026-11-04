/** Catálogo en el chat: recomendación, tarjetas del carrusel, ficha técnica y detección de productos. */
import { Availability, CartItem, ChatMessage, Conversation, Product, ProductCard, ProductVariant } from './models';
import { includesWord, normalize } from './text';

/** Mensaje saliente antes de guardarse (sin id, conversación ni fecha). */
export type OutgoingDraft = Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt' | 'direction' | 'sender'>;

/** Prefijos de los botones que entiende el bot. */
export const BTN = {
  details: 'det_',
  select: 'sel_',
  variant: 'var_',
  more: 'more_options',
  none: 'none_liked',
  cartDone: 'cart_done',
  cartMore: 'cart_more',
} as const;

/** Separa el producto y la opción en el botón de una opción. */
const VARIANT_SEP = '~';

export const variantButtonId = (p: Product, v: ProductVariant) => BTN.variant + p.id + VARIANT_SEP + v.id;

/** Producto y opción de un botón de opción. */
export function parseVariantButton(id: string, products: Product[]): { product: Product; variant: ProductVariant } | null {
  const [productId, variantId] = id.slice(BTN.variant.length).split(VARIANT_SEP);
  const product = products.find((p) => p.id === productId);
  const variant = product?.variants?.find((v) => v.id === variantId);
  return product && variant ? { product, variant } : null;
}

export const hasVariants = (p: Product) => (p.variants?.length ?? 0) > 0;

/** "Peso", "Talla"… con mayúscula inicial, para mostrarlo en la tarjeta y en la ficha. */
const optionsTitle = (p: Product) => {
  const name = p.variantName || 'Opciones';
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));

/** Opción que nombra un texto ("las de 10 kg", "talla m", "2,5"). Si no hay una sola que coincida, ninguna. */
export function matchVariant(p: Product, text: string): ProductVariant | undefined {
  const variants = p.variants ?? [];
  const numbers = numbersIn(text);
  const byNumber = variants.filter((v) => {
    const n = numbersIn(v.label);
    return n.length === 1 && numbers.includes(n[0]);
  });
  // "De 2,5 a 10 kg" es un rango, no una elección: se le pregunta.
  if (byNumber.length > 1) return undefined;
  const t = normalize(text);
  const named = variants.filter((v) => includesWord(t, v.label));
  if (named.length === 1) return named[0];
  return byNumber[0];
}

/** Valor estimado del pedido ("2-3" cuenta como 2, "4+" como 4; sin cantidad, 1). */
export function cartValue(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + i.price * (parseInt(i.qty, 10) || 1), 0);
}

/** "2-3 × Evo Latte, 1 × Mancuernas" */
export function cartText(cart: CartItem[], sep = ', '): string {
  return cart.map((i) => `${i.qty || '1'} × ${i.name}`).join(sep);
}

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
  const options = hasVariants(p) ? `${optionsTitle(p)}: ${p.variants!.map((v) => v.label).join(', ')}` : '';
  const subtitle = [options.length > 70 ? `${p.variants!.length} opciones` : options, p.maxUserKg ? `Soporta ${p.maxUserKg} kg` : '', p.mode === 'caminar' ? 'Solo caminar' : '', AVAIL_LABEL[p.availability]]
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
  const options = hasVariants(p) ? [{ label: optionsTitle(p), value: p.variants!.map((v) => v.label).join(', ') }] : [];
  const specs = [...options, ...p.specs].map((s) => `• *${s.label}:* ${s.value}`).join('\n');
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

/** "Ver detalles": el video del producto (si tiene) y luego la ficha con los botones. */
export function productDetails(p: Product, companyName = ''): OutgoingDraft[] {
  const video: OutgoingDraft[] = p.videoUrl ? [{ type: 'video', videoUrl: p.videoUrl, text: `🎬 ${p.name}` }] : [];
  return [...video, productDetail(p, companyName)];
}

/** Productos mencionados en un texto libre ("¿tienen caminadoras?"). */
export function detectProducts(text: string, products: Product[]): Product[] {
  const t = normalize(text);
  return products.filter((p) => p.active && p.keywords.some((k) => includesWord(t, k)));
}
