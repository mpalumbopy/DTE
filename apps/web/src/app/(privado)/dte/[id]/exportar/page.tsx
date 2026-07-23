'use client';

import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../../lib/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

interface ResultadoExportacion {
  exportacionId: string;
  hashSha256: string;
  uriObjeto: string;
}

export default function ExportarPage({ params }: { params: { id: string } }) {
  const dteId = params.id;
  const { sesion } = useAuth();
  const token = sesion?.accessToken;

  const mutContenedor = useMutation({
    mutationFn: () => apiFetch<ResultadoExportacion>(`/dte/${dteId}/exportacion`, { method: 'POST', token, body: { tipo: 'CONTENEDOR' } }),
  });
  const mutPdfA = useMutation({
    mutationFn: () => apiFetch<ResultadoExportacion>(`/dte/${dteId}/exportacion`, { method: 'POST', token, body: { tipo: 'PDF_A' } }),
  });

  // El endpoint de descarga solo acepta el token vía header Authorization (no query param), así
  // que un <a href> normal no autenticaría la petición: se descarga como blob autenticado y se
  // dispara la descarga desde un object URL.
  async function descargar(exportacionId: string) {
    const res = await fetch(`${API_BASE_URL}/exportaciones/${exportacionId}/descargar`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = exportacionId;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  function ResultadoDescarga({ resultado }: { resultado: ResultadoExportacion }) {
    return (
      <div className="mt-2 rounded border border-green-200 bg-green-50 p-3 text-sm">
        <p className="text-green-800">Generado. Hash SHA-256: <span className="font-mono text-xs">{resultado.hashSha256}</span></p>
        <button
          data-testid="btn-descargar-exportacion"
          onClick={() => descargar(resultado.exportacionId)}
          className="mt-1 font-medium text-gray-900 underline"
        >
          Descargar →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Exportar pagaré</h1>

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Contenedor probatorio (ZIP)</h2>
        <p className="mt-1 text-sm text-gray-600">
          Incluye el XML vigente, evidencias, certificados y un manifiesto sellado con TSA — listo para expediente.
        </p>
        {mutContenedor.isError && (
          <p className="mt-1 text-sm text-red-700">
            {mutContenedor.error instanceof ApiError ? mutContenedor.error.message : 'Error al generar el contenedor'}
          </p>
        )}
        <button
          data-testid="btn-generar-contenedor"
          disabled={mutContenedor.isPending}
          onClick={() => mutContenedor.mutate()}
          className="mt-2 rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutContenedor.isPending ? 'Generando...' : 'Generar contenedor'}
        </button>
        {mutContenedor.data && <ResultadoDescarga resultado={mutContenedor.data} />}
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Representación PDF/A</h2>
        <p className="mt-1 text-sm text-gray-600">Documento legible para presentación, con conformidad PDF/A verificada.</p>
        {mutPdfA.isError && (
          <p className="mt-1 text-sm text-red-700">
            {mutPdfA.error instanceof ApiError ? mutPdfA.error.message : 'Error al generar el PDF/A'}
          </p>
        )}
        <button
          data-testid="btn-generar-pdfa"
          disabled={mutPdfA.isPending}
          onClick={() => mutPdfA.mutate()}
          className="mt-2 rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {mutPdfA.isPending ? 'Generando...' : 'Generar PDF/A'}
        </button>
        {mutPdfA.data && <ResultadoDescarga resultado={mutPdfA.data} />}
      </div>
    </div>
  );
}
