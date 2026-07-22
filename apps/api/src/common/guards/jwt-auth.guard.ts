import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/publico.decorator';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  sesionId: string;
  mfaVerificada: boolean;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const esPublico = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de acceso requerido');
    }
    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(token);
      request.usuarioAutenticado = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o expirado');
    }
  }
}
