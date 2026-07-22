import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { CatEstadoDte } from '../../entities/cat-estado-dte.entity';
import { CatTipoEvento } from '../../entities/cat-tipo-evento.entity';
import { CatTransicion } from '../../entities/cat-transicion.entity';
import { CatRol } from '../../entities/cat-rol.entity';
import { CatActoExterno } from '../../entities/cat-acto-externo.entity';
import { CatCausalBloqueo } from '../../entities/cat-causal-bloqueo.entity';
import { CatTipoEvidencia } from '../../entities/cat-tipo-evidencia.entity';
import { CatNivelConsulta } from '../../entities/cat-nivel-consulta.entity';
import { CatTipoNotificacion } from '../../entities/cat-tipo-notificacion.entity';
import { CatError } from '../../entities/cat-error.entity';

export interface CatalogoResultado {
  codigo: string;
  version: string;
  items: unknown[];
}

const TTL_MS = 5 * 60 * 1000;

function versionDe(filas: Array<{ versionCatalogo?: string }>): string {
  const versiones = new Set(filas.map((f) => f.versionCatalogo).filter((v): v is string => Boolean(v)));
  return versiones.size > 0 ? [...versiones].sort().at(-1)! : '1.0';
}

@Injectable()
export class CatalogosService {
  private cache = new Map<string, { resultado: CatalogoResultado; cargadoEn: number }>();

  constructor(
    @InjectRepository(CatEstadoDte) private readonly estadoDte: Repository<CatEstadoDte>,
    @InjectRepository(CatTipoEvento) private readonly tipoEvento: Repository<CatTipoEvento>,
    @InjectRepository(CatTransicion) private readonly transicion: Repository<CatTransicion>,
    @InjectRepository(CatRol) private readonly rol: Repository<CatRol>,
    @InjectRepository(CatActoExterno) private readonly actoExterno: Repository<CatActoExterno>,
    @InjectRepository(CatCausalBloqueo) private readonly causalBloqueo: Repository<CatCausalBloqueo>,
    @InjectRepository(CatTipoEvidencia) private readonly tipoEvidencia: Repository<CatTipoEvidencia>,
    @InjectRepository(CatNivelConsulta) private readonly nivelConsulta: Repository<CatNivelConsulta>,
    @InjectRepository(CatTipoNotificacion) private readonly tipoNotificacion: Repository<CatTipoNotificacion>,
    @InjectRepository(CatError) private readonly error: Repository<CatError>,
  ) {}

  private async cargar(codigo: string): Promise<CatalogoResultado> {
    switch (codigo) {
      case 'CAT-DTE-01': {
        const filas = await this.estadoDte.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: versionDe(filas), items: filas };
      }
      case 'CAT-DTE-02': {
        const filas = await this.tipoEvento.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: versionDe(filas), items: filas };
      }
      case 'CAT-DTE-03': {
        const filas = await this.transicion.find({ where: { vigente: true }, order: { id: 'ASC' } });
        return { codigo, version: versionDe(filas), items: filas };
      }
      case 'CAT-DTE-04': {
        const filas = await this.rol.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      case 'CAT-DTE-05': {
        const filas = await this.actoExterno.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      case 'CAT-DTE-06': {
        const filas = await this.causalBloqueo.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      case 'CAT-DTE-07': {
        const filas = await this.tipoEvidencia.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      case 'CAT-DTE-08': {
        const filas = await this.nivelConsulta.find({ order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      case 'CAT-DTE-09': {
        const filas = await this.tipoNotificacion.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      case 'CAT-DTE-10': {
        const filas = await this.error.find({ where: { vigente: true }, order: { codigo: 'ASC' } });
        return { codigo, version: '1.0', items: filas };
      }
      default:
        throw new ErrorDominio('ERR-DTE-404', `Catálogo inexistente: ${codigo}`);
    }
  }

  async obtener(codigo: string): Promise<CatalogoResultado> {
    const codigoNormalizado = codigo.toUpperCase();
    const entrada = this.cache.get(codigoNormalizado);
    if (entrada && Date.now() - entrada.cargadoEn < TTL_MS) {
      return entrada.resultado;
    }
    const resultado = await this.cargar(codigoNormalizado);
    this.cache.set(codigoNormalizado, { resultado, cargadoEn: Date.now() });
    return resultado;
  }

  invalidar(codigo?: string): void {
    if (codigo) {
      this.cache.delete(codigo.toUpperCase());
    } else {
      this.cache.clear();
    }
  }
}
