/**
 * Plantillas de WhatsApp ↔ Meta. El estado (aprobada, pendiente, rechazada) lo decide Meta, nunca el CRM:
 *  - submitTemplate: crea la plantilla en la cuenta de WhatsApp del cliente (queda pendiente de revisión).
 *  - syncTemplates: trae el estado real de Meta; las que no existen allá quedan "LOCAL" (solo en el CRM)
 *    y las que solo existen en Meta (hechas en WhatsApp Manager) se agregan al CRM.
 * El token solo viaja del servidor a Meta.
 */
import { WaTemplate } from '../../shared/models';
import { newId } from '../../shared/ids';
import { templateParamCount } from '../../shared/templates';
import { ApiError } from './auth';
import { GRAPH_URL } from './http';

/** Ejemplos que Meta exige para cada variable ({{1}} nombre, {{2}} producto, {{3}} negocio). */
const EXAMPLES = ['Juan', 'Trotadora EvoFlex', 'nuestra tienda', 'mañana', '10:00 a. m.'];

/** Variables seguidas desde {{1}} (Meta rechaza {{1}} y {{3}} sin {{2}}). */
export function templateProblem(t: WaTemplate): string | null {
  if (t.kind === 'carousel' || t.kind === 'product') return 'Los carruseles y fichas de producto todavía no se pueden enviar desde el CRM: créalos en WhatsApp Manager o usa una plantilla de texto o con botones.';
  if (t.imageUrl) return 'Las plantillas con imagen todavía no se pueden enviar desde el CRM: quita la imagen o créala en WhatsApp Manager.';
  if (!/^[a-z0-9_]{1,512}$/.test(t.name)) return 'El nombre solo puede tener minúsculas, números y guiones bajos.';
  const nums = [...new Set((t.body.match(/\{\{(\d+)\}\}/g) ?? []).map((x) => Number(x.replace(/\D/g, ''))))].sort((a, b) => a - b);
  if (nums.some((n, i) => n !== i + 1)) return 'Las variables deben ir seguidas: {{1}}, {{2}}, {{3}}…';
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(t.body)) return 'Meta no acepta que el mensaje empiece o termine con una variable: agrega texto antes o después.';
  if (t.category === 'AUTHENTICATION') return 'Las plantillas de autenticación se crean en WhatsApp Manager.';
  return null;
}

function components(t: WaTemplate): object[] {
  const n = templateParamCount(t.body);
  return [
    ...(t.header ? [{ type: 'HEADER', format: 'TEXT', text: t.header.slice(0, 60) }] : []),
    { type: 'BODY', text: t.body, ...(n ? { example: { body_text: [EXAMPLES.slice(0, n)] } } : {}) },
    ...(t.footer ? [{ type: 'FOOTER', text: t.footer.slice(0, 60) }] : []),
    ...(t.buttons.length ? [{ type: 'BUTTONS', buttons: t.buttons.slice(0, 3).map((b) => ({ type: 'QUICK_REPLY', text: b.title.slice(0, 25) })) }] : []),
  ];
}

async function graph(method: 'GET' | 'POST', path: string, token: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH_URL}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok) throw new ApiError(502, `Meta respondió: ${json.error?.error_user_msg || json.error?.message || res.status}`);
  return json;
}

const STATUS: Record<string, WaTemplate['status']> = { APPROVED: 'APPROVED', PENDING: 'PENDING', IN_APPEAL: 'PENDING', REJECTED: 'REJECTED', DISABLED: 'REJECTED', PAUSED: 'REJECTED' };

/** Crea la plantilla en Meta. Devuelve el estado inicial que informa Meta (normalmente PENDING). */
export async function submitToMeta(t: WaTemplate, wabaId: string, token: string): Promise<WaTemplate['status']> {
  const problem = templateProblem(t);
  if (problem) throw new ApiError(400, problem);
  const r = await graph('POST', `${encodeURIComponent(wabaId)}/message_templates`, token, {
    name: t.name, language: t.language || 'es', category: t.category, components: components(t),
  });
  return STATUS[String(r['status'] ?? 'PENDING')] ?? 'PENDING';
}

interface MetaTemplate {
  name: string;
  language: string;
  status: string;
  category: string;
  components?: { type: string; format?: string; text?: string; buttons?: { type: string; text: string }[] }[];
}

/** Estado real de Meta para cada plantilla del CRM, y las que solo existen en Meta. */
export async function syncFromMeta(local: WaTemplate[], wabaId: string, token: string): Promise<{ updated: WaTemplate[]; added: WaTemplate[] }> {
  const remote: MetaTemplate[] = [];
  let path = `${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components&limit=100`;
  for (let page = 0; page < 10 && path; page++) {
    const r = await graph('GET', path, token);
    remote.push(...((r['data'] as MetaTemplate[]) ?? []));
    const next = (r['paging'] as { next?: string } | undefined)?.next;
    path = next ? next.replace(/^https?:\/\/[^/]+\/v[\d.]+\//, '') : '';
  }
  const updated = local.map((t) => {
    const m = remote.find((x) => x.name === t.name && x.language === t.language) ?? remote.find((x) => x.name === t.name);
    return { ...t, status: m ? STATUS[m.status] ?? 'PENDING' : 'LOCAL', ...(m ? { language: m.language } : {}) } as WaTemplate;
  });
  const added: WaTemplate[] = remote
    .filter((m) => !local.some((t) => t.name === m.name))
    .map((m) => {
      const c = (type: string) => m.components?.find((x) => x.type === type);
      const buttons = (c('BUTTONS')?.buttons ?? []).filter((b) => b.type === 'QUICK_REPLY').map((b, i) => ({ id: `btn_${i + 1}`, title: b.text.slice(0, 20) }));
      return {
        id: newId('tpl'), name: m.name, language: m.language, status: STATUS[m.status] ?? 'PENDING',
        category: (['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(m.category) ? m.category : 'MARKETING') as WaTemplate['category'],
        kind: buttons.length ? 'buttons' : 'text', body: c('BODY')?.text ?? '', buttons,
        ...(c('HEADER')?.format === 'TEXT' && c('HEADER')?.text ? { header: c('HEADER')!.text } : {}),
        ...(c('FOOTER')?.text ? { footer: c('FOOTER')!.text } : {}),
      } satisfies WaTemplate;
    });
  return { updated, added };
}
