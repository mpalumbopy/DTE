import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ErrorDominio } from '@psdte/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { ActualizarPersonaDto } from './dto/actualizar-persona.dto';
import { CrearPersonaDto } from './dto/crear-persona.dto';
import { PersonasService } from './personas.service';

const ROLES_BUSQUEDA_POR_DOCUMENTO = ['ADMIN_PSDTE', 'OPERADOR_EMISION', 'TENEDOR', 'DEUDOR', 'AUTORIDAD'];

@Controller({ path: 'personas', version: '1' })
@Roles('ADMIN_PSDTE', 'OPERADOR_EMISION')
export class PersonasController {
  constructor(private readonly personasService: PersonasService) {}

  /** El listado completo (sin `documento`) sigue restringido a ADMIN_PSDTE/OPERADOR_EMISION (regla
   * de clase). La búsqueda POR documento se abre a TENEDOR/DEUDOR/AUTORIDAD porque el wizard de
   * endoso necesita ubicar a un endosatario por documento — nunca navegar el padrón completo. */
  @Get()
  @Roles(...ROLES_BUSQUEDA_POR_DOCUMENTO)
  listar(@Query('documento') documento: string | undefined, @UsuarioActual() usuario: AccessTokenPayload) {
    if (documento) {
      return this.personasService.buscarPorDocumento(documento);
    }
    const puedeListarTodas = usuario.roles.some((r) => ['ADMIN_PSDTE', 'OPERADOR_EMISION'].includes(r));
    if (!puedeListarTodas) {
      throw new ErrorDominio('ERR-DTE-403', 'Debe indicar un número de documento para buscar una persona');
    }
    return this.personasService.listar();
  }

  @Get(':id')
  obtener(@Param('id') id: string) {
    return this.personasService.obtener(id);
  }

  @Post()
  crear(@Body() dto: CrearPersonaDto) {
    return this.personasService.crear(dto);
  }

  @Put(':id')
  actualizar(@Param('id') id: string, @Body() dto: ActualizarPersonaDto) {
    return this.personasService.actualizar(id, dto);
  }
}
