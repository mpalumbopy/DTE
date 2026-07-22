import { Controller, Get, HttpException, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { Response } from 'express';
import { register } from 'prom-client';
import { Publico } from '../../common/decorators/publico.decorator';
import { SaludService } from './salud.service';

// Sin versión: /api/healthz, /api/readyz, /api/metrics (ver docs/PLAN.md sección 5.2).
@Controller({ version: VERSION_NEUTRAL })
export class SaludController {
  constructor(private readonly saludService: SaludService) {}

  @Publico()
  @Get('healthz')
  healthz() {
    return { estado: 'ok' };
  }

  @Publico()
  @Get('readyz')
  async readyz() {
    const resultado = await this.saludService.verificarDependencias();
    if (!resultado.ok) {
      throw new HttpException(resultado, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return resultado;
  }

  @Publico()
  @Get('metrics')
  async metrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  }
}
