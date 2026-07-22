import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditoriaLog } from '../../entities/auditoria-log.entity';
import { HashChainService } from '../../common/crypto/hash-chain.service';

export interface RegistrarAuditoriaInput {
  accion: string;
  entidad?: string | null;
  entidadId?: string | null;
  usuarioId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detalle?: Record<string, unknown> | null;
}

/**
 * auditoria_log no tiene una función SQL equivalente a fn_aplicar_evento para encadenar
 * hashes de forma atómica, así que se serializa aquí: se bloquea (FOR UPDATE) la última fila
 * antes de calcular e insertar la siguiente, evitando que dos inserciones concurrentes generen
 * cadenas divergentes (I5).
 */
@Injectable()
export class AuditoriaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hashChainService: HashChainService,
  ) {}

  async registrar(input: RegistrarAuditoriaInput): Promise<AuditoriaLog> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AuditoriaLog);
      const ultima = await repo
        .createQueryBuilder('a')
        .orderBy('a.id', 'DESC')
        .limit(1)
        .setLock('pessimistic_write')
        .getOne();

      const registro = {
        accion: input.accion,
        entidad: input.entidad ?? null,
        entidadId: input.entidadId ?? null,
        usuarioId: input.usuarioId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        detalle: input.detalle ?? null,
      };
      const hashAnterior = ultima?.hashRegistro ?? null;
      const hashRegistro = this.hashChainService.calcularHash(registro, hashAnterior);

      const nueva = repo.create({ ...registro, hashAnterior, hashRegistro });
      return repo.save(nueva);
    });
  }
}
