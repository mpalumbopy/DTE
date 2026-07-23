import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notificacion } from '../../entities/notificacion.entity';
import { Dte } from '../../entities/dte.entity';
import { DteTenencia } from '../../entities/dte-tenencia.entity';
import { Persona } from '../../entities/persona.entity';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { VencimientoNotificacionService } from './vencimiento-notificacion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notificacion, Dte, DteTenencia, Persona])],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, VencimientoNotificacionService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
