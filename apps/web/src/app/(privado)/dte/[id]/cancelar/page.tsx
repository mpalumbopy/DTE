'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../../lib/api-client';

export default function CancelarPage({ params }: { params: { id: string } }) {
  const dteId = params.id;
  const router = useRouter();
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [motivo, setMotivo] = useState('');

  const mutCancelar = useMutation({
    mutationFn: () => apiFetch(`/dte/${dteId}/cancelacion`, { method: 'POST', token, body: { motivo } }),
    onSuccess: () => router.push(`/dte/${dteId}`),
  });

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Cancelar pagaré</h1>
      <p className="text-sm text-gray-600">
        Esta acción extingue el título (estado final). No admite eventos posteriores.
      </p>

      <form
        data-testid="form-cancelacion"
        className="space-y-4 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutCancelar.mutate();
        }}
      >
        <label className="block text-sm text-gray-700">
          Motivo
          <textarea
            data-testid="input-motivo-cancelacion"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>

        {mutCancelar.isError && (
          <p className="text-sm text-red-700">
            {mutCancelar.error instanceof ApiError ? `${mutCancelar.error.message} (${mutCancelar.error.codigo})` : 'Error al cancelar'}
          </p>
        )}

        <button
          type="submit"
          data-testid="btn-confirmar-cancelacion"
          disabled={mutCancelar.isPending}
          className="rounded bg-red-700 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutCancelar.isPending ? 'Cancelando...' : 'Confirmar cancelación'}
        </button>
      </form>
    </div>
  );
}
