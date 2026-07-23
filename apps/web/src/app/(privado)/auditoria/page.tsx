'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../lib/auth-context';
import { apiFetch } from '../../../lib/api-client';

interface RegistroAuditoria {
  id: string;
  ocurridoEn: string;
  usuarioId: string | null;
  accion: string;
  entidad: string | null;
  entidadId: string | null;
  detalle: Record<string, unknown> | null;
  hashRegistro: string;
  hashAnterior: string | null;
}

interface ResultadoVerificacionCadena {
  valida: boolean;
  filasVerificadas: number;
  motivos: string[];
}

interface Filtros {
  entidad: string;
  entidadId: string;
  desde: string;
  hasta: string;
}

function construirQuery(filtros: Filtros): string {
  const params = new URLSearchParams();
  if (filtros.entidad) params.set('entidad', filtros.entidad);
  if (filtros.entidadId) params.set('entidadId', filtros.entidadId);
  if (filtros.desde) params.set('desde', new Date(filtros.desde).toISOString());
  if (filtros.hasta) params.set('hasta', new Date(filtros.hasta).toISOString());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function AuditoriaPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [filtros, setFiltros] = useState<Filtros>({ entidad: '', entidadId: '', desde: '', hasta: '' });
  const [filtrosAplicados, setFiltrosAplicados] = useState<Filtros>(filtros);

  const {
    data: registros,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['auditoria', filtrosAplicados],
    queryFn: () => apiFetch<RegistroAuditoria[]>(`/admin/auditoria${construirQuery(filtrosAplicados)}`, { token }),
    enabled: Boolean(token),
  });

  const {
    data: verificacion,
    refetch: verificarCadena,
    isFetching: verificando,
  } = useQuery({
    queryKey: ['auditoria-verificar-cadena'],
    queryFn: () => apiFetch<ResultadoVerificacionCadena>('/admin/auditoria/verificar-cadena', { token }),
    enabled: false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Auditoría</h1>

      <form
        data-testid="form-filtros-auditoria"
        className="flex flex-wrap items-end gap-4 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFiltrosAplicados(filtros);
        }}
      >
        <label className="flex flex-col text-sm text-gray-700">
          Entidad
          <input
            data-testid="input-entidad"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={filtros.entidad}
            onChange={(e) => setFiltros({ ...filtros, entidad: e.target.value })}
            placeholder="dte"
          />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Entidad ID
          <input
            data-testid="input-entidad-id"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={filtros.entidadId}
            onChange={(e) => setFiltros({ ...filtros, entidadId: e.target.value })}
          />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Desde
          <input
            data-testid="input-desde"
            type="datetime-local"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={filtros.desde}
            onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
          />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Hasta
          <input
            data-testid="input-hasta"
            type="datetime-local"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={filtros.hasta}
            onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
          />
        </label>
        <button data-testid="btn-filtrar" type="submit" className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white">
          Filtrar
        </button>
      </form>

      <div className="rounded border border-gray-200 bg-white p-4" data-testid="panel-verificacion">
        <div className="flex items-center gap-3">
          <button
            data-testid="btn-verificar-cadena"
            onClick={() => verificarCadena()}
            disabled={verificando}
            className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {verificando ? 'Verificando...' : 'Verificar cadena de hashes'}
          </button>
          {verificacion && (
            <span
              data-testid="resultado-verificacion"
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                verificacion.valida ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {verificacion.valida
                ? `Cadena válida (${verificacion.filasVerificadas} filas verificadas)`
                : `Cadena inválida: ${verificacion.motivos.join('; ')}`}
            </span>
          )}
        </div>
      </div>

      {isLoading && <p>Cargando registros de auditoría...</p>}
      {isError && (
        <p className="text-sm text-red-700">
          No se pudieron cargar los registros ({error instanceof Error ? error.message : 'error desconocido'}).
        </p>
      )}
      {registros && registros.length === 0 && <p className="text-sm text-gray-500">Sin registros para los filtros aplicados.</p>}
      {registros && registros.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-sm" data-testid="tabla-auditoria">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Entidad</th>
                <th className="px-3 py-2">Entidad ID</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Hash</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-gray-100" data-testid="fila-auditoria">
                  <td className="px-3 py-2">{new Date(r.ocurridoEn).toLocaleString('es-PY')}</td>
                  <td className="px-3 py-2">{r.accion}</td>
                  <td className="px-3 py-2">{r.entidad ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.entidadId ?? '—'}</td>
                  <td className="px-3 py-2">{r.usuarioId ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs" title={r.hashRegistro}>
                    {r.hashRegistro.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
