import { Parse } from '../xades';
import {
  AcreedorInicialInput,
  CoDeudorInput,
  DatosGeneralesDteInput,
  DeudorInput,
  DireccionInput,
  DocumentoIdentidadInput,
  EndosatarioInput,
  EventoEndosoInput,
  EventoInput,
  EventoPagoInput,
  EventoCancelacionInput,
} from '../modelo/tipos';

const NAMESPACE_PAGARE = 'http://acraiz.gov.py/pagare/arhivos-en-xsd';

/**
 * Placeholders que el generador debe resolver siempre (ver docs/PLAN.md sección 7: "resolución
 * obligatoria de placeholders ... error si queda alguno sin resolver antes de firmar"). El XML de
 * referencia (test/fixtures/pagare-referencia-firmado.xml) los deja literales — eso es aceptable
 * para un documento de ejemplo, pero NUNCA para uno emitido de verdad: por eso el parser (tolerante)
 * los reporta como aviso, mientras que este builder (estricto) revienta si sobrevive alguno.
 */
const PATRON_PLACEHOLDER = /\[[A-Za-zÁÉÍÓÚÑáéíóúñ]+\]/;

export class ErrorPlaceholderSinResolver extends Error {
  constructor(campo: string, textoConPlaceholder: string) {
    super(`El campo "${campo}" tiene un placeholder sin resolver: "${textoConPlaceholder}"`);
    this.name = 'ErrorPlaceholderSinResolver';
  }
}

function escaparXml(valor: string | number): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function campo(tag: string, valor: string | number): string {
  return `<${tag}>${escaparXml(valor)}</${tag}>`;
}

function campoOpcional(tag: string, valor: string | undefined | null): string {
  return valor === undefined || valor === null || valor === '' ? '' : campo(tag, valor);
}

