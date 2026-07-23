import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { CatEstadoDte } from '../../entities/cat-estado-dte.entity';
import { Incidencia } from '../../entities/incidencia.entity';
import { VerificacionModule } from '../verificacion/verificacion.module';
import { DteController } from './dte.controller';
import { DteService } from './dte.service';

@Module({
  imports: [TypeOrmModule.forFeature([Dte, DteXmlVersion, CatEstadoDte, Incidencia]), VerificacionModule],
  controllers: [DteController],
  providers: [DteService],
})
export class DteModule {}
