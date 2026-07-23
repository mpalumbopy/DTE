'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../lib/api-client';

type Severidad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
type Estado = 'ABIERTA' | 'EN_ANALISIS' | 'RESUELTA' | 'CERRADA';

interface Incidencia {
  id: string;
  errorCodigo: string | null;
  dteId: string | null;
  endpoint: string | null;
  detalle: Record<string, unknown> | null;
  severidad: Severidad;
  estado: Estado;
  ocurridoEn: string;
  resueltoEn: string | null;
}

const ESTADOS: Estado[] = ['ABIERTA', 'EN_ANALISIS', 'RESUELTA', 'CERRADA'];
const SEVERIDADES: Severidad[] = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

const COLOR_SEVERIDAD: Record<Severidad, string> = {
  BAJA: 'bg-gray-100 text-gray-700',
  MEDIA: 'bg-amber-100 text-amber-800',
  ALTA: 'bg-orange-100 text-orange-800',
  CRITICA: 'bg-red-100 text-red-800',
};

function construirQuery(estado: string, severidad: string): string {
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (severidad) params.set('severidad', severidad);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function IncidenciasPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const esAdmin = sesion?.roles.includes('ADMIN_PSDTE') ?? false;
  const queryClient = useQueryClient();
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [severidadFiltro, setSeveridadFiltro] = useState('');
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const {
    data: incidencias,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['incidencias', estadoFiltro, severidadFiltro],
    queryFn: () => apiFetch<Incidencia[]>(`/admin/incidencias${construirQuery(estadoFiltro, severidadFiltro)}`, { token }),
    enabled: Boolean(token),
  });

  const mutCambiarEstado = useMutation({
    mutationFn: (vars: { id: string; estado: Estado }) =>
      apiFetch(`/admin/incidencias/${vars.id}/estado`, { method: 'PUT', token, body: { estado: vars.estado } }),
    onSuccess: () => {
      setErrorAccion(null);
      queryClient.invalidateQueries({ queryKey: ['incidencias'] });
    },
    onError: (err) => setErrorAccion(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error al cambiar estado'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Incidencias</h1>

      <div className="flex flex-wrap items-end gap-4 rounded border border-gray-200 bg-white p-4">
        <label className="flex flex-col text-sm text-gray-700">
          Estado
          <select
            data-testid="select-estado"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Severidad
          <select
            data-testid="select-severidad"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={severidadFiltro}
            onChange={(e) => setSeveridadFiltro(e.target.value)}
          >
            <option value="">Todas</option>
            {SEVERIDADES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorAccion && <p className="text-sm text-red-700">{errorAccion}</p>}
      {isLoading && <p>Cargando incidencias...</p>}
      {isError && <p className="text-sm text-red-700">No se pudieron cargar las incidencias.</p>}
      {incidencias && incidencias.length === 0 && <p className="text-sm text-gray-500">Sin incidencias para los filtros aplicados.</p>}

      {incidencias && incidencias.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-sm" data-testid="tabla-incidencias">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Ocurrida</th>
                <th className="px-3 py-2">Error</th>
                <th className="px-3 py-2">Endpoint</th>
                <th className="px-3 py-2">Severidad</th>
                <th className="px-3 py-2">Estado</th>
                {esAdmin && <th className="px-3 py-2">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {incidencias.map((i) => (
                <tr key={i.id} className="border-t border-gray-100" data-testid="fila-incidencia">
                  <td className="px-3 py-2">{new Date(i.ocurridoEn).toLocaleString('es-PY')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{i.errorCodigo ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{i.endpoint ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLOR_SEVERIDAD[i.severidad]}`}>{i.severidad}</span>
                  </td>
                  <td className="px-3 py-2">{i.estado}</td>
                  {esAdmin && (
                    <td className="px-3 py-2">
                      <select
                        data-testid={`select-cambiar-estado-${i.id}`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                        value={i.estado}
                        onChange={(e) => mutCambiarEstado.mutate({ id: i.id, estado: e.target.value as Estado })}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {e}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
