import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';

export interface ResultadoReadyz {
  ok: boolean;
  baseDeDatos: boolean;
  redis: boolean;
  integraciones: boolean;
}

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly providerFactory: ProviderFactoryService,
  ) {}

  async verificarDependencias(): Promise<ResultadoReadyz> {
    const [baseDeDatos, redis, integraciones] = await Promise.all([
      this.verificarBaseDeDatos(),
      this.verificarRedis(),
      this.verificarIntegraciones(),
    ]);
    return { ok: baseDeDatos && redis && integraciones, baseDeDatos, redis, integraciones };
  }

  private async verificarBaseDeDatos(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (err) {
      this.logger.error('readyz: base de datos no disponible', err instanceof Error ? err.stack : String(err));
      return false;
    }
  }

  private async verificarRedis(): Promise<boolean> {
    try {
      const respuesta = await this.redis.ping();
      return respuesta === 'PONG';
    } catch (err) {
      this.logger.error('readyz: redis no disponible', err instanceof Error ? err.stack : String(err));
      return false;
    }
  }

  /** Confirma que FIRMA/TSA/OCSP (las integraciones críticas del candado ALLOW_SIMULATOR, ver
   * docs/PLAN.md sección 11) tienen una fila activa resoluble — no realiza llamadas de red, solo
   * construye los adaptadores (HTTP real o simulador) a partir de la config cacheada. */
  private async verificarIntegraciones(): Promise<boolean> {
    try {
      await Promise.all([this.providerFactory.obtenerProveedorFirma(), this.providerFactory.obtenerProveedorRevocacion('OCSP')]);
      return true;
    } catch (err) {
      this.logger.error('readyz: integraciones críticas no resolubles', err instanceof Error ? err.stack : String(err));
      return false;
    }
  }
}
