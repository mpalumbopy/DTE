import { Module, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, register } from 'prom-client';
import { SaludController } from './salud.controller';
import { SaludService } from './salud.service';

@Module({
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule implements OnModuleInit {
  onModuleInit(): void {
    collectDefaultMetrics({ register });
  }
}
