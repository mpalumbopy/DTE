'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../../lib/api-client';

interface CatCausalBloqueo {
  codigo: number;
  nombre: string;
}

export default function BloquearPage({ params }: { params: { id: string } }) {
  const dteId = params.id;
  const router = useRouter();
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [causalCodigo, setCausalCodigo] = useState('');
  const [autoridad, setAutoridad] = useState('');
  const [numeroOficio, setNumeroOficio] = useState('');
  const [fechaOrden, setFechaOrden] = useState('');

  const { data: causales } = useQuery({
    queryKey: ['cat-causal-bloqueo'],
    queryFn: () => apiFetch<{ items: CatCausalBloqueo[] }>('/catalogos/CAT-DTE-06', { token }),
    enabled: Boolean(token),
  });

  const mutBloquear = useMutation({
    mutationFn: () =>
      apiFetch(`/dte/${dteId}/bloqueos`, {
        method: 'POST',
        token,
        body: {
          causalCodigo: Number(causalCodigo),
          autoridad,
          numeroOficio: numeroOficio || undefined,
          fechaOrden: new Date(fechaOrden).toISOString(),
        },
      }),
    onSuccess: () => router.push(`/dte/${dteId}`),
  });

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Registrar bloqueo por medida de autoridad</h1>

      <form
        data-testid="form-bloqueo"
        className="space-y-4 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutBloquear.mutate();
        }}
      >
        <label className="block text-sm text-gray-700">
          Causal
          <select
            data-testid="select-causal-bloqueo"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={causalCodigo}
            onChange={(e) => setCausalCodigo(e.target.value)}
          >
            <option value="">Seleccione una causal</option>
            {causales?.items.map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-gray-700">
          Autoridad
          <input
            data-testid="input-autoridad"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={autoridad}
            onChange={(e) => setAutoridad(e.target.value)}
            placeholder="Juzgado / entidad que ordena la medida"
          />
        </label>
        <label className="block text-sm text-gray-700">
          N.° de oficio (opcional)
          <input
            data-testid="input-numero-oficio"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={numeroOficio}
            onChange={(e) => setNumeroOficio(e.target.value)}
          />
        </label>
        <label className="block text-sm text-gray-700">
          Fecha de la orden
          <input
            data-testid="input-fecha-orden"
            type="date"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={fechaOrden}
            onChange={(e) => setFechaOrden(e.target.value)}
          />
        </label>

        {mutBloquear.isError && (
          <p className="text-sm text-red-700">
            {mutBloquear.error instanceof ApiError ? `${mutBloquear.error.message} (${mutBloquear.error.codigo})` : 'Error al bloquear'}
          </p>
        )}

        <button
          type="submit"
          data-testid="btn-confirmar-bloqueo"
          disabled={mutBloquear.isPending}
          className="rounded bg-red-700 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutBloquear.isPending ? 'Registrando...' : 'Confirmar bloqueo'}
        </button>
      </form>
    </div>
  );
}
