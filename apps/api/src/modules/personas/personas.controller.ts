import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActualizarPersonaDto } from './dto/actualizar-persona.dto';
import { CrearPersonaDto } from './dto/crear-persona.dto';
import { PersonasService } from './personas.service';

@Controller({ path: 'personas', version: '1' })
@Roles('ADMIN_PSDTE', 'OPERADOR_EMISION')
export class PersonasController {
  constructor(private readonly personasService: PersonasService) {}

  @Get()
  listar(@Query('documento') documento?: string) {
    if (documento) {
      return this.personasService.buscarPorDocumento(documento);
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
