import { ApiAction, ApiActions } from '@shared/api';
import { api } from '../http';

/**
 * Todas las escrituras del CRM pasan por aquí.
 *  - Con servidor: ApiBackend llama a POST /api/action, que valida sesión, rol y datos.
 *  - En modo demo: DemoBackend (demo-backend.ts) simula ese servidor dentro del navegador.
 */
export interface CrmBackend {
  call<A extends ApiAction>(action: A, data: ApiActions[A]['req']): Promise<ApiActions[A]['res']>;
}

export class ApiBackend implements CrmBackend {
  async call<A extends ApiAction>(action: A, data: ApiActions[A]['req']): Promise<ApiActions[A]['res']> {
    const r = await api<{ result: ApiActions[A]['res'] }>('/api/action', { method: 'POST', body: { action, data } });
    return r.result;
  }
}
