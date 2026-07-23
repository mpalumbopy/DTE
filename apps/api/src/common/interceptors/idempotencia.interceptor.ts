import { CallHandler, ConflictException, ExecutionContext, Inject, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { AccessTokenPayload } from '../guards/jwt-auth.guard';

const METODOS_MUTACION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TTL_EN_CURSO_SEGUNDOS = 30;
const TTL_RESPUESTA_CACHEADA_SEGUNDOS = 24 * 60 * 60;
const SENTINELA_EN_CURSO = '__EN_CURSO__';

/**
 * Invariante I10 (CLAUDE.md): "operaciones nunca a medias... idempotencia por Idempotency-Key".
 * Opt-in por el cliente (solo actúa si el header está presente) — reintentar una mutación con la
 * MISMA clave devuelve la respuesta ya calculada en vez de re-ejecutar el handler (protege contra
 * el caso clásico de timeout de red: el cliente no sabe si la primera petición llegó a aplicarse y
 * reintenta). Una segunda petición concurrente con la misma clave, mientras la primera sigue en
 * curso, se rechaza con 409 en vez de ejecutar el handler dos veces en paralelo.
 *
 * Simplificación deliberada: la respuesta cacheada se reproduce siempre con status 200 (no se
 * intenta replicar el status code original, p. ej. 201 de un `@HttpCode`) — NestJS solo aplica el
 * status real a la respuesta HTTP después de que el interceptor completa, así que leerlo acá sería
 * leer un valor todavía no asignado. Se agrega el header `Idempotent-Replay: true` para que el
 * cliente distinga una respuesta reproducida de una ejecución fresca.
 */
@Injectable()
export class IdempotenciaInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotenciaInterceptor.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request>();
    const claveCliente = request.header('Idempotency-Key');
    if (!METODOS_MUTACION.has(request.method) || !claveCliente) {
      return next.handle();
    }

    const usuario = (request as unknown as { usuarioAutenticado?: AccessTokenPayload }).usuarioAutenticado;
    const clave = `idem:${usuario?.sub ?? 'anon'}:${request.method}:${request.route?.path ?? request.path}:${claveCliente}`;

    return from(this.reclamar(clave)).pipe(
      concatMap((yaExistia) => {
        if (yaExistia === SENTINELA_EN_CURSO) {
          throw new ConflictException('Ya hay una operación en curso con esta Idempotency-Key; reintente en unos segundos.');
        }
        if (yaExistia !== null) {
          const response = context.switchToHttp().getResponse<Response>();
          response.setHeader('Idempotent-Replay', 'true');
          return of(JSON.parse(yaExistia));
        }
        return next.handle().pipe(
          concatMap(async (data) => {
            await this.guardarSeguro(clave, data);
            return data;
          }),
          catchError(async (err) => {
            await this.liberarSeguro(clave);
            throw err;
          }),
        );
      }),
    );
  }

  /** SET NX atómico: devuelve null si esta petición se quedó con el turno de ejecutar, o el valor
   * existente (sentinela "en curso" o respuesta cacheada en JSON) si ya había una entrada. */
  private async reclamar(clave: string): Promise<string | null> {
    const reclamado = await this.redis.set(clave, SENTINELA_EN_CURSO, 'EX', TTL_EN_CURSO_SEGUNDOS, 'NX');
    if (reclamado === 'OK') {
      return null;
    }
    return this.redis.get(clave);
  }

  private async guardarSeguro(clave: string, data: unknown): Promise<void> {
    try {
      await this.redis.set(clave, JSON.stringify(data ?? null), 'EX', TTL_RESPUESTA_CACHEADA_SEGUNDOS);
    } catch (err) {
      this.logger.error('No se pudo cachear la respuesta idempotente', err instanceof Error ? err.stack : String(err));
    }
  }

  private async liberarSeguro(clave: string): Promise<void> {
    try {
      await this.redis.del(clave);
    } catch (err) {
      this.logger.error('No se pudo liberar la clave idempotente tras un error', err instanceof Error ? err.stack : String(err));
    }
  }
}
