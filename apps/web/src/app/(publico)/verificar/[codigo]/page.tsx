import { QrCodigo } from './qr-codigo';
import { Reverificar } from './reverificar';

interface ResultadoPublico {
  existe: boolean;
  idDte?: string;
  estado?: string;
  fechaEmision?: string;
  hashVerificacion?: string;
  integridadValida?: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

async function consultarVerificacion(codigo: string): Promise<ResultadoPublico> {
  const res = await fetch(`${API_BASE_URL}/verificacion?codigo=${encodeURIComponent(codigo)}`, { cache: 'no-store' });
  if (!res.ok) {
    return { existe: false };
  }
  return (await res.json()) as ResultadoPublico;
}

export default async function VerificarPage({ params }: { params: { codigo: string } }) {
  const codigo = decodeURIComponent(params.codigo);
  const resultado = await consultarVerificacion(codigo);
  const urlPropia = `${PUBLIC_BASE_URL}/verificar/${encodeURIComponent(codigo)}`;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold text-gray-900">Verificación de pagaré electrónico</h1>
      <p className="mt-1 text-sm text-gray-600" data-testid="codigo-consultado">
        Código consultado: <span className="font-mono">{codigo}</span>
      </p>

      {!resultado.existe && (
        <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="no-existe">
          No se encontró ningún pagaré electrónico con este código. Verifique que el código esté completo y correctamente
          escrito.
        </div>
      )}

      {resultado.existe && (
        <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex-1 rounded border border-gray-200 bg-white p-4">
            <Reverificar codigo={codigo} resultadoInicial={resultado} />
          </div>
          <div className="flex flex-col items-center gap-2 rounded border border-gray-200 bg-white p-4">
            <QrCodigo url={urlPropia} />
            <p className="text-center text-xs text-gray-500">Escanee para volver a esta verificación</p>
          </div>
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400">
        Esta consulta pública no expone datos personales de las partes del pagaré (Ley N.° 6822/2021, art. 5.2).
      </p>
    </main>
  );
}
