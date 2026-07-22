import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  info() {
    return { servicio: 'psdte-api', estado: 'ok' };
  }
}
