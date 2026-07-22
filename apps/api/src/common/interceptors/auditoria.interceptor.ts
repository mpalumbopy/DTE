import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { Request } from 'express';
import { ErrorDominio } from '@psdte/shared';
import { AuditoriaService } from '../../modules/auditoria/auditoria.service';
import { AccessTokenPayload } from '../guards/jwt-auth.guard';

const METODOS_MUTACION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CLAVES_SENSIBLES = ['password', 'token', 'credenciales', 'codigo', 'mfaPendingToken', 'refreshToken'];

function enmascarar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(enmascarar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([clave, v]) => [
        clave,
        CLAVES_SENSIBLES.some((s) => clave.toLowerCase().includes(s.toLowerCase())) ? '********' : enmascarar(v),
      ]),
    );
  }
  return valor;
}

/** Registra toda mutación HTTP (exitosa o rechazada) en auditoria_log; nunca revierte la operación. */
@Injectable()
export class AuditoriaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditoriaInterceptor.name);

  constructor(private readonly auditoriaService: AuditoriaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (!METODOS_MUTACION.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      concatMap(async (data) => {
        await this.registrarSeguro(request, { exitoso: true });
        return data;
      }),
      catchError(async (err) => {
        const detalleError = err instanceof ErrorDominio ? err.codigo : err instanceof Error ? err.message : 'error';
        await this.registrarSeguro(request, { exitoso: false, error: detalleError });
        throw err;
      }),
    );
  }

  private async registrarSeguro(request: Request, resultado: { exitoso: boolean; error?: string }): Promise<void> {
    const usuario = (request as unknown as { usuarioAutenticado?: AccessTokenPayload }).usuarioAutenticado;
    try {
      await this.auditoriaService.registrar({
        accion: `${request.method} ${request.route?.path ?? request.path}`,
        usuarioId: usuario?.sub ?? null,
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
        detalle: { ...resultado, body: enmascarar(request.body) },
      });
    } catch (err) {
      this.logger.error('No se pudo registrar auditoría', err instanceof Error ? err.stack : String(err));
    }
  }
}
