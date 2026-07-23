import { Parse } from '../xades';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_SIGNED_PROPS_TYPE = 'http://uri.etsi.org/01903#SignedProperties';

export interface AvisoParser {
  codigo: string;
  mensaje: string;
  contexto?: string;
}

export interface DireccionExtraida {
  direccion?: string;
  numeroCasa?: string;
  ciudad?: string;
  distrito?: string;
  departamento?: string;
  pais?: string;
}

export interface DocumentoIdentidadExtraido {
  tipo?: string;
  numero?: string;
  pais?: string;
}

export interface PersonaExtraida {
  nombre?: string;
  documento: DocumentoIdentidadExtraido;
}

export interface DeudorExtraido extends PersonaExtraida {
  condicionFirmante?: string;
  direccion: DireccionExtraida;
}

export interface AcreedorExtraido extends PersonaExtraida {
  direcciones: DireccionExtraida[];
}

export interface DatosGeneralesExtraidos {
  codigoTipoDte?: string;
  descripcionTipoDte?: string;
  numeroDte?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  codigoMoneda?: string;
  monto?: string;
  montoLetras?: string;
  textoPromesaPago?: string;
  lugarEmision: DireccionExtraida;
  lugaresPago: DireccionExtraida[];
  acreedorInicial: AcreedorExtraido;
  deudores: DeudorExtraido[];
  codeudores: DeudorExtraido[];
  condiciones: string[];
  prestadorServicio: {
    nombre?: string;
    ruc?: string;
    resolucionMic?: string;
  };
  enlaceQr?: string;
}

export interface EventoExtraidoBase {
  idEvento: string | null;
  /** Posición dentro de <gEventos> (orden documental) — NO confiar en <numeroEvento>, ver aviso. */
  posicion: number;
  numeroEvento?: string;
  fechaEvento?: string;
  codigoTipoEvento?: string;
  tipoEvento?: string;
}

export interface EventoEndosoExtraido extends EventoExtraidoBase {
  clase: 'ENDOSO';
  numeroEndoso?: string;
  endosante: PersonaExtraida & { condicionFirmante?: string };
  endosatario: PersonaExtraida;
  textoEndoso?: string;
}

export interface EventoPagoExtraido extends EventoExtraidoBase {
  clase: 'PAGO';
  numeroPago?: string;
  montoPagado?: string;
  saldoPendiente?: string;
}

export interface EventoCancelacionExtraido extends EventoExtraidoBase {
  clase: 'CANCELACION';
  motivo?: string;
}

export interface EventoBloqueoExtraido extends EventoExtraidoBase {
  clase: 'BLOQUEO';
  autoridad?: string;
  numeroOficio?: string;
  fechaOrden?: string;
}

export interface EventoLevantamientoBloqueoExtraido extends EventoExtraidoBase {
  clase: 'LEVANTAMIENTO_BLOQUEO';
  motivo?: string;
}

export interface EventoDesconocidoExtraido extends EventoExtraidoBase {
  clase: 'DESCONOCIDO';
}

export type EventoExtraido =
  | EventoEndosoExtraido
  | EventoPagoExtraido
  | EventoCancelacionExtraido
  | EventoBloqueoExtraido
  | EventoLevantamientoBloqueoExtraido
  | EventoDesconocidoExtraido;

export interface FirmaExtraida {
  id: string | null;
  /** URIs de las referencias de negocio (excluye SignedProperties y KeyInfo). */
  referencias: string[];
  tieneSelloTiempo: boolean;
}

export interface ResultadoParseoDte {
  idDte: string | null;
  idDatosGenerales: string | null;
  version: string | null;
  idEventos: string | null;
  datosGenerales: DatosGeneralesExtraidos;
  eventos: EventoExtraido[];
  firmas: FirmaExtraida[];
  avisos: AvisoParser[];
}

function primerHijo(el: Element | Document | null | undefined, tag: string): Element | null {
  if (!el) return null;
  const nodos = (el as Element).getElementsByTagName(tag);
  return nodos.length > 0 ? (nodos[0] as unknown as Element) : null;
}

function texto(el: Element | Document | null | undefined, tag: string): string | undefined {
  const nodo = primerHijo(el, tag);
  const contenido = nodo?.textContent?.trim();
  return contenido === '' ? undefined : contenido;
}

