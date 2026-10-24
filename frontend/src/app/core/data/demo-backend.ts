/**
 * Servidor simulado para el MODO DEMO (sin backend).
 * Implementa las mismas acciones que el backend Node/Express (backend/src/actions.ts) con las
 * mismas reglas de negocio de /shared, pero guardando en el navegador (localStorage).
 * En producción este archivo no participa: se usa ApiBackend.
 */
import { agentMessagePatch, applyEdit, BOT_PAUSED_NOTE, botToggle, stageChange } from '@shared/actions';
import { ApiAction, ApiActions } from '@shared/api';
import { followUpDue } from '@shared/automation';
import { DEFAULT_FLOW, FlowConfig } from '@shared/flow';
import { processIncoming } from '@shared/flow-engine';
import { newId } from '@shared/ids';
import { materializeResult, newTestConversation, noteMessage, outboundMessage } from '@shared/messages';
import { ChatMessage, Conversation, CrmSettings, Product, WaTemplate } from '@shared/models';
import { OutgoingDraft } from '@shared/products';
import { SEED_CHANNELS, SEED_PRODUCTS, SEED_SETTINGS, SEED_TEMPLATES } from '@shared/seed';
import { MINUTE } from '@shared/time';
import { CrmBackend } from './backend';
import { buildDemo } from './demo-data';
import { LocalPersistence } from './local-persistence';

type Handler<A extends ApiAction> = (d: ApiActions[A]['req']) => Promise<ApiActions[A]['res']>;

export class DemoBackend implements CrmBackend {
  constructor(private db: LocalPersistence, private userName: () => string) {
    if (db.isEmpty) this.seed();
    setInterval(() => this.runFollowUps(), MINUTE);
  }

  call<A extends ApiAction>(action: A, data: ApiActions[A]['req']): Promise<ApiActions[A]['res']> {
    const h = (this.handlers as unknown as Record<string, Handler<A>>)[action];
    return h ? h(structuredClone(data)) : Promise.reject(new Error('Acción no soportada en demo'));
  }

  reset(): void {
    this.db.reset();
    this.seed();
  }

  // ---------------------------------------------------------------------------

  private seed(): void {
    const data = buildDemo(Date.now());
    this.db.bulk(() => {
      this.seedDefaults();
      data.conversations.forEach((c) => this.db.set('conversations', c));
      data.messages.forEach((m) => this.db.addMessage(m));
      data.tasks.forEach((t) => this.db.set('tasks', t));
    });
  }

  private seedDefaults(): void {
    SEED_PRODUCTS.forEach((p) => this.db.set('products', p));
    SEED_TEMPLATES.forEach((t) => this.db.set('templates', t));
    SEED_CHANNELS.forEach((c) => this.db.set('channels', c));
    this.db.setDoc('settings/general', SEED_SETTINGS);
    this.db.setDoc('settings/flow', DEFAULT_FLOW);
  }

  private conv(id: string): Conversation {
    const c = this.db.get<Conversation>('conversations', id);
    if (!c) throw new Error('La conversación no existe');
    return c;
  }

  private settings(): CrmSettings {
    return { ...SEED_SETTINGS, ...(this.db.getDoc<CrmSettings>('settings/general') ?? {}) };
  }

  private flow(): FlowConfig {
    return { ...DEFAULT_FLOW, ...(this.db.getDoc<FlowConfig>('settings/flow') ?? {}) };
  }

  private note(conversationId: string, text: string, at = Date.now()): Promise<void> {
    return this.db.addMessage(noteMessage(conversationId, text, at));
  }

  /** Guarda un mensaje saliente y simula que el cliente lo lee. */
  private async save(m: ChatMessage): Promise<void> {
    await this.db.addMessage(m);
    setTimeout(() => this.db.updateMessage(m.conversationId, m.id, { status: 'read' }), 1500);
  }

  private out(conv: Conversation, sender: 'bot' | 'asesor', d: OutgoingDraft, at: number): Promise<void> {
    return this.save(outboundMessage(d, conv, sender, sender === 'bot' ? 'Bot' : this.userName(), at));
  }

  private async runFollowUps(): Promise<void> {
    const now = Date.now();
    for (const c of this.db.all<Conversation>('conversations')) {
      const action = followUpDue(c, this.flow(), { products: this.db.all<Product>('products'), templates: this.db.all<WaTemplate>('templates'), companyName: this.settings().companyName, now });
      if (!action) continue;
      if (action.message) await this.out(c, 'bot', action.message, now);
      if (action.note) await this.note(c.id, action.note, now + 1);
      await this.db.update('conversations', c.id, action.patch);
    }
  }

  // ---------------------------------------------------------------------------

