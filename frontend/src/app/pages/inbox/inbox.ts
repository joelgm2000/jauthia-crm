import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { convVars, outsideWindow } from '@shared/automation';
import { STAGES, stageDef } from '@shared/flow';
import { templateDrafts } from '@shared/templates';
import { HOUR } from '@shared/time';
import { productCard, productDetail } from '@shared/products';
import {
  CHANNEL_LABELS,
  ChannelType,
  ChatMessage,
  ContactFields,
  Conversation,
  Product,
  StageId,
  WaTemplate,
} from '@shared/models';
import { AuthService } from '../../core/auth.service';
import { CrmStore } from '../../core/data/crm-store';
import { FIELD_LABELS, intentEmoji } from '../../ui/labels';
import { newId } from '@shared/ids';
import { ChannelIcon } from '../../ui/channel-icon';
import { Icon } from '../../ui/icon';
import { ButtonPick, MessageBubble } from '../../ui/message-bubble';
import { AgoPipe, CopPipe, InitialsPipe } from '../../ui/pipes';
import { ProductPicker } from './product-picker';
import { TemplatePicker } from './template-picker';

type Filter = 'todas' | 'sin-leer' | 'calientes' | 'bot' | 'asesor' | 'mias';
type ComposerMode = 'reply' | 'note' | 'simulate';


