import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { ParametrosController } from './parametros.controller';
import { ParametrosService } from './parametros.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParametroSistema])],
  controllers: [ParametrosController],
  providers: [ParametrosService],
})
export class ParametrosModule {}
