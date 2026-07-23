import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';

export interface AplicarEventoParams {
  dteId: string;
  tipoEvento: number;
  idEventoXml: string;
  numeroEvento: string;
  fechaEvento: Date;
  actorUsuarioId: string | null;
  actorDescripcion: string;
  rolActor: string;
  payload: Record<string, unknown>;
  hashEvento: string;
  /** Desambigua cat_transicion cuando hay más de una fila para (estado_origen, tipo_evento) — ver
   * migración 018 y ADR-004/F7 en docs/DECISIONES.md (PAGO parcial/total, restaurar tras bloqueo). */
  estadoDestino?: number;
}

export interface ResultadoAplicarEvento {
  eventoId: string;
  estadoResultante: number;
}

const PATRON_ERROR_DOMINIO = /(ERR-[A-Z]+-\d+):\s*(.+)/;

/**
 * Única puerta a `fn_aplicar_evento` (ver docs/PLAN.md sección 5.1, invariante I3): ningún módulo de
 * eventos (endoso/pago/bloqueo/cancelación) debe llamar la función SQL directamente, siempre a
 * través de este servicio, para que el mapeo de errores y la lectura del estado resultante queden
 * en un solo lugar.
 */
@Injectable()
export class EventosService {
  async aplicarEvento(manager: EntityManager, params: AplicarEventoParams): Promise<ResultadoAplicarEvento> {
    let eventoId: string;
    try {
      const filas: Array<{ fn_aplicar_evento: string }> = await manager.query(
        `SELECT psdte.fn_aplicar_evento($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS fn_aplicar_evento`,
        [
          params.dteId,
          params.tipoEvento,
          params.idEventoXml,
          params.numeroEvento,
          params.fechaEvento,
          params.actorUsuarioId,
          params.actorDescripcion,
          params.rolActor,
          JSON.stringify(params.payload),
          params.hashEvento,
          params.estadoDestino ?? null,
        ],
      );
      eventoId = filas[0].fn_aplicar_evento;
    } catch (err) {
      throw this.mapearError(err);
    }

    const filasEstado: Array<{ estado_resultante: number }> = await manager.query(
      `SELECT estado_resultante FROM psdte.dte_evento WHERE id = $1`,
      [eventoId],
    );
    return { eventoId, estadoResultante: Number(filasEstado[0].estado_resultante) };
  }

  private mapearError(err: unknown): Error {
    if (err instanceof Error) {
      const coincidencia = err.message.match(PATRON_ERROR_DOMINIO);
      if (coincidencia) {
        return new ErrorDominio(coincidencia[1], coincidencia[2].split('\n')[0].trim());
      }
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
