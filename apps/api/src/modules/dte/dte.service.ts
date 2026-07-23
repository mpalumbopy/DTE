import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { CatEstadoDte } from '../../entities/cat-estado-dte.entity';
import { Incidencia } from '../../entities/incidencia.entity';
import { VerificacionService } from '../verificacion/verificacion.service';

const CODIGO_ESTADO_BLOQUEADO = 7;
const CODIGO_ESTADO_CANCELADO = 8;
const DIAS_POR_VENCER = 7;

/** Roles con visibilidad operativa sobre TODOS los DTE (no solo los propios) — distinto del
 * `nivel_acceso` de CAT-DTE-04, que existe para el modelo de consulta/verificación pública, no
 * para la bandeja operativa. TENEDOR/DEUDOR (partes) solo ven los DTE en los que participan. */
const ROLES_VISIBILIDAD_COMPLETA = ['ADMIN_PSDTE', 'OPERADOR_EMISION', 'AUTORIDAD', 'AUDITOR'];

function tieneVisibilidadCompleta(usuario: AccessTokenPayload): boolean {
  return usuario.roles.some((rol) => ROLES_VISIBILIDAD_COMPLETA.includes(rol));
}

export interface FiltroBandeja {
  estado?: number;
  desde?: Date;
  hasta?: Date;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface FilaBandeja {
  id: string;
  idDte: string;
  estadoActual: number;
  estadoNombre: string;
  fechaEmision: Date;
  fechaVencimiento: Date;
  monto: string;
  monedaCodigo: string;
  saldoPendiente: string;
}

export interface ResultadoBandeja {
  items: FilaBandeja[];
  total: number;
  page: number;
  pageSize: number;
}

export interface KpisDashboard {
  emitidosActivos: number;
  porVencer: number;
  bloqueados: number;
  incidenciasAbiertas: number | null;
}

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

@Injectable()
export class DteService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    @InjectRepository(DteXmlVersion) private readonly xmlVersionRepo: Repository<DteXmlVersion>,
    @InjectRepository(CatEstadoDte) private readonly estadoRepo: Repository<CatEstadoDte>,
    @InjectRepository(Incidencia) private readonly incidenciaRepo: Repository<Incidencia>,
    private readonly verificacionService: VerificacionService,
  ) {}

  /** KPIs del dashboard (docs/PLAN.md sección 8). "jobs" del enunciado se representa como
   * incidencias abiertas (única señal operativa real disponible hoy — no hay cola/cron con
   * estado propio todavía, ver ADR de F12) y solo se muestra a roles con visibilidad completa. */
  async kpis(usuario: AccessTokenPayload): Promise<KpisDashboard> {
    const visibilidadCompleta = tieneVisibilidadCompleta(usuario);
    const idsRelacionados = visibilidadCompleta ? null : await this.verificacionService.dteIdsRelacionados(usuario);
    if (idsRelacionados !== null && idsRelacionados.length === 0) {
      return { emitidosActivos: 0, porVencer: 0, bloqueados: 0, incidenciasAbiertas: visibilidadCompleta ? 0 : null };
    }

    const limitePorVencer = new Date(Date.now() + DIAS_POR_VENCER * 24 * 60 * 60 * 1000);

    const base = () => {
      const qb = this.dteRepo.createQueryBuilder('dte');
      if (idsRelacionados) qb.andWhere('dte.id IN (:...ids)', { ids: idsRelacionados });
      return qb;
    };

    const [emitidosActivos, porVencer, bloqueados, incidenciasAbiertas] = await Promise.all([
      base().andWhere('dte.estadoActual != :cancelado', { cancelado: CODIGO_ESTADO_CANCELADO }).getCount(),
      base()
        .andWhere('dte.estadoActual != :cancelado', { cancelado: CODIGO_ESTADO_CANCELADO })
        .andWhere('dte.fechaVencimiento <= :limite', { limite: limitePorVencer })
        .andWhere('dte.saldoPendiente > 0')
        .getCount(),
      base().andWhere('dte.estadoActual = :bloqueado', { bloqueado: CODIGO_ESTADO_BLOQUEADO }).getCount(),
      visibilidadCompleta ? this.incidenciaRepo.count({ where: { estado: 'ABIERTA' } }) : Promise.resolve(null),
    ]);

    return { emitidosActivos, porVencer, bloqueados, incidenciasAbiertas };
  }

  async bandeja(usuario: AccessTokenPayload, filtro: FiltroBandeja): Promise<ResultadoBandeja> {
    const page = Math.max(filtro.page ?? 1, 1);
    const pageSize = Math.min(filtro.pageSize ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);

    const qb = this.dteRepo.createQueryBuilder('dte').orderBy('dte.fechaEmision', 'DESC');

    if (!tieneVisibilidadCompleta(usuario)) {
      const idsRelacionados = await this.verificacionService.dteIdsRelacionados(usuario);
      if (idsRelacionados.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      qb.andWhere('dte.id IN (:...ids)', { ids: idsRelacionados });
    }
    if (filtro.estado !== undefined) qb.andWhere('dte.estadoActual = :estado', { estado: filtro.estado });
    if (filtro.desde) qb.andWhere('dte.fechaEmision >= :desde', { desde: filtro.desde });
    if (filtro.hasta) qb.andWhere('dte.fechaEmision <= :hasta', { hasta: filtro.hasta });
    if (filtro.q) qb.andWhere('dte.idDte ILIKE :q', { q: `%${filtro.q}%` });

    const [filas, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const codigosEstado = Array.from(new Set(filas.map((f) => f.estadoActual)));
    const estados = codigosEstado.length > 0 ? await this.estadoRepo.findBy({ codigo: In(codigosEstado) }) : [];
    const nombrePorCodigo = new Map(estados.map((e) => [e.codigo, e.nombre]));

    return {
      items: filas.map((f) => ({
        id: f.id,
        idDte: f.idDte,
        estadoActual: f.estadoActual,
        estadoNombre: nombrePorCodigo.get(f.estadoActual) ?? String(f.estadoActual),
        fechaEmision: f.fechaEmision,
        fechaVencimiento: f.fechaVencimiento,
        monto: f.monto,
        monedaCodigo: f.monedaCodigo,
        saldoPendiente: f.saldoPendiente,
      })),
      total,
      page,
      pageSize,
    };
  }

  async obtenerXml(dteId: string, version: number | undefined, usuario: AccessTokenPayload): Promise<{ xml: string; version: number }> {
    const dte = await this.dteRepo.findOne({ where: { id: dteId } });
    if (!dte) {
      throw new ErrorDominio('ERR-DTE-404', `DTE inexistente: ${dteId}`);
    }
    const relacionado = tieneVisibilidadCompleta(usuario) ? true : await this.verificacionService.esRelacionado(dteId, usuario);
    if (!relacionado) {
      throw new ErrorDominio('ERR-DTE-403', 'No tiene acceso al XML de este DTE');
    }

    const versionBuscada = version ?? dte.versionVigente;
    const xmlVersion = await this.xmlVersionRepo.findOne({ where: { dteId, version: versionBuscada } });
    if (!xmlVersion?.contenidoXml) {
      throw new ErrorDominio('ERR-DTE-404', `Versión ${versionBuscada} del XML no encontrada o no disponible en base`);
    }
    return { xml: xmlVersion.contenidoXml, version: xmlVersion.version };
  }
}
