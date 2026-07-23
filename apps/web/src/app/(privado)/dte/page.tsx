'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useAuth } from '../../../lib/auth-context';
import { apiFetch } from '../../../lib/api-client';
import { formatearMonto, formatearFecha } from '../../../lib/formato';

interface FilaBandeja {
  id: string;
  idDte: string;
  estadoActual: number;
  estadoNombre: string;
  fechaEmision: string;
  fechaVencimiento: string;
  monto: string;
  monedaCodigo: string;
  saldoPendiente: string;
}

interface ResultadoBandeja {
  items: FilaBandeja[];
  total: number;
  page: number;
  pageSize: number;
}

interface CatEstadoDte {
  codigo: number;
  nombre: string;
}

const columnHelper = createColumnHelper<FilaBandeja>();

const columnas = [
  columnHelper.accessor('idDte', {
    header: 'ID-DTE',
    cell: (info) => (
      <Link href={`/dte/${info.row.original.id}`} className="font-mono text-sm text-gray-900 underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor('estadoNombre', {
    header: 'Estado',
    cell: (info) => (
      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor('fechaEmision', {
    header: 'Emisión',
    cell: (info) => formatearFecha(info.getValue()),
  }),
  columnHelper.accessor('fechaVencimiento', {
    header: 'Vencimiento',
    cell: (info) => formatearFecha(info.getValue()),
  }),
  columnHelper.accessor('monto', {
    header: 'Monto',
    cell: (info) => formatearMonto(info.getValue(), info.row.original.monedaCodigo),
  }),
  columnHelper.accessor('saldoPendiente', {
    header: 'Saldo pendiente',
    cell: (info) => formatearMonto(info.getValue(), info.row.original.monedaCodigo),
  }),
];

export default function BandejaDtePage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [estado, setEstado] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: estados } = useQuery({
    queryKey: ['cat-estado-dte'],
    queryFn: () => apiFetch<{ items: CatEstadoDte[] }>('/catalogos/CAT-DTE-01', { token }),
    enabled: Boolean(token),
  });

  const { data: bandeja, isLoading, isError } = useQuery({
    queryKey: ['dte-bandeja', estado, desde, hasta, q, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (estado) params.set('estado', estado);
      if (desde) params.set('desde', new Date(desde).toISOString());
      if (hasta) params.set('hasta', new Date(hasta).toISOString());
      if (q) params.set('q', q);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      return apiFetch<ResultadoBandeja>(`/dte?${params.toString()}`, { token });
    },
    enabled: Boolean(token),
  });

  const tabla = useReactTable({
    data: bandeja?.items ?? [],
    columns: columnas,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPaginas = bandeja ? Math.max(Math.ceil(bandeja.total / bandeja.pageSize), 1) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Pagarés</h1>

      <form
        data-testid="form-filtros-bandeja"
        className="flex flex-wrap items-end gap-4 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
      >
        <label className="flex flex-col text-sm text-gray-700">
          Estado
          <select
            data-testid="select-estado-bandeja"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {estados?.items.map((e) => (
              <option key={e.codigo} value={e.codigo}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Emitido desde
          <input
            data-testid="input-desde-bandeja"
            type="date"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Emitido hasta
          <input
            data-testid="input-hasta-bandeja"
            type="date"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        <label className="flex flex-col text-sm text-gray-700">
          Buscar ID-DTE
          <input
            data-testid="input-buscar-bandeja"
            className="mt-1 rounded border border-gray-300 px-2 py-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="vDTE-..."
          />
        </label>
        <button data-testid="btn-filtrar-bandeja" type="submit" className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white">
          Filtrar
        </button>
      </form>

      {isLoading && <p>Cargando pagarés...</p>}
      {isError && <p className="text-sm text-red-700">No se pudieron cargar los pagarés.</p>}
      {bandeja && bandeja.items.length === 0 && <p className="text-sm text-gray-500">Sin pagarés para los filtros aplicados.</p>}

      {bandeja && bandeja.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-sm" data-testid="tabla-bandeja">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                {tabla.getHeaderGroups().map((grupo) => (
                  <tr key={grupo.id}>
                    {grupo.headers.map((header) => (
                      <th key={header.id} className="px-3 py-2">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {tabla.getRowModel().rows.map((fila) => (
                  <tr key={fila.id} className="border-t border-gray-100" data-testid="fila-bandeja">
                    {fila.getVisibleCells().map((celda) => (
                      <td key={celda.id} className="px-3 py-2">
                        {flexRender(celda.column.columnDef.cell, celda.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Página {bandeja.page} de {totalPaginas} — {bandeja.total} pagarés
            </span>
            <div className="flex gap-2">
              <button
                data-testid="btn-pagina-anterior"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                data-testid="btn-pagina-siguiente"
                disabled={page >= totalPaginas}
                onClick={() => setPage((p) => Math.min(p + 1, totalPaginas))}
                className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
