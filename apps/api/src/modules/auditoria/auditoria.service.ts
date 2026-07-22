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

// Clave fija para el advisory lock de escritura en auditoria_log (ver comentario de la clase).
const ADVISORY_LOCK_KEY = 727272001;

/**
 * auditoria_log no tiene una función SQL equivalente a fn_aplicar_evento para encadenar
 * hashes de forma atómica, así que se serializa aquí. Un `SELECT ... FOR UPDATE` sobre la
 * última fila NO alcanza: con la tabla vacía no hay fila que bloquear, así que dos inserciones
 * concurrentes de la primera fila (dos réplicas del API arrancando a la vez, por ejemplo)
 * pasarían ambas con hash_anterior = NULL. Por eso se toma primero un advisory lock de
 * transacción (`pg_advisory_xact_lock`), que sí serializa incluso con la tabla vacía y se
 * libera solo al terminar la transacción (commit o rollback).
 */
@Injectable()
export class AuditoriaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hashChainService: HashChainService,
  ) {}

  async registrar(input: RegistrarAuditoriaInput): Promise<AuditoriaLog> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [ADVISORY_LOCK_KEY]);

      const repo = manager.getRepository(AuditoriaLog);
      const ultima = await repo.createQueryBuilder('a').orderBy('a.id', 'DESC').limit(1).getOne();

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
