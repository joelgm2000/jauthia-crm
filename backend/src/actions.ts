/**
 * Acciones del CRM (POST /api/action): un manejador tipado por acción.
 * Cada manejador recibe datos YA validados (schemas.ts) y solo toca datos del cliente activo.
 */
import { deleteConversationFiles } from './inbox-files';
import { submitToMeta, syncFromMeta } from './meta-templates';
import { agentMessagePatch, applyEdit, BOT_PAUSED_NOTE, botToggle, stageChange } from '../../shared/actions';
import { ApiAction, ApiActions } from '../../shared/api';
import { DEFAULT_FLOW, FlowConfig } from '../../shared/flow';
import { conversationId, newConversation, newTestConversation, noteMessage, outboundMessage } from '../../shared/messages';
import { ChannelConfig, Conversation, CrmTask, Product, Tenant, WaTemplate } from '../../shared/models';
import { SEED_PRODUCTS } from '../../shared/seed';
import { OPT_IN_TAG } from '../../shared/optout';
import { templateDrafts } from '../../shared/templates';
import { ApiError, AuthUser, createUser, deleteUser, listUsers, publicUser, updateUser } from './auth';
import { testChannelConnection } from './channel-setup';
import { ingest, invalidateCtx, loadCtx, notifyStageChange, publishTeam } from './core';
import { getDoc, getSetting, insertMessage, patchDoc, pool, putDoc, putSetting, removeDoc, txEmit } from './db';
import { log } from './log';
import { getSecrets, SECRET_FIELDS, saveSecrets, secretsStatus } from './secrets';

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

/** Cuenta de WhatsApp (WABA) y token del cliente, para hablar con Meta. */
async function waAccount(tenantId: string): Promise<{ wabaId: string; token: string }> {
  const ch = (await loadCtx(tenantId)).channels.get('whatsapp');
  const token = (await getSecrets(tenantId, 'whatsapp'))['accessToken'];
  if (!ch?.wabaId || !token) throw new ApiError(409, 'Conecta WhatsApp en Canales (falta la cuenta de WhatsApp Business o el token).');
  return { wabaId: ch.wabaId, token };
}

