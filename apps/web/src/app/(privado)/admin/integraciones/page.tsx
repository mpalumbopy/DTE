'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../../lib/api-client';

type Modo = 'SIMULADOR' | 'REAL' | 'DESHABILITADO';
type AuthTipo = 'NONE' | 'BASIC' | 'BEARER' | 'API_KEY' | 'MTLS';

interface UltimoTest {
  ok: boolean;
  latenciaMs: number;
  detalle: string;
  fecha: string;
}

interface Integracion {
  id: string;
  tipo: string;
  nombre: string;
  modo: Modo;
  baseUrl: string | null;
  endpoints: Record<string, string>;
  authTipo: AuthTipo;
  credencialesEnmascaradas: string | null;
  headersExtra: Record<string, string>;
  timeoutMs: number;
  reintentos: number;
  backoffMs: number;
  mapeoPayload: Record<string, unknown>;
  verificarTls: boolean;
  activo: boolean;
  ultimoTest: UltimoTest | null;
  actualizadoPor: string | null;
  actualizadoEn: string;
}

interface EntradaHistorial {
  id: number;
  cambio: { accion: string; modoAnterior?: string; modoNuevo?: string };
  usuarioId: string | null;
  ocurridoEn: string;
}

interface FormState {
  baseUrl: string;
  endpoints: string;
  authTipo: AuthTipo;
  usuario: string;
  clave: string;
  token: string;
  apiKeyHeader: string;
  apiKeyValor: string;
  headersExtra: string;
  timeoutMs: string;
  reintentos: string;
  backoffMs: string;
  mapeoPayload: string;
  verificarTls: boolean;
}

function estadoInicial(integracion: Integracion): FormState {
  return {
    baseUrl: integracion.baseUrl ?? '',
    endpoints: JSON.stringify(integracion.endpoints, null, 2),
    authTipo: integracion.authTipo,
    usuario: '',
    clave: '',
    token: '',
    apiKeyHeader: '',
    apiKeyValor: '',
    headersExtra: JSON.stringify(integracion.headersExtra, null, 2),
    timeoutMs: String(integracion.timeoutMs),
    reintentos: String(integracion.reintentos),
    backoffMs: String(integracion.backoffMs),
    mapeoPayload: JSON.stringify(integracion.mapeoPayload, null, 2),
    verificarTls: integracion.verificarTls,
  };
}

function credencialesTocadas(form: FormState): boolean {
  return Boolean(form.usuario || form.clave || form.token || form.apiKeyHeader || form.apiKeyValor);
}

function construirPayload(form: FormState, modo: Modo) {
  return {
    modo,
    baseUrl: form.baseUrl || null,
    endpoints: JSON.parse(form.endpoints || '{}'),
    authTipo: form.authTipo,
    credenciales: credencialesTocadas(form)
      ? {
          usuario: form.usuario || undefined,
          clave: form.clave || undefined,
          token: form.token || undefined,
          apiKeyHeader: form.apiKeyHeader || undefined,
          apiKeyValor: form.apiKeyValor || undefined,
        }
      : undefined,
    headersExtra: JSON.parse(form.headersExtra || '{}'),
    timeoutMs: Number(form.timeoutMs),
    reintentos: Number(form.reintentos),
    backoffMs: Number(form.backoffMs),
    mapeoPayload: JSON.parse(form.mapeoPayload || '{}'),
    verificarTls: form.verificarTls,
  };
}

