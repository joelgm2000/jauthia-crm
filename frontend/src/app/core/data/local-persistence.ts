import { ChatMessage } from '@shared/models';
import { CollectionName, ReadSource, Unsub } from './persistence';

const KEY = 'jauthia-crm-demo-v1';

interface DemoDb {
  cols: Record<CollectionName, Record<string, { id: string }>>;
  docs: Record<string, object>;
  messages: Record<string, ChatMessage[]>;
}

/** Persistencia en el navegador (modo demo). Notifica cambios a la interfaz en tiempo real. */
export class LocalPersistence implements ReadSource {
  readonly mode = 'demo' as const;
  private db: DemoDb;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.db = this.load() ?? this.empty();
  }

  get isEmpty(): boolean {
    return Object.keys(this.db.cols.products).length === 0;
  }

  reset(): void {
    this.db = this.empty();
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* sin almacenamiento */
    }
    this.emit();
  }

  /** Carga masiva sin disparar un evento por cada elemento (semilla del demo). */
  bulk(fn: () => void): void {
    const prev = this.listeners;
    this.listeners = new Set();
    try {
      fn();
    } finally {
      this.listeners = prev;
      this.emit();
    }
  }

  get<T>(col: CollectionName, id: string): T | undefined {
    const v = this.db.cols[col][id];
    return v ? (structuredClone(v) as T) : undefined;
  }

  all<T>(col: CollectionName): T[] {
    return Object.values(this.db.cols[col]).map((x) => structuredClone(x) as T);
  }

  getDoc<T>(path: string): T | undefined {
    const v = this.db.docs[path];
    return v ? (structuredClone(v) as T) : undefined;
  }

  listen<T extends { id: string }>(col: CollectionName, cb: (items: T[]) => void): Unsub {
    const fire = () => cb(Object.values(this.db.cols[col]).map((x) => structuredClone(x)) as T[]);
    return this.subscribe(fire);
  }

  listenDoc<T>(path: string, cb: (doc: T | null) => void): Unsub {
    const fire = () => cb(this.db.docs[path] ? (structuredClone(this.db.docs[path]) as T) : null);
    return this.subscribe(fire);
  }

  listenMessages(conversationId: string, cb: (msgs: ChatMessage[]) => void): Unsub {
    const fire = () => cb([...(this.db.messages[conversationId] ?? [])].sort((a, b) => a.createdAt - b.createdAt));
    return this.subscribe(fire);
  }

  async set<T extends { id: string }>(col: CollectionName, item: T): Promise<void> {
    this.db.cols[col][item.id] = structuredClone(item);
    this.emit();
  }

  async update(col: CollectionName, id: string, patch: object): Promise<void> {
    const cur = this.db.cols[col][id];
    if (!cur) return;
    this.db.cols[col][id] = { ...cur, ...structuredClone(patch) };
    this.emit();
  }

  async remove(col: CollectionName, id: string): Promise<void> {
    delete this.db.cols[col][id];
    if (col === 'conversations') delete this.db.messages[id];
    this.emit();
  }

  async setDoc(path: string, data: object): Promise<void> {
    this.db.docs[path] = structuredClone(data);
    this.emit();
  }

  async addMessage(msg: ChatMessage): Promise<void> {
    (this.db.messages[msg.conversationId] ??= []).push(structuredClone(msg));
    this.emit();
  }

  async updateMessage(conversationId: string, id: string, patch: Partial<ChatMessage>): Promise<void> {
    const list = this.db.messages[conversationId] ?? [];
    const i = list.findIndex((m) => m.id === id);
    if (i >= 0) list[i] = { ...list[i], ...patch };
    this.emit();
  }

  // ---------------------------------------------------------------------------

  private subscribe(fire: () => void): Unsub {
    this.listeners.add(fire);
    queueMicrotask(fire);
    return () => this.listeners.delete(fire);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 300);
  }

  private persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db));
    } catch {
      /* cuota llena o modo privado: seguimos en memoria */
    }
  }

  private load(): DemoDb | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as DemoDb) : null;
    } catch {
      return null;
    }
  }

  private empty(): DemoDb {
    return {
      cols: { conversations: {}, products: {}, templates: {}, tasks: {}, channels: {} },
      docs: {},
      messages: {},
    };
  }
}
