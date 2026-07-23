import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegracionesModule } from '../integraciones/integraciones.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { Persona } from '../../entities/persona.entity';
import { Usuario } from '../../entities/usuario.entity';
import { CatPais } from '../../entities/cat-pais.entity';
import { CatTipoDocumentoIdentidad } from '../../entities/cat-tipo-documento-identidad.entity';
import { CatCausalBloqueo } from '../../entities/cat-causal-bloqueo.entity';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';
import { Dte } from '../../entities/dte.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { DteEvento } from '../../entities/dte-evento.entity';
import { DteEndoso } from '../../entities/dte-endoso.entity';
import { DtePago } from '../../entities/dte-pago.entity';
import { DteBloqueo } from '../../entities/dte-bloqueo.entity';
import { DteCancelacion } from '../../entities/dte-cancelacion.entity';
import { Certificado } from '../../entities/certificado.entity';
import { Firma } from '../../entities/firma.entity';
import { IdDteService } from '../../common/id-dte/id-dte.service';
import { EventosComunesService } from './eventos-comunes.service';
import { EventosService } from './eventos.service';
import { EndosoService } from './endoso.service';
import { PagoService } from './pago.service';
import { BloqueoService } from './bloqueo.service';
import { CancelacionService } from './cancelacion.service';
import { EventosController } from './eventos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Persona,
      Usuario,
      CatPais,
      CatTipoDocumentoIdentidad,
      CatCausalBloqueo,
      ParametroSistema,
      Dte,
      DteTenencia,
      DteXmlVersion,
      DteEvento,
      DteEndoso,
      DtePago,
      DteBloqueo,
      DteCancelacion,
      Certificado,
      Firma,
    ]),
    IntegracionesModule,
    NotificacionesModule,
  ],
  controllers: [EventosController],
  providers: [IdDteService, EventosComunesService, EventosService, EndosoService, PagoService, BloqueoService, CancelacionService],
})
export class EventosModule {}
