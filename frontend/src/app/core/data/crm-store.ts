import { Injectable, computed, inject, signal } from '@angular/core';
import { ConversationEdit } from '@shared/actions';
import { ApiAction, ApiActions, CrmUserInfo, SuperAction, SuperActions } from '@shared/api';
import { DEFAULT_FLOW, FlowConfig } from '@shared/flow';
import { OutgoingDraft } from '@shared/products';
import { ChannelConfig, ChannelType, ChatMessage, Conversation, CrmSettings, CrmTask, Product, StageId, WaTemplate } from '@shared/models';
import { SEED_CHANNELS, SEED_SETTINGS } from '@shared/seed';
import { AuthService } from '../auth.service';
import { environment } from '../../../environments/environment';
import { api, HttpError } from '../http';
import { ApiBackend, CrmBackend } from './backend';
import { DemoBackend } from './demo-backend';
import { LocalPersistence } from './local-persistence';
import { newId } from '@shared/ids';
import { intentEmoji } from '../../ui/labels';
import { ReadSource, Unsub } from './persistence';
import { ServerSource } from './server-source';

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'hot' | 'success' | 'intent' | 'error';
  conversationId?: string;
}

/**
 * Estado central del CRM (signals).
 * - LEE en tiempo real desde el servidor (API + Socket.io) o desde el navegador en modo demo.
 * - ESCRIBE siempre a través de CrmBackend: la API del servidor (/api/action).
 */
@Injectable({ providedIn: 'root' })
export class CrmStore {
  private auth = inject(AuthService);
  private local = environment.demo ? new LocalPersistence() : null;
  private server = environment.demo ? null : new ServerSource();
  readonly source: ReadSource = this.local ?? this.server!;
  /** Estado de la conexión en tiempo real con el servidor. */
  readonly online = signal(true);
  private backend: CrmBackend = this.local ? new DemoBackend(this.local, () => this.auth.user()?.name ?? 'Asesor') : new ApiBackend();
  readonly mode = this.source.mode;

  readonly conversations = signal<Conversation[]>([]);
  readonly products = signal<Product[]>([]);
  readonly templates = signal<WaTemplate[]>([]);
  readonly tasks = signal<CrmTask[]>([]);
  readonly channels = signal<ChannelConfig[]>([]);
  readonly settings = signal<CrmSettings>(SEED_SETTINGS);
  readonly flow = signal<FlowConfig>(DEFAULT_FLOW);
  readonly toasts = signal<Toast[]>([]);
  /** Tokens guardados por canal, enmascarados ("••••1234"). Nunca llegan en claro. */
  readonly secrets = signal<Record<string, Record<string, string>>>({});
  /** URL pública del servidor (para mostrar los webhooks). */
  readonly publicBaseUrl = signal('');
  /** Categorías del catálogo del cliente. */
  readonly categories = computed(() => this.settings().catalog?.categories ?? []);
  /** Conversaciones donde el bot está "escribiendo…" */
  readonly typing = signal<Set<string>>(new Set());

  readonly sortedConversations = computed(() => [...this.conversations()].sort((a, b) => b.lastMessageAt - a.lastMessageAt));
  readonly hotLeads = computed(() => this.sortedConversations().filter((c) => c.hot));
  readonly unreadTotal = computed(() => this.conversations().reduce((n, c) => n + (c.unread || 0), 0));
  readonly openTasks = computed(() => this.tasks().filter((t) => !t.done).sort((a, b) => a.dueAt - b.dueAt));
  readonly enabledChannels = computed(() => this.channels().filter((c) => c.enabled));

  private unsubs: Unsub[] = [];
  private started = false;
  private known = new Map<string, Conversation>();

