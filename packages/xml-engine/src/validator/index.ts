import { readFileSync } from 'fs';
import * as libxmljs from 'libxmljs2';
import { montoALetras } from '../monto-letras';
import { DatosGeneralesExtraidos, ResultadoParseoDte } from '../parser';

export interface ErrorValidacionXsd {
  mensaje: string;
  linea: number | null;
  columna: number | null;
}

export interface ResultadoValidacionXsd {
  valido: boolean;
  errores: ErrorValidacionXsd[];
}

const cacheXsd = new Map<string, libxmljs.Document>();

function obtenerXsd(rutaXsd: string): libxmljs.Document {
  let doc = cacheXsd.get(rutaXsd);
  if (!doc) {
    doc = libxmljs.parseXml(readFileSync(rutaXsd, 'utf8'));
    cacheXsd.set(rutaXsd, doc);
  }
  return doc;
}

/**
 * Valida `xml` contra el XSD en `rutaXsd` (parseo endurecido: sin red, sin resolver entidades ni
 * cargar DTDs externos — ver docs/PLAN.md sección 0.4 "XML"). `rutaXsd` la decide el llamador
 * (en apps/api, la variable de entorno `XSD_PATH`): este paquete no lee configuración de entorno.
 */
export function validarContraXsd(xml: string, rutaXsd: string): ResultadoValidacionXsd {
  const xsdDoc = obtenerXsd(rutaXsd);
  const documento = libxmljs.parseXml(xml, { nonet: true, noent: false, dtdload: false });
  const valido = documento.validate(xsdDoc);
  const errores = documento.validationErrors.map((e) => ({
    mensaje: e.message.trim(),
    linea: e.line,
    columna: e.column,
  }));
  return { valido, errores };
}

export interface ErrorSemantico {
  codigo: string;
  mensaje: string;
}

/**
 * Reglas semánticas del perfil pagaré-DTE que un XSD no puede expresar (ver docs/PLAN.md sección
 * 7): monto↔letras, vencimiento > emisión, unicidad de `condicionFirmante`, coherencia temporal de
 * eventos. Opera sobre el resultado ya extraído por `parser/parsearDte`, no sobre XML crudo.
 */
export function validarSemantica(resultado: Pick<ResultadoParseoDte, 'datosGenerales' | 'eventos'>): ErrorSemantico[] {
  const errores: ErrorSemantico[] = [];
  const { datosGenerales, eventos } = resultado;

  validarMontoLetras(datosGenerales, errores);
  validarFechas(datosGenerales, errores);
  validarCondicionFirmanteUnica(datosGenerales, errores);
  validarCoherenciaTemporalEventos(datosGenerales, eventos, errores);

  return errores;
}

function validarMontoLetras(datosGenerales: DatosGeneralesExtraidos, errores: ErrorSemantico[]): void {
  if (datosGenerales.monto === undefined || datosGenerales.montoLetras === undefined) {
    return;
  }
  const monto = Number(datosGenerales.monto);
  if (!Number.isFinite(monto)) {
    errores.push({ codigo: 'ERR-SEM-001', mensaje: `montoDTE no es un número válido: "${datosGenerales.monto}"` });
    return;
  }
  let esperado: string;
  try {
    esperado = montoALetras(monto);
  } catch (err) {
    errores.push({
      codigo: 'ERR-SEM-001',
      mensaje: `No se pudo verificar montoDTELetras: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  // Comparación insensible a mayúsculas/acentos menores: el XML de referencia usa grafías propias
  // ("Un Millon" sin tilde) — se compara de forma laxa, no textual exacta (ver ADR en DECISIONES.md).
  const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (normalizar(esperado) !== normalizar(datosGenerales.montoLetras)) {
    errores.push({
      codigo: 'ERR-SEM-001',
      mensaje: `montoDTELetras ("${datosGenerales.montoLetras}") no corresponde a montoDTE (${monto} → "${esperado}")`,
    });
  }
}

function validarFechas(datosGenerales: DatosGeneralesExtraidos, errores: ErrorSemantico[]): void {
  if (!datosGenerales.fechaEmision || !datosGenerales.fechaVencimiento) {
    return;
  }
  const emision = new Date(datosGenerales.fechaEmision);
  const vencimiento = new Date(datosGenerales.fechaVencimiento);
  if (Number.isNaN(emision.getTime()) || Number.isNaN(vencimiento.getTime())) {
    errores.push({ codigo: 'ERR-SEM-002', mensaje: 'fechaEmisionDTE o fechaVencimientoDTE no son fechas ISO válidas' });
    return;
  }
  if (vencimiento <= emision) {
    errores.push({
      codigo: 'ERR-SEM-002',
      mensaje: `fechaVencimientoDTE (${datosGenerales.fechaVencimiento}) debe ser posterior a fechaEmisionDTE (${datosGenerales.fechaEmision})`,
    });
  }
}

function validarCondicionFirmanteUnica(datosGenerales: DatosGeneralesExtraidos, errores: ErrorSemantico[]): void {
  const condiciones = [...datosGenerales.deudores, ...datosGenerales.codeudores]
    .map((p) => p.condicionFirmante)
    .filter((c): c is string => c !== undefined);
  const vistos = new Set<string>();
  for (const c of condiciones) {
    if (vistos.has(c)) {
      errores.push({ codigo: 'ERR-SEM-002', mensaje: `condicionFirmante duplicada: "${c}"` });
    }
    vistos.add(c);
  }
}

function validarCoherenciaTemporalEventos(
  datosGenerales: DatosGeneralesExtraidos,
  eventos: ResultadoParseoDte['eventos'],
  errores: ErrorSemantico[],
): void {
  let fechaAnterior = datosGenerales.fechaEmision ? new Date(datosGenerales.fechaEmision) : undefined;
  for (const evento of eventos) {
    if (!evento.fechaEvento) continue;
    const fechaEvento = new Date(evento.fechaEvento);
    if (Number.isNaN(fechaEvento.getTime())) {
      errores.push({
        codigo: 'ERR-SEM-002',
        mensaje: `fechaEvento inválida en el evento ${evento.idEvento ?? evento.posicion}: "${evento.fechaEvento}"`,
      });
      continue;
    }
    if (fechaAnterior && fechaEvento < fechaAnterior) {
      errores.push({
        codigo: 'ERR-SEM-002',
        mensaje: `El evento ${evento.idEvento ?? evento.posicion} tiene fecha anterior al evento/emisión previo`,
      });
    }
    fechaAnterior = fechaEvento;
  }
}
