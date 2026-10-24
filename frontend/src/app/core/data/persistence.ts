import { ChatMessage } from '@shared/models';

export type Unsub = () => void;

export type { CollectionName } from '@shared/api';
import type { CollectionName } from '@shared/api';

/**
 * Fuente de datos de SOLO LECTURA para la interfaz (escuchas en tiempo real).
 * Las escrituras nunca pasan por aquí: van por CrmBackend (API del servidor).
 */
export interface ReadSource {
  readonly mode: 'demo' | 'server';
  listen<T extends { id: string }>(col: CollectionName, cb: (items: T[]) => void): Unsub;
  listenDoc<T>(path: 'settings/general' | 'settings/flow', cb: (doc: T | null) => void): Unsub;
  listenMessages(conversationId: string, cb: (msgs: ChatMessage[]) => void): Unsub;
}
