'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../lib/api-client';
import { formatearFechaHora, formatearMonto } from '../../../../lib/formato';
import { accionesDisponibles, puedeLevantarBloqueo, Transicion } from '../../../../lib/acciones-dte';

interface Parte {
  personaId: string;
  nombre: string;
  rolParte: string;
  condicionFirmante: string | null;
}

interface Evento {
  id: string;
  numeroEvento: string;
  tipoEvento: number;
  fechaEvento: string;
  estadoPrevio: number;
  estadoResultante: number;
  rolActor: string;
  actorDescripcion: string;
}

interface FirmaResumen {
  eventoId: string | null;
  rolFirmante: string;
  ambito: string;
  estadoValidacion: string;
  signingTime: string;
}

interface DetalleDte {
  existe: boolean;
  nivelAcceso: number;
  idDte?: string;
  estado?: string;
  estadoCodigo?: number;
  fechaEmision?: string;
  fechaVencimiento?: string;
  monto?: string;
  monedaCodigo?: string;
  saldoPendiente?: string;
  montoLetras?: string;
  integridadValida?: boolean;
  cadenaHashValida?: boolean;
  eventos?: Evento[];
  firmas?: FirmaResumen[];
  partes?: Parte[];
  bloqueoActivoId?: string | null;
}

interface CatTipoEvento {
  codigo: number;
  nombre: string;
}