export default function IntegracionesPage() {
  const { sesion } = useAuth();
  const token = sesion?.accessToken;
  const queryClient = useQueryClient();
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; detalle: string } | null>(null);
  const [modalConmutar, setModalConmutar] = useState(false);
  const [passwordAdmin, setPasswordAdmin] = useState('');
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const { data: integraciones } = useQuery({
    queryKey: ['integraciones'],
    queryFn: () => apiFetch<Integracion[]>('/admin/integraciones', { token }),
    enabled: Boolean(token),
  });

  const seleccionada = integraciones?.find((i) => i.id === seleccionadaId) ?? null;

  useEffect(() => {
    if (seleccionada) {
      setForm(estadoInicial(seleccionada));
      setResultadoPrueba(null);
      setErrorAccion(null);
    }
  }, [seleccionada?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: historial } = useQuery({
    queryKey: ['integracion-historial', seleccionadaId],
    queryFn: () => apiFetch<EntradaHistorial[]>(`/admin/integraciones/${seleccionadaId}/historial`, { token }),
    enabled: Boolean(token && seleccionadaId),
  });

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['integraciones'] });
    queryClient.invalidateQueries({ queryKey: ['integracion-historial', seleccionadaId] });
    queryClient.invalidateQueries({ queryKey: ['estado-global-integraciones'] });
  };

  const mutTest = useMutation({
    mutationFn: () => apiFetch(`/admin/integraciones/${seleccionadaId}/test`, { method: 'POST', token, body: construirPayload(form!, seleccionada!.modo) }),
    onSuccess: (res: unknown) => {
      const r = res as { ok: boolean; detalle: string };
      setResultadoPrueba({ ok: r.ok, detalle: r.detalle });
    },
    onError: (err) => setResultadoPrueba({ ok: false, detalle: err instanceof ApiError ? err.message : 'Error' }),
  });

  const mutGuardar = useMutation({
    mutationFn: () => apiFetch(`/admin/integraciones/${seleccionadaId}`, { method: 'PUT', token, body: construirPayload(form!, seleccionada!.modo) }),
    onSuccess: () => invalidar(),
    onError: (err) => setErrorAccion(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error al guardar'),
  });

  const mutConmutar = useMutation({
    mutationFn: (vars: { modoDestino: Modo; passwordAdmin?: string }) =>
      apiFetch(`/admin/integraciones/${seleccionadaId}/conmutar`, { method: 'POST', token, body: vars }),
    onSuccess: () => {
      invalidar();
      setModalConmutar(false);
      setPasswordAdmin('');
      setErrorAccion(null);
    },
    onError: (err) => setErrorAccion(err instanceof ApiError ? `${err.message} (${err.codigo})` : 'Error al conmutar'),
  });

  if (!integraciones) {
    return <p>Cargando integraciones...</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-1" data-testid="lista-integraciones">
        <h1 className="text-lg font-semibold text-gray-900">Integraciones</h1>
        {integraciones.map((integracion) => (
          <button
            key={integracion.id}
            data-testid={`card-integracion-${integracion.tipo}`}
            onClick={() => setSeleccionadaId(integracion.id)}
            className={`block w-full rounded border p-3 text-left text-sm ${
              integracion.id === seleccionadaId ? 'border-gray-900 bg-white' : 'border-gray-200 bg-white/60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{integracion.tipo}</span>
              <span
                data-testid={`modo-${integracion.tipo}`}
                className={`rounded px-2 py-0.5 text-xs ${
                  integracion.modo === 'REAL' ? 'bg-green-100 text-green-800' : integracion.modo === 'SIMULADOR' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {integracion.modo}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{integracion.nombre}</p>
            {integracion.ultimoTest && (
              <p className="mt-1 text-xs text-gray-400">
                Último test: {integracion.ultimoTest.ok ? 'OK' : 'FALLÓ'} ({integracion.ultimoTest.latenciaMs} ms)
              </p>
            )}
          </button>
        ))}
      </div>

      <div className="lg:col-span-2">
        {seleccionada && form ? (
          <div className="space-y-6 rounded border border-gray-200 bg-white p-6" data-testid="formulario-integracion">
            <h2 className="text-lg font-semibold text-gray-900">
              Editar {seleccionada.tipo} — {seleccionada.nombre}
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Base URL</label>
                <input
                  data-testid="input-base-url"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de auth</label>
                <select
                  data-testid="select-auth-tipo"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={form.authTipo}
                  onChange={(e) => setForm({ ...form, authTipo: e.target.value as AuthTipo })}
                >
                  <option value="NONE">Ninguna</option>
                  <option value="BASIC">Usuario/clave</option>
                  <option value="BEARER">Token (bearer)</option>
                  <option value="API_KEY">API Key</option>
                  <option value="MTLS">mTLS (certificado)</option>
                </select>
              </div>
            </div>

            {seleccionada.credencialesEnmascaradas && (
              <p className="text-xs text-gray-500">
                Credenciales actuales: <span data-testid="credenciales-enmascaradas">{seleccionada.credencialesEnmascaradas}</span> (se
                mantienen salvo que se complete un campo abajo — &quot;rotar credenciales&quot;)
              </p>
            )}

            {form.authTipo === 'BASIC' && (
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="Usuario" data-testid="input-cred-usuario" className="rounded border border-gray-300 px-3 py-2 text-sm" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
                <input placeholder="Clave" type="password" data-testid="input-cred-clave" className="rounded border border-gray-300 px-3 py-2 text-sm" value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} />
              </div>
            )}
            {form.authTipo === 'BEARER' && (
              <input placeholder="Token" data-testid="input-cred-token" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
            )}
            {form.authTipo === 'API_KEY' && (
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="Header" data-testid="input-cred-apikey-header" className="rounded border border-gray-300 px-3 py-2 text-sm" value={form.apiKeyHeader} onChange={(e) => setForm({ ...form, apiKeyHeader: e.target.value })} />
                <input placeholder="Valor" data-testid="input-cred-apikey-valor" className="rounded border border-gray-300 px-3 py-2 text-sm" value={form.apiKeyValor} onChange={(e) => setForm({ ...form, apiKeyValor: e.target.value })} />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Endpoints (JSON)</label>
              <textarea
                data-testid="textarea-endpoints"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
                rows={3}
                value={form.endpoints}
                onChange={(e) => setForm({ ...form, endpoints: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Timeout (ms)</label>
                <input type="number" data-testid="input-timeout" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reintentos</label>
                <input type="number" data-testid="input-reintentos" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.reintentos} onChange={(e) => setForm({ ...form, reintentos: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Backoff (ms)</label>
                <input type="number" data-testid="input-backoff" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={form.backoffMs} onChange={(e) => setForm({ ...form, backoffMs: e.target.value })} />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" data-testid="checkbox-verificar-tls" checked={form.verificarTls} onChange={(e) => setForm({ ...form, verificarTls: e.target.checked })} />
              Verificar TLS
            </label>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <button
                data-testid="btn-probar-conexion"
                onClick={() => mutTest.mutate()}
                disabled={mutTest.isPending}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
              >
                Probar conexión
              </button>
              <button
                data-testid="btn-guardar"
                onClick={() => mutGuardar.mutate()}
                disabled={mutGuardar.isPending}
                className="rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Guardar
              </button>

              {seleccionada.modo === 'REAL' ? (
                <button
                  data-testid="btn-volver-simulador"
                  onClick={() => mutConmutar.mutate({ modoDestino: 'SIMULADOR' })}
                  className="rounded border border-amber-400 px-3 py-2 text-sm font-medium text-amber-800"
                >
                  Volver a SIMULADOR
                </button>
              ) : (
                <button
                  data-testid="btn-conmutar-real"
                  onClick={() => setModalConmutar(true)}
                  className="rounded border border-green-600 px-3 py-2 text-sm font-medium text-green-700"
                >
                  Conmutar a REAL
                </button>
              )}
            </div>

            {resultadoPrueba && (
              <p data-testid="resultado-prueba" className={`text-sm ${resultadoPrueba.ok ? 'text-green-700' : 'text-red-700'}`}>
                {resultadoPrueba.ok ? 'OK' : 'FALLÓ'} — {resultadoPrueba.detalle}
              </p>
            )}
            {errorAccion && (
              <p data-testid="error-accion" className="text-sm text-red-700">
                {errorAccion}
              </p>
            )}

            {modalConmutar && (
              <div className="fixed inset-0 flex items-center justify-center bg-black/40" data-testid="modal-conmutar">
                <div className="w-full max-w-sm rounded bg-white p-6 shadow-lg">
                  <h3 className="mb-2 text-base font-semibold text-gray-900">Conmutar a REAL</h3>
                  <p className="mb-4 text-sm text-gray-600">
                    Requiere una prueba de conexión exitosa reciente y su contraseña de administrador.
                  </p>
                  <input
                    type="password"
                    placeholder="Contraseña"
                    data-testid="input-password-conmutar"
                    className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={passwordAdmin}
                    onChange={(e) => setPasswordAdmin(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <button data-testid="btn-cancelar-conmutar" onClick={() => setModalConmutar(false)} className="rounded px-3 py-2 text-sm text-gray-600">
                      Cancelar
                    </button>
                    <button
                      data-testid="btn-confirmar-conmutar"
                      onClick={() => mutConmutar.mutate({ modoDestino: 'REAL', passwordAdmin })}
                      className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white"
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Historial</h3>
              <ul data-testid="lista-historial" className="space-y-1 text-xs text-gray-600">
                {(historial ?? []).map((entrada) => (
                  <li key={entrada.id}>
                    {new Date(entrada.ocurridoEn).toLocaleString('es-PY')} — {entrada.cambio.accion}
                    {entrada.cambio.modoAnterior && entrada.cambio.modoNuevo
                      ? ` (${entrada.cambio.modoAnterior} → ${entrada.cambio.modoNuevo})`
                      : ''}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Seleccioná una integración para editarla.</p>
        )}
      </div>
    </div>
  );
}
