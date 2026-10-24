/**
 * Validación (zod) de todo lo que entra por la API: tipos, tamaños máximos y campos permitidos.
 * Los valores posibles (etapas, roles, estados…) salen de /shared para que no se desincronicen.
 */
import { z } from 'zod';
import { EDITABLE_FIELDS } from '../../shared/actions';
import { ApiAction, PASSWORD_MIN, TENANT_ROLES } from '../../shared/api';
import { PRODUCT_IMAGE, STAGES, TRIGGER_INTENTS } from '../../shared/flow';
import { SELLER_TONES } from '../../shared/seller';
import {
  AVAILABILITIES, CHANNEL_LABELS, ChannelType, PRODUCT_LINES, StageId, TEMPLATE_CATEGORIES, TEMPLATE_KINDS, TEMPLATE_STATUSES, USE_MODES,
} from '../../shared/models';

export const passwordSchema = z.string().min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`).max(200);
export const emailSchema = z.string().email().max(200);

export const id = z.string().min(1).max(120).regex(/^[\w-]+$/, 'id inválido');
export const short = (n = 200) => z.string().max(n);
export const url = z.string().max(1000).refine((u) => u === '' || u.startsWith('/') || /^https:\/\//.test(u), 'La URL debe ser https:// o una ruta del sitio');
const channelType = z.enum(Object.keys(CHANNEL_LABELS) as [ChannelType, ...ChannelType[]]);
const stageId = z.enum(STAGES.map((s) => s.id) as [StageId, ...StageId[]]);
const button = z.object({ id: short(64), title: short(40), description: short(100).optional() });
const card = z.object({ productId: id, title: short(80), subtitle: short(200), imageUrl: url, buttons: z.array(button).max(3) });

const draft = z.object({
  type: z.enum(['text', 'buttons', 'list', 'carousel', 'product', 'image', 'template']), // los asesores no envían notas por aquí
  text: short(4096),
  header: short(120).optional(),
  footer: short(120).optional(),
  imageUrl: url.optional(),
  buttons: z.array(button).max(10).optional(),
  listButton: short(40).optional(),
  cards: z.array(card).max(10).optional(),
  templateName: z.string().max(120).regex(/^[a-z0-9_]+$/).optional(),
  templateParams: z.array(short(500)).max(10).optional(),
});

const fieldsShape = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, z.union([z.string().max(300), z.number()]).optional().nullable()]));
const edit = z.object({
  name: short(80).optional(),
  fields: z.object(fieldsShape).optional(),
  tags: z.array(short(40)).max(30).optional(),
  priority: z.enum(['alta', 'normal']).optional(),
  assignedTo: z.string().max(120).nullable().optional(),
  value: z.number().min(0).max(1e12).optional(),
  clearIntent: z.boolean().optional(),
  markRead: z.boolean().optional(),
});

const task = z.object({
  id, conversationId: id, title: short(200), detail: short(2000), dueAt: z.number(), done: z.boolean(),
  priority: z.enum(['alta', 'normal']), assignedTo: z.string().max(120).nullable().optional(), createdAt: z.number(),
});

const product = z.object({
  id, name: short(120).min(1), category: short(60).min(1), subcategory: short(60),
  keywords: z.array(short(60)).max(40), imageUrl: url, price: z.number().min(0).max(1e12),
  line: z.enum(PRODUCT_LINES).optional(), availability: z.enum(AVAILABILITIES),
  description: short(2000), specs: z.array(z.object({ label: short(60), value: short(200) })).max(30),
  maxUserKg: z.number().min(0).max(1000).optional(), mode: z.enum(USE_MODES).optional(),
  minCeilingCm: z.number().min(0).max(2000).optional(), active: z.boolean(),
});

const template = z.object({
  id, name: z.string().max(120).regex(/^[a-z0-9_]+$/), category: z.enum(TEMPLATE_CATEGORIES),
  kind: z.enum(TEMPLATE_KINDS), language: short(10), header: short(120).optional(), imageUrl: url.optional(),
  body: short(1024), footer: short(120).optional(), buttons: z.array(button).max(3), productIds: z.array(id).max(10).optional(),
  status: z.enum(TEMPLATE_STATUSES),
});

// Datos públicos del canal (los tokens van aparte, cifrados, con saveChannelSecrets).
const digits = z.string().max(40).regex(/^\d*$/, 'Solo números');
const channel = z.object({
  id: channelType, enabled: z.boolean(), connected: z.boolean(), botEnabled: z.boolean(),
  accountName: short(120).optional(), phoneNumberId: digits.optional(), wabaId: digits.optional(),
  pageId: digits.optional(), igAccountId: digits.optional(), botUsername: short(60).optional(),
});

const settings = z.object({
  companyName: short(120), freeShippingCity: short(120), hotThreshold: z.number().min(1).max(100),
  minMessagesForHot: z.number().min(1).max(20).optional(),
  hours: z.object({
    timezone: short(60),
    days: z.record(z.string().regex(/^[0-6]$/), z.array(z.string().regex(/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/)).max(6)),
    outOfHoursMessage: short(1000),
  }),
  advisors: z.array(z.object({ id, name: short(120), email: z.string().max(200), active: z.boolean() })).max(100).optional(),
  discounts: z.array(z.object({ label: short(200), value: short(300) })).max(50),
  socialProof: z.object({
    enabled: z.boolean(), triggerStage: z.enum(['pago', 'ganado']), inactiveHours: z.number().min(0.25).max(24 * 30),
    stages: z.array(stageId).max(9), sameCategoryOnly: z.boolean(), cooldownHours: z.number().min(1).max(24 * 30),
    maxRecipients: z.number().int().min(1).max(1000), message: short(1024).min(1), includeImage: z.boolean(), templateId: z.string().max(120).optional(),
  }).optional(),
  catalog: z.object({
    gymFilters: z.boolean(),
    currency: short(10),
    categories: z.array(z.object({ id, name: short(60).min(1), subcategories: z.array(short(60)).max(30) })).max(30),
  }).optional(),
});

const option = z.object({ id: short(64), title: short(40), description: short(100).optional(), value: short(60), synonyms: z.array(short(60)).max(40).optional(), next: short(64).optional() });
const flow = z.object({
  version: z.number(), startNode: short(64), maxOptions: z.number().min(1).max(10), maxRetries: z.number().min(1).max(10),
  priorityKeywords: z.array(short(60)).max(60),
  nodes: z.array(z.object({
    id: short(64), kind: z.enum(['question', 'recommend', 'handoff']), route: short(40), title: short(80), message: short(1024),
    display: z.enum(['buttons', 'list', 'text']).optional(), listButton: short(40).optional(), options: z.array(option).max(10).optional(),
    field: short(40).optional(), parse: z.enum(['name_city', 'city', 'number', 'choice', 'text']).optional(), next: short(64).optional(),
    optionsFrom: z.enum(['categories']).optional(),
  })).max(80),
  triggers: z.array(z.object({
    id: short(64), label: short(120), intent: z.enum(TRIGGER_INTENTS), keywords: z.array(short(60)).max(80),
    handoff: z.boolean(), score: z.number().min(-100).max(100), moveTo: stageId.optional(),
  })).max(30),
  followUps: z.array(z.object({
    afterHours: z.number().min(0.25).max(24 * 60), message: short(1024).min(1), imageUrl: z.union([url, z.literal(PRODUCT_IMAGE)]).optional(), templateId: z.string().max(120).optional(),
  })).max(10),
  remarketing: z.object({
    enabled: z.boolean(), stages: z.array(stageId).max(9), withAdvisor: z.boolean(), loseAfterHours: z.number().min(0).max(24 * 60),
  }).optional(),
  faqs: z.array(z.object({ id: short(64), keywords: z.array(short(60).min(1)).min(1).max(40), answer: short(1024).min(1) })).max(40).optional(),
  persona: z.object({
    botName: short(60).min(1), role: short(120), tone: z.enum(SELLER_TONES), objective: short(1000), rules: z.array(short(300)).max(30), prompt: short(8000),
  }).optional(),
  required: z.array(z.object({
    key: z.enum(['nombre', 'producto', ...EDITABLE_FIELDS]), label: short(60).min(1), when: z.enum(['inicio', 'antes_asesor']), nodeId: short(64).optional(),
  })).max(15).optional(),
  messages: z.record(z.string().max(40), short(1024)),
});

export const tenantRole = z.enum(TENANT_ROLES);

/** Esquema de los datos de cada acción de POST /api/action. */
export const actionSchemas: Record<ApiAction, z.ZodType> = {
  sendMessage: z.object({ conversationId: id, draft, pauseBot: z.boolean().optional() }),
  addNote: z.object({ conversationId: id, text: short(2000).min(1) }),
  setStage: z.object({ conversationId: id, stage: stageId }),
  toggleBot: z.object({ conversationId: id }),
  editConversation: z.object({ conversationId: id, edit }),
  createTestConversation: z.object({ channel: channelType, name: short(80).optional() }),
  simulateIncoming: z.object({ conversationId: id, text: short(2000).optional(), buttonId: short(64).optional(), title: short(80).optional() }),
  saveTask: z.object({ task }),
  toggleTask: z.object({ id }),
  removeTask: z.object({ id }),
  deleteConversation: z.object({ conversationId: id }),
  saveProduct: z.object({ product }),
  removeProduct: z.object({ id }),
  saveTemplate: z.object({ template }),
  removeTemplate: z.object({ id }),
  saveChannel: z.object({ channel }),
  saveChannelSecrets: z.object({ channel: channelType, secrets: z.record(z.string().max(40), z.string().max(1000)) }),
  testChannel: z.object({ channel: channelType }),
  saveSettings: z.object({ settings }),
  saveFlow: z.object({ flow }),
  seedDefaults: z.object({}),
  listUsers: z.object({}),
  createUser: z.object({ name: short(80).min(2), email: emailSchema, password: passwordSchema, role: tenantRole }),
  updateUser: z.object({ id, name: short(80).min(2).optional(), role: tenantRole.optional(), active: z.boolean().optional(), password: passwordSchema.optional() }),
  deleteUser: z.object({ id }),
};
