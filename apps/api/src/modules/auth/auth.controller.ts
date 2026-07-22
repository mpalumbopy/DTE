import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ErrorDominio } from '@psdte/shared';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioActual } from '../../common/decorators/usuario-actual.decorator';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private fijarCookieRefresh(res: Response, refreshToken: string, expiraEn: Date): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: expiraEn,
    });
  }

  @Publico()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.login(dto, req.ip ?? null, req.headers['user-agent'] ?? null);
    if (resultado.requiereMfa) {
      return { requiereMfa: true, mfaPendingToken: resultado.mfaPendingToken };
    }
    this.fijarCookieRefresh(res, resultado.refreshToken, resultado.refreshExpiraEn);
    return { requiereMfa: false, accessToken: resultado.accessToken };
  }

  @Publico()
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  async verificarMfa(@Body() dto: MfaVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const resultado = await this.authService.verificarMfa(
      dto.mfaPendingToken,
      dto.codigo,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );
    this.fijarCookieRefresh(res, resultado.refreshToken, resultado.refreshExpiraEn);
    return { accessToken: resultado.accessToken };
  }

  @Publico()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refrescar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new ErrorDominio('ERR-AUTH-002', 'Sesión inválida, expirada o revocada');
    }
    const resultado = await this.authService.refrescar(refreshToken, req.ip ?? null, req.headers['user-agent'] ?? null);
    this.fijarCookieRefresh(res, resultado.refreshToken, resultado.refreshExpiraEn);
    return { accessToken: resultado.accessToken };
  }

  @Publico()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Post('mfa/enrol')
  @HttpCode(HttpStatus.OK)
  async enrolarMfa(@UsuarioActual() usuario: AccessTokenPayload) {
    return this.authService.enrolarMfa(usuario.sub);
  }
}
