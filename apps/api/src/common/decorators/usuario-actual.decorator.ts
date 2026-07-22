import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AccessTokenPayload } from '../guards/jwt-auth.guard';

/** Extrae el payload del access token adjuntado por JwtAuthGuard. */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessTokenPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.usuarioAutenticado;
  },
);
