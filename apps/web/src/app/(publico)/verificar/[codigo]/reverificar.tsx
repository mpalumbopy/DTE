'use client';

import { useState } from 'react';

interface ResultadoPublico {
  existe: boolean;
  idDte?: string;
  estado?: string;
  fechaEmision?: string;
  hashVerificacion?: string;
  integridadValida?: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export function Reverificar({ codigo, resultadoInicial }: { codigo: string; resultadoInicial: ResultadoPublico }) {
  const [resultado, setResultado] = useState(resultadoInicial);
  const [verificando, setVerificando] = useState(false);
  const [ultimaVerificacion, setUltimaVerificacion] = useState<Date | null>(null);

  async function reverificar() {
    setVerificando(true);
    try {
      const res = await fetch(`${API_BASE_URL}/verificacion?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' });
      const cuerpo = (await res.json()) as ResultadoPublico;
      setResultado(cuerpo);
      setUltimaVerificacion(new Date());
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="resultado-verificacion">
        <div>
          <dt className="text-xs uppercase text-gray-500">Existe</dt>
          <dd className="text-sm font-medium text-gray-900" data-testid="dato-existe">
            {resultado.existe ? 'Sí' : 'No'}
          </dd>
        </div>
        {resultado.existe && (
          <>
            <div>
              <dt className="text-xs uppercase text-gray-500">Estado</dt>
              <dd className="text-sm font-medium text-gray-900" data-testid="dato-estado">
                {resultado.estado}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">Fecha de emisión</dt>
              <dd className="text-sm font-medium text-gray-900">
                {resultado.fechaEmision ? new Date(resultado.fechaEmision).toLocaleDateString('es-PY') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-gray-500">Integridad</dt>
              <dd
                className={`text-sm font-medium ${resultado.integridadValida ? 'text-green-700' : 'text-red-700'}`}
                data-testid="dato-integridad"
              >
                {resultado.integridadValida ? 'Válida' : 'No se pudo validar'}
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="flex items-center gap-3">
        <button
          data-testid="btn-reverificar"
          onClick={reverificar}
          disabled={verificando}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {verificando ? 'Verificando...' : 'Verificar de nuevo'}
        </button>
        {ultimaVerificacion && (
          <span className="text-xs text-gray-500">Última verificación: {ultimaVerificacion.toLocaleTimeString('es-PY')}</span>
        )}
      </div>
    </div>
  );
}
