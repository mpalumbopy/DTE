import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { BorradorEmisionState } from './borrador-emision.types';

const PREFIJO = 'psdte:borrador-emision:';
const TTL_SEGUNDOS = 60 * 60 * 24; // 24h: un borrador es transitorio, sin valor legal (ver tipos).

@Injectable()
export class BorradorEmisionStore {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async guardar(idDatosGenerales: string, estado: BorradorEmisionState): Promise<void> {
    await this.redis.set(PREFIJO + idDatosGenerales, JSON.stringify(estado), 'EX', TTL_SEGUNDOS);
  }

  async obtener(idDatosGenerales: string): Promise<BorradorEmisionState | null> {
    const crudo = await this.redis.get(PREFIJO + idDatosGenerales);
    return crudo ? (JSON.parse(crudo) as BorradorEmisionState) : null;
  }

  async eliminar(idDatosGenerales: string): Promise<void> {
    await this.redis.del(PREFIJO + idDatosGenerales);
  }
}
