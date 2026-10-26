/**
 * Panel de la plataforma: POST /api/super/action { action, data }  (solo super administradores).
 *
 *  - Clientes: datos de contacto, módulos contratados (CRM, chatbot o ambos), plan mensual y estado.
 *  - Usuarios de cada cliente (su administrador y asesores).
 *  - "Entrar" a un cliente para configurarlo (flujo, catálogo, WhatsApp) como si fuera su administrador.
 *  - Super administradores: SOLO el dueño de la plataforma (PLATFORM_OWNER_EMAIL) puede crearlos o quitarlos.
 */
import { Response, Router } from 'express';
import { z } from 'zod';
import { OWNER_ACTIONS, SuperAction, SuperActions, TenantSummary } from '../../shared/api';
import { Tenant, TENANT_STATUSES } from '../../shared/models';
import { slugify } from '../../shared/text';
import { ApiError, AuthUser, createUser, getTenant, listUsers, publicUser, requireAuth, requireCsrfHeader, requireSuperadmin, setSession } from './auth';
import { invalidateCtx, publishTeam } from './core';
import { pool } from './db';
import { log } from './log';
import { emailSchema, passwordSchema, short, tenantRole } from './schemas';
import { getAiKey, setAiKey } from './secrets';
import { seedTenant } from './tenants';

const tenantId = z.string().min(3).max(60).regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones');

const tenant = z.object({
  id: tenantId.optional(),
  name: short(120).min(2),
  legalId: short(40).optional(),
  address: short(200).optional(),
  city: short(80).optional(),
  contactName: short(120).optional(),
  contactEmail: z.union([emailSchema, z.literal('')]).optional(),
  contactPhone: short(40).optional(),
  modules: z.object({ crm: z.boolean(), chatbot: z.boolean(), aiImages: z.boolean().optional() }).refine((m) => m.crm || m.chatbot, 'Elige al menos un módulo'),
  plan: z.object({ name: short(60), price: z.number().min(0).max(1e10), currency: short(10), billingDay: z.number().int().min(1).max(28) }),
  status: z.enum(TENANT_STATUSES),
  trialEndsAt: z.number().nullable().optional(),
  nextDueAt: z.number().nullable().optional(),
  notes: short(2000).optional(),
  createdAt: z.number().optional(),
});

const schemas: Record<SuperAction, z.ZodType> = {
  listTenants: z.object({}),
  saveTenant: z.object({
    tenant, flowTemplate: z.enum(['evosport', 'generico']).optional(), sampleCatalog: z.boolean().optional(),
    aiApiKey: z.union([z.literal(''), z.string().trim().regex(/^[\w-]{20,200}$/, 'La clave API no tiene un formato válido')]).optional(),
  }),
  deleteTenant: z.object({ id: tenantId, confirmName: short(120) }),
  listTenantUsers: z.object({ tenantId }),
  createTenantUser: z.object({ tenantId, name: short(80).min(2), email: emailSchema, password: passwordSchema, role: tenantRole }),
  enterTenant: z.object({ tenantId: tenantId.nullable() }),
  listSuperadmins: z.object({}),
  createSuperadmin: z.object({ name: short(80).min(2), email: emailSchema, password: passwordSchema }),
  removeSuperadmin: z.object({ id: z.string().max(120) }),
};

/** Id del cliente: nombre legible + sufijo al azar ("evosport-4rps"). */
function newTenantId(name: string): string {
  return `${slugify(name, 'cliente')}-${Math.random().toString(36).slice(2, 6)}`;
}

interface SuperContext {
  me: AuthUser;
  res: Response;
}
type Handler<A extends SuperAction> = (d: SuperActions[A]['req'], cx: SuperContext) => Promise<SuperActions[A]['res'] | null>;

