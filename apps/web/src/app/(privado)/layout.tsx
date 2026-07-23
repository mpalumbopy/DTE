'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth-context';
import { apiFetch } from '../../lib/api-client';

interface EstadoSimuladorCritico {
  enSimulador: boolean;
  tipos: string[];
}

export default function PrivadoLayout({ children }: { children: React.ReactNode }) {
  const { sesion, cargando, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!cargando && !sesion) {
      router.replace('/login');
    }
  }, [cargando, sesion, router]);

  const esAdmin = sesion?.roles.includes('ADMIN_PSDTE') ?? false;
  const { data: estadoSimulador } = useQuery({
    queryKey: ['estado-global-integraciones'],
    queryFn: () => apiFetch<EstadoSimuladorCritico>('/admin/integraciones/estado-global', { token: sesion?.accessToken }),
    enabled: Boolean(sesion) && esAdmin,
    refetchInterval: 30_000,
  });

  if (cargando || !sesion) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {estadoSimulador?.enSimulador && (
        <div
          data-testid="banner-simulador"
          className="w-full bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 border-b border-amber-300"
        >
          MODO SIMULADOR ACTIVO — {estadoSimulador.tipos.join(', ')} en simulador (no aptas para producción)
        </div>
      )}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <span className="font-semibold text-gray-900">PSDTE</span>
        <button data-testid="btn-logout" onClick={logout} className="text-sm text-gray-600 hover:text-gray-900">
          Cerrar sesión
        </button>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
