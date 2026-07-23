import { Module } from '@nestjs/common';
import { IntegracionesModule } from '../integraciones/integraciones.module';
import { DevController } from './dev.controller';

@Module({
  imports: [IntegracionesModule],
  controllers: [DevController],
})
export class DevModule {}
