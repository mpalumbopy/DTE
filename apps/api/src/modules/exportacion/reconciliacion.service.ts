import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import { Parse, canonicalizarExclusivo, parsearDte, sha256Hex } from '@psdte/xml-engine';
import { Dte } from '../../entities/dte.entity';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { Incidencia } from '../../entities/incidencia.entity';

export interface ResultadoReconciliacion {
  consistente: boolean;
  discrepancias: string[];
}

/**
 * Job `reconciliacion` (docs/PLAN.md sección 9, cron horario en producción — invocable
 * directamente aquí, misma razón que ADR de jobs diferidos en F7/F9): re-parsea el XML vigente y
 * lo compara contra la proyección de PostgreSQL. Cualquier discrepancia es una violación de I8
 * ("el XML manda") y se registra como incidencia ALTA — nunca se corrige la BD en silencio ni se
 * descarta la discrepancia.
 */
@Injectable()
export class ReconciliacionService {
  constructor(
    @InjectRepository(Dte) private readonly dteRepo: Repository<Dte>,
    @InjectRepository(DteXmlVersion) private readonly xmlVersionRepo: Repository<DteXmlVersion>,
    @InjectRepository(Incidencia) private readonly incidenciaRepo: Repository<Incidencia>,
  ) {}

  async reconciliarDte(dteId: string): Promise<ResultadoReconciliacion> {
    const dte = await this.dteRepo.findOneOrFail({ where: { id: dteId } });
    const ultimaVersion = await this.xmlVersionRepo.findOne({ where: { dteId }, order: { version: 'DESC' } });
    if (!ultimaVersion?.contenidoXml) {
      throw new ErrorDominio('ERR-SISTEMA-001', 'DTE sin versión XML vigente');
    }

    const discrepancias: string[] = [];
    const documento = Parse(ultimaVersion.contenidoXml);
    const hashRecalculado = sha256Hex(canonicalizarExclusivo(documento.documentElement));
    if (hashRecalculado !== dte.hashVigente) {
      discrepancias.push(`hash_vigente en BD (${dte.hashVigente}) no coincide con el XML actual (${hashRecalculado})`);
    }

    const parseo = parsearDte(ultimaVersion.contenidoXml);
    if (parseo.idDte !== dte.idDte) {
      discrepancias.push(`id_dte en BD (${dte.idDte}) no coincide con el XML (${parseo.idDte})`);
    }
    const montoXml = parseo.datosGenerales.monto;
    if (montoXml !== undefined && Number(montoXml) !== Number(dte.monto)) {
      discrepancias.push(`monto en BD (${dte.monto}) no coincide con el XML (${montoXml})`);
    }

    if (discrepancias.length > 0) {
      await this.incidenciaRepo.save(
        this.incidenciaRepo.create({
          errorCodigo: null,
          dteId: dte.id,
          endpoint: 'reconciliacion',
          requestId: null,
          detalle: { discrepancias },
          severidad: 'ALTA',
          estado: 'ABIERTA',
        }),
      );
    }

    return { consistente: discrepancias.length === 0, discrepancias };
  }
}