export default function DetalleDtePage({ params }: { params: { id: string } }) {
  const dteId = params.id;
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const roles = sesion?.roles ?? [];
  const queryClient = useQueryClient();
  const [motivoLevantamiento, setMotivoLevantamiento] = useState('');
  const [mostrarLevantamiento, setMostrarLevantamiento] = useState(false);

  const { data: detalle, isLoading, isError } = useQuery({
    queryKey: ['dte-detalle', dteId],
    queryFn: () => apiFetch<DetalleDte>(`/dte/${dteId}/verificacion`, { token }),
    enabled: Boolean(token),
  });

  const { data: transiciones } = useQuery({
    queryKey: ['cat-transiciones'],
    queryFn: () => apiFetch<{ items: Transicion[] }>('/catalogos/CAT-DTE-03', { token }),
    enabled: Boolean(token),
  });

  const { data: tiposEvento } = useQuery({
    queryKey: ['cat-tipo-evento'],
    queryFn: () => apiFetch<{ items: CatTipoEvento[] }>('/catalogos/CAT-DTE-02', { token }),
    enabled: Boolean(token),
  });

  const mutLevantarBloqueo = useMutation({
    mutationFn: () =>
      apiFetch(`/dte/${dteId}/bloqueos/${detalle?.bloqueoActivoId}`, {
        method: 'DELETE',
        token,
        body: { motivo: motivoLevantamiento },
      }),
    onSuccess: () => {
      setMostrarLevantamiento(false);
      setMotivoLevantamiento('');
      queryClient.invalidateQueries({ queryKey: ['dte-detalle', dteId] });
    },
  });

  if (isLoading) return <p>Cargando pagaré...</p>;
  if (isError || !detalle?.existe) return <p className="text-sm text-red-700">No se encontró el pagaré.</p>;

  const nombrePorTipoEvento = new Map(tiposEvento?.items.map((t) => [t.codigo, t.nombre]) ?? []);
  const acciones =
    detalle.estadoCodigo !== undefined && transiciones ? accionesDisponibles(detalle.estadoCodigo, transiciones.items, roles) : [];
  const mostrarLevantar =
    detalle.estadoCodigo !== undefined && transiciones && puedeLevantarBloqueo(detalle.estadoCodigo, transiciones.items, roles);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-lg font-semibold text-gray-900" data-testid="detalle-id-dte">
            {detalle.idDte}
          </h1>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700" data-testid="detalle-estado">
            {detalle.estado}
          </span>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="acciones-dte">
          {acciones.map((accion) => (
            <Link
              key={accion.tipoEvento}
              href={accion.ruta(dteId)}
              data-testid={`accion-${accion.tipoEvento}`}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
            >
              {accion.etiqueta}
            </Link>
          ))}
          {detalle.nivelAcceso >= 2 && (
            <Link
              href={`/dte/${dteId}/exportar`}
              data-testid="accion-exportar"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              Exportar
            </Link>
          )}
          {mostrarLevantar && !mostrarLevantamiento && (
            <button
              data-testid="btn-levantar-bloqueo"
              onClick={() => setMostrarLevantamiento(true)}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700"
            >
              Levantar bloqueo
            </button>
          )}
        </div>
      </div>

      {mostrarLevantamiento && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <label className="block text-sm text-gray-700" htmlFor="motivo-levantamiento">
            Motivo del levantamiento
          </label>
          <textarea
            id="motivo-levantamiento"
            data-testid="input-motivo-levantamiento"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            value={motivoLevantamiento}
            onChange={(e) => setMotivoLevantamiento(e.target.value)}
          />
          {mutLevantarBloqueo.isError && (
            <p className="mt-1 text-sm text-red-700">
              {mutLevantarBloqueo.error instanceof ApiError ? mutLevantarBloqueo.error.message : 'Error al levantar el bloqueo'}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              data-testid="btn-confirmar-levantamiento"
              disabled={!motivoLevantamiento || mutLevantarBloqueo.isPending}
              onClick={() => mutLevantarBloqueo.mutate()}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              onClick={() => setMostrarLevantamiento(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {detalle.monto && (
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Monto</p>
            <p className="text-sm font-medium text-gray-900">{formatearMonto(detalle.monto, detalle.monedaCodigo ?? 'PYG')}</p>
          </div>
        )}
        {detalle.saldoPendiente && (
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Saldo pendiente</p>
            <p className="text-sm font-medium text-gray-900">{formatearMonto(detalle.saldoPendiente, detalle.monedaCodigo ?? 'PYG')}</p>
          </div>
        )}
        {detalle.fechaVencimiento && (
          <div className="rounded border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase text-gray-500">Vencimiento</p>
            <p className="text-sm font-medium text-gray-900">{formatearFechaHora(detalle.fechaVencimiento)}</p>
          </div>
        )}
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="text-xs uppercase text-gray-500">Integridad</p>
          <p className={`text-sm font-medium ${detalle.integridadValida ? 'text-green-700' : 'text-red-700'}`}>
            {detalle.integridadValida ? 'Válida' : 'No válida'}
          </p>
        </div>
      </div>

      {detalle.partes && detalle.partes.length > 0 && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Partes</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-700" data-testid="lista-partes">
            {detalle.partes.map((p) => (
              <li key={p.personaId}>
                <span className="font-medium">{p.rolParte}</span>: {p.nombre}
                {p.condicionFirmante ? ` (${p.condicionFirmante})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detalle.eventos && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Timeline de eventos</h2>
          {detalle.eventos.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Sin eventos registrados (solo la emisión).</p>
          ) : (
            <ol className="mt-3 space-y-3" data-testid="timeline-eventos">
              {detalle.eventos.map((evento) => {
                const firmasDelEvento = detalle.firmas?.filter((f) => f.eventoId === evento.id) ?? [];
                return (
                  <li key={evento.id} className="border-l-2 border-gray-300 pl-3" data-testid="timeline-item">
                    <p className="text-sm font-medium text-gray-900">
                      {nombrePorTipoEvento.get(evento.tipoEvento) ?? `Evento ${evento.tipoEvento}`} — N.° {evento.numeroEvento}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatearFechaHora(evento.fechaEvento)} · {evento.actorDescripcion} ({evento.rolActor})
                    </p>
                    <p className="text-xs text-gray-500">
                      Estado: {evento.estadoPrevio} → {evento.estadoResultante}
                    </p>
                    {firmasDelEvento.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {firmasDelEvento.map((f, i) => (
                          <span
                            key={i}
                            title={`${f.rolFirmante} — ${formatearFechaHora(f.signingTime)}`}
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              f.estadoValidacion === 'VALIDA' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {f.rolFirmante}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
