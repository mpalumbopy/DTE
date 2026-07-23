import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegracionesModule } from '../integraciones/integraciones.module';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteParte } from '../../entities/dte-parte.entity';
import { DteCondicion } from '../../entities/dte-condicion.entity';
import { Persona } from '../../entities/persona.entity';
import { Evidencia } from '../../entities/evidencia.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { Exportacion } from '../../entities/exportacion.entity';
import { ReselladoLtv } from '../../entities/resellado-ltv.entity';
import { Incidencia } from '../../entities/incidencia.entity';
import { ExportacionController } from './exportacion.controller';
import { ExportacionService } from './exportacion.service';
import { ReselladoService } from './resellado.service';
import { ReconciliacionService } from './reconciliacion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dte,
      DteXmlVersion,
      DteParte,
      DteCondicion,
      Persona,
      Evidencia,
      Certificado,
      Firma,
      Exportacion,
      ReselladoLtv,
      Incidencia,
    ]),
    IntegracionesModule,
  ],
  controllers: [ExportacionController],
  providers: [ExportacionService, ReselladoService, ReconciliacionService],
  exports: [ReselladoService, ReconciliacionService],
})
export class ExportacionModule {}
