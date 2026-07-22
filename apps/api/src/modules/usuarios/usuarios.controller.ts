import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { ActualizarRolesDto } from './dto/actualizar-roles.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { UsuariosService } from './usuarios.service';

@Controller({ path: 'usuarios', version: '1' })
@Roles('ADMIN_PSDTE')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.usuariosService.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearUsuarioDto) {
    return this.usuariosService.crear(dto);
  }

  @Put(':id/roles')
  actualizarRoles(
    @Param('id') id: string,
    @Body() dto: ActualizarRolesDto,
    @UsuarioActual() actor: AccessTokenPayload,
  ) {
    return this.usuariosService.actualizarRoles(id, dto, actor.sub);
  }
}