function todosLosHijos(el: Element | Document | null | undefined, tag: string): Element[] {
  if (!el) return [];
  return Array.from((el as Element).getElementsByTagName(tag)) as unknown as Element[];
}

// Sin la bandera "g": se reutiliza este mismo objeto en varios .test() y "g" arrastra
// lastIndex entre llamadas, produciendo falsos negativos intermitentes (regla general: nunca
// reusar un RegExp con estado global entre llamadas a .test()/.exec()).
const PATRON_PLACEHOLDER = /\[[A-Za-zÁÉÍÓÚÑáéíóúñ]+\]/;

/**
 * `sufijoPais` existe porque el XML de referencia es inconsistente: "dPaisEmisionDTE"/
 * "dPaisPagoDTE" llevan el sufijo "DTE" completo, pero "dPaisAcreedor" no lo lleva (ver ADR en
 * docs/DECISIONES.md) — se pasa el sufijo real observado para ese bloque en particular.
 */
function extraerDireccion(el: Element | null, sufijo: string, sufijoPais: string = sufijo): DireccionExtraida {
  return {
    direccion: texto(el, `direccion${sufijo}`),
    numeroCasa: texto(el, `numeroCasa${sufijo}`),
    ciudad: texto(el, `ciudad${sufijo}`),
    distrito: texto(el, `distrito${sufijo}`),
    departamento: texto(el, `departamento${sufijo}`),
    pais: texto(el, `dPais${sufijoPais}`),
  };
}

function extraerPersonaConSufijo(el: Element | null, sufijo: string): PersonaExtraida {
  return {
    nombre: texto(el, `nombresApellidos${sufijo}`) ?? texto(el, `nombre${sufijo}`),
    documento: {
      tipo: texto(el, `dTipoDocumento${sufijo}`),
      numero: texto(el, `dNumeroDocumento${sufijo}`),
      pais: texto(el, `nombrePaisDocumento${sufijo}`),
    },
  };
}

function extraerDatosGenerales(gDatosGenerales: Element | null, avisos: AvisoParser[]): DatosGeneralesExtraidos {
  const lugarEmisionEl = primerHijo(gDatosGenerales, 'gLugarEmisionDTE');
  const lugaresPagoEls = todosLosHijos(gDatosGenerales, 'gLugarPagoDTE');
  const acreedorEl = primerHijo(gDatosGenerales, 'gAcreedorInicial');
  const direccionesAcreedorEls = todosLosHijos(acreedorEl, 'gDireccionAcreedor');
  const deudorEls = todosLosHijos(gDatosGenerales, 'gFirmanteDeudorPersonaFisica');
  const codeudorEls = todosLosHijos(gDatosGenerales, 'gFirmanteCoDeudorPersonaFisica');
  const condicionEls = todosLosHijos(gDatosGenerales, 'descripcionCondicionDTE');
  const prestadorEl = primerHijo(gDatosGenerales, 'gPrestadorServicioDTE');

  const textoPromesaPago = texto(gDatosGenerales, 'TextoPromesaPago');
  if (textoPromesaPago && PATRON_PLACEHOLDER.test(textoPromesaPago)) {
    avisos.push({
      codigo: 'PLACEHOLDER_SIN_RESOLVER',
      mensaje: 'TextoPromesaPago contiene un placeholder [Clave] sin resolver.',
      contexto: textoPromesaPago,
    });
  }

  return {
    codigoTipoDte: texto(gDatosGenerales, 'codigoTipoDTE'),
    descripcionTipoDte: texto(gDatosGenerales, 'descripcionTipoDTE'),
    numeroDte: texto(gDatosGenerales, 'numeroDTE'),
    fechaEmision: texto(gDatosGenerales, 'fechaEmisionDTE'),
    fechaVencimiento: texto(gDatosGenerales, 'fechaVencimientoDTE'),
    codigoMoneda: texto(gDatosGenerales, 'codigoMonedaDTE'),
    monto: texto(gDatosGenerales, 'montoDTE'),
    montoLetras: texto(gDatosGenerales, 'montoDTELetras'),
    textoPromesaPago,
    lugarEmision: extraerDireccion(lugarEmisionEl, 'EmisionDTE'),
    lugaresPago: lugaresPagoEls.map((el) => extraerDireccion(el, 'PagoDTE')),
    acreedorInicial: {
      nombre: texto(acreedorEl, 'nombresApellidos'),
      documento: {
        tipo: texto(acreedorEl, 'dTipoDocumento'),
        numero: texto(acreedorEl, 'dNumero'),
        pais: texto(acreedorEl, 'nombrePaisDocumento'),
      },
      direcciones: direccionesAcreedorEls.map((el) => extraerDireccion(el, 'AcreedorDTE', 'Acreedor')),
    },
    deudores: deudorEls.map((el) => ({
      ...extraerPersonaConSufijo(el, 'Deudor'),
      condicionFirmante: texto(el, 'condicionFirmante'),
      direccion: extraerDireccion(el, 'Deudor'),
    })),
    codeudores: codeudorEls.map((el) => ({
      ...extraerPersonaConSufijo(el, 'CoDeudor'),
      condicionFirmante: texto(el, 'condicionFirmante'),
      direccion: extraerDireccion(el, 'CoDeudor'),
    })),
    condiciones: condicionEls.map((el) => el.textContent?.trim() ?? ''),
    prestadorServicio: {
      nombre: texto(prestadorEl, 'nombrePSDTE'),
      ruc: texto(prestadorEl, 'rUCPSDTE'),
      resolucionMic: texto(prestadorEl, 'resolucionMIC'),
    },
    enlaceQr: texto(gDatosGenerales, 'enlaceQRDTE'),
  };
}

