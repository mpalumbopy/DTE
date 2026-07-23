import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificacionesService } from '../modules/notificaciones/notificaciones.service';
import { COLA_NOTIFICACIONES } from './nombres-colas';

@Processor(COLA_NOTIFICACIONES)
export class NotificacionesProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificacionesProcessor.name);

  constructor(private readonly notificacionesService: NotificacionesService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const resultado = await this.notificacionesService.enviarPendientes();
    this.logger.log(`notificaciones: ${JSON.stringify(resultado)}`);
  }
}
