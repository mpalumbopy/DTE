'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../lib/auth-context';
import { apiFetch } from '../../../lib/api-client';

interface KpisDashboard {
  emitidosActivos: number;
  porVencer: number;
  bloqueados: number;
  incidenciasAbiertas: number | null;
}

function TarjetaKpi({ etiqueta, valor, testId, tono }: { etiqueta: string; valor: number | null; testId: string; tono?: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4" data-testid={testId}>
      <p className="text-xs uppercase text-gray-500">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold ${tono ?? 'text-gray-900'}`}>{valor ?? '—'}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;

  const { data: kpis, isLoading, isError } = useQuery({
    queryKey: ['dte-kpis'],
    queryFn: () => apiFetch<KpisDashboard>('/dte/kpis', { token }),
    enabled: Boolean(token),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>

      {isLoading && <p>Cargando KPIs...</p>}
      {isError && <p className="text-sm text-red-700">No se pudieron cargar los indicadores.</p>}

      {kpis && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TarjetaKpi etiqueta="Pagarés emitidos activos" valor={kpis.emitidosActivos} testId="kpi-emitidos" />
          <TarjetaKpi
            etiqueta="Por vencer (≤7 días)"
            valor={kpis.porVencer}
            testId="kpi-por-vencer"
            tono={kpis.porVencer > 0 ? 'text-amber-700' : undefined}
          />
          <TarjetaKpi
            etiqueta="Bloqueados"
            valor={kpis.bloqueados}
            testId="kpi-bloqueados"
            tono={kpis.bloqueados > 0 ? 'text-red-700' : undefined}
          />
          <TarjetaKpi etiqueta="Incidencias abiertas" valor={kpis.incidenciasAbiertas} testId="kpi-incidencias" />
        </div>
      )}

      <div className="rounded border border-gray-200 bg-white p-4">
        <Link href="/dte" data-testid="link-ir-bandeja" className="text-sm font-medium text-gray-900 underline">
          Ver bandeja de pagarés →
        </Link>
      </div>
    </div>
  );
}
