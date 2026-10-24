/**
 * Acciones del CRM (POST /api/action): un manejador tipado por acción.
 * Cada manejador recibe datos YA validados (schemas.ts) y solo toca datos del cliente activo.
 */
import { agentMessagePatch, applyEdit, BOT_PAUSED_NOTE, botToggle, stageChange } from '../../shared/actions';
import { ApiAction, ApiActions } from '../../shared/api';
import { DEFAULT_FLOW, FlowConfig } from '../../shared/flow';
import { newTestConversation, noteMessage, outboundMessage } from '../../shared/messages';
import { ChannelConfig, Conversation, CrmTask, Product, Tenant, WaTemplate } from '../../shared/models';
import { SEED_PRODUCTS } from '../../shared/seed';
import { ApiError, AuthUser, createUser, deleteUser, listUsers, publicUser, updateUser } from './auth';
import { testChannelConnection } from './channel-setup';
import { ingest, invalidateCtx, loadCtx, notifyStageChange, publishTeam } from './core';
import { getDoc, getSetting, insertMessage, patchDoc, putDoc, putSetting, removeDoc, txEmit } from './db';
import { log } from './log';
import { SECRET_FIELDS, saveSecrets, secretsStatus } from './secrets';

export interface ActionContext {
  tenant: Tenant;
  user: AuthUser;
  now: number;
}

type Handler<A extends ApiAction> = (d: ApiActions[A]['req'], cx: ActionContext) => Promise<ApiActions[A]['res'] | null>;

async function getConv(tenantId: string, conversationId: string): Promise<Conversation> {
  const c = await getDoc<Conversation>(tenantId, 'conversations', conversationId);
  if (!c) throw new ApiError(404, 'La conversación no existe');
  return c;
}

/** Cambia la conversación y deja la nota interna en la misma transacción. */
async function patchWithNote(tenantId: string, conv: Conversation, patch: Partial<Conversation>, note: string, at: number): Promise<void> {
  await txEmit(async (c) => {
    await patchDoc(tenantId, 'conversations', conv.id, patch, c);
    await insertMessage(tenantId, noteMessage(conv.id, note, at), c);
  });
}