  /** Se llama una vez desde el layout cuando hay sesión. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.server?.start(
      (on) => this.online.set(on),
      (m) => {
        this.secrets.set(m.secrets ?? {});
        this.publicBaseUrl.set(m.publicBaseUrl || window.location.origin);
        this.auth.setTenant(m.tenant);
      },
    );
    this.unsubs.push(
      this.source.listen<Conversation>('conversations', (x) => this.onConversations(x)),
      this.source.listen<Product>('products', (x) => this.products.set(x)),
      this.source.listen<WaTemplate>('templates', (x) => this.templates.set(x)),
      this.source.listen<CrmTask>('tasks', (x) => this.tasks.set(x)),
      this.source.listen<ChannelConfig>('channels', (x) => this.channels.set(x.length ? x : SEED_CHANNELS)),
      this.source.listenDoc<CrmSettings>('settings/general', (x) => x && this.settings.set({ ...SEED_SETTINGS, ...x })),
      this.source.listenDoc<FlowConfig>('settings/flow', (x) => x && this.flow.set({ ...DEFAULT_FLOW, ...x })),
    );
  }

  /** Detecta cambios importantes (cliente caliente, intención de compra) para avisar al asesor. */
  private onConversations(list: Conversation[]): void {
    const first = this.known.size === 0;
    for (const c of list) {
      const prev = this.known.get(c.id);
      if (!first && prev) {
        if (c.hot && !prev.hot) this.toast(`🔥 ${c.name} está a punto de comprar`, 'hot', c.id);
        else if (c.stage === 'ganado' && prev.stage !== 'ganado') this.toast(`🎉 Venta ganada: ${c.name}`, 'success', c.id);
        else if (c.intent && c.intent.at !== prev.intent?.at && c.intent.type !== prev.intent?.type)
          this.toast(`${intentEmoji(c.intent.type)} ${c.name}: ${c.intent.text}`, 'intent', c.id);
      }
      this.known.set(c.id, c);
    }
    this.conversations.set(list);
  }

