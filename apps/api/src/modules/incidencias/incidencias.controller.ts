import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { IncidenciasService } from './incidencias.service';
import { CambiarEstadoIncidenciaDto } from './dto/cambiar-estado-incidencia.dto';
import { EstadoIncidencia, SeveridadIncidencia } from '../../entities/incidencia.entity';

@Controller({ path: 'admin/incidencias', version: '1' })
@Roles('ADMIN_PSDTE', 'AUDITOR')
export class IncidenciasController {
  constructor(private readonly incidenciasService: IncidenciasService) {}

  @Get()
  listar(
    @Query('estado') estado?: EstadoIncidencia,
    @Query('severidad') severidad?: SeveridadIncidencia,
    @Query('dteId') dteId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.incidenciasService.listar({ estado, severidad, dteId, limit: limit ? Number(limit) : undefined });
  }

  @Put(':id/estado')
  @Roles('ADMIN_PSDTE')
  cambiarEstado(@Param('id') id: string, @Body() dto: CambiarEstadoIncidenciaDto) {
    return this.incidenciasService.cambiarEstado(id, dto.estado);
  }
}
