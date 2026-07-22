import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AccessTokenPayload } from './jwt-auth.guard';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const usuario: AccessTokenPayload | undefined = request.usuarioAutenticado;
    if (!usuario) {
      return false;
    }
    return rolesRequeridos.some((rol) => usuario.roles.includes(rol));
  }
}
