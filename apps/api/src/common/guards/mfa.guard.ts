import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorDominio } from '@psdte/shared';
import { REQUIERE_MFA_KEY } from '../decorators/requiere-mfa.decorator';
import { AccessTokenPayload } from './jwt-auth.guard';

/** Exige que la sesión del access token tenga MFA verificada (@RequiereMfa en el handler/clase). */
@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiereMfa = this.reflector.getAllAndOverride<boolean>(REQUIERE_MFA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiereMfa) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const usuario: AccessTokenPayload | undefined = request.usuarioAutenticado;
    if (!usuario?.mfaVerificada) {
      throw new ErrorDominio('ERR-AUTH-004', 'MFA requerida y no verificada para este rol');
    }
    return true;
  }
}
