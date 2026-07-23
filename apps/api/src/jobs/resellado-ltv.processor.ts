import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ReselladoService } from '../modules/exportacion/resellado.service';
import { COLA_RESELLADO_LTV } from './nombres-colas';

@Processor(COLA_RESELLADO_LTV)
export class ReselladoLtvProcessor extends WorkerHost {
  private readonly logger = new Logger(ReselladoLtvProcessor.name);

  constructor(private readonly reselladoService: ReselladoService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const resultado = await this.reselladoService.reselladoVencidos();
    this.logger.log(`resellado-ltv: ${JSON.stringify(resultado)}`);
  }
}
