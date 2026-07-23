import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../config/config.schema';
import { COLA_NOTIFICACIONES, COLA_RECONCILIACION, COLA_RESELLADO_LTV, COLA_VENCIMIENTOS_PROXIMOS } from './nombres-colas';

/** Programa los jobs repetibles (sección 9) SOLO en el proceso worker (`PROCESS_ROLE=worker`) —
 * si el proceso api también los programara, cada réplica de la API duplicaría las ejecuciones.
 * BullMQ deduplica por `jobId` fijo, así que reiniciar el worker no crea repetibles duplicados. */
@Injectable()
export class JobsSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsSchedulerService.name);

  constructor(
    @InjectQueue(COLA_RESELLADO_LTV) private readonly reselladoQueue: Queue,
    @InjectQueue(COLA_RECONCILIACION) private readonly reconciliacionQueue: Queue,
    @InjectQueue(COLA_NOTIFICACIONES) private readonly notificacionesQueue: Queue,
    @InjectQueue(COLA_VENCIMIENTOS_PROXIMOS) private readonly vencimientosQueue: Queue,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.configService.get('PROCESS_ROLE', { infer: true }) !== 'worker') {
      return;
    }

    await Promise.all([
      this.reselladoQueue.upsertJobScheduler('resellado-ltv-diario', { pattern: '0 3 * * *' }, { name: 'resellado-ltv' }),
      this.reconciliacionQueue.upsertJobScheduler('reconciliacion-horaria', { pattern: '0 * * * *' }, { name: 'reconciliacion' }),
      this.notificacionesQueue.upsertJobScheduler('notificaciones-cada-5-min', { pattern: '*/5 * * * *' }, { name: 'notificaciones' }),
      this.vencimientosQueue.upsertJobScheduler('vencimientos-proximos-diario', { pattern: '0 6 * * *' }, { name: 'vencimientos-proximos' }),
    ]);
    this.logger.log('Jobs repetibles programados: resellado-ltv (diario), reconciliacion (horaria), notificaciones (5 min), vencimientos-proximos (diario)');
  }
}