  /** Llama a la API y muestra el error al usuario si el servidor la rechaza. */
  private async call<A extends ApiAction>(action: A, data: ApiActions[A]['req']): Promise<ApiActions[A]['res']> {
    try {
      return await this.backend.call(action, data);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        this.toast('Tu sesión expiró. Vuelve a iniciar sesión.', 'error');
        setTimeout(() => (window.location.href = '/login'), 1200);
        throw e;
      }
      const msg = (e as { message?: string }).message ?? 'Error';
      this.toast(`No se pudo completar: ${msg}`, 'error');
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Datos
  // ---------------------------------------------------------------------------

  resetDemo(): void {
    if (this.backend instanceof DemoBackend) {
      this.known.clear();
      this.backend.reset();
    }
  }

  async seedDefaults(): Promise<void> {
    await this.call('seedDefaults', {});
    this.toast('Datos iniciales cargados', 'success');
  }

  /** Detiene la conexión en tiempo real (al cerrar sesión). */
  stop(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.server?.stop();
    this.started = false;
  }

  // ---- Canales: tokens cifrados en el servidor ----
  async saveChannelSecrets(channel: ChannelType, secrets: Record<string, string>): Promise<void> {
    const r = await this.call('saveChannelSecrets', { channel, secrets });
    this.secrets.update((all) => ({ ...all, [channel]: r.status }));
  }
  async testChannel(channel: ChannelType): Promise<{ ok: boolean; message: string }> {
    return this.call('testChannel', { channel });
  }

  // ---- Plataforma (super administrador) ----
  async superCall<A extends SuperAction>(action: A, data: SuperActions[A]['req']): Promise<SuperActions[A]['res']> {
    try {
      return (await api<{ result: SuperActions[A]['res'] }>('/api/super/action', { method: 'POST', body: { action, data } })).result;
    } catch (e) {
      this.toast(`No se pudo completar: ${(e as Error).message}`, 'error');
      throw e;
    }
  }
  /** Entra a gestionar un cliente (o vuelve al panel con null) y recarga la aplicación. */
  async enterTenant(tenantId: string | null): Promise<void> {
    await this.superCall('enterTenant', { tenantId });
    window.location.href = tenantId ? '/inbox' : '/super';
  }

  // ---- Usuarios (solo administrador) ----
  async listUsers(): Promise<CrmUserInfo[]> {
    return (await this.call('listUsers', {})).users;
  }
  async createUser(name: string, email: string, password: string, role: 'admin' | 'asesor'): Promise<CrmUserInfo> {
    return (await this.call('createUser', { name, email, password, role })).user;
  }
  async updateUser(id: string, patch: { name?: string; role?: 'admin' | 'asesor'; active?: boolean; password?: string }): Promise<void> {
    await this.call('updateUser', { id, ...patch });
  }
  async deleteUser(id: string): Promise<void> {
    await this.call('deleteUser', { id });
  }

  // ---------------------------------------------------------------------------
  // Conversaciones
  // ---------------------------------------------------------------------------

  conversation(id: string | null | undefined): Conversation | undefined {
    return this.conversations().find((c) => c.id === id);
  }

  listenMessages(id: string, cb: (m: ChatMessage[]) => void): Unsub {
    return this.source.listenMessages(id, cb);
  }

  async createTestConversation(channel: ChannelType, name: string): Promise<Conversation> {
    const { conversation } = await this.call('createTestConversation', { channel, name });
    this.conversations.update((list) => (list.some((c) => c.id === conversation.id) ? list : [...list, conversation]));
    return conversation;
  }

  /** Mensaje entrante del cliente (simulador). Lo procesa el servidor con el motor del bot. */
  async simulateIncoming(convId: string, input: { text?: string; buttonId?: string; title?: string }): Promise<void> {
    this.setTyping(convId, true);
    try {
      await this.call('simulateIncoming', { conversationId: convId, ...input });
    } finally {
      this.setTyping(convId, false);
    }
  }

  /** Mensaje del asesor. pauseBot: el asesor toma la conversación (texto libre). */
  async sendAgentMessage(convId: string, draft: OutgoingDraft, pauseBot = false): Promise<void> {
    await this.call('sendMessage', { conversationId: convId, draft, pauseBot });
  }

  async addNote(convId: string, text: string): Promise<void> {
    await this.call('addNote', { conversationId: convId, text });
  }

  async setStage(convId: string, stage: StageId): Promise<void> {
    await this.call('setStage', { conversationId: convId, stage });
  }

  async toggleBot(convId: string): Promise<void> {
    await this.call('toggleBot', { conversationId: convId });
  }

  async editConversation(convId: string, edit: ConversationEdit): Promise<void> {
    await this.call('editConversation', { conversationId: convId, edit });
  }

  markRead(convId: string): void {
    if (this.conversation(convId)?.unread) this.editConversation(convId, { markRead: true }).catch(() => {});
  }

  clearIntent(convId: string): Promise<void> {
    return this.editConversation(convId, { clearIntent: true });
  }

  async deleteConversation(convId: string): Promise<void> {
    await this.call('deleteConversation', { conversationId: convId });
  }

  // ---------------------------------------------------------------------------
  // Tareas, catálogo, plantillas, canales, ajustes
  // ---------------------------------------------------------------------------

  async saveTask(task: CrmTask): Promise<void> {
    await this.call('saveTask', { task });
  }
  async toggleTask(t: CrmTask): Promise<void> {
    await this.call('toggleTask', { id: t.id });
  }
  async removeTask(id: string): Promise<void> {
    await this.call('removeTask', { id });
  }
  async saveProduct(product: Product): Promise<void> {
    await this.call('saveProduct', { product });
  }
  async removeProduct(id: string): Promise<void> {
    await this.call('removeProduct', { id });
  }
  async saveTemplate(template: WaTemplate): Promise<void> {
    await this.call('saveTemplate', { template });
  }
  async removeTemplate(id: string): Promise<void> {
    await this.call('removeTemplate', { id });
  }
  async saveChannel(channel: ChannelConfig): Promise<void> {
    await this.call('saveChannel', { channel });
  }
  async saveSettings(settings: CrmSettings): Promise<void> {
    await this.call('saveSettings', { settings });
  }
  async saveFlow(flow: FlowConfig): Promise<void> {
    await this.call('saveFlow', { flow });
  }

  // ---------------------------------------------------------------------------

  toast(text: string, kind: Toast['kind'] = 'info', conversationId?: string): void {
    const t: Toast = { id: newId(), text, kind, conversationId };
    this.toasts.update((l) => [...l, t].slice(-4));
    setTimeout(() => this.dismissToast(t.id), kind === 'error' ? 9000 : 6000);
  }

  dismissToast(id: string): void {
    this.toasts.update((l) => l.filter((x) => x.id !== id));
  }

  private setTyping(convId: string, on: boolean): void {
    this.typing.update((s) => {
      const n = new Set(s);
      if (on) n.add(convId);
      else n.delete(convId);
      return n;
    });
  }
}

