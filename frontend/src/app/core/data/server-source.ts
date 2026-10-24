import { io, Socket } from 'socket.io-client';
import { BootstrapData, CollectionName, RealtimeEvents } from '@shared/api';
import { Tenant } from '@shared/models';
import { ChatMessage } from '@shared/models';
import { environment } from '../../../environments/environment';
import { api } from '../http';
import { ReadSource, Unsub } from './persistence';

type SettingKey = 'general' | 'flow';

/** Datos del cliente activo que no son colecciones (cliente, tokens enmascarados, URL pública). */
export interface SessionMeta {
  tenant: Tenant;
  secrets: Record<string, Record<string, string>>;
  publicBaseUrl: string;
}

/**
 * Lectura en tiempo real desde el backend:
 *  1) GET /api/bootstrap carga todo al entrar,
 *  2) Socket.io avisa cada cambio (nuevos mensajes, etapas, catálogo…).
 * Es de SOLO LECTURA: las escrituras van por la API de acciones.
 */
export class ServerSource implements ReadSource {
  readonly mode = 'server' as const;
  private cols: Record<CollectionName, Map<string, { id: string }>> = {
    conversations: new Map(), products: new Map(), templates: new Map(), tasks: new Map(), channels: new Map(),
  };
  private settings: Record<SettingKey, unknown> = { general: null, flow: null };
  private colListeners = new Map<CollectionName, Set<() => void>>();
  private docListeners = new Map<SettingKey, Set<() => void>>();
  private msgCache = new Map<string, ChatMessage[]>();
  private msgListeners = new Map<string, Set<() => void>>();
  private socket: Socket | null = null;

  private onMeta?: (m: SessionMeta) => void;

  start(onStatus?: (connected: boolean) => void, onMeta?: (m: SessionMeta) => void): void {
    if (this.socket) return;
    this.onMeta = onMeta;
    void this.reload();
    this.socket = io(environment.apiUrl || undefined, { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => {
      onStatus?.(true);
      // Al reconectar recargamos por si se perdieron eventos.
      void this.reload();
      this.msgListeners.forEach((_s, convId) => void this.fetchMessages(convId));
    });
    this.socket.on('disconnect', () => onStatus?.(false));
    this.socket.on('upsert', (e: RealtimeEvents['upsert']) => {
      this.cols[e.col].set(e.item.id, e.item);
      this.fire(this.colListeners.get(e.col));
    });
    this.socket.on('remove', (e: RealtimeEvents['remove']) => {
      this.cols[e.col].delete(e.id);
      this.fire(this.colListeners.get(e.col));
    });
    this.socket.on('setting', (e: RealtimeEvents['setting']) => {
      this.settings[e.key] = e.data;
      this.fire(this.docListeners.get(e.key));
    });
    this.socket.on('message', (e: RealtimeEvents['message']) => {
      const list = this.msgCache.get(e.conversationId);
      if (!list) return;
      if (!list.some((m) => m.id === e.message.id)) {
        list.push(e.message);
        list.sort((a, b) => a.createdAt - b.createdAt);
      }
      this.fire(this.msgListeners.get(e.conversationId));
    });
    this.socket.on('messagePatch', (e: RealtimeEvents['messagePatch']) => {
      const list = this.msgCache.get(e.conversationId);
      const i = list?.findIndex((m) => m.id === e.id) ?? -1;
      if (list && i >= 0) {
        list[i] = { ...list[i], ...e.patch };
        this.fire(this.msgListeners.get(e.conversationId));
      }
    });
  }

  stop(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  async reload(): Promise<void> {
    try {
      const d = await api<BootstrapData>('/api/bootstrap');
      for (const col of Object.keys(this.cols) as CollectionName[]) {
        this.cols[col] = new Map((d[col] as { id: string }[]).map((x) => [x.id, x]));
        this.fire(this.colListeners.get(col));
      }
      this.settings = { general: d.settings, flow: d.flow };
      this.onMeta?.({ tenant: d.tenant, secrets: d.secrets, publicBaseUrl: d.publicBaseUrl });
      this.docListeners.forEach((s) => this.fire(s));
    } catch (e) {
      console.warn('No se pudo cargar el CRM', e);
    }
  }

  private async fetchMessages(convId: string): Promise<void> {
    try {
      const r = await api<{ messages: ChatMessage[] }>(`/api/conversations/${encodeURIComponent(convId)}/messages`);
      this.msgCache.set(convId, r.messages);
      this.fire(this.msgListeners.get(convId));
    } catch (e) {
      console.warn('No se pudieron cargar los mensajes', e);
    }
  }

  private fire(set: Set<() => void> | undefined): void {
    set?.forEach((f) => f());
  }

  private add<K>(map: Map<K, Set<() => void>>, key: K, f: () => void): Unsub {
    let s = map.get(key);
    if (!s) map.set(key, (s = new Set()));
    s.add(f);
    queueMicrotask(f);
    return () => s!.delete(f);
  }

  listen<T extends { id: string }>(col: CollectionName, cb: (items: T[]) => void): Unsub {
    return this.add(this.colListeners, col, () => cb([...this.cols[col].values()] as T[]));
  }

  listenDoc<T>(path: 'settings/general' | 'settings/flow', cb: (doc: T | null) => void): Unsub {
    const key = path.split('/')[1] as SettingKey;
    return this.add(this.docListeners, key, () => cb((this.settings[key] as T) ?? null));
  }

  listenMessages(conversationId: string, cb: (msgs: ChatMessage[]) => void): Unsub {
    const first = !this.msgCache.has(conversationId);
    if (first) this.msgCache.set(conversationId, []);
    const unsub = this.add(this.msgListeners, conversationId, () => cb([...(this.msgCache.get(conversationId) ?? [])]));
    void this.fetchMessages(conversationId);
    return () => {
      unsub();
      if (!this.msgListeners.get(conversationId)?.size) this.msgCache.delete(conversationId);
    };
  }
}
