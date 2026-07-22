import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { ActualizarParametroDto } from './dto/actualizar-parametro.dto';
import { ParametrosService } from './parametros.service';

@Controller({ path: 'parametros', version: '1' })
@Roles('ADMIN_PSDTE')
export class ParametrosController {
  constructor(private readonly parametrosService: ParametrosService) {}

  @Get()
  listar() {
    return this.parametrosService.listar();
  }

  @Put(':clave')
  actualizar(
    @Param('clave') clave: string,
    @Body() dto: ActualizarParametroDto,
    @UsuarioActual() actor: AccessTokenPayload,
  ) {
    return this.parametrosService.actualizar(clave, dto, actor.sub);
  }
}
