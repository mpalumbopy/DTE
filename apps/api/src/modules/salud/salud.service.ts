import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

export interface ResultadoReadyz {
  ok: boolean;
  baseDeDatos: boolean;
  redis: boolean;
  // El chequeo del ProviderFactory (integraciones activas) se agrega en F5.
}

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async verificarDependencias(): Promise<ResultadoReadyz> {
    const [baseDeDatos, redis] = await Promise.all([this.verificarBaseDeDatos(), this.verificarRedis()]);
    return { ok: baseDeDatos && redis, baseDeDatos, redis };
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
}
