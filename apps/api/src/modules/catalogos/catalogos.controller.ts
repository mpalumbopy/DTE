import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CatalogosService } from './catalogos.service';

@Controller({ path: 'catalogos', version: '1' })
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  @Get(':codigo')
  async obtener(@Param('codigo') codigo: string, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.catalogosService.obtener(codigo);
    res.setHeader('X-Catalogos-Version', resultado.version);
    return resultado;
  }
}
