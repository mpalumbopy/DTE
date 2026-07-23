import { Controller, Get, Param, Query } from '@nestjs/common';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { DteService } from './dte.service';

@Controller({ path: 'dte', version: '1' })
export class DteController {
  constructor(private readonly dteService: DteService) {}

  @Get()
  bandeja(
    @UsuarioActual() usuario: AccessTokenPayload,
    @Query('estado') estado?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.dteService.bandeja(usuario, {
      estado: estado ? Number(estado) : undefined,
      desde: desde ? new Date(desde) : undefined,
      hasta: hasta ? new Date(hasta) : undefined,
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('kpis')
  kpis(@UsuarioActual() usuario: AccessTokenPayload) {
    return this.dteService.kpis(usuario);
  }

  @Get(':id/xml')
  obtenerXml(@Param('id') id: string, @Query('version') version: string | undefined, @UsuarioActual() usuario: AccessTokenPayload) {
    return this.dteService.obtenerXml(id, version ? Number(version) : undefined, usuario);
  }
}
