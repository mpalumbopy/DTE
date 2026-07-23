import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { EventosComunesService } from './eventos-comunes.service';
import { EndosoService } from './endoso.service';
import { PagoService } from './pago.service';
import { BloqueoService } from './bloqueo.service';
import { CancelacionService } from './cancelacion.service';
import { RegistrarEndosoDto } from './dto/registrar-endoso.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { RegistrarBloqueoDto } from './dto/registrar-bloqueo.dto';
import { MotivoDto } from './dto/motivo.dto';

@Controller({ path: 'dte/:id', version: '1' })
export class EventosController {
  constructor(
    private readonly eventosComunes: EventosComunesService,
    private readonly endosoService: EndosoService,
    private readonly pagoService: PagoService,
    private readonly bloqueoService: BloqueoService,
    private readonly cancelacionService: CancelacionService,
  ) {}

  @Post('endosos')
  @Roles('TENEDOR', 'DEUDOR', 'ADMIN_PSDTE')
  async endosar(@Param('id') dteId: string, @Body() dto: RegistrarEndosoDto, @UsuarioActual() usuario: AccessTokenPayload) {
    const callerPersonaId = await this.eventosComunes.resolverPersonaIdDeUsuario(usuario.sub);
    return this.endosoService.registrarEndoso(dteId, usuario.sub, callerPersonaId, dto.endosatarioPersonaId);
  }

  @Post('pagos')
  @Roles('TENEDOR', 'DEUDOR', 'ADMIN_PSDTE')
  async pagar(@Param('id') dteId: string, @Body() dto: RegistrarPagoDto, @UsuarioActual() usuario: AccessTokenPayload) {
    const callerPersonaId = await this.eventosComunes.resolverPersonaIdDeUsuario(usuario.sub);
    return this.pagoService.registrarPago(
      dteId,
      usuario.sub,
      callerPersonaId,
      dto.montoPagado,
      dto.medioPago ?? null,
      dto.referenciaExterna ?? null,
    );
  }

  @Post('bloqueos')
  @Roles('AUTORIDAD', 'ADMIN_PSDTE')
  async bloquear(@Param('id') dteId: string, @Body() dto: RegistrarBloqueoDto, @UsuarioActual() usuario: AccessTokenPayload) {
    return this.bloqueoService.registrarBloqueo(
      dteId,
      usuario.sub,
      dto.causalCodigo,
      dto.autoridad,
      dto.numeroOficio ?? null,
      new Date(dto.fechaOrden),
      dto.documentoRespaldo ?? null,
    );
  }

  @Delete('bloqueos/:bid')
  @Roles('AUTORIDAD', 'ADMIN_PSDTE')
  async levantarBloqueo(
    @Param('id') dteId: string,
    @Param('bid') bloqueoId: string,
    @Body() dto: MotivoDto,
    @UsuarioActual() usuario: AccessTokenPayload,
  ) {
    return this.bloqueoService.levantarBloqueo(dteId, usuario.sub, bloqueoId, dto.motivo);
  }

  @Post('cancelacion')
  @Roles('TENEDOR', 'DEUDOR', 'ADMIN_PSDTE')
  async cancelar(@Param('id') dteId: string, @Body() dto: MotivoDto, @UsuarioActual() usuario: AccessTokenPayload) {
    const callerPersonaId = await this.eventosComunes.resolverPersonaIdDeUsuario(usuario.sub);
    return this.cancelacionService.cancelar(dteId, usuario.sub, callerPersonaId, dto.motivo);
  }
}
