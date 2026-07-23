import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { IntegracionesModule } from '../integraciones/integraciones.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { Persona } from '../../entities/persona.entity';
import { PersonaDireccion } from '../../entities/persona-direccion.entity';
import { CatPais } from '../../entities/cat-pais.entity';
import { CatDepartamento } from '../../entities/cat-departamento.entity';
import { CatDistrito } from '../../entities/cat-distrito.entity';
import { CatCiudad } from '../../entities/cat-ciudad.entity';
import { CatMoneda } from '../../entities/cat-moneda.entity';
import { CatTipoDocumentoIdentidad } from '../../entities/cat-tipo-documento-identidad.entity';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { Dte } from '../../entities/dte.entity';
import { DteParte } from '../../entities/dte-parte.entity';
import { DteLugarPago } from '../../entities/dte-lugar-pago.entity';
import { DteCondicion } from '../../entities/dte-condicion.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { Evidencia } from '../../entities/evidencia.entity';
import { SolicitudFirma } from '../../entities/solicitud-firma.entity';
import { IdDteService } from '../../common/id-dte/id-dte.service';
import { BorradorEmisionStore } from './borrador-emision.store';
import { EmisionController } from './emision.controller';
import { EmisionService } from './emision.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Persona,
      PersonaDireccion,
      CatPais,
      CatDepartamento,
      CatDistrito,
      CatCiudad,
      CatMoneda,
      CatTipoDocumentoIdentidad,
      ParametroSistema,
      Dte,
      DteParte,
      DteLugarPago,
      DteCondicion,
      DteTenencia,
      DteXmlVersion,
      Certificado,
      Firma,
      Evidencia,
      SolicitudFirma,
    ]),
    AuditoriaModule,
    IntegracionesModule,
    NotificacionesModule,
  ],
  controllers: [EmisionController],
  providers: [EmisionService, BorradorEmisionStore, IdDteService],
})
export class EmisionModule {}
