import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditoriaService } from './auditoria.service';

@Controller({ path: 'admin/auditoria', version: '1' })
@Roles('ADMIN_PSDTE', 'AUDITOR')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get('verificar-cadena')
  verificarCadena() {
    return this.auditoriaService.verificarCadena();
  }

  @Get()
  listar(
    @Query('entidad') entidad?: string,
    @Query('entidadId') entidadId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditoriaService.listar({
      entidad,
      entidadId,
      desde: desde ? new Date(desde) : undefined,
      hasta: hasta ? new Date(hasta) : undefined,
      after,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
