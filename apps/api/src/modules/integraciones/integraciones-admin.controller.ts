import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiereMfa } from '../../common/decorators/requiere-mfa.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { IntegracionesAdminService } from './integraciones-admin.service';
import { ConfigurarIntegracionDto } from './dto/configurar-integracion.dto';
import { ConmutarIntegracionDto } from './dto/conmutar-integracion.dto';

@Controller({ path: 'admin/integraciones', version: '1' })
@Roles('ADMIN_PSDTE')
@RequiereMfa()
export class IntegracionesAdminController {
  constructor(private readonly service: IntegracionesAdminService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get('estado-global')
  estadoGlobal() {
    return this.service.estadoGlobal();
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.service.obtener(id);
  }

  @Get(':id/historial')
  historial(@Param('id') id: string) {
    return this.service.historial(id);
  }

  @Put(':id')
  actualizar(@Param('id') id: string, @Body() dto: ConfigurarIntegracionDto, @UsuarioActual() usuario: AccessTokenPayload) {
    return this.service.actualizar(id, dto, usuario.sub);
  }

  @Post(':id/test')
  probarConexion(@Param('id') id: string, @Body() dto: ConfigurarIntegracionDto) {
    return this.service.probarConexionFormulario(id, dto);
  }

  @Post(':id/conmutar')
  conmutar(@Param('id') id: string, @Body() dto: ConmutarIntegracionDto, @UsuarioActual() usuario: AccessTokenPayload) {
    return this.service.conmutar(id, dto.modoDestino, dto.passwordAdmin, usuario.sub);
  }
}
