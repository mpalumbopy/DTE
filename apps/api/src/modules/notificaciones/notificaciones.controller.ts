import { Controller, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { NotificacionesService } from './notificaciones.service';
import { VencimientoNotificacionService } from './vencimiento-notificacion.service';

@Controller({ path: 'admin/jobs', version: '1' })
@Roles('ADMIN_PSDTE')
export class NotificacionesController {
  constructor(
    private readonly notificacionesService: NotificacionesService,
    private readonly vencimientoService: VencimientoNotificacionService,
  ) {}

  @Post('notificaciones')
  enviarPendientes() {
    return this.notificacionesService.enviarPendientes();
  }

  @Post('vencimientos-proximos')
  notificarVencimientos() {
    return this.vencimientoService.notificarProximosAVencer();
  }
}
