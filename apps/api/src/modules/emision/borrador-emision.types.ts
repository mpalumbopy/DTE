/**
 * El DDL no modela un estado "antes de emitido" para `dte` (`cat_estado_dte` solo tiene estados
 * posteriores a la emisión — ver ADR en docs/DECISIONES.md): por eso el borrador vive en Redis
 * (transitorio, sin valor legal todavía) hasta `POST .../confirmar`, que sí escribe todo en
 * Postgres de forma transaccional. Se persiste ya resuelto (nombres, no solo códigos) para no
 * re-consultar personas/catálogos en cada paso; los campos de fecha van como ISO-8601 (Redis solo
 * guarda JSON) y se reconvierten a `Date` en el punto de uso (`aDatosGeneralesInput`).
 */
import { DatosGeneralesDteInput } from '@psdte/xml-engine';

export type EstadoBorrador = 'BORRADOR' | 'FIRMAS_EN_CURSO' | 'LISTO_PARA_CONFIRMAR';

/** Igual a DatosGeneralesDteInput pero con fechaEmision/fechaVencimiento como ISO-8601 (JSON no tiene Date). */
export type DatosGeneralesSerializado = Omit<DatosGeneralesDteInput, 'fechaEmision' | 'fechaVencimiento'> & {
  fechaEmision: string;
  fechaVencimiento: string;
};

export interface FirmaParteRecolectada {
  personaId: string;
  rolFirmante: 'DEUDOR' | 'CODEUDOR';
  condicionFirmante: string;
  solicitudFirmaId: string;
}

export interface BorradorEmisionState {
  estado: EstadoBorrador;
  creadoPor: string;
  creadoEn: string;
  montoLetras: string;
  datosGenerales: DatosGeneralesSerializado;
  acreedorInicialPersonaId: string;
  deudores: Array<{ personaId: string; condicionFirmante: string }>;
  codeudores: Array<{ personaId: string; condicionFirmante: string }>;
  /** Firmas de partes ya recolectadas, en el orden en que se solicitaron. */
  firmasPartes: FirmaParteRecolectada[];
  /** Fragmento `<gDatosGeneralesDTE>` firmado hasta ahora (sin envolver en DTE/rDTE todavía). */
  xmlDatosGeneralesFirmadoParcial?: string;
}

export function aDatosGeneralesInput(serializado: DatosGeneralesSerializado): DatosGeneralesDteInput {
  return {
    ...serializado,
    fechaEmision: new Date(serializado.fechaEmision),
    fechaVencimiento: new Date(serializado.fechaVencimiento),
  };
}
