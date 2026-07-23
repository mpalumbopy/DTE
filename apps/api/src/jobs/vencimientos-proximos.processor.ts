import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { VencimientoNotificacionService } from '../modules/notificaciones/vencimiento-notificacion.service';
import { COLA_VENCIMIENTOS_PROXIMOS } from './nombres-colas';

@Processor(COLA_VENCIMIENTOS_PROXIMOS)
export class VencimientosProximosProcessor extends WorkerHost {
  private readonly logger = new Logger(VencimientosProximosProcessor.name);

  constructor(private readonly vencimientoNotificacionService: VencimientoNotificacionService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const resultado = await this.vencimientoNotificacionService.notificarProximosAVencer();
    this.logger.log(`vencimientos-proximos: ${JSON.stringify(resultado)}`);
  }
}