const CODIGO_TIPO_EVENTO_ENDOSO = '3';
const CODIGO_TIPO_EVENTO_PAGO = '4';
const CODIGO_TIPO_EVENTO_CANCELACION = '1';
const CODIGO_TIPO_EVENTO_BLOQUEO = '2';
const CODIGO_TIPO_EVENTO_LEVANTAMIENTO_BLOQUEO = '7';

function extraerEvento(el: Element, posicion: number, avisos: AvisoParser[]): EventoExtraido {
  const idEvento = el.getAttribute('ID');
  const numeroEvento = texto(el, 'numeroEvento');
  const codigoTipoEvento = texto(el, 'codigoTipoEvento');
  const base: EventoExtraidoBase = {
    idEvento,
    posicion,
    numeroEvento,
    fechaEvento: texto(el, 'fechaEvento'),
    codigoTipoEvento,
    tipoEvento: texto(el, 'tipoEvento'),
  };

  if (numeroEvento !== undefined && numeroEvento !== String(posicion + 1).padStart(numeroEvento.length, '0')) {
    avisos.push({
      codigo: 'NUMERO_EVENTO_NO_SECUENCIAL',
      mensaje:
        `numeroEvento="${numeroEvento}" no coincide con la posición documental del evento ` +
        `(${posicion + 1}ª en <gEventos>); se usa el sufijo del atributo ID como secuencia real.`,
      contexto: idEvento ?? undefined,
    });
  }

  if (codigoTipoEvento === CODIGO_TIPO_EVENTO_ENDOSO) {
    const endosanteEl = primerHijo(el, 'gFirmanteEndosantePersonaFisica');
    const endosatarioEl = primerHijo(el, 'gEndosatarioPersonaFisica');
    const textoEndoso = texto(el, 'TextoEndoso');
    if (textoEndoso && PATRON_PLACEHOLDER.test(textoEndoso)) {
      avisos.push({
        codigo: 'PLACEHOLDER_SIN_RESOLVER',
        mensaje: `TextoEndoso del evento ${idEvento} contiene un placeholder [Clave] sin resolver.`,
        contexto: textoEndoso,
      });
    }
    return {
      ...base,
      clase: 'ENDOSO',
      numeroEndoso: texto(el, 'numeroEndoso'),
      endosante: { ...extraerPersonaConSufijo(endosanteEl, 'Endosante'), condicionFirmante: texto(endosanteEl, 'condicionFirmante') },
      endosatario: { nombre: texto(endosatarioEl, 'nombreEndosatario'), documento: extraerPersonaConSufijo(endosatarioEl, 'Endosatario').documento },
      textoEndoso,
    };
  }

  if (codigoTipoEvento === CODIGO_TIPO_EVENTO_PAGO) {
    return {
      ...base,
      clase: 'PAGO',
      numeroPago: texto(el, 'numeroPago'),
      montoPagado: texto(el, 'montoPagado'),
      saldoPendiente: texto(el, 'saldoPendiente'),
    };
  }

  if (codigoTipoEvento === CODIGO_TIPO_EVENTO_CANCELACION) {
    return { ...base, clase: 'CANCELACION', motivo: texto(el, 'motivo') };
  }

  if (codigoTipoEvento === CODIGO_TIPO_EVENTO_BLOQUEO) {
    return {
      ...base,
      clase: 'BLOQUEO',
      autoridad: texto(el, 'autoridad'),
      numeroOficio: texto(el, 'numeroOficio'),
      fechaOrden: texto(el, 'fechaOrden'),
    };
  }

  if (codigoTipoEvento === CODIGO_TIPO_EVENTO_LEVANTAMIENTO_BLOQUEO) {
    return { ...base, clase: 'LEVANTAMIENTO_BLOQUEO', motivo: texto(el, 'motivo') };
  }

  avisos.push({
    codigo: 'TIPO_EVENTO_DESCONOCIDO',
    mensaje: `codigoTipoEvento="${codigoTipoEvento}" no reconocido (esperado 1/2/3/4/7 — ver CAT_TIPO_EVENTO).`,
    contexto: idEvento ?? undefined,
  });
  return { ...base, clase: 'DESCONOCIDO' };
}