export const handlers: { [A in ApiAction]: Handler<A> } = {
  // ---------------- Asesor ----------------
  sendMessage: async (d, { tenant, user, now }) => {
    const conv = await getConv(tenant.id, d.conversationId);
    const msg = outboundMessage(d.draft, conv, 'asesor', user.name, now);
    await txEmit(async (c) => {
      if (d.pauseBot && conv.botActive) await insertMessage(tenant.id, noteMessage(conv.id, BOT_PAUSED_NOTE, now - 1), c);
      await insertMessage(tenant.id, msg, c);
      await patchDoc(tenant.id, 'conversations', conv.id, agentMessagePatch(conv, d.draft, now, !!d.pauseBot), c);
    });
    return { id: msg.id };
  },

  addNote: async (d, { tenant, user }) => {
    await getConv(tenant.id, d.conversationId);
    const n = noteMessage(d.conversationId, `📝 ${user.name}: ${d.text}`);
    await insertMessage(tenant.id, n);
    return { id: n.id };
  },

  setStage: async (d, { tenant, user, now }) => {
    const conv = await getConv(tenant.id, d.conversationId);
    const change = stageChange(conv, d.stage, (await loadCtx(tenant.id)).settings.hotThreshold, now, user.name);
    if (!change) return null;
    await patchWithNote(tenant.id, conv, change.patch, change.note, now);
    notifyStageChange(tenant.id, conv.id, conv.stage, d.stage);
    return null;
  },

  toggleBot: async (d, { tenant, now }) => {
    const conv = await getConv(tenant.id, d.conversationId);
    if (!conv.botActive && !tenant.modules.chatbot) throw new ApiError(403, 'Este cliente no tiene el módulo de chatbot');
    const tg = botToggle(conv);
    await patchWithNote(tenant.id, conv, tg.patch, tg.note, now);
    return null;
  },

  editConversation: async (d, { tenant }) => {
    const conv = await getConv(tenant.id, d.conversationId);
    const patch = applyEdit(conv, d.edit);
    if (Object.keys(patch).length) await patchDoc(tenant.id, 'conversations', conv.id, patch);
    return null;
  },

  createTestConversation: async (d, { tenant, now }) => {
    const conversation = newTestConversation(d.channel, d.name, now);
    await putDoc(tenant.id, 'conversations', conversation);
    return { conversation };
  },

  simulateIncoming: async (d, { tenant }) => {
    const conv = await getConv(tenant.id, d.conversationId);
    // El simulador nunca puede inyectar mensajes en conversaciones reales.
    if (!conv.simulated) throw new ApiError(403, 'Solo se puede simular en conversaciones de prueba');
    if (!d.text && !d.buttonId) throw new ApiError(400, 'Falta el texto o el botón');
    await ingest(tenant.id, { channel: conv.channel, externalId: conv.externalId, text: d.title ?? d.text ?? '', buttonId: d.buttonId });
    return null;
  },

  saveTask: async (d, { tenant }) => {
    await putDoc<CrmTask>(tenant.id, 'tasks', d.task);
    return null;
  },
  toggleTask: async (d, { tenant }) => {
    const tk = await getDoc<CrmTask>(tenant.id, 'tasks', d.id);
    if (!tk) throw new ApiError(404, 'La tarea no existe');
    await patchDoc<CrmTask>(tenant.id, 'tasks', d.id, { done: !tk.done });
    return null;
  },
  removeTask: async (d, { tenant }) => {
    await removeDoc(tenant.id, 'tasks', d.id);
    return null;
  },

  // ---------------- Administrador del cliente ----------------
  deleteConversation: async (d, { tenant }) => {
    await removeDoc(tenant.id, 'conversations', d.conversationId); // los mensajes se borran en cascada
    return null;
  },
  saveProduct: async (d, { tenant }) => {
    await putDoc<Product>(tenant.id, 'products', d.product);
    invalidateCtx(tenant.id);
    return null;
  },
  removeProduct: async (d, { tenant }) => {
    await removeDoc(tenant.id, 'products', d.id);
    invalidateCtx(tenant.id);
    return null;
  },
  // Las plantillas las usa el remarketing (caché del cliente): se invalida al cambiarlas.
  saveTemplate: async (d, { tenant }) => {
    await putDoc<WaTemplate>(tenant.id, 'templates', d.template);
    invalidateCtx(tenant.id);
    return null;
  },
  removeTemplate: async (d, { tenant }) => {
    await removeDoc(tenant.id, 'templates', d.id);
    invalidateCtx(tenant.id);
    return null;
  },
  saveChannel: async (d, { tenant }) => {
    const prev = await getDoc<ChannelConfig>(tenant.id, 'channels', d.channel.id);
    // "connected" solo lo marca el servidor al probar la conexión.
    await putDoc<ChannelConfig>(tenant.id, 'channels', { ...d.channel, connected: prev?.connected ?? false });
    invalidateCtx(tenant.id);
    return null;
  },
  saveChannelSecrets: async (d, { tenant, user }) => {
    if (!SECRET_FIELDS[d.channel]) throw new ApiError(400, 'Este canal no usa tokens');
    await saveSecrets(tenant.id, d.channel, d.secrets);
    log.info('Tokens de canal actualizados', { tenant: tenant.id, channel: d.channel, by: user.id, keys: Object.keys(d.secrets) });
    return { status: (await secretsStatus(tenant.id))[d.channel] ?? {} };
  },
  testChannel: async (d, { tenant }) => {
    const r = await testChannelConnection(tenant.id, d.channel);
    const prev = await getDoc<ChannelConfig>(tenant.id, 'channels', d.channel);
    if (prev) await putDoc<ChannelConfig>(tenant.id, 'channels', { ...prev, connected: r.ok, ...(r.accountName ? { accountName: r.accountName } : {}) });
    invalidateCtx(tenant.id);
    return { ok: r.ok, message: r.message };
  },
  saveSettings: async (d, { tenant }) => {
    // Los asesores salen de los usuarios: no se guardan aquí.
    const { advisors: _advisors, ...rest } = d.settings;
    await putSetting(tenant.id, 'general', { ...rest, advisors: [] }, false);
    await publishTeam(tenant.id);
    return null;
  },
  saveFlow: async (d, { tenant }) => {
    const prev = (await getSetting<FlowConfig>(tenant.id, 'flow'))?.version ?? 0;
    await putSetting(tenant.id, 'flow', { ...DEFAULT_FLOW, ...d.flow, version: prev + 1 });
    invalidateCtx(tenant.id);
    return null;
  },
  seedDefaults: async (_d, { tenant }) => {
    for (const p of SEED_PRODUCTS) await putDoc(tenant.id, 'products', p);
    invalidateCtx(tenant.id);
    return null;
  },

  listUsers: async (_d, { tenant }) => ({ users: await listUsers(tenant.id) }),
  createUser: async (d, { tenant }) => {
    const user = publicUser(await createUser(tenant.id, d.name, d.email, d.password, d.role));
    await publishTeam(tenant.id);
    return { user };
  },
  updateUser: async (d, { tenant, user }) => {
    if (d.id === user.id && (d.role === 'asesor' || d.active === false)) throw new ApiError(400, 'No puedes quitarte tu propio acceso de administrador');
    await updateUser(tenant.id, d.id, d);
    await publishTeam(tenant.id);
    return null;
  },
  deleteUser: async (d, { tenant, user }) => {
    if (d.id === user.id) throw new ApiError(400, 'No puedes eliminar tu propio usuario');
    await deleteUser(tenant.id, d.id);
    await publishTeam(tenant.id);
    return null;
  },
};

/** Ejecuta una acción con datos ya validados. */
export function runAction<A extends ApiAction>(action: A, data: ApiActions[A]['req'], cx: ActionContext): Promise<ApiActions[A]['res'] | null> {
  return (handlers[action] as Handler<A>)(data, cx);
}
