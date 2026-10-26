/**
 * API de acciones del cliente: POST /api/action { action, data }.
 *
 * Seguridad:
 *  - Sesión válida (cookie httpOnly) y un cliente activo (el propio, o el que gestiona un super admin).
 *  - Toda lectura y escritura va filtrada por ese cliente: nunca se tocan datos de otro.
 *  - Acciones de configuración solo para admin del cliente (o super admin); módulos contratados respetados.
 *  - Cada payload se valida con zod: tipos, tamaños máximos y campos permitidos.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ADMIN_ACTIONS, ApiAction, BootstrapData, canAdminTenant, MODULE_ACTIONS } from '../../shared/api';
import { FlowConfig } from '../../shared/flow';
import { ChannelConfig, Conversation, CrmTask, Product, WaTemplate } from '../../shared/models';
import { MINUTE } from '../../shared/time';
import { runAction } from './actions';
import { ApiError, requireAuth, requireCsrfHeader, requireTenant } from './auth';
import { config } from './config';
import { settingsWithTeam } from './core';
import { getSetting, listDocs, listMessages } from './db';
import { log } from './log';
import { mediaRouter } from './media';
import { actionSchemas, id } from './schemas';
import { secretsStatus } from './secrets';

// ---------------------------------------------------------------------------
// Rutas /api (requieren sesión y cliente activo)
// ---------------------------------------------------------------------------

export const apiRouter = Router();
// Límite por usuario: frena scripts o cuentas robadas que intenten descargar o borrar todo en ráfaga.
const userLimiter = rateLimit({
  windowMs: MINUTE, limit: 600, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => 'u:' + req.user!.id,
  message: { error: 'Demasiadas solicitudes, espera un momento' },
});
apiRouter.use(requireCsrfHeader, requireAuth, requireTenant, userLimiter);
apiRouter.use('/media', mediaRouter);

/** Todo lo que la interfaz necesita al cargar (solo datos del cliente activo). */
apiRouter.get('/bootstrap', async (req, res) => {
  const tenant = req.tenant!;
  const t = tenant.id;
  const isAdmin = canAdminTenant(req.user!.role);
  const [conversations, products, templates, tasks, channels, settingsDoc, flowDoc] = await Promise.all([
    listDocs<Conversation>(t, 'conversations'),
    listDocs<Product>(t, 'products'),
    listDocs<WaTemplate>(t, 'templates'),
    listDocs<CrmTask>(t, 'tasks'),
    listDocs<ChannelConfig>(t, 'channels'),
    settingsWithTeam(t),
    getSetting<FlowConfig>(t, 'flow'),
  ]);
  const body: BootstrapData = {
    tenant, conversations, products, templates, tasks, channels, settings: settingsDoc, flow: flowDoc,
    secrets: isAdmin ? await secretsStatus(t) : {},
    publicBaseUrl: config.publicBaseUrl,
  };
  res.json(body);
});

apiRouter.get('/conversations/:id/messages', async (req, res) => {
  const p = id.safeParse(req.params['id']);
  if (!p.success) throw new ApiError(400, 'id inválido');
  res.json({ messages: await listMessages(req.tenant!.id, p.data) });
});

apiRouter.post('/action', async (req, res) => {
  const user = req.user!;
  const tenant = req.tenant!;
  const action = req.body?.action as ApiAction;
  const schema = Object.prototype.hasOwnProperty.call(actionSchemas, action) ? actionSchemas[action] : undefined;
  if (!schema) throw new ApiError(400, 'Acción desconocida');
  if (ADMIN_ACTIONS.includes(action) && !canAdminTenant(user.role)) throw new ApiError(403, 'Solo un administrador puede hacer esto');
  const mod = MODULE_ACTIONS[action];
  if (mod && !tenant.modules[mod]) throw new ApiError(403, `Este cliente no tiene el módulo de ${mod === 'crm' ? 'CRM' : 'chatbot'}`);
  const parsed = schema.safeParse(req.body?.data ?? {});
  if (!parsed.success) throw new ApiError(400, 'Datos inválidos', parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`));
  log.info('accion', { action, user: user.id, tenant: tenant.id });
  const result = await runAction(action, parsed.data as never, { tenant, user, now: Date.now() });
  res.json({ result: result ?? null });
});