  private handlers: { [A in ApiAction]: Handler<A> } = {

    sendMessage: async ({ conversationId, draft, pauseBot }) => {
      const conv = this.conv(conversationId);
      const now = Date.now();
      if (pauseBot && conv.botActive) await this.note(conv.id, BOT_PAUSED_NOTE, now - 1);
      await this.out(conv, 'asesor', draft, now);
      await this.db.update('conversations', conv.id, agentMessagePatch(conv, draft, now, !!pauseBot));
      return { id: '' };
    },

    addNote: async ({ conversationId, text }) => {
      await this.note(conversationId, `📝 ${this.userName()}: ${text}`);
      return { id: '' };
    },

    setStage: async ({ conversationId, stage }) => {
      const conv = this.conv(conversationId);
      const change = stageChange(conv, stage, this.settings().hotThreshold, Date.now(), this.userName());
      if (!change) return;
      await this.db.update('conversations', conv.id, change.patch);
      await this.note(conv.id, change.note);
    },

    toggleBot: async ({ conversationId }) => {
      const t = botToggle(this.conv(conversationId));
      await this.db.update('conversations', conversationId, t.patch);
      await this.note(conversationId, t.note);
    },

    editConversation: async ({ conversationId, edit }) => {
      const patch = applyEdit(this.conv(conversationId), edit);
      if (Object.keys(patch).length) await this.db.update('conversations', conversationId, patch);
    },

    createTestConversation: async ({ channel, name }) => {
      const conv = newTestConversation(channel, name, Date.now());
      await this.db.set('conversations', conv);
      return { conversation: conv };
    },

    simulateIncoming: async ({ conversationId, text, buttonId, title }) => {
      const conv = this.conv(conversationId);
      if (!conv.simulated) throw new Error('Solo se puede simular en conversaciones de prueba');
      const now = Date.now();
      const shown = title ?? text ?? '';
      const inbound: ChatMessage = { id: newId('m'), conversationId, direction: 'in', sender: 'cliente', type: 'text', text: shown, replyToButtonId: buttonId, createdAt: now, processed: true };
      await this.db.addMessage(inbound);
      await this.db.update('conversations', conversationId, { lastMessage: shown, lastMessageAt: now, unread: (conv.unread || 0) + 1 });

      const products = this.db.all<Product>('products');
      const res = processIncoming({ conv, flow: this.flow(), products, settings: this.settings(), now }, { text: text ?? title, buttonId });
      await new Promise((r) => setTimeout(r, res.replies.length ? 700 : 0));
      const out = materializeResult(res, conv, inbound, Date.now());
      for (const m of out.replies) await this.save(m);
      for (const n of out.notes) await this.db.addMessage(n);
      for (const task of out.tasks) await this.db.set('tasks', task);
      await this.db.update('conversations', conversationId, { ...res.patch, lastMessage: out.lastMessage, lastMessageAt: out.lastMessageAt });
    },

    saveTask: async ({ task }) => this.db.set('tasks', task),
    toggleTask: async ({ id }) => {
      const t = this.db.get<{ id: string; done: boolean }>('tasks', id);
      if (t) await this.db.update('tasks', id, { done: !t.done });
    },
    removeTask: async ({ id }) => this.db.remove('tasks', id),

    deleteConversation: async ({ conversationId }) => this.db.remove('conversations', conversationId),
    saveProduct: async ({ product }) => this.db.set('products', product),
    removeProduct: async ({ id }) => this.db.remove('products', id),
    saveTemplate: async ({ template }) => this.db.set('templates', template),
    removeTemplate: async ({ id }) => this.db.remove('templates', id),
    saveChannel: async ({ channel }) => this.db.set('channels', channel),
    saveSettings: async ({ settings }) => this.db.setDoc('settings/general', settings),
    saveFlow: async ({ flow }) => this.db.setDoc('settings/flow', { ...flow, version: (this.flow().version || 0) + 1 }),
    seedDefaults: async () => this.seedDefaults(),
    saveChannelSecrets: async () => ({ status: {} }),
    testChannel: async () => ({ ok: false, message: 'En modo demo no se conectan redes reales.' }),
    listUsers: async () => ({ users: [{ id: 'demo', name: 'Laura Gómez', email: 'demo@jauthia.com', role: 'admin', active: true, createdAt: 0, tenantId: 'demo' }] }),
    createUser: async () => {
      throw new Error('En modo demo no se pueden crear usuarios');
    },
    updateUser: async () => {
      throw new Error('En modo demo no se pueden editar usuarios');
    },
    deleteUser: async () => {
      throw new Error('En modo demo no se pueden eliminar usuarios');
    },
  };
}
