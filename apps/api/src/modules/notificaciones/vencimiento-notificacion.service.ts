import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { Dte } from '../../entities/dte.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { Persona } from '../../entities/persona.entity';
import { Notificacion } from '../../entities/notificacion.entity';
import { NotificacionesService } from './notificaciones.service';
import { CODIGO_NOTIFICACION_VENCIMIENTO_PROXIMO } from './plantillas';

const DIAS_ANTELACION = 7;
const DIAS_SIN_RENOTIFICAR = 1;
const ESTADOS_FINALES_O_SIN_SALDO = [5, 8]; // PAGADO_TOTAL, CANCELADO (ver cat_estado_dte)

export interface ResultadoVencimientoProximo {
  notificados: number;
}

/**
 * Job `vencimientos` — la porción de notificación (docs/PLAN.md sección 9): detecta DTE con
 * `fecha_vencimiento` dentro de `DIAS_ANTELACION` días, saldo pendiente > 0 y estado que no sea
 * final, y crea una notificación VENCIMIENTO_PROXIMO para el tenedor vigente (si no se le notificó
 * en el último día). El evento VENCIDO en sí (fn_aplicar_evento) sigue diferido — ver ADR F7.
 */
@Injectable()
export class VencimientoNotificacionService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    @InjectRepository(DteTenencia) private readonly tenenciaRepo: Repository<DteTenencia>,
    @InjectRepository(Persona) private readonly personaRepo: Repository<Persona>,
    @InjectRepository(Notificacion) private readonly notificacionRepo: Repository<Notificacion>,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  async notificarProximosAVencer(): Promise<ResultadoVencimientoProximo> {
    const limite = new Date(Date.now() + DIAS_ANTELACION * 24 * 60 * 60 * 1000);
    const candidatos = await this.dteRepo.find({
      where: { fechaVencimiento: LessThanOrEqual(limite) },
    });

    let notificados = 0;
    for (const dte of candidatos) {
      if (ESTADOS_FINALES_O_SIN_SALDO.includes(dte.estadoActual)) continue;
      if (Number(dte.saldoPendiente) <= 0) continue;

      const yaNotificado = await this.notificacionRepo.findOne({
        where: {
          dteId: dte.id,
          tipoCodigo: CODIGO_NOTIFICACION_VENCIMIENTO_PROXIMO,
          creadoEn: MoreThan(new Date(Date.now() - DIAS_SIN_RENOTIFICAR * 24 * 60 * 60 * 1000)),
        },
      });
      if (yaNotificado) continue;

      const tenencia = await this.tenenciaRepo.findOne({ where: { dteId: dte.id, hasta: IsNull() } });
      if (!tenencia) continue;
      const persona = await this.personaRepo.findOne({ where: { id: tenencia.personaId } });
      if (!persona?.email) continue;

      await this.notificacionesService.crear({
        tipoCodigo: CODIGO_NOTIFICACION_VENCIMIENTO_PROXIMO,
        dteId: dte.id,
        destinatarioPersonaId: persona.id,
        destino: persona.email,
        datosPlantilla: {
          idDte: dte.idDte,
          fechaVencimiento: dte.fechaVencimiento.toISOString().slice(0, 10),
          saldoPendiente: dte.saldoPendiente,
        },
      });
      notificados += 1;
    }

    return { notificados };
  }
}
