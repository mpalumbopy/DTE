'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../lib/auth-context';
import { ApiError, apiFetch } from '../../../lib/api-client';
import { formatearMonto } from '../../../lib/formato';

type Paso = 1 | 2 | 3 | 4 | 5;

interface Direccion {
  direccion: string;
  codigoCiudad: number;
  codigoDistrito: number;
  codigoDepartamento: number;
  codigoPais: number;
}

interface PersonaEncontrada {
  id: string;
  nombresApellidos: string | null;
  razonSocial: string | null;
  numeroDocumento: string;
}

interface PersonaSeleccionada {
  id: string;
  nombre: string;
}

function direccionInicial(): Direccion {
  return { direccion: '', codigoCiudad: 1, codigoDistrito: 1, codigoDepartamento: 0, codigoPais: 600 };
}

function FormularioDireccion({ etiqueta, valor, onChange, testIdPrefijo }: {
  etiqueta: string;
  valor: Direccion;
  onChange: (d: Direccion) => void;
  testIdPrefijo: string;
}) {
  return (
    <fieldset className="space-y-2 rounded border border-gray-200 p-3">
      <legend className="px-1 text-sm font-medium text-gray-700">{etiqueta}</legend>
      <input
        data-testid={`${testIdPrefijo}-direccion`}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder="Dirección"
        value={valor.direccion}
        onChange={(e) => onChange({ ...valor, direccion: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['codigoPais', 'codigoDepartamento', 'codigoDistrito', 'codigoCiudad'] as const).map((campo) => (
          <label key={campo} className="text-xs text-gray-600">
            {campo.replace('codigo', '')}
            <input
              type="number"
              data-testid={`${testIdPrefijo}-${campo}`}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={valor[campo]}
              onChange={(e) => onChange({ ...valor, [campo]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BuscadorPersona({ etiqueta, seleccionada, onSeleccionar, testIdPrefijo, token }: {
  etiqueta: string;
  seleccionada: PersonaSeleccionada | null;
  onSeleccionar: (p: PersonaSeleccionada) => void;
  testIdPrefijo: string;
  token?: string | null;
}) {
  const [documento, setDocumento] = useState('');
  const [documentoBuscado, setDocumentoBuscado] = useState('');

  const { data: resultados, isFetching } = useQuery({
    queryKey: ['buscar-persona-emision', testIdPrefijo, documentoBuscado],
    queryFn: () => apiFetch<PersonaEncontrada[]>(`/personas?documento=${encodeURIComponent(documentoBuscado)}`, { token }),
    enabled: Boolean(token && documentoBuscado),
  });

  return (
    <div className="space-y-2 rounded border border-gray-200 p-3">
      <p className="text-sm font-medium text-gray-700">{etiqueta}</p>
      {seleccionada ? (
        <div className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-sm">
          <span data-testid={`${testIdPrefijo}-seleccionada`}>{seleccionada.nombre}</span>
          <button className="text-xs text-gray-500 underline" onClick={() => onSeleccionar({ id: '', nombre: '' })}>
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              data-testid={`${testIdPrefijo}-input-documento`}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Número de documento"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
            <button
              data-testid={`${testIdPrefijo}-btn-buscar`}
              onClick={() => setDocumentoBuscado(documento)}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
              type="button"
            >
              Buscar
            </button>
          </div>
          {isFetching && <p className="text-xs text-gray-500">Buscando...</p>}
          {resultados && resultados.length === 0 && <p className="text-xs text-gray-500">No se encontró ninguna persona.</p>}
          {resultados && resultados.length > 0 && (
            <ul className="space-y-1">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    data-testid={`${testIdPrefijo}-resultado-${p.id}`}
                    onClick={() => onSeleccionar({ id: p.id, nombre: p.nombresApellidos ?? p.razonSocial ?? p.id })}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {p.nombresApellidos ?? p.razonSocial} — {p.numeroDocumento}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function EmitirPage() {
  const router = useRouter();
  const { sesion } = useAuth();
  const token = sesion?.accessToken;

  const [paso, setPaso] = useState<Paso>(1);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [monto, setMonto] = useState('');
  const [codigoMoneda, setCodigoMoneda] = useState('PYG');
  const [lugarEmision, setLugarEmision] = useState<Direccion>(direccionInicial());
  const [lugarPago, setLugarPago] = useState<Direccion>(direccionInicial());
  const [acreedor, setAcreedor] = useState<PersonaSeleccionada | null>(null);
  const [deudor, setDeudor] = useState<PersonaSeleccionada | null>(null);
  const [condicionFirmante, setCondicionFirmante] = useState('Deudor-1');
  const [condicionesTexto, setCondicionesTexto] = useState('');
  const [idDatosGenerales, setIdDatosGenerales] = useState<string | null>(null);
  const [idDte, setIdDte] = useState<string | null>(null);
  const [firmantesCompletos, setFirmantesCompletos] = useState<number | null>(null);

  const condiciones = condicionesTexto.split('\n').map((c) => c.trim()).filter(Boolean);

  const mutCrearYSolicitar = useMutation({
    mutationFn: async () => {
      const crear = await apiFetch<{ idDatosGenerales: string; idDte: string }>('/dte/emisiones', {
        method: 'POST',
        token,
        body: {
          fechaVencimiento: new Date(fechaVencimiento).toISOString(),
          monto: Number(monto),
          codigoMoneda,
          lugarEmision,
          lugaresPago: [lugarPago],
          acreedorInicialPersonaId: acreedor!.id,
          deudores: [{ personaId: deudor!.id, condicionFirmante }],
          condiciones,
        },
      });
      const firmas = await apiFetch<{ estado: string; firmantesCompletos: number }>(
        `/dte/emisiones/${crear.idDatosGenerales}/firmas/solicitar`,
        { method: 'POST', token, body: {} },
      );
      return { ...crear, ...firmas };
    },
    onSuccess: (res) => {
      setIdDatosGenerales(res.idDatosGenerales);
      setIdDte(res.idDte);
      setFirmantesCompletos(res.firmantesCompletos);
      setPaso(5);
    },
  });

  const mutConfirmar = useMutation({
    mutationFn: () => apiFetch<{ dteId: string }>(`/dte/emisiones/${idDatosGenerales}/confirmar`, { method: 'POST', token, body: {} }),
    onSuccess: (res) => router.push(`/dte/${res.dteId}`),
  });

  const paso1Completo = Boolean(fechaVencimiento && monto && lugarEmision.direccion && lugarPago.direccion);
  const paso2Completo = Boolean(acreedor?.id && deudor?.id && condicionFirmante);
  const paso3Completo = condiciones.length > 0;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold text-gray-900">Emitir pagaré</h1>

      <ol className="flex flex-wrap gap-2 text-xs" data-testid="pasos-emision">
        {(['Datos generales', 'Partes', 'Condiciones', 'Revisión', 'Firmas'] as const).map((etiqueta, i) => (
          <li
            key={etiqueta}
            className={`rounded px-2 py-1 ${paso === i + 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            {i + 1}. {etiqueta}
          </li>
        ))}
      </ol>

      {paso === 1 && (
        <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
          <label className="block text-sm text-gray-700">
            Fecha de vencimiento
            <input
              data-testid="input-fecha-vencimiento"
              type="date"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <label className="flex-1 text-sm text-gray-700">
              Monto
              <input
                data-testid="input-monto-emision"
                type="number"
                min="1"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </label>
            <label className="w-28 text-sm text-gray-700">
              Moneda
              <select
                data-testid="select-moneda-emision"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={codigoMoneda}
                onChange={(e) => setCodigoMoneda(e.target.value)}
              >
                <option value="PYG">PYG</option>
                <option value="USD">USD</option>
              </select>
            </label>
          </div>
          <FormularioDireccion etiqueta="Lugar de emisión" valor={lugarEmision} onChange={setLugarEmision} testIdPrefijo="lugar-emision" />
          <FormularioDireccion etiqueta="Lugar de pago" valor={lugarPago} onChange={setLugarPago} testIdPrefijo="lugar-pago" />
          <button
            data-testid="btn-siguiente-paso1"
            disabled={!paso1Completo}
            onClick={() => setPaso(2)}
            className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
          <BuscadorPersona etiqueta="Acreedor inicial" seleccionada={acreedor} onSeleccionar={setAcreedor} testIdPrefijo="acreedor" token={token} />
          <BuscadorPersona etiqueta="Deudor" seleccionada={deudor} onSeleccionar={setDeudor} testIdPrefijo="deudor-emision" token={token} />
          <label className="block text-sm text-gray-700">
            Condición del firmante deudor
            <input
              data-testid="input-condicion-firmante"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={condicionFirmante}
              onChange={(e) => setCondicionFirmante(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setPaso(1)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">
              Atrás
            </button>
            <button
              data-testid="btn-siguiente-paso2"
              disabled={!paso2Completo}
              onClick={() => setPaso(3)}
              className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
          <label className="block text-sm text-gray-700">
            Condiciones del pagaré (una por línea)
            <textarea
              data-testid="input-condiciones"
              rows={5}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={condicionesTexto}
              onChange={(e) => setCondicionesTexto(e.target.value)}
              placeholder="La parte deudora se obliga a pagar incondicionalmente la suma indicada."
            />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setPaso(2)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">
              Atrás
            </button>
            <button
              data-testid="btn-siguiente-paso3"
              disabled={!paso3Completo}
              onClick={() => setPaso(4)}
              className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {paso === 4 && (
        <div className="space-y-4 rounded border border-gray-200 bg-white p-4" data-testid="revision-emision">
          <h2 className="text-sm font-semibold text-gray-900">Revisión</h2>
          <dl className="space-y-1 text-sm text-gray-700">
            <div><dt className="inline font-medium">Vencimiento: </dt><dd className="inline">{fechaVencimiento}</dd></div>
            <div><dt className="inline font-medium">Monto: </dt><dd className="inline">{monto && formatearMonto(monto, codigoMoneda)}</dd></div>
            <div><dt className="inline font-medium">Acreedor: </dt><dd className="inline">{acreedor?.nombre}</dd></div>
            <div><dt className="inline font-medium">Deudor: </dt><dd className="inline">{deudor?.nombre} ({condicionFirmante})</dd></div>
            <div><dt className="font-medium">Condiciones:</dt>
              <ul className="ml-4 list-disc">
                {condiciones.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          </dl>
          {mutCrearYSolicitar.isError && (
            <p className="text-sm text-red-700">
              {mutCrearYSolicitar.error instanceof ApiError
                ? `${mutCrearYSolicitar.error.message} (${mutCrearYSolicitar.error.codigo})`
                : 'Error al crear el borrador'}
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setPaso(3)} className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700">
              Atrás
            </button>
            <button
              data-testid="btn-solicitar-firmas"
              disabled={mutCrearYSolicitar.isPending}
              onClick={() => mutCrearYSolicitar.mutate()}
              className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {mutCrearYSolicitar.isPending ? 'Solicitando firmas...' : 'Solicitar firmas'}
            </button>
          </div>
        </div>
      )}

      {paso === 5 && (
        <div className="space-y-4 rounded border border-gray-200 bg-white p-4" data-testid="paso-firmas">
          <h2 className="text-sm font-semibold text-gray-900">Firmas</h2>
          <p className="text-sm text-gray-700">
            ID-DTE: <span className="font-mono">{idDte}</span>
          </p>
          <p className="text-sm text-green-700" data-testid="firmantes-completos">
            {firmantesCompletos} firmante(s) firmaron correctamente.
          </p>
          {mutConfirmar.isError && (
            <p className="text-sm text-red-700">
              {mutConfirmar.error instanceof ApiError ? `${mutConfirmar.error.message} (${mutConfirmar.error.codigo})` : 'Error al confirmar'}
            </p>
          )}
          <button
            data-testid="btn-confirmar-emision"
            disabled={mutConfirmar.isPending}
            onClick={() => mutConfirmar.mutate()}
            className="rounded bg-gray-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {mutConfirmar.isPending ? 'Confirmando...' : 'Confirmar emisión'}
          </button>
        </div>
      )}
    </div>
  );
}
