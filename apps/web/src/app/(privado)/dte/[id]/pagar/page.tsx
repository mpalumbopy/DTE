'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../../lib/api-client';

export default function PagarPage({ params }: { params: { id: string } }) {
  const dteId = params.id;
  const router = useRouter();
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [montoPagado, setMontoPagado] = useState('');
  const [medioPago, setMedioPago] = useState('TRANSFERENCIA');
  const [referenciaExterna, setReferenciaExterna] = useState('');

  const mutPagar = useMutation({
    mutationFn: () =>
      apiFetch(`/dte/${dteId}/pagos`, {
        method: 'POST',
        token,
        body: { montoPagado: Number(montoPagado), medioPago, referenciaExterna: referenciaExterna || undefined },
      }),
    onSuccess: () => router.push(`/dte/${dteId}`),
  });

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Registrar pago</h1>

      <form
        data-testid="form-pago"
        className="space-y-4 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutPagar.mutate();
        }}
      >
        <label className="block text-sm text-gray-700">
          Monto pagado
          <input
            data-testid="input-monto-pagado"
            type="number"
            min="0.01"
            step="0.01"
            required
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={montoPagado}
            onChange={(e) => setMontoPagado(e.target.value)}
          />
        </label>
        <label className="block text-sm text-gray-700">
          Medio de pago
          <select
            data-testid="select-medio-pago"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={medioPago}
            onChange={(e) => setMedioPago(e.target.value)}
          >
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="CHEQUE">Cheque</option>
          </select>
        </label>
        <label className="block text-sm text-gray-700">
          Referencia externa (opcional)
          <input
            data-testid="input-referencia-pago"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={referenciaExterna}
            onChange={(e) => setReferenciaExterna(e.target.value)}
          />
        </label>

        {mutPagar.isError && (
          <p className="text-sm text-red-700">
            {mutPagar.error instanceof ApiError ? `${mutPagar.error.message} (${mutPagar.error.codigo})` : 'Error al registrar el pago'}
          </p>
        )}

        <button
          type="submit"
          data-testid="btn-confirmar-pago"
          disabled={mutPagar.isPending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutPagar.isPending ? 'Registrando...' : 'Confirmar pago'}
        </button>
      </form>
    </div>
  );
}
