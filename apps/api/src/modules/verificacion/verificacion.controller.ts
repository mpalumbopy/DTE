import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ErrorDominio } from '@psdte/shared';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { VerificacionService } from './verificacion.service';

@Controller({ version: '1' })
export class VerificacionController {
  constructor(private readonly verificacionService: VerificacionService) {}

  @Publico()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('verificacion')
  consultaPublica(@Query('codigo') codigo: string, @Req() req: Request) {
    if (!codigo) {
      throw new ErrorDominio('ERR-SEM-002', 'El parámetro "codigo" es obligatorio');
    }
    return this.verificacionService.consultaPublica(codigo, req.ip ?? null);
  }

  @Get('dte/:id/verificacion')
  consultaDetallada(@Param('id') dteId: string, @UsuarioActual() usuario: AccessTokenPayload, @Req() req: Request) {
    return this.verificacionService.consultaDetallada(dteId, usuario, req.ip ?? null);
  }
}
