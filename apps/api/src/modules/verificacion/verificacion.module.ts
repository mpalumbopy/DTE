import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { DteParte } from '../../entities/dte-parte.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteEndoso } from '../../entities/dte-endoso.entity';
import { Firma } from '../../entities/firma.entity';
import { CatEstadoDte } from '../../entities/cat-estado-dte.entity';
import { CatRol } from '../../entities/cat-rol.entity';
import { Usuario } from '../../entities/usuario.entity';
import { ConsultaVerificacion } from '../../entities/consulta-verificacion.entity';
import { Persona } from '../../entities/persona.entity';
import { VerificacionController } from './verificacion.controller';
import { VerificacionService } from './verificacion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dte,
      DteXmlVersion,
      DteEvento,
      DteParte,
      DteTenencia,
      DteEndoso,
      Firma,
      CatEstadoDte,
      CatRol,
      Usuario,
      ConsultaVerificacion,
      Persona,
    ]),
  ],
  controllers: [VerificacionController],
  providers: [VerificacionService],
  exports: [VerificacionService],
})
export class VerificacionModule {}
