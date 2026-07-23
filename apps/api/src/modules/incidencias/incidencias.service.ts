import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { EstadoIncidencia, Incidencia, SeveridadIncidencia } from '../../entities/incidencia.entity';

export interface FiltroIncidencias {
  estado?: EstadoIncidencia;
  severidad?: SeveridadIncidencia;
  dteId?: string;
  limit?: number;
}

@Injectable()
export class IncidenciasService {
  constructor(@InjectRepository(Incidencia) private readonly incidenciaRepo: Repository<Incidencia>) {}

  async listar(filtro: FiltroIncidencias): Promise<Incidencia[]> {
    const qb = this.incidenciaRepo.createQueryBuilder('i').orderBy('i.ocurridoEn', 'DESC').limit(Math.min(filtro.limit ?? 50, 200));
    if (filtro.estado) qb.andWhere('i.estado = :estado', { estado: filtro.estado });
    if (filtro.severidad) qb.andWhere('i.severidad = :severidad', { severidad: filtro.severidad });
    if (filtro.dteId) qb.andWhere('i.dteId = :dteId', { dteId: filtro.dteId });
    return qb.getMany();
  }

  async cambiarEstado(id: string, estado: EstadoIncidencia): Promise<Incidencia> {
    const incidencia = await this.incidenciaRepo.findOne({ where: { id } });
    if (!incidencia) {
      throw new ErrorDominio('ERR-DTE-404', `Incidencia inexistente: ${id}`);
    }
    incidencia.estado = estado;
    if (estado === 'RESUELTA' || estado === 'CERRADA') {
      incidencia.resueltoEn = new Date();
    }
    return this.incidenciaRepo.save(incidencia);
  }
}
