import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReconciliacionService } from '../modules/exportacion/reconciliacion.service';
import { COLA_RECONCILIACION } from './nombres-colas';

@Processor(COLA_RECONCILIACION)
export class ReconciliacionProcessor extends WorkerHost {
  private readonly logger = new Logger(ReconciliacionProcessor.name);

  constructor(private readonly reconciliacionService: ReconciliacionService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const resultado = await this.reconciliacionService.reconciliarTodos();
    this.logger.log(`reconciliacion: ${JSON.stringify(resultado)}`);
  }
}
