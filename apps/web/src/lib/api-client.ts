const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly codigo: string,
    message: string,
    public readonly status: number,
    public readonly detalle?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface OpcionesApi {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
}

/** Cliente HTTP mínimo hacia la API (docs/PLAN.md sección 8): siempre bajo /api/v1, adjunta el
 * access token vía Authorization, y traduce el contrato uniforme de error (CAT-DTE-10) a ApiError. */
export async function apiFetch<T>(path: string, opciones: OpcionesApi = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opciones.token) {
    headers.Authorization = `Bearer ${opciones.token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opciones.method ?? 'GET',
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const cuerpo = contentType.includes('application/json') ? await res.json() : undefined;

  if (!res.ok) {
    const error = cuerpo as { error?: string; mensaje?: string; detalle?: Record<string, unknown> } | undefined;
    throw new ApiError(error?.error ?? `ERR-HTTP-${res.status}`, error?.mensaje ?? res.statusText, res.status, error?.detalle);
  }

  return cuerpo as T;
}
