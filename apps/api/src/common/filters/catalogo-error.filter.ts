import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ErrorDominio } from '@psdte/shared';
import { obtenerRequestId } from '../context/request-context';
import { CatalogoErrorService } from './catalogo-error.service';

interface CuerpoErrorApi {
  error: string;
  mensaje: string;
  detalle: Record<string, unknown>;
  requestId: string;
  timestamp: string;
}

function extraerMensajeHttp(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    const mensaje = (body as { message: unknown }).message;
    return Array.isArray(mensaje) ? mensaje.join('; ') : String(mensaje);
  }
  return fallback;
}

/** Formatea toda excepción según el contrato uniforme del plan (sección 5.2, CAT-DTE-10). */
@Catch()
export class CatalogoErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(CatalogoErrorFilter.name);

  constructor(private readonly catalogoErrorService: CatalogoErrorService) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = obtenerRequestId() ?? 'sin-request-id';
    const timestamp = new Date().toISOString();

    if (exception instanceof ErrorDominio) {
      const catalogado = await this.catalogoErrorService.buscar(exception.codigo);
      const cuerpo: CuerpoErrorApi = {
        error: exception.codigo,
        mensaje: catalogado?.mensaje ?? exception.message,
        detalle: exception.detalle ?? {},
        requestId,
        timestamp,
      };
      response.status(catalogado?.httpStatus ?? HttpStatus.INTERNAL_SERVER_ERROR).json(cuerpo);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const cuerpo: CuerpoErrorApi = {
        error: `ERR-HTTP-${status}`,
        mensaje: extraerMensajeHttp(body, exception.message),
        detalle: typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {},
        requestId,
        timestamp,
      };
      response.status(status).json(cuerpo);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    const cuerpo: CuerpoErrorApi = {
      error: 'ERR-SISTEMA-001',
      mensaje: 'Error interno del servidor',
      detalle: {},
      requestId,
      timestamp,
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(cuerpo);
  }
}
