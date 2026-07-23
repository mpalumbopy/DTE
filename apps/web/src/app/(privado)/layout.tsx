'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth-context';
import { apiFetch } from '../../lib/api-client';

interface EstadoSimuladorCritico {
  enSimulador: boolean;
  tipos: string[];
}

interface ItemNav {
  href: string;
  etiqueta: string;
  roles?: string[];
}

const NAV_PRINCIPAL: ItemNav[] = [
  { href: '/dashboard', etiqueta: 'Dashboard' },
  { href: '/dte', etiqueta: 'Pagarés' },
  { href: '/emitir', etiqueta: 'Emitir', roles: ['OPERADOR_EMISION'] },
];

const NAV_ADMIN: ItemNav[] = [
  { href: '/admin/usuarios', etiqueta: 'Usuarios', roles: ['ADMIN_PSDTE'] },
  { href: '/admin/catalogos', etiqueta: 'Catálogos', roles: ['ADMIN_PSDTE'] },
  { href: '/admin/parametros', etiqueta: 'Parámetros', roles: ['ADMIN_PSDTE'] },
  { href: '/admin/integraciones', etiqueta: 'Integraciones', roles: ['ADMIN_PSDTE'] },
  { href: '/auditoria', etiqueta: 'Auditoría', roles: ['ADMIN_PSDTE', 'AUDITOR'] },
  { href: '/incidencias', etiqueta: 'Incidencias', roles: ['ADMIN_PSDTE', 'AUDITOR'] },
  { href: '/dev/firmador', etiqueta: 'Firmador (dev)', roles: ['ADMIN_PSDTE'] },
];

function visiblePara(item: ItemNav, roles: string[]): boolean {
  return !item.roles || item.roles.some((r) => roles.includes(r));
}

export default function PrivadoLayout({ children }: { children: React.ReactNode }) {
  const { sesion, cargando, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!cargando && !sesion) {
      router.replace('/login');
    }
  }, [cargando, sesion, router]);

  const roles = sesion?.roles ?? [];
  const esAdmin = roles.includes('ADMIN_PSDTE');
  const { data: estadoSimulador } = useQuery({
    queryKey: ['estado-global-integraciones'],
    queryFn: () => apiFetch<EstadoSimuladorCritico>('/admin/integraciones/estado-global', { token: sesion?.accessToken }),
    enabled: Boolean(sesion) && esAdmin,
    refetchInterval: 30_000,
  });

  if (cargando || !sesion) {
    return null;
  }

  const itemsNav = [...NAV_PRINCIPAL, ...NAV_ADMIN].filter((item) => visiblePara(item, roles));

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {estadoSimulador?.enSimulador && (
        <div
          data-testid="banner-simulador"
          className="fixed inset-x-0 top-0 z-20 w-full bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 border-b border-amber-300"
        >
          MODO SIMULADOR ACTIVO — {estadoSimulador.tipos.join(', ')} en simulador (no aptas para producción)
        </div>
      )}

      <button
        data-testid="btn-menu-movil"
        onClick={() => setMenuAbierto((v) => !v)}
        className="fixed left-4 top-4 z-30 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm lg:hidden"
        aria-expanded={menuAbierto}
        aria-controls="nav-lateral"
      >
        Menú
      </button>

      <aside
        id="nav-lateral"
        data-testid="nav-lateral"
        className={`${menuAbierto ? 'block' : 'hidden'} w-64 shrink-0 border-r border-gray-200 bg-white lg:block ${
          estadoSimulador?.enSimulador ? 'lg:pt-9' : ''
        }`}
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <span className="font-semibold text-gray-900">PSDTE</span>
        </div>
        <nav className="space-y-1 p-3">
          {itemsNav.map((item) => {
            const activo = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`nav-${item.href.replace(/\//g, '-').slice(1)}`}
                className={`block rounded px-3 py-2 text-sm ${
                  activo ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => setMenuAbierto(false)}
              >
                {item.etiqueta}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={`flex-1 ${estadoSimulador?.enSimulador ? 'pt-9' : ''}`}>
        <header className="flex items-center justify-end border-b border-gray-200 bg-white px-6 py-3">
          <button data-testid="btn-logout" onClick={logout} className="text-sm text-gray-600 hover:text-gray-900">
            Cerrar sesión
          </button>
        </header>
        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
