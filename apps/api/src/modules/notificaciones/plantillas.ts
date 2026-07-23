/** Códigos de cat_tipo_notificacion (CAT-DTE-09) — ver db/seeds/data/06_evidencias_notificaciones.sql. */
export const CODIGO_NOTIFICACION_EMISION_CONFIRMADA = 1;
export const CODIGO_NOTIFICACION_ENDOSO_REGISTRADO = 2;
export const CODIGO_NOTIFICACION_PAGO_REGISTRADO = 3;
export const CODIGO_NOTIFICACION_BLOQUEO_APLICADO = 4;
export const CODIGO_NOTIFICACION_DTE_CANCELADO = 5;
export const CODIGO_NOTIFICACION_SOLICITUD_FIRMA = 6;
export const CODIGO_NOTIFICACION_VENCIMIENTO_PROXIMO = 7;

export interface PlantillaRenderizada {
  asunto: string;
  cuerpo: string;
}

interface DatosEmisionConfirmada {
  idDte: string;
  monto: string;
  monedaCodigo: string;
}

interface DatosEndosoRegistrado {
  idDte: string;
  nombreEndosatario: string;
  numeroEndoso: number;
}

interface DatosPagoRegistrado {
  idDte: string;
  montoPagado: string;
  saldoPendiente: string;
}

interface DatosBloqueoAplicado {
  idDte: string;
  autoridad: string;
  causal: string;
}

interface DatosDteCancelado {
  idDte: string;
  motivo: string;
}

interface DatosSolicitudFirma {
  idDte: string;
  rolFirmante: string;
}

interface DatosVencimientoProximo {
  idDte: string;
  fechaVencimiento: string;
  saldoPendiente: string;
}

/** Plantillas de los 6 tipos de email (docs/PLAN.md sección 9/11) + DTE_CANCELADO. Genera
 * asunto/cuerpo en el momento (no HTML, texto plano — suficiente para MailHog/pruebas y para un
 * primer envío real; una plantilla HTML queda para cuando exista una necesidad de marca). */
export function renderizarNotificacion(tipoCodigo: number, datos: Record<string, unknown>): PlantillaRenderizada {
  switch (tipoCodigo) {
    case CODIGO_NOTIFICACION_EMISION_CONFIRMADA: {
      const d = datos as unknown as DatosEmisionConfirmada;
      return {
        asunto: `Pagaré ${d.idDte} emitido`,
        cuerpo: `El pagaré electrónico ${d.idDte} por ${d.monto} ${d.monedaCodigo} fue emitido y registrado exitosamente.`,
      };
    }
    case CODIGO_NOTIFICACION_ENDOSO_REGISTRADO: {
      const d = datos as unknown as DatosEndosoRegistrado;
      return {
        asunto: `Pagaré ${d.idDte}: endoso N° ${d.numeroEndoso} registrado`,
        cuerpo: `Se registró el endoso N° ${d.numeroEndoso} del pagaré ${d.idDte} a favor de ${d.nombreEndosatario}.`,
      };
    }
    case CODIGO_NOTIFICACION_PAGO_REGISTRADO: {
      const d = datos as unknown as DatosPagoRegistrado;
      return {
        asunto: `Pagaré ${d.idDte}: pago registrado`,
        cuerpo: `Se registró un pago de ${d.montoPagado} sobre el pagaré ${d.idDte}. Saldo pendiente: ${d.saldoPendiente}.`,
      };
    }
    case CODIGO_NOTIFICACION_BLOQUEO_APLICADO: {
      const d = datos as unknown as DatosBloqueoAplicado;
      return {
        asunto: `Pagaré ${d.idDte}: bloqueado por medida de autoridad`,
        cuerpo: `El pagaré ${d.idDte} fue bloqueado por orden de ${d.autoridad} (causal: ${d.causal}). No admite endoso ni pago mientras el bloqueo esté vigente.`,
      };
    }
    case CODIGO_NOTIFICACION_DTE_CANCELADO: {
      const d = datos as unknown as DatosDteCancelado;
      return {
        asunto: `Pagaré ${d.idDte} cancelado`,
        cuerpo: `El pagaré ${d.idDte} fue cancelado. Motivo: ${d.motivo}.`,
      };
    }
    case CODIGO_NOTIFICACION_SOLICITUD_FIRMA: {
      const d = datos as unknown as DatosSolicitudFirma;
      return {
        asunto: `Se requiere su firma — pagaré ${d.idDte}`,
        cuerpo: `Se solicita su firma como ${d.rolFirmante} para el pagaré ${d.idDte}.`,
      };
    }
    case CODIGO_NOTIFICACION_VENCIMIENTO_PROXIMO: {
      const d = datos as unknown as DatosVencimientoProximo;
      return {
        asunto: `Pagaré ${d.idDte}: vencimiento próximo`,
        cuerpo: `El pagaré ${d.idDte} vence el ${d.fechaVencimiento} con saldo pendiente ${d.saldoPendiente}.`,
      };
    }
    default:
      return { asunto: `Notificación PSDTE (tipo ${tipoCodigo})`, cuerpo: JSON.stringify(datos) };
  }
}