@Component({
  selector: 'app-inbox',
  imports: [FormsModule, RouterLink, Icon, ChannelIcon, MessageBubble, AgoPipe, CopPipe, InitialsPipe, ProductPicker, TemplatePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inbox.html',
  styleUrl: './inbox.css',
})
export class Inbox {
  readonly store = inject(CrmStore);
  private auth = inject(AuthService);
  private router = inject(Router);

  /** Parámetro de ruta /inbox/:id */
  readonly id = input<string>();

  readonly stages = STAGES;
  readonly fieldDefs = FIELD_LABELS;
  readonly channelLabels = CHANNEL_LABELS;
  readonly allChannels = Object.keys(CHANNEL_LABELS) as ChannelType[];

  readonly filter = signal<Filter>('todas');
  readonly channelFilter = signal<ChannelType | 'all'>('all');
  readonly search = signal('');
  readonly messages = signal<ChatMessage[]>([]);
  readonly mode = signal<ComposerMode>('reply');
  readonly draft = signal('');
  readonly showProducts = signal(false);
  readonly showTemplates = signal(false);
  readonly showNewTest = signal(false);
  readonly showInfo = signal(window.innerWidth > 1100);
  readonly newTag = signal('');
  readonly testChannel = signal<ChannelType>('whatsapp');
  readonly testName = signal('');

  private scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  private box = viewChild<ElementRef<HTMLTextAreaElement>>('box');

  readonly conv = computed(() => this.store.conversation(this.id()));

  readonly list = computed(() => {
    const q = this.search().toLowerCase().trim();
    const f = this.filter();
    const ch = this.channelFilter();
    const u = this.auth.user();
    const me = this.store.settings().advisors.find((a) => a.email === u?.email || a.name === u?.name)?.id ?? u?.id;
    return this.store.sortedConversations().filter((c) => {
      if (ch !== 'all' && c.channel !== ch) return false;
      if (f === 'sin-leer' && !c.unread) return false;
      if (f === 'calientes' && !c.hot) return false;
      if (f === 'bot' && !c.botActive) return false;
      if (f === 'asesor' && c.botActive) return false;
      if (f === 'mias' && c.assignedTo !== me) return false;
      if (q && !`${c.name} ${c.phone ?? ''} ${c.lastMessage} ${c.fields.ciudad ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  readonly channelCounts = computed(() => {
    const m = new Map<string, number>();
    for (const c of this.store.conversations()) m.set(c.channel, (m.get(c.channel) ?? 0) + 1);
    return m;
  });

  readonly intentProducts = computed<Product[]>(() => {
    const ids = this.conv()?.intent?.productIds ?? [];
    return this.store.products().filter((p) => ids.includes(p.id));
  });

  readonly convTasks = computed(() => this.store.tasks().filter((t) => t.conversationId === this.id()));
  readonly typing = computed(() => this.store.typing().has(this.id() ?? ''));
  readonly stageName = computed(() => stageDef(this.conv()?.stage)?.name);

  /** WhatsApp/Meta solo permiten mensajes libres hasta 24 h después del último mensaje del cliente. */
  readonly outsideWindow = computed(() => {
    const c = this.conv();
    return !!c && outsideWindow(c, Date.now());
  });

  readonly advisors = computed(() => this.store.settings().advisors);

  constructor() {
    // Suscripción a los mensajes de la conversación abierta.
    effect((onCleanup) => {
      const id = this.id();
      this.messages.set([]);
      if (!id) return;
      const unsub = this.store.listenMessages(id, (m) => {
        this.messages.set(m);
        queueMicrotask(() => this.scrollBottom());
        // Las imágenes del carrusel cambian la altura al cargar.
        setTimeout(() => this.scrollBottom(), 350);
      });
      untracked(() => {
        this.store.markRead(id);
        const c = this.store.conversation(id);
        if (c?.simulated && c.botActive) this.mode.set('simulate');
        else if (this.mode() === 'simulate' && !c?.simulated) this.mode.set('reply');
      });
      onCleanup(unsub);
    });
    effect(() => {
      if (this.typing()) queueMicrotask(() => this.scrollBottom());
    });
    // Abre la primera conversación en pantallas anchas.
    effect(() => {
      const first = this.list()[0];
      if (!this.id() && first && window.innerWidth > 1100) untracked(() => this.open(first));
    });
  }

  open(c: Conversation): void {
    this.router.navigate(['/inbox', c.id]);
  }

  back(): void {
    this.router.navigate(['/inbox']);
  }

  scrollBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  intentEmoji = intentEmoji;

  // ---------------------------------------------------------------------------
  // Composer
  // ---------------------------------------------------------------------------

  async send(): Promise<void> {
    const c = this.conv();
    const text = this.draft().trim();
    if (!c || !text) return;
    this.draft.set('');
    const el = this.box()?.nativeElement;
    if (el) el.value = '';
    // El servidor agrega el autor de la nota (📝 Nombre: …).
    if (this.mode() === 'note') await this.store.addNote(c.id, text);
    else if (this.mode() === 'simulate') await this.store.simulateIncoming(c.id, { text });
    else {
      // Al escribir texto libre el asesor toma la conversación (el servidor pausa el bot).
      await this.store.sendAgentMessage(c.id, { type: 'text', text }, true);
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  onPick(p: ButtonPick): void {
    const c = this.conv();
    if (c && this.mode() === 'simulate') this.store.simulateIncoming(c.id, { buttonId: p.id, title: p.title });
  }

  // ---------------------------------------------------------------------------
  // Productos y plantillas
  // ---------------------------------------------------------------------------

  async sendProducts(e: { products: Product[]; as: 'carousel' | 'detail' }): Promise<void> {
    const c = this.conv();
    this.showProducts.set(false);
    if (!c || !e.products.length) return;
    if (e.as === 'detail') {
      for (const p of e.products) await this.store.sendAgentMessage(c.id, productDetail(p));
    } else {
      await this.store.sendAgentMessage(c.id, { type: 'carousel', text: '', cards: e.products.map((p) => productCard(p)) });
    }
  }

  async sendIntentCarousel(): Promise<void> {
    await this.sendProducts({ products: this.intentProducts(), as: this.intentProducts().length === 1 ? 'detail' : 'carousel' });
  }

  async sendTemplate(t: WaTemplate): Promise<void> {
    const c = this.conv();
    this.showTemplates.set(false);
    if (!c) return;
    const vars = convVars(c, this.store.products(), this.store.settings().companyName);
    for (const d of templateDrafts(t, this.store.products(), vars)) await this.store.sendAgentMessage(c.id, d);
  }


  // ---------------------------------------------------------------------------
  // Panel derecho
  // ---------------------------------------------------------------------------

  setStage(stage: string): void {
    const c = this.conv();
    if (c) this.store.setStage(c.id, stage as StageId);
  }

  setField(key: keyof ContactFields, value: string): void {
    const c = this.conv();
    if (!c) return;
    const num = !!FIELD_LABELS.find((f) => f.key === key)?.numeric;
    const fields = { ...c.fields, [key]: value === '' ? undefined : num ? Number(value) : value };
    this.store.editConversation(c.id, { fields });
  }

  fieldValue(c: Conversation, key: keyof ContactFields): string {
    const v = c.fields[key];
    return v === undefined || v === null ? '' : String(v);
  }

  addTag(): void {
    const c = this.conv();
    const t = this.newTag().trim().toLowerCase().replace(/\s+/g, '-');
    if (!c || !t || c.tags.includes(t)) return;
    this.store.editConversation(c.id, { tags: [...c.tags, t] });
    this.newTag.set('');
  }

  removeTag(tag: string): void {
    const c = this.conv();
    if (c) this.store.editConversation(c.id, { tags: c.tags.filter((x) => x !== tag) });
  }

  setAssigned(id: string): void {
    const c = this.conv();
    if (c) this.store.editConversation(c.id, { assignedTo: id || null });
  }

  togglePriority(): void {
    const c = this.conv();
    if (c) this.store.editConversation(c.id, { priority: c.priority === 'alta' ? 'normal' : 'alta' });
  }

  setValue(v: string): void {
    const c = this.conv();
    if (c) this.store.editConversation(c.id, { value: Number(v) || 0 });
  }

  addTask(): void {
    const c = this.conv();
    if (!c) return;
    this.store.saveTask({
      id: newId('t'),
      conversationId: c.id,
      title: `Llamar a ${c.name}`,
      detail: c.summary ?? '',
      dueAt: Date.now() + HOUR,
      done: false,
      priority: c.priority,
      assignedTo: c.assignedTo ?? null,
      createdAt: Date.now(),
    });
  }

  async createTest(): Promise<void> {
    const conv = await this.store.createTestConversation(this.testChannel(), this.testName());
    this.showNewTest.set(false);
    this.testName.set('');
    this.filter.set('todas');
    this.channelFilter.set('all');
    await this.router.navigate(['/inbox', conv.id]);
    this.mode.set('simulate');
  }

  async deleteConv(): Promise<void> {
    const c = this.conv();
    if (!c || !confirm(`¿Eliminar la conversación con ${c.name}?`)) return;
    await this.store.deleteConversation(c.id);
    this.back();
  }

  stageColor(id: StageId): string {
    return stageDef(id)?.color ?? '#999';
  }

  stageLabel(id: StageId): string {
    return stageDef(id)?.name ?? id;
  }

  advisorName(id: string | null | undefined): string {
    return this.advisors().find((a) => a.id === id)?.name ?? 'Sin asignar';
  }
}
