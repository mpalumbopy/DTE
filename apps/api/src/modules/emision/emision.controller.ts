import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { CrearEmisionDto } from './dto/crear-emision.dto';
import { EmisionService } from './emision.service';

@Controller({ path: 'dte/emisiones', version: '1' })
@Roles('OPERADOR_EMISION', 'ADMIN_PSDTE')
export class EmisionController {
  constructor(private readonly emisionService: EmisionService) {}

  @Post()
  crear(@Body() dto: CrearEmisionDto, @UsuarioActual() usuario: AccessTokenPayload) {
    return this.emisionService.crearBorrador(dto, usuario.sub);
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.emisionService.obtenerBorrador(id);
  }

  @Post(':id/firmas/solicitar')
  solicitarFirmas(@Param('id') id: string) {
    return this.emisionService.solicitarFirmas(id);
  }

  @Post(':id/confirmar')
  confirmar(@Param('id') id: string, @UsuarioActual() usuario: AccessTokenPayload) {
    return this.emisionService.confirmar(id, usuario.sub);
  }
}
