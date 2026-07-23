'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../lib/api-client';

interface ResultadoFirma {
  xadesXml: string;
  providerRef: string;
}

export default function FirmadorDevPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [texto, setTexto] = useState('Documento de prueba para el simulador de firma.');
  const [nombreFirmante, setNombreFirmante] = useState('Firmante de prueba');

  const mutFirmar = useMutation({
    mutationFn: () => apiFetch<ResultadoFirma>('/dev/firmador', { method: 'POST', token, body: { texto, nombreFirmante } }),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Firmador de desarrollo</h1>
      <p className="text-sm text-gray-600">
        Firma manual contra el simulador de firma — solo disponible con <code>ALLOW_SIMULATOR=true</code>. Útil para
        inspeccionar el XAdES resultante sin pasar por un flujo de DTE completo.
      </p>

      <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
        <label className="block text-sm text-gray-700">
          Texto a firmar
          <textarea
            data-testid="input-texto-firmador"
            rows={4}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <label className="block text-sm text-gray-700">
          Nombre del firmante
          <input
            data-testid="input-nombre-firmante"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            value={nombreFirmante}
            onChange={(e) => setNombreFirmante(e.target.value)}
          />
        </label>

        {mutFirmar.isError && (
          <p className="text-sm text-red-700">
            {mutFirmar.error instanceof ApiError ? `${mutFirmar.error.message} (${mutFirmar.error.codigo})` : 'Error al firmar'}
          </p>
        )}

        <button
          data-testid="btn-firmar-dev"
          disabled={mutFirmar.isPending}
          onClick={() => mutFirmar.mutate()}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutFirmar.isPending ? 'Firmando...' : 'Firmar'}
        </button>
      </div>

      {mutFirmar.data && (
        <div className="rounded border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">Referencia del proveedor: <span className="font-mono">{mutFirmar.data.providerRef}</span></p>
          <pre
            data-testid="resultado-xades"
            className="mt-2 max-h-96 overflow-auto rounded bg-white p-2 text-xs text-gray-700"
          >
            {mutFirmar.data.xadesXml}
          </pre>
        </div>
      )}
    </div>
  );
}
