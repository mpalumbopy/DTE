import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Publico } from './common/decorators/publico.decorator';

@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  @Publico()
  @Get()
  info() {
    return { servicio: 'psdte-api', estado: 'ok' };
  }
}
