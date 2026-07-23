import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderFactoryService } from '../integraciones/provider-factory.service';
import { DteXmlVersion } from '../../entities/dte-xml-version.entity';
import { ReselladoLtv } from '../../entities/resellado-ltv.entity';

/** Intervalo por defecto entre resellados LTV — conservador para un entorno de prueba; en
 * producción se ajusta según la política de conservación real (docs/PLAN.md sección 9). */
const INTERVALO_RESELLADO_MS = 365 * 24 * 60 * 60 * 1000;

export interface ResultadoResellado {
  procesados: number;
  versionesIds: string[];
}

/**
 * Job `resellado-ltv` (docs/PLAN.md sección 9, cron diario en producción — aquí expuesto como
 * operación invocable directamente, ya que la infraestructura de colas/cron todavía no existe en
 * el monorepo, igual que el job de vencimientos diferido en F7): agrega un nuevo token TSA a cada
 * `dte_xml_version` cuyo resellado esté vencido (o que nunca fue sellado), extendiendo la validez
 * a largo plazo de la firma (I: preservación ≥ 10 años).
 */
@Injectable()
export class ReselladoService {
  constructor(
    private readonly providerFactory: ProviderFactoryService,
    @InjectRepository(DteXmlVersion) private readonly xmlVersionRepo: Repository<DteXmlVersion>,
    @InjectRepository(ReselladoLtv) private readonly reselladoRepo: Repository<ReselladoLtv>,
  ) {}

  async reselladoVencidos(): Promise<ResultadoResellado> {
    const versiones = await this.xmlVersionRepo.find();
    const ahora = new Date();
    const versionesIds: string[] = [];

    for (const version of versiones) {
      const ultimoResellado = await this.reselladoRepo.findOne({
        where: { xmlVersionId: version.id },
        order: { aplicadoEn: 'DESC' },
      });
      const vencido = !ultimoResellado || ultimoResellado.proximoResellado < ahora;
      if (!vencido) continue;

      await this.resellarVersion(version);
      versionesIds.push(version.id);
    }

    return { procesados: versionesIds.length, versionesIds };
  }

  async resellarVersion(version: DteXmlVersion): Promise<ReselladoLtv> {
    const tsaProvider = await this.providerFactory.obtenerProveedorTsa();
    const { tokenTsrDer } = await tsaProvider.sellarHash(Buffer.from(version.hashSha256, 'hex'));
    const aplicadoEn = new Date();

    return this.reselladoRepo.save(
      this.reselladoRepo.create({
        dteId: version.dteId,
        xmlVersionId: version.id,
        tokenTsa: tokenTsrDer,
        algoritmo: 'RFC3161-SHA256',
        aplicadoEn,
        proximoResellado: new Date(aplicadoEn.getTime() + INTERVALO_RESELLADO_MS),
      }),
    );
  }
}
