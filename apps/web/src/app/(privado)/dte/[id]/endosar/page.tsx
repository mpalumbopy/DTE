'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../../lib/api-client';

interface PersonaEncontrada {
  id: string;
  nombresApellidos: string | null;
  razonSocial: string | null;
  numeroDocumento: string;
}

export default function EndosarPage({ params }: { params: { id: string } }) {
  const dteId = params.id;
  const router = useRouter();
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const [documento, setDocumento] = useState('');
  const [documentoBuscado, setDocumentoBuscado] = useState('');
  const [endosatarioPersonaId, setEndosatarioPersonaId] = useState<string | null>(null);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['buscar-persona', documentoBuscado],
    queryFn: () => apiFetch<PersonaEncontrada[]>(`/personas?documento=${encodeURIComponent(documentoBuscado)}`, { token }),
    enabled: Boolean(token && documentoBuscado),
  });

  const mutEndosar = useMutation({
    mutationFn: () => apiFetch(`/dte/${dteId}/endosos`, { method: 'POST', token, body: { endosatarioPersonaId } }),
    onSuccess: () => router.push(`/dte/${dteId}`),
  });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Endosar pagaré</h1>

      <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-700">Paso 1: buscar al endosatario por número de documento.</p>
        <div className="flex gap-2">
          <input
            data-testid="input-documento-endosatario"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder="Número de documento"
          />
          <button
            data-testid="btn-buscar-endosatario"
            onClick={() => setDocumentoBuscado(documento)}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
          >
            Buscar
          </button>
        </div>

        {isFetching && <p className="text-sm text-gray-500">Buscando...</p>}
        {resultados && resultados.length === 0 && <p className="text-sm text-gray-500">No se encontró ninguna persona.</p>}
        {resultados && resultados.length > 0 && (
          <ul className="space-y-1" data-testid="resultados-busqueda-persona">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  data-testid={`resultado-persona-${p.id}`}
                  onClick={() => setEndosatarioPersonaId(p.id)}
                  className={`w-full rounded border px-3 py-2 text-left text-sm ${
                    endosatarioPersonaId === p.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200'
                  }`}
                >
                  {p.nombresApellidos ?? p.razonSocial} — {p.numeroDocumento}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {endosatarioPersonaId && (
        <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">Paso 2: confirmar el endoso. La firma se aplica automáticamente al confirmar.</p>
          {mutEndosar.isError && (
            <p className="text-sm text-red-700">
              {mutEndosar.error instanceof ApiError ? `${mutEndosar.error.message} (${mutEndosar.error.codigo})` : 'Error al endosar'}
            </p>
          )}
          <button
            data-testid="btn-confirmar-endoso"
            disabled={mutEndosar.isPending}
            onClick={() => mutEndosar.mutate()}
            className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {mutEndosar.isPending ? 'Endosando...' : 'Confirmar endoso'}
          </button>
        </div>
      )}
    </div>
  );
}