export const handlers: { [A in ApiAction]: Handler<A> } = {
  // ---------------- Asesor ----------------
  sendMessage: async (d, { tenant, user, now }) => {
    const conv = await getConv(tenant.id, d.conversationId);
    // Plantillas = mensajes que inicia el negocio: prohibidos si el cliente pidió no recibir más (política de Meta).
    if (conv.optOutAt && d.draft.type === 'template') {
      throw new ApiError(409, 'Este cliente pidió no recibir más mensajes: no se le pueden enviar plantillas. Si él vuelve a escribir, puedes responderle.');
    }
    if (d.draft.type === 'template' && !conv.optInAt && !conv.simulated) {
      const tpl = d.draft.templateName ? (await loadCtx(tenant.id)).templates.find((t) => t.name === d.draft.templateName) : undefined;
      if (tpl?.category === 'MARKETING') {
        throw new ApiError(409, 'Este cliente no ha aceptado recibir promociones: WhatsApp no permite enviarle plantillas de marketing. Usa una plantilla de servicio (utilidad) o pídele permiso cuando escriba.');
      }
    }
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

  startConversation: async (d, args) => {
    const { tenant, user, now } = args;
    const ctx = await loadCtx(tenant.id);
    if (!ctx.channels.get('whatsapp')?.connected) throw new ApiError(409, 'WhatsApp no está conectado: conéctalo en Canales.');
    let digits = d.phone.replace(/\D/g, '');
    // Celular colombiano sin el código del país (3XX XXX XXXX) → +57.
    if (!d.phone.trim().startsWith('+') && digits.length === 10 && digits.startsWith('3')) digits = '57' + digits;
    if (digits.length < 8 || digits.length > 15) throw new ApiError(400, 'Número inválido: escríbelo con el código del país, p. ej. +57 300 123 4567.');
    // Fuera de la ventana de 24 h (un chat nuevo siempre lo está) WhatsApp solo acepta plantillas aprobadas.
    const tpl = ctx.templates.find((t) => t.id === d.templateId);
    if (!tpl || tpl.status !== 'APPROVED') throw new ApiError(400, 'Elige una plantilla aprobada por Meta.');
    // Si ya hay chat con ese número (o con ese teléfono anotado), se usa el mismo.
    let conv = await getDoc<Conversation>(tenant.id, 'conversations', conversationId('whatsapp', digits));
    if (!conv) {
      const r = await pool.query(`SELECT id FROM conversations WHERE tenant_id = $1 AND data->>'channel' = 'whatsapp' AND data->>'phone' = $2 LIMIT 1`, [tenant.id, '+' + digits]);
      if (r.rows[0]) conv = await getDoc<Conversation>(tenant.id, 'conversations', String(r.rows[0].id));
    }
    if (conv?.optOutAt) throw new ApiError(409, 'Este cliente pidió no recibir más mensajes: no se le puede escribir primero.');
    const name = d.name?.trim() || conv?.name || '+' + digits;
    if (!conv) {
      // Lo atiende el asesor que lo inició: el bot queda en pausa para este chat.
      conv = { ...newConversation('whatsapp', digits, name, now, '+' + digits), botActive: false };
      await putDoc(tenant.id, 'conversations', conv);
    }
    // El asesor confirma el permiso del cliente (opt-in que exige WhatsApp) y queda registrado quién y cuándo.
    const tags = conv.tags.filter((t) => t !== OPT_IN_TAG).concat(OPT_IN_TAG);
    await txEmit(async (c) => {
      await patchDoc(tenant.id, 'conversations', conv!.id, { optInAt: conv!.optInAt ?? now, tags }, c);
      await insertMessage(tenant.id, noteMessage(conv!.id, `✅ ${user.name} confirmó que ${name} autorizó que le escribamos por WhatsApp.`, now - 1), c);
    });
    const [draft] = templateDrafts(tpl, ctx.products, { nombre: name.startsWith('+') ? '' : name.split(' ')[0], producto: '', empresa: ctx.settings.companyName }, true);
    await handlers.sendMessage({ conversationId: conv.id, draft: { ...draft, type: 'template' }, pauseBot: true }, args);
    return { conversationId: conv.id };
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
    await deleteConversationFiles(tenant.id, d.conversationId);
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
    // El estado lo decide Meta (enviar / sincronizar), no el formulario. Si cambia el contenido de una plantilla
    // que ya está en Meta, deja de coincidir con la aprobada: vuelve a "LOCAL" hasta que se envíe de nuevo.
    const prev = await getDoc<WaTemplate>(tenant.id, 'templates', d.template.id);
    const same = prev && ['name', 'language', 'category', 'body', 'header', 'footer', 'imageUrl'].every((k) => (prev as unknown as Record<string, unknown>)[k] === (d.template as unknown as Record<string, unknown>)[k])
      && JSON.stringify(prev.buttons.map((b) => b.title)) === JSON.stringify(d.template.buttons.map((b) => b.title));
    d.template.status = prev && same ? prev.status : 'LOCAL';
    await putDoc<WaTemplate>(tenant.id, 'templates', d.template);
    invalidateCtx(tenant.id);
    return null;
  },
  submitTemplate: async (d, { tenant }) => {
    const { wabaId, token } = await waAccount(tenant.id);
    const t = await getDoc<WaTemplate>(tenant.id, 'templates', d.id);
    if (!t) throw new ApiError(404, 'La plantilla no existe');
    const status = await submitToMeta(t, wabaId, token);
    await patchDoc<WaTemplate>(tenant.id, 'templates', t.id, { status });
    invalidateCtx(tenant.id);
    return { status };
  },
  syncTemplates: async (_d, { tenant }) => {
    const { wabaId, token } = await waAccount(tenant.id);
    const { updated, added } = await syncFromMeta((await loadCtx(tenant.id)).templates, wabaId, token);
    for (const t of [...updated, ...added]) await putDoc<WaTemplate>(tenant.id, 'templates', t);
    invalidateCtx(tenant.id);
    const all = [...updated, ...added];
    const n = (s: WaTemplate['status']) => all.filter((t) => t.status === s).length;
    return { approved: n('APPROVED'), pending: n('PENDING'), rejected: n('REJECTED'), local: n('LOCAL'), added: added.length };
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
