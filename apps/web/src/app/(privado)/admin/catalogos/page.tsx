'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { apiFetch } from '../../../../lib/api-client';

const CATALOGOS = [
  { codigo: 'CAT-DTE-01', nombre: 'Estados del DTE' },
  { codigo: 'CAT-DTE-02', nombre: 'Tipos de evento' },
  { codigo: 'CAT-DTE-03', nombre: 'Matriz de transiciones' },
  { codigo: 'CAT-DTE-04', nombre: 'Roles' },
  { codigo: 'CAT-DTE-05', nombre: 'Actos externos' },
  { codigo: 'CAT-DTE-06', nombre: 'Causales de bloqueo' },
  { codigo: 'CAT-DTE-07', nombre: 'Tipos de evidencia' },
  { codigo: 'CAT-DTE-08', nombre: 'Niveles de consulta' },
  { codigo: 'CAT-DTE-09', nombre: 'Tipos de notificación' },
  { codigo: 'CAT-DTE-10', nombre: 'Catálogo de errores' },
];

type FilaCatalogo = Record<string, unknown>;

export default function CatalogosPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [seleccionado, setSeleccionado] = useState(CATALOGOS[0].codigo);

  const { data, isLoading } = useQuery({
    queryKey: ['catalogo-admin', seleccionado],
    queryFn: () => apiFetch<{ codigo: string; version: string; items: FilaCatalogo[] }>(`/catalogos/${seleccionado}`, { token }),
    enabled: Boolean(token),
  });

  const columnas = data?.items.length ? Object.keys(data.items[0]) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Catálogos</h1>

      <div className="flex flex-wrap gap-2" data-testid="selector-catalogos">
        {CATALOGOS.map((c) => (
          <button
            key={c.codigo}
            data-testid={`btn-catalogo-${c.codigo}`}
            onClick={() => setSeleccionado(c.codigo)}
            className={`rounded px-3 py-1.5 text-sm ${
              seleccionado === c.codigo ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {isLoading && <p>Cargando catálogo...</p>}
      {data && (
        <div className="rounded border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs text-gray-500">
            {data.codigo} — versión {data.version} — {data.items.length} filas
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" data-testid="tabla-catalogo">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  {columnas.map((c) => (
                    <th key={c} className="px-3 py-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((fila, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {columnas.map((c) => (
                      <td key={c} className="px-3 py-2 font-mono text-xs">
                        {typeof fila[c] === 'object' ? JSON.stringify(fila[c]) : String(fila[c] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
