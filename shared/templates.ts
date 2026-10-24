/**
 * Plantillas de WhatsApp. Las variables van por posición, igual en todo el sistema:
 * {{1}} nombre del cliente · {{2}} producto · {{3}} nombre del negocio.
 */
import { Product, WaTemplate } from './models';
import { OutgoingDraft, productCard } from './products';

export interface TemplateVars {
  nombre: string;
  producto: string;
  empresa: string;
}

/** Cuántas variables distintas ({{n}}) usa el texto. */
export function templateParamCount(body: string): number {
  return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

/** Valores de las variables en el orden {{1}}, {{2}}, {{3}}. */
export function templateParams(body: string, vars: TemplateVars): string[] {
  return [vars.nombre || 'hola', vars.producto, vars.empresa].slice(0, templateParamCount(body));
}

/** Texto con las variables reemplazadas (lo que leerá el cliente). */
export function fillTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? '');
}

/**
 * Mensajes que produce una plantilla. Si está aprobada por Meta se marca para enviarse como plantilla
 * (única forma de escribir fuera de la ventana de 24 h); si no, sale como mensaje normal.
 */
export function templateDrafts(t: WaTemplate, products: Product[], vars: TemplateVars, asTemplate = t.status === 'APPROVED'): OutgoingDraft[] {
  const prods = products.filter((p) => t.productIds?.includes(p.id));
  const prod = t.kind === 'product' ? prods[0] : undefined;
  const v = prod ? { ...vars, producto: prod.name } : vars;
  const params = templateParams(t.body, v);
  const text = fillTemplateBody(t.body, params);
  if (t.kind === 'carousel') {
    return [{ type: 'text', text }, { type: 'carousel', text: '', cards: prods.map((p) => productCard(p)) }];
  }
  return [{
    type: t.buttons.length ? 'buttons' : 'template',
    header: prod?.name ?? t.header,
    imageUrl: prod?.imageUrl ?? t.imageUrl,
    text,
    footer: t.footer,
    buttons: t.buttons,
    ...(asTemplate ? { templateName: t.name, templateParams: params } : {}),
  }];
}
