'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { ApiError } from '../../../lib/api-client';

type Paso = 'CREDENCIALES' | 'MFA';

export default function LoginPage() {
  const { login, verificarMfa } = useAuth();
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>('CREDENCIALES');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const [mfaPendingToken, setMfaPendingToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviarCredenciales(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const resultado = await login(username, password);
      if (resultado.requiereMfa && resultado.mfaPendingToken) {
        setMfaPendingToken(resultado.mfaPendingToken);
        setPaso('MFA');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error de conexión');
    } finally {
      setEnviando(false);
    }
  }

  async function enviarMfa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await verificarMfa(mfaPendingToken, codigo);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error de conexión');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">PSDTE — Ingresar</h1>

        {paso === 'CREDENCIALES' ? (
          <form onSubmit={enviarCredenciales} className="space-y-4" data-testid="form-login">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">Usuario</label>
              <input
                id="username"
                data-testid="input-username"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Contraseña</label>
              <input
                id="password"
                type="password"
                data-testid="input-password"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600" data-testid="login-error">{error}</p>}
            <button
              type="submit"
              disabled={enviando}
              data-testid="btn-login"
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Ingresar
            </button>
          </form>
        ) : (
          <form onSubmit={enviarMfa} className="space-y-4" data-testid="form-mfa">
            <div>
              <label htmlFor="codigo" className="block text-sm font-medium text-gray-700">Código MFA (TOTP)</label>
              <input
                id="codigo"
                data-testid="input-mfa"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600" data-testid="login-error">{error}</p>}
            <button
              type="submit"
              disabled={enviando}
              data-testid="btn-mfa"
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Verificar
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