function extraerFirmas(documento: Document): FirmaExtraida[] {
  const firmasEl = Array.from(documento.getElementsByTagNameNS(DS_NS, 'Signature')) as unknown as Element[];
  return firmasEl.map((firmaEl) => {
    const referencias = Array.from(firmaEl.getElementsByTagNameNS(DS_NS, 'Reference')) as unknown as Element[];
    const referenciasNegocio = referencias
      .filter((r) => r.getAttribute('Type') !== XADES_SIGNED_PROPS_TYPE)
      .map((r) => r.getAttribute('URI') ?? '')
      .filter((uri) => !uri.startsWith('#keyInfo-'));
    const tieneSelloTiempo = firmaEl.getElementsByTagName('xades:EncapsulatedTimeStamp').length > 0;
    return { id: firmaEl.getAttribute('Id'), referencias: referenciasNegocio, tieneSelloTiempo };
  });
}

/**
 * Parser tolerante del perfil pagaré-DTE (ver docs/PLAN.md sección 7): lee cualquier XML del
 * perfil, incluido el de referencia con sus inconsistencias conocidas (numeroEvento repetido,
 * placeholders `[Clave]` sin resolver en los textos libres) — esas inconsistencias se reportan en
 * `avisos`, nunca lanzan. Solo lanza si el XML no es parseable o le falta la estructura mínima
 * (`DTE`/`gDatosGeneralesDTE`).
 */
export function parsearDte(xml: string): ResultadoParseoDte {
  const documento = Parse(xml);
  const avisos: AvisoParser[] = [];

  const dteEl = primerHijo(documento, 'DTE');
  const gDatosGeneralesEl = primerHijo(documento, 'gDatosGeneralesDTE');
  if (!dteEl || !gDatosGeneralesEl) {
    throw new Error('XML no reconocible como perfil pagaré-DTE: falta <DTE> o <gDatosGeneralesDTE>.');
  }

  const gEventosEl = primerHijo(documento, 'gEventos');
  const eventoEls = todosLosHijos(gEventosEl, 'gEvento');

  return {
    idDte: dteEl.getAttribute('id'),
    idDatosGenerales: gDatosGeneralesEl.getAttribute('id'),
    version: dteEl.getAttribute('version'),
    idEventos: gEventosEl?.getAttribute('ID') ?? null,
    datosGenerales: extraerDatosGenerales(gDatosGeneralesEl, avisos),
    eventos: eventoEls.map((el, i) => extraerEvento(el, i, avisos)),
    firmas: extraerFirmas(documento),
    avisos,
  };
}
