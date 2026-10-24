/**
 * Reglas de los mensajes automáticos (puras, sin I/O):
 *  - Remarketing cuando el cliente deja de contestar.
 *  - Alertas de compra ("prueba social") a los leads inactivos.
 * Respetan la ventana de 24 h de WhatsApp/Meta: fuera de ella solo plantillas aprobadas.
 */
import { DEFAULT_REMARKETING, FlowConfig, PRODUCT_IMAGE } from './flow';
import { ChannelType, Conversation, Product, SocialProofConfig, WaTemplate } from './models';
import { OutgoingDraft } from './products';
import { NO_CITY } from './seller';
import { templateDrafts, TemplateVars } from './templates';
import { HOUR } from './time';

/** Canales con ventana de 24 h: fuera de ella solo se permiten plantillas aprobadas. */
const WINDOW_CHANNELS: ChannelType[] = ['whatsapp', 'messenger', 'instagram'];

export interface AutoContext {
  products: Product[];
  templates: WaTemplate[];
  companyName: string;
  now: number;
}

/** Producto de interés del cliente (para {producto} y la foto). */
export function interestProduct(conv: Conversation, products: Product[]): Product | undefined {
  const byName = conv.fields.modeloInteres && products.find((p) => p.name === conv.fields.modeloInteres);
  const id = conv.intent?.productIds?.[0] ?? conv.bot.lastProductIds[0];
  return byName || products.find((p) => p.id === id);
}

/** Reemplaza {nombre}, {producto}, {empresa} y otras variables; limpia los huecos si falta alguna. */
export function fillVars(text: string, vars: Record<string, string | undefined>): string {
  return (text ?? '')
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] ?? '' : m))
    .replace(/^[\s,;:]+/, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Variables de los mensajes automáticos. */
export interface MessageVars extends TemplateVars {
  [extra: string]: string;
}

export function convVars(conv: Conversation, products: Product[], companyName: string): MessageVars {
  const p = interestProduct(conv, products);
  return {
    nombre: conv.name && conv.name !== 'Cliente' ? conv.name.split(' ')[0] : '',
    producto: p?.name ?? (conv.fields.subcategoria || 'producto'),
    empresa: companyName,
  };
}

/** ¿Pasaron más de 24 h desde el último mensaje del cliente en un canal que lo exige? */
export function outsideWindow(conv: Conversation, now: number): boolean {
  const lastIn = conv.lastInboundAt ?? conv.waitingSince ?? conv.bot.awaitingSince ?? now;
  return WINDOW_CHANNELS.includes(conv.channel) && now - lastIn > 24 * HOUR;
}

/**
 * Mensaje automático listo para enviar respetando las reglas del canal:
 * dentro de la ventana, texto (o imagen con texto); fuera, plantilla aprobada de WhatsApp, o nada.
 */
export function autoDraft(
  conv: Conversation,
  ax: AutoContext,
  text: string,
  imageUrl: string | undefined,
  templateId: string | undefined,
  extraVars: Record<string, string> = {},
): { draft?: OutgoingDraft; skipped?: string } {
  const vars: MessageVars = { ...convVars(conv, ax.products, ax.companyName), ...extraVars };
  // "Foto del producto que le interesa": cada cliente recibe la de su producto (si no hay, va sin imagen).
  if (imageUrl === PRODUCT_IMAGE) imageUrl = interestProduct(conv, ax.products)?.imageUrl || undefined;
  const body = fillVars(text, vars);
  if (!outsideWindow(conv, ax.now)) {
    return { draft: imageUrl ? { type: 'image', text: body, imageUrl } : { type: 'text', text: body } };
  }
  const tpl = templateId ? ax.templates.find((t) => t.id === templateId) : undefined;
  if (conv.channel === 'whatsapp' && tpl && (tpl.status === 'APPROVED' || conv.simulated)) {
    const [draft] = templateDrafts(tpl, ax.products, vars, true);
    return { draft: { ...draft, type: 'template', imageUrl: imageUrl || draft.imageUrl } };
  }
  return {
    skipped: conv.channel === 'whatsapp'
      ? 'pasaron más de 24 h desde el último mensaje del cliente y WhatsApp exige una plantilla aprobada'
      : `pasaron más de 24 h desde el último mensaje del cliente y ${conv.channel === 'instagram' ? 'Instagram' : 'Messenger'} no permite mensajes promocionales`,
  };
}

export interface FollowUpAction {
  message?: OutgoingDraft;
  patch: Partial<Conversation>;
  note?: string;
}

/** Siguiente paso de remarketing de una conversación (o null si no toca nada todavía). */
export function followUpDue(conv: Conversation, flow: FlowConfig, ax: AutoContext): FollowUpAction | null {
  const rm = { ...DEFAULT_REMARKETING, ...(flow.remarketing ?? {}) };
  const since = conv.waitingSince ?? conv.bot.awaitingSince;
  if (!rm.enabled || !since) return null;
  if (!rm.stages.includes(conv.stage)) return null;
  if (!conv.botActive && !rm.withAdvisor) return null;
  const step = conv.bot.followUpStep ?? 0;
  const elapsedH = (ax.now - since) / HOUR;
  const steps = flow.followUps ?? [];
  if (step < steps.length && elapsedH >= steps[step].afterHours) {
    const st = steps[step];
    const label = `Remarketing ${step + 1}/${steps.length}`;
    const out = autoDraft(conv, ax, st.message, st.imageUrl || undefined, st.templateId || undefined);
    return {
      message: out.draft,
      patch: { bot: { ...conv.bot, followUpStep: step + 1 } },
      note: out.draft ? `📣 ${label} enviado (${Math.round(elapsedH)} h sin respuesta)` : `⏭️ ${label} no enviado: ${out.skipped}`,
    };
  }
  const last = steps[steps.length - 1];
  if (steps.length && step >= steps.length && rm.loseAfterHours > 0 && elapsedH >= last.afterHours + rm.loseAfterHours) {
    return {
      patch: { stage: 'perdido', stageChangedAt: ax.now, hot: false, botActive: false, waitingSince: null, bot: { ...conv.bot, awaitingSince: undefined } },
      note: 'Sin respuesta tras el remarketing: pasa a Perdido',
    };
  }
  return null;
}

export const DEFAULT_SOCIAL_PROOF: SocialProofConfig = {
  enabled: false,
  triggerStage: 'pago',
  inactiveHours: 1,
  stages: ['calificando', 'asesor', 'cotizacion', 'negociacion'],
  sameCategoryOnly: true,
  cooldownHours: 24,
  maxRecipients: 100,
  message: '🔥 Un cliente de {ciudad_comprador} acaba de comprar {producto}. Aún quedan unidades con el descuento de esta semana. {nombre}, ¿quieres que te ayude con tu compra?',
  includeImage: true,
};

/** Alerta de compra para un lead: nunca menciona quién compró, solo su ciudad. */
export function socialProofDraft(
  cfg: SocialProofConfig,
  buyer: Conversation,
  recipient: Conversation,
  product: Product | undefined,
  ax: AutoContext,
): { draft?: OutgoingDraft; skipped?: string } {
  const city = buyer.fields.ciudad && buyer.fields.ciudad !== NO_CITY ? buyer.fields.ciudad : 'nuestra tienda';
  return autoDraft(recipient, ax, cfg.message, cfg.includeImage ? product?.imageUrl : undefined, cfg.templateId, {
    producto: product?.name ?? 'uno de nuestros productos',
    ciudad_comprador: city,
  });
}
