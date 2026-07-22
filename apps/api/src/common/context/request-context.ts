import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  requestId: string;
  usuarioId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContextStore>();

export function obtenerRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

export function obtenerUsuarioIdContexto(): string | undefined {
  return requestContextStorage.getStore()?.usuarioId;
}

export function fijarUsuarioIdContexto(usuarioId: string): void {
  const store = requestContextStorage.getStore();
  if (store) {
    store.usuarioId = usuarioId;
  }
}
