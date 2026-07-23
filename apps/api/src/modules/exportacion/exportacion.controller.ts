import { Body, Controller, Get, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { ExportacionService } from './exportacion.service';
import { ReselladoService } from './resellado.service';
import { ReconciliacionService } from './reconciliacion.service';
import { GenerarExportacionDto } from './dto/generar-exportacion.dto';

@Controller({ version: '1' })
export class ExportacionController {
  constructor(
    private readonly exportacionService: ExportacionService,
    private readonly reselladoService: ReselladoService,
    private readonly reconciliacionService: ReconciliacionService,
  ) {}

  @Post('dte/:id/exportacion')
  async generar(@Param('id') dteId: string, @Body() dto: GenerarExportacionDto, @UsuarioActual() usuario: AccessTokenPayload) {
    if (dto.tipo === 'CONTENEDOR') {
      return this.exportacionService.generarContenedor(dteId, usuario.sub);
    }
    return this.exportacionService.generarPdfA(dteId, usuario.sub);
  }

  @Get('exportaciones/:id/descargar')
  async descargar(@Param('id') exportacionId: string, @Res({ passthrough: true }) res: Response) {
    const { contenido, tipo } = await this.exportacionService.leerArchivo(exportacionId);
    res.set({
      'Content-Type': tipo === 'CONTENEDOR' ? 'application/zip' : 'application/pdf',
      'Content-Disposition': `attachment; filename="${exportacionId}.${tipo === 'CONTENEDOR' ? 'zip' : 'pdf'}"`,
    });
    return new StreamableFile(contenido);
  }

  @Post('admin/jobs/resellado-ltv')
  @Roles('ADMIN_PSDTE')
  reselladoLtv() {
    return this.reselladoService.reselladoVencidos();
  }

  @Get('admin/jobs/reconciliacion')
  @Roles('ADMIN_PSDTE', 'AUDITOR')
  reconciliar(@Query('dteId') dteId: string) {
    return this.reconciliacionService.reconciliarDte(dteId);
  }
}