const handlers: { [A in SuperAction]: Handler<A> } = {
  listTenants: async () => {
    const r = await pool.query(`
      SELECT t.data,
             (SELECT count(*)::int FROM users u WHERE u.tenant_id = t.id) AS users,
             (SELECT count(*)::int FROM conversations c WHERE c.tenant_id = t.id) AS conversations,
             (SELECT max(m.created_at) FROM messages m WHERE m.tenant_id = t.id) AS last,
             EXISTS (SELECT 1 FROM channel_secrets s WHERE s.tenant_id = t.id AND s.channel = 'ai') AS ai_row
      FROM tenants t ORDER BY t.created_at`);
    const tenants: TenantSummary[] = await Promise.all(r.rows.map(async (x) => ({
      ...x.data, users: x.users, conversations: x.conversations, lastActivityAt: x.last ?? null,
      aiKeySaved: x.ai_row && !!(await getAiKey(x.data.id)),
    })));
    return { tenants };
  },

  saveTenant: async (d) => {
    const now = Date.now();
    const exists = d.tenant.id ? await getTenant(d.tenant.id) : null;
    const t: Tenant = { ...d.tenant, id: exists?.id ?? newTenantId(d.tenant.name), createdAt: exists?.createdAt ?? now };
    await pool.query(`INSERT INTO tenants (id, data, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [t.id, JSON.parse(JSON.stringify(t)), t.createdAt]);
    if (!exists) await seedTenant(t, d.flowTemplate ?? 'generico', !!d.sampleCatalog);
    if (d.aiApiKey !== undefined) {
      await setAiKey(t.id, d.aiApiKey);
      log.info(d.aiApiKey ? 'Clave de IA del cliente guardada' : 'Clave de IA del cliente quitada', { tenant: t.id });
    }
    invalidateCtx(t.id);
    // Al suspender, las sesiones de ese cliente dejan de valer de inmediato.
    if (exists && exists.status !== 'suspendido' && t.status === 'suspendido') {
      await pool.query('UPDATE users SET token_version = token_version + 1 WHERE tenant_id = $1', [t.id]);
    }
    return { tenant: t };
  },

  deleteTenant: async (d, { me }) => {
    const t = await getTenant(d.id);
    if (!t) throw new ApiError(404, 'El cliente no existe');
    if (d.confirmName.trim() !== t.name) throw new ApiError(400, 'Escribe el nombre exacto del cliente para confirmar');
    await pool.query('DELETE FROM tenants WHERE id = $1', [t.id]); // borra en cascada todos sus datos
    invalidateCtx(t.id);
    log.warn('Cliente eliminado', { tenant: t.id, by: me.id });
    return null;
  },

  listTenantUsers: async (d) => ({ users: await listUsers(d.tenantId) }),

  createTenantUser: async (d) => {
    if (!(await getTenant(d.tenantId))) throw new ApiError(404, 'El cliente no existe');
    const user = publicUser(await createUser(d.tenantId, d.name, d.email, d.password, d.role));
    await publishTeam(d.tenantId);
    return { user };
  },

  enterTenant: async (d, { me, res }) => {
    const t = d.tenantId ? await getTenant(d.tenantId) : null;
    if (d.tenantId && !t) throw new ApiError(404, 'El cliente no existe');
    setSession(res, me, t?.id ?? null);
    log.info('Super admin gestiona cliente', { user: me.id, tenant: t?.id ?? null });
    return { tenant: t };
  },

  listSuperadmins: async () => ({ users: await listUsers(null) }),

  createSuperadmin: async (d, { me }) => {
    const user = publicUser(await createUser(null, d.name, d.email, d.password, 'superadmin'));
    log.warn('Nuevo super administrador', { id: user.id, by: me.id });
    return { user };
  },

  removeSuperadmin: async (d, { me }) => {
    if (d.id === me.id) throw new ApiError(400, 'No puedes quitarte a ti mismo');
    const r = await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'superadmin' RETURNING email`, [d.id]);
    if (!r.rowCount) throw new ApiError(404, 'No existe ese super administrador');
    log.warn('Super administrador eliminado', { id: d.id, by: me.id });
    return null;
  },
};

export const superRouter = Router();
superRouter.use(requireCsrfHeader, requireAuth, requireSuperadmin);

superRouter.post('/action', async (req, res) => {
  const me = req.user!;
  const action = req.body?.action as SuperAction;
  const schema = Object.prototype.hasOwnProperty.call(schemas, action) ? schemas[action] : undefined;
  if (!schema) throw new ApiError(400, 'Acción desconocida');
  if (OWNER_ACTIONS.includes(action) && !me.isOwner) throw new ApiError(403, 'Solo el dueño de la plataforma puede gestionar super administradores');
  const parsed = schema.safeParse(req.body?.data ?? {});
  if (!parsed.success) throw new ApiError(400, 'Datos inválidos', parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`));
  log.info('super', { action, user: me.id });
  const run = handlers[action] as Handler<SuperAction>;
  res.json({ result: (await run(parsed.data as never, { me, res })) ?? null });
});
