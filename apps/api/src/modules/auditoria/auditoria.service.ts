import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
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

export interface FiltroAuditoria {
  entidad?: string;
  entidadId?: string;
  desde?: Date;
  hasta?: Date;
  after?: string;
  limit?: number;
}

export interface ResultadoVerificacionCadena {
  valida: boolean;
  filasVerificadas: number;
  motivos: string[];
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

  async listar(filtro: FiltroAuditoria): Promise<AuditoriaLog[]> {
    const repo: Repository<AuditoriaLog> = this.dataSource.getRepository(AuditoriaLog);
    const qb = repo.createQueryBuilder('a').orderBy('a.id', 'DESC').limit(Math.min(filtro.limit ?? 50, 200));

    if (filtro.entidad) qb.andWhere('a.entidad = :entidad', { entidad: filtro.entidad });
    if (filtro.entidadId) qb.andWhere('a.entidad_id = :entidadId', { entidadId: filtro.entidadId });
    if (filtro.desde) qb.andWhere('a.ocurrido_en >= :desde', { desde: filtro.desde });
    if (filtro.hasta) qb.andWhere('a.ocurrido_en <= :hasta', { hasta: filtro.hasta });
    if (filtro.after) qb.andWhere('a.id < :after', { after: filtro.after });

    return qb.getMany();
  }

  /** Recorre auditoria_log en orden y recalcula cada hash_registro/hash_anterior — I5. Cualquier
   * fila que no encadene (o cuyo contenido ya no reproduzca su hash) indica alteración. */
  async verificarCadena(): Promise<ResultadoVerificacionCadena> {
    const repo = this.dataSource.getRepository(AuditoriaLog);
    const motivos: string[] = [];
    let hashAnteriorEsperado: string | null = null;
    let filasVerificadas = 0;

    const TAMANO_LOTE = 500;
    let ultimoId: string | undefined;
    for (;;) {
      const qb = repo.createQueryBuilder('a').orderBy('a.id', 'ASC').limit(TAMANO_LOTE);
      if (ultimoId) qb.andWhere('a.id > :ultimoId', { ultimoId });
      const lote = await qb.getMany();
      if (lote.length === 0) break;

      for (const fila of lote) {
        const registro = {
          accion: fila.accion,
          entidad: fila.entidad,
          entidadId: fila.entidadId,
          usuarioId: fila.usuarioId,
          ip: fila.ip,
          userAgent: fila.userAgent,
          detalle: fila.detalle,
        };
        if (fila.hashAnterior !== hashAnteriorEsperado) {
          motivos.push(`Fila ${fila.id}: hash_anterior no coincide con el hash de la fila previa`);
        }
        const hashCalculado = this.hashChainService.calcularHash(registro, hashAnteriorEsperado);
        if (hashCalculado !== fila.hashRegistro) {
          motivos.push(`Fila ${fila.id}: hash_registro no coincide con el contenido almacenado`);
        }
        hashAnteriorEsperado = fila.hashRegistro;
        filasVerificadas += 1;
      }
      ultimoId = lote[lote.length - 1].id;
    }

    return { valida: motivos.length === 0, filasVerificadas, motivos };
  }
}
