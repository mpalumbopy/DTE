/**
 * Modelo de dominio del perfil pagaré-DTE (ver docs/PLAN.md sección 7 y el XML de referencia en
 * `test/fixtures/pagare-referencia-firmado.xml`). Estos tipos son el contrato entre el resto del
 * sistema (apps/api) y `builder`/`validator`/`parser` de este paquete — no dependen de TypeORM ni
 * de ningún framework.
 *
 * Solo se modela "persona física" (`codigoTipoPersona=1`), que es lo único demostrado en el XML de
 * referencia; "persona jurídica" (`codigoTipoPersona=2`) queda fuera de alcance hasta contar con un
 * ejemplo real de esa variante (ver ADR correspondiente en docs/DECISIONES.md).
 */

export interface DireccionInput {
  direccion: string;
  numeroCasa?: string;
  codigoCiudad: number;
  ciudad: string;
  codigoDistrito: number;
  distrito: string;
  codigoDepartamento: number;
  departamento: string;
  codigoPais: number;
  pais: string;
}

export interface DocumentoIdentidadInput {
  /** cTipoDocumento / codigoTipoDocumentoXxx del catálogo (1=CI, ver cat_tipo_documento_identidad). */
  codigoTipo: number;
  /** dTipoDocumento: descripción del catálogo (p. ej. "CI"). */
  tipo: string;
  numero: string;
  codigoPais: number;
  pais: string;
}

export interface PersonaFisicaInput {
  nombresApellidos: string;
  documento: DocumentoIdentidadInput;
  email?: string;
  telefono?: string;
}

export interface AcreedorInicialInput extends PersonaFisicaInput {
  direcciones: DireccionInput[];
}

export interface DeudorInput extends PersonaFisicaInput {
  /** condicionFirmante: identifica al firmante dentro del documento (p. ej. "Deudor-1"). */
  condicionFirmante: string;
  direccion: DireccionInput;
}

export interface CoDeudorInput extends PersonaFisicaInput {
  condicionFirmante: string;
  direccion: DireccionInput;
}

export interface PrestadorServicioInput {
  nombre: string;
  nombreFantasia: string;
  ruc: string;
  resolucionMic: string;
  telefono: string;
  email: string;
  sitioWeb: string;
}

export interface DatosGeneralesDteInput {
  /** Atributo id de <DTE> (vDTE...) — ver IdDteService, docs/PLAN.md sección 5.3. */
  idDte: string;
  /** Atributo id de <gDatosGeneralesDTE> (dDTE...), mismo sufijo que idDte. */
  idDatosGenerales: string;
  version?: string;
  /** codigoTipoDTE: 1 = pagaré a la orden (único perfil soportado, ver cat_estado_dte/plan). */
  codigoTipoDte: number;
  descripcionTipoDte: string;
  numeroDte: number;
  fechaEmision: Date;
  fechaVencimiento: Date;
  codigoMoneda: string;
  descripcionMoneda: string;
  monto: number;
  lugarEmision: DireccionInput;
  lugaresPago: DireccionInput[];
  acreedorInicial: AcreedorInicialInput;
  deudores: DeudorInput[];
  codeudores?: CoDeudorInput[];
  /** Descripciones de gCondicionEmisorDTE, en el orden en que deben quedar en el XML. */
  condiciones: string[];
  prestadorServicio: PrestadorServicioInput;
  enlaceQr: string;
  /** Lugar a usar para resolver el placeholder [lugardte] de TextoPromesaPago (ciudad, país). */
  lugarTextoPromesa?: string;
}

export interface EndosanteInput extends PersonaFisicaInput {
  condicionFirmante: string;
}

export interface EndosatarioInput extends PersonaFisicaInput {}

export interface EventoEndosoInput {
  tipo: 'ENDOSO';
  /** Atributo ID de <gEvento> (eDTE...-NNN). */
  idEvento: string;
  numeroEvento: string;
  fechaEvento: Date;
  /** numeroEndoso: "01", "02"... */
  numeroEndoso: string;
  endosante: EndosanteInput;
  endosatario: EndosatarioInput;
}

export interface EventoPagoInput {
  tipo: 'PAGO';
  idEvento: string;
  numeroEvento: string;
  fechaEvento: Date;
  numeroPago: string;
  montoPagado: number;
  saldoPendiente: number;
}

export interface EventoCancelacionInput {
  tipo: 'CANCELACION';
  idEvento: string;
  numeroEvento: string;
  fechaEvento: Date;
  motivo: string;
}

/**
 * BLOQUEO y LEVANTAMIENTO_BLOQUEO no están demostrados en el XML de referencia (ver ADR-014): la
 * forma de estos dos `gEvento` es inferida a partir de `dte_bloqueo` (db/modelo_datos_psdte.sql) y
 * documentada como "punto a confirmar" en `schema/pagare-dte.provisional.xsd`, no adivinada en
 * silencio.
 */
export interface EventoBloqueoInput {
  tipo: 'BLOQUEO';
  idEvento: string;
  numeroEvento: string;
  fechaEvento: Date;
  /** Código de cat_causal_bloqueo. */
  codigoCausalBloqueo: number;
  causalBloqueo: string;
  autoridad: string;
  numeroOficio?: string;
  fechaOrden: Date;
}

export interface EventoLevantamientoBloqueoInput {
  tipo: 'LEVANTAMIENTO_BLOQUEO';
  idEvento: string;
  numeroEvento: string;
  fechaEvento: Date;
  motivo: string;
}

export type EventoInput =
  | EventoEndosoInput
  | EventoPagoInput
  | EventoCancelacionInput
  | EventoBloqueoInput
  | EventoLevantamientoBloqueoInput;
