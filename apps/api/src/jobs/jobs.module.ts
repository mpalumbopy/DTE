import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EnvConfig } from '../config/config.schema';
import { ExportacionModule } from '../modules/exportacion/exportacion.module';
import { NotificacionesModule } from '../modules/notificaciones/notificaciones.module';
import { COLA_NOTIFICACIONES, COLA_RECONCILIACION, COLA_RESELLADO_LTV, COLA_VENCIMIENTOS_PROXIMOS } from './nombres-colas';
import { ReselladoLtvProcessor } from './resellado-ltv.processor';
import { ReconciliacionProcessor } from './reconciliacion.processor';
import { NotificacionesProcessor } from './notificaciones.processor';
import { VencimientosProximosProcessor } from './vencimientos-proximos.processor';
import { JobsSchedulerService } from './jobs-scheduler.service';

/**
 * Colas BullMQ para los jobs de la sección 9 que F7/F9/F11 dejaron como invocación directa por no
 * existir todavía esta infraestructura (ver "Pendiente" en docs/ESTADO.md de esas fases). Reutiliza
 * los MISMOS servicios ya probados en esas fases — este módulo solo agrega el scheduling real
 * (repeatable jobs) y el proceso `PROCESS_ROLE=worker` que los consume (ver main.worker.ts).
 *
 * BullMQ exige `maxRetriesPerRequest: null` en la conexión (usa comandos bloqueantes) — por eso no
 * reutiliza el REDIS_CLIENT genérico de RedisModule, que fija `maxRetriesPerRequest: 2`.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const url = new URL(configService.get('REDIS_URL', { infer: true }));
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
            password: url.password || undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: COLA_RESELLADO_LTV },
      { name: COLA_RECONCILIACION },
      { name: COLA_NOTIFICACIONES },
      { name: COLA_VENCIMIENTOS_PROXIMOS },
    ),
    ExportacionModule,
    NotificacionesModule,
  ],
  providers: [ReselladoLtvProcessor, ReconciliacionProcessor, NotificacionesProcessor, VencimientosProximosProcessor, JobsSchedulerService],
})
export class JobsModule {}
