'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../lib/api-client';

interface Parametro {
  clave: string;
  valor: unknown;
  descripcion: string | null;
  editable: boolean;
  actualizadoEn: string;
}

export default function ParametrosPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const queryClient = useQueryClient();
  const [claveEnEdicion, setClaveEnEdicion] = useState<string | null>(null);
  const [valorTexto, setValorTexto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: parametros, isLoading } = useQuery({
    queryKey: ['parametros'],
    queryFn: () => apiFetch<Parametro[]>('/parametros', { token }),
    enabled: Boolean(token),
  });

  const mutActualizar = useMutation({
    mutationFn: (clave: string) => apiFetch(`/parametros/${clave}`, { method: 'PUT', token, body: { valor: JSON.parse(valorTexto) } }),
    onSuccess: () => {
      setClaveEnEdicion(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['parametros'] });
    },
    onError: (err) => setError(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error al actualizar'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Parámetros del sistema</h1>

      {isLoading && <p>Cargando parámetros...</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {parametros && (
        <div className="space-y-3" data-testid="lista-parametros">
          {parametros.map((p) => (
            <div key={p.clave} className="rounded border border-gray-200 bg-white p-4" data-testid={`parametro-${p.clave}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-medium text-gray-900">{p.clave}</p>
                  {p.descripcion && <p className="text-xs text-gray-500">{p.descripcion}</p>}
                </div>
                {!p.editable && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">No editable</span>}
              </div>

              {claveEnEdicion === p.clave ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    data-testid={`input-valor-${p.clave}`}
                    className="w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                    rows={3}
                    value={valorTexto}
                    onChange={(e) => setValorTexto(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      data-testid={`btn-guardar-parametro-${p.clave}`}
                      onClick={() => mutActualizar.mutate(p.clave)}
                      disabled={mutActualizar.isPending}
                      className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button onClick={() => setClaveEnEdicion(null)} className="rounded border border-gray-300 px-3 py-1 text-xs">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <pre className="overflow-x-auto text-xs text-gray-700">{JSON.stringify(p.valor, null, 2)}</pre>
                  {p.editable && (
                    <button
                      data-testid={`btn-editar-parametro-${p.clave}`}
                      onClick={() => {
                        setClaveEnEdicion(p.clave);
                        setValorTexto(JSON.stringify(p.valor, null, 2));
                      }}
                      className="shrink-0 rounded border border-gray-300 px-3 py-1 text-xs text-gray-700"
                    >
                      Editar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