/** Formatea una fecha como el XML de referencia: ISO 8601 UTC sin milisegundos (`...T00:00:00Z`). */
export function formatearFechaDte(fecha: Date): string {
  return fecha.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function verificarSinPlaceholders(campoNombre: string, texto: string): void {
  const coincidencia = texto.match(PATRON_PLACEHOLDER);
  if (coincidencia) {
    throw new ErrorPlaceholderSinResolver(campoNombre, texto);
  }
}

/** Reemplaza tokens `[Clave]` por su valor resuelto; lanza si falta alguna clave del template. */
function resolverPlaceholders(plantilla: string, valores: Record<string, string>): string {
  const resuelto = plantilla.replace(/\[([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\]/g, (coincidencia, clave: string) => {
    if (!(clave in valores)) {
      return coincidencia;
    }
    return valores[clave];
  });
  return resuelto;
}

// ---------------------------------------------------------------------------------------------
// Bloques de dirección — los nombres de campo NO siguen un patrón uniforme en el perfil real
// (p. ej. "codigoPaisEmision"/"codigoPaisAcreedor" no llevan sufijo "DTE" pero
// "codigoPaisPagoDTE" sí). Se replica cada bloque tal como aparece en el XML de referencia en vez
// de inferirlo por convención, para no adivinar el perfil oficial (ver ADR en docs/DECISIONES.md).
// ---------------------------------------------------------------------------------------------

function bloqueLugarEmision(d: DireccionInput): string {
  return (
    '<gLugarEmisionDTE>' +
    campo('direccionEmisionDTE', d.direccion) +
    campoOpcional('numeroCasaEmisionDTE', d.numeroCasa) +
    campo('codigoCiudadEmisionDTE', d.codigoCiudad) +
    campo('ciudadEmisionDTE', d.ciudad) +
    campo('codigoDistritoEmisionDTE', d.codigoDistrito) +
    campo('distritoEmisionDTE', d.distrito) +
    campo('codigoDepartamentoEmisionDTE', d.codigoDepartamento) +
    campo('departamentoEmisionDTE', d.departamento) +
    campo('codigoPaisEmision', d.codigoPais) +
    campo('dPaisEmisionDTE', d.pais) +
    '</gLugarEmisionDTE>'
  );
}

function bloqueLugarPago(d: DireccionInput): string {
  return (
    '<gLugarPagoDTE>' +
    campo('direccionPagoDTE', d.direccion) +
    campoOpcional('numeroCasaPagoDTE', d.numeroCasa) +
    campo('codigoCiudadPagoDTE', d.codigoCiudad) +
    campo('ciudadPagoDTE', d.ciudad) +
    campo('codigoDistritoPagoDTE', d.codigoDistrito) +
    campo('distritoPagoDTE', d.distrito) +
    campo('codigoDepartamentoPagoDTE', d.codigoDepartamento) +
    campo('departamentoPagoDTE', d.departamento) +
    campo('codigoPaisPagoDTE', d.codigoPais) +
    campo('dPaisPagoDTE', d.pais) +
    '</gLugarPagoDTE>'
  );
}

function bloqueDireccionAcreedor(d: DireccionInput, correo?: string, telefono?: string): string {
  return (
    '<gDireccionAcreedor>' +
    campo('direccionAcreedorDTE', d.direccion) +
    campoOpcional('numeroCasaAcreedorDTE', d.numeroCasa) +
    campo('codigoCiudadAcreedorDTE', d.codigoCiudad) +
    campo('ciudadAcreedorDTE', d.ciudad) +
    campo('codigoDistritoAcreedorDTE', d.codigoDistrito) +
    campo('distritoAcreedorDTE', d.distrito) +
    campo('codigoDepartamentoAcreedorDTE', d.codigoDepartamento) +
    campo('departamentoAcreedorDTE', d.departamento) +
    campo('codigoPaisAcreedor', d.codigoPais) +
    campo('dPaisAcreedor', d.pais) +
    campoOpcional('correoElectronicoAcreedor', correo) +
    campoOpcional('numeroContactoAcreedor', telefono) +
    '</gDireccionAcreedor>'
  );
}

function documentoAcreedor(doc: DocumentoIdentidadInput): string {
  return (
    '<gDocumentoAcreedorInicial>' +
    campo('cTipoDocumento', doc.codigoTipo) +
    campo('dTipoDocumento', doc.tipo) +
    campo('dNumero', doc.numero) +
    campo('codigoPaisDocumento', doc.codigoPais) +
    campo('nombrePaisDocumento', doc.pais) +
    '</gDocumentoAcreedorInicial>'
  );
}

function bloqueAcreedorInicial(a: AcreedorInicialInput): string {
  return (
    '<gAcreedorInicial>' +
    campo('codigoTipoPersonaAcreedor', 1) +
    campo('tipoPersonaAcreedor', 'Fisica') +
    campo('nombresApellidos', a.nombresApellidos) +
    documentoAcreedor(a.documento) +
    '<gDireccionesAcreedor>' +
    a.direcciones.map((d) => bloqueDireccionAcreedor(d, a.email, a.telefono)).join('') +
    '</gDireccionesAcreedor>' +
    '</gAcreedorInicial>'
  );
}

function bloqueDeudor(deudor: DeudorInput): string {
  const d = deudor.direccion;
  const doc = deudor.documento;
  return (
    '<gFirmanteDeudorPersonaFisica>' +
    campo('condicionFirmante', deudor.condicionFirmante) +
    campo('codigoTipoPersonaDeudor', 1) +
    campo('tipoPersonaDeudor', 'Fisica') +
    campo('cTipoDocumentoDeudor', doc.codigoTipo) +
    campo('dTipoDocumentoDeudor', doc.tipo) +
    campo('dNumeroDocumentoDeudor', doc.numero) +
    campo('codigoPaisDocumentoDeudor', doc.codigoPais) +
    campo('nombrePaisDocumentoDeudor', doc.pais) +
    campo('nombresApellidosDeudor', deudor.nombresApellidos) +
    campo('direccionDeudor', d.direccion) +
    campoOpcional('numeroCasaDeudor', d.numeroCasa) +
    campo('codigoCiudadDeudor', d.codigoCiudad) +
    campo('ciudadDeudor', d.ciudad) +
    campo('codigoDistritoDeudor', d.codigoDistrito) +
    campo('distritoDeudor', d.distrito) +
    campo('codigoDepartamentoDeudor', d.codigoDepartamento) +
    campo('departamentoDeudor', d.departamento) +
    campo('codigoPaisDeudor', d.codigoPais) +
    campo('dPaisDeudor', d.pais) +
    campoOpcional('correoElectronicoDeudor', deudor.email) +
    campoOpcional('numeroContactoDeudor', deudor.telefono) +
    '</gFirmanteDeudorPersonaFisica>'
  );
}

function bloqueCoDeudor(codeudor: CoDeudorInput): string {
  const d = codeudor.direccion;
  const doc = codeudor.documento;
  return (
    '<gFirmanteCoDeudorPersonaFisica>' +
    campo('condicionFirmante', codeudor.condicionFirmante) +
    campo('codigoTipoPersonaCoDeudor', 1) +
    campo('tipoPersonaCoDeudor', 'Fisica') +
    campo('cTipoDocumentoCoDeudor', doc.codigoTipo) +
    campo('dTipoDocumentoCoDeudor', doc.tipo) +
    campo('dNumeroDocumentoCoDeudor', doc.numero) +
    campo('codigoPaisDocumentoCoDeudor', doc.codigoPais) +
    campo('nombrePaisDocumentoCoDeudor', doc.pais) +
    campo('nombresApellidosCoDeudor', codeudor.nombresApellidos) +
    campo('direccionCoDeudor', d.direccion) +
    campoOpcional('numeroCasaCoDeudor', d.numeroCasa) +
    campo('codigoCiudadCoDeudor', d.codigoCiudad) +
    campo('ciudadCoDeudor', d.ciudad) +
    campo('codigoDistritoCoDeudor', d.codigoDistrito) +
    campo('distritoCoDeudor', d.distrito) +
    campo('codigoDepartamentoCoDeudor', d.codigoDepartamento) +
    campo('departamentoCoDeudor', d.departamento) +
    campo('codigoPaisCoDeudor', d.codigoPais) +
    campo('dPaisCoDeudor', d.pais) +
    campoOpcional('correoElectronicoCoDeudor', codeudor.email) +
    campoOpcional('numeroContactoCoDeudor', codeudor.telefono) +
    '</gFirmanteCoDeudorPersonaFisica>'
  );
}

function bloqueDeudores(deudores: DeudorInput[], codeudores: CoDeudorInput[]): string {
  const gDeudor =
    '<gDeudor><gFirmantesDeudorPersonaFisica>' +
    deudores.map(bloqueDeudor).join('') +
    '</gFirmantesDeudorPersonaFisica></gDeudor>';
  const gCodeudor =
    codeudores.length === 0
      ? ''
      : '<gCodeudor><gFirmantesCoDeudorPersonaFisica>' +
        codeudores.map(bloqueCoDeudor).join('') +
        '</gFirmantesCoDeudorPersonaFisica></gCodeudor>';
  return `<gDeudores>${gDeudor}${gCodeudor}</gDeudores>`;
}

function bloqueCondiciones(condiciones: string[]): string {
  return (
    '<gCondicionesEmisorDTE>' +
    condiciones.map((c) => `<gCondicionEmisorDTE>${campo('descripcionCondicionDTE', c)}</gCondicionEmisorDTE>`).join('') +
    '</gCondicionesEmisorDTE>'
  );
}

function bloquePrestadorServicio(p: DatosGeneralesDteInput['prestadorServicio']): string {
  return (
    '<gPrestadorServicioDTE>' +
    campo('nombrePSDTE', p.nombre) +
    campo('nomFantasiaPSDTE', p.nombreFantasia) +
    campo('rUCPSDTE', p.ruc) +
    campo('resolucionMIC', p.resolucionMic) +
    campo('telefonoPSDTE', p.telefono) +
    campo('emailPSDTE', p.email) +
    campo('sitiowebPSDTE', p.sitioWeb) +
    '</gPrestadorServicioDTE>'
  );
}

/** Resuelve TextoPromesaPago (ver docs/PLAN.md sección 7: placeholders con resolución obligatoria). */
export function construirTextoPromesaPago(
  input: Pick<DatosGeneralesDteInput, 'acreedorInicial' | 'monto' | 'fechaVencimiento' | 'lugarTextoPromesa'>,
  montoEnLetras: string,
): string {
  const plantilla =
    'Prometo pagar a la orden de [AcreedorInicial] identificado en este documento la suma expresada en ' +
    '[montoDTE], en [lugardte] y [fechaVencimientoDTE] de pago establecidos en las secciones correspondientes, ' +
    'conforme a las demás condiciones aquí consignadas.';
  const texto = resolverPlaceholders(plantilla, {
    AcreedorInicial: input.acreedorInicial.nombresApellidos,
    montoDTE: `${input.monto.toLocaleString('es-PY')} (${montoEnLetras})`,
    lugardte: input.lugarTextoPromesa ?? `${input.acreedorInicial.direcciones[0]?.ciudad ?? ''}, Paraguay`,
    fechaVencimientoDTE: formatearFechaDte(input.fechaVencimiento),
  });
  verificarSinPlaceholders('TextoPromesaPago', texto);
  return texto;
}

/** Resuelve TextoEndoso (mismo criterio: placeholder [nombreEndosatario] siempre resuelto). */
export function construirTextoEndoso(endosatario: EndosatarioInput): string {
  const plantilla = 'Páguese a la orden de [nombreEndosatario] identificado en este documento el presente pagaré.';
  const texto = resolverPlaceholders(plantilla, { nombreEndosatario: endosatario.nombresApellidos });
  verificarSinPlaceholders('TextoEndoso', texto);
  return texto;
}

export interface DocumentoDteConstruido {
  documento: Document;
  /** Nodo <gDatosGeneralesDTE>: destino de las firmas de emisión (deudor, codeudor, sello PSDTE). */
  nodoDatosGenerales: Element;
  /** URI lista para usar como `uriNodoPrincipal` al firmar ("#dDTE..."). */
  uriDatosGenerales: string;
}

/**
 * Construye el XML `<rDTE><DTE><gDatosGeneralesDTE>...</gDatosGeneralesDTE></DTE></rDTE>` (sin
 * firmas todavía) desde el modelo de dominio. Lanza `ErrorPlaceholderSinResolver` si algún texto
 * libre queda con un placeholder `[...]` sin resolver — el generador es estricto (ver docs/PLAN.md
 * sección 7), a diferencia del parser tolerante usado para leer el XML de referencia.
 */
export function construirDatosGeneralesDte(input: DatosGeneralesDteInput, montoEnLetras: string): DocumentoDteConstruido {
  const version = input.version ?? '1.0';
  const codeudores = input.codeudores ?? [];
  const textoPromesaPago = construirTextoPromesaPago(input, montoEnLetras);

  const xml =
    `<rDTE xmlns="${NAMESPACE_PAGARE}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<DTE id="${escaparXml(input.idDte)}" version="${escaparXml(version)}">` +
    `<gDatosGeneralesDTE id="${escaparXml(input.idDatosGenerales)}">` +
    campo('codigoTipoDTE', input.codigoTipoDte) +
    campo('descripcionTipoDTE', input.descripcionTipoDte) +
    campo('numeroDTE', input.numeroDte) +
    campo('fechaEmisionDTE', formatearFechaDte(input.fechaEmision)) +
    campo('fechaVencimientoDTE', formatearFechaDte(input.fechaVencimiento)) +
    campo('codigoMonedaDTE', input.codigoMoneda) +
    campo('descripcionMonedaDTE', input.descripcionMoneda) +
    campo('montoDTE', input.monto) +
    campo('montoDTELetras', montoEnLetras) +
    bloqueLugarEmision(input.lugarEmision) +
    `<gLugaresPagoDTE>${input.lugaresPago.map(bloqueLugarPago).join('')}</gLugaresPagoDTE>` +
    bloqueAcreedorInicial(input.acreedorInicial) +
    `<TextoPromesaPago>${escaparXml(textoPromesaPago)}</TextoPromesaPago>` +
    bloqueCondiciones(input.condiciones) +
    bloqueDeudores(input.deudores, codeudores) +
    bloquePrestadorServicio(input.prestadorServicio) +
    campo('enlaceQRDTE', input.enlaceQr) +
    '</gDatosGeneralesDTE>' +
    '</DTE>' +
    '</rDTE>';

  const documento = Parse(xml);
  const nodoDatosGenerales = documento.getElementsByTagName('gDatosGeneralesDTE')[0] as unknown as Element;
  return { documento, nodoDatosGenerales, uriDatosGenerales: `#${input.idDatosGenerales}` };
}

export interface EventoConstruido {
  /** Nodo <gEvento> recién agregado: destino de las firmas de ese evento. */
  nodoEvento: Element;
  /** URI lista para usar como `uriNodoPrincipal`/referencia adicional ("#eDTE...-NNN"). */
  uriEvento: string;
}

function construirNodoEndoso(e: EventoEndosoInput): string {
  const doc = e.endosante.documento;
  const docEndosatario = e.endosatario.documento;
  return (
    campo('numeroEvento', e.numeroEvento) +
    campo('fechaEvento', formatearFechaDte(e.fechaEvento)) +
    campo('codigoTipoEvento', 3) +
    campo('numeroEndoso', e.numeroEndoso) +
    campo('tipoEvento', 'ENDOSO') +
    '<gEndosante><gFirmanteEndosantePersonaFisica>' +
    campo('condicionFirmante', e.endosante.condicionFirmante) +
    campo('codigoTipoPersonaEndosante', 1) +
    campo('tipoPersonaEndosante', 'Fisica') +
    campo('cTipoDocumentoEndosante', doc.codigoTipo) +
    campo('dTipoDocumentoEndosante', doc.tipo) +
    campo('dNumeroDocumentoEndosante', doc.numero) +
    campo('codigoPaisDocumentoEndosante', doc.codigoPais) +
    campo('nombrePaisDocumentoEndosante', doc.pais) +
    campo('nombresApellidosEndosante', e.endosante.nombresApellidos) +
    '</gFirmanteEndosantePersonaFisica></gEndosante>' +
    '<gEndosatario><gEndosatarioPersonaFisica>' +
    campo('codigoTipoPersonaEndosatario', 1) +
    campo('tipoPersonaEndosatario', 'Fisica') +
    campo('cTipoDocumentoEndosatario', docEndosatario.codigoTipo) +
    campo('dTipoDocumentoEndosatario', docEndosatario.tipo) +
    campo('dNumeroDocumentoEndosatario', docEndosatario.numero) +
    campo('codigoPaisDocumentoEndosatario', docEndosatario.codigoPais) +
    campo('nombrePaisDocumentoEndosatario', docEndosatario.pais) +
    campo('nombreEndosatario', e.endosatario.nombresApellidos) +
    '</gEndosatarioPersonaFisica></gEndosatario>' +
    `<TextoEndoso>${escaparXml(construirTextoEndoso(e.endosatario))}</TextoEndoso>`
  );
}

function construirNodoPago(e: EventoPagoInput): string {
  return (
    campo('numeroEvento', e.numeroEvento) +
    campo('fechaEvento', formatearFechaDte(e.fechaEvento)) +
    campo('codigoTipoEvento', 4) +
    campo('tipoEvento', 'PAGO') +
    campo('numeroPago', e.numeroPago) +
    campo('montoPagado', e.montoPagado) +
    campo('saldoPendiente', e.saldoPendiente)
  );
}

function construirNodoCancelacion(e: EventoCancelacionInput): string {
  return (
    campo('numeroEvento', e.numeroEvento) +
    campo('fechaEvento', formatearFechaDte(e.fechaEvento)) +
    campo('codigoTipoEvento', 1) +
    campo('tipoEvento', 'CANCELACION DEL DTE') +
    campo('motivo', e.motivo)
  );
}

/**
 * Agrega un `<gEvento>` a `<gEventos>` (creándolo si es el primer evento del DTE, con el mismo
 * sufijo correlativo que `vDTE`/`dDTE` — ver docs/PLAN.md sección 5.3). Muta `documento` en el
 * lugar y devuelve el nodo recién creado, listo para firmar.
 */
export function agregarEvento(documento: Document, idDte: string, evento: EventoInput): EventoConstruido {
  let gEventos = documento.getElementsByTagName('gEventos')[0] as unknown as Element | undefined;
  if (!gEventos) {
    const idGEventos = idDte.replace(/^vDTE/, 'eDTE');
    const nodoDte = documento.getElementsByTagName('DTE')[0] as unknown as Element;
    const fragmento = Parse(
      `<gEventos xmlns="${NAMESPACE_PAGARE}" ID="${escaparXml(idGEventos)}"></gEventos>`,
    ).documentElement;
    const importado = documento.importNode(fragmento, false);
    nodoDte.appendChild(importado);
    gEventos = importado as unknown as Element;
  }

  const contenido =
    evento.tipo === 'ENDOSO'
      ? construirNodoEndoso(evento)
      : evento.tipo === 'PAGO'
        ? construirNodoPago(evento)
        : construirNodoCancelacion(evento);

  const fragmentoEvento = Parse(
    `<gEvento xmlns="${NAMESPACE_PAGARE}" ID="${escaparXml(evento.idEvento)}">${contenido}</gEvento>`,
  ).documentElement;
  const nodoEvento = documento.importNode(fragmentoEvento, true) as unknown as Element;
  gEventos.appendChild(nodoEvento);

  return { nodoEvento, uriEvento: `#${evento.idEvento}` };
}
