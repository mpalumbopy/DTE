import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoridadSimulada, generarAutoridadSimulada } from '@psdte/crypto-providers';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { ParametroSistema } from '../../entities/parametro-sistema.entity';

const CLAVE_PARAMETRO = 'simulador.pki';

interface ValorCifrado {
  cifrado: string;
}

/**
 * Genera (una única vez) y persiste la CA/TSA efímeras del simulador criptográfico (ver
 * docs/PLAN.md sección 6.3). Los PEMs se guardan cifrados (AES-256-GCM) en
 * parametro_sistema['simulador.pki'] para que todos los procesos (api/worker) usen la misma
 * autoridad simulada sin volver a generarla en cada arranque.
 */
@Injectable()
export class PkiSimuladaService {
  private cacheAutoridad?: AutoridadSimulada;
  private cargaEnCurso?: Promise<AutoridadSimulada>;

  constructor(
    @InjectRepository(ParametroSistema) private readonly parametros: Repository<ParametroSistema>,
    private readonly aesGcm: AesGcmService,
  ) {}

  async obtenerAutoridad(): Promise<AutoridadSimulada> {
    if (this.cacheAutoridad) {
      return this.cacheAutoridad;
    }
    if (!this.cargaEnCurso) {
      this.cargaEnCurso = this.cargarOGenerar().finally(() => {
        this.cargaEnCurso = undefined;
      });
    }
    this.cacheAutoridad = await this.cargaEnCurso;
    return this.cacheAutoridad;
  }

  private async cargarOGenerar(): Promise<AutoridadSimulada> {
    const existente = await this.parametros.findOne({ where: { clave: CLAVE_PARAMETRO } });
    if (existente) {
      return this.descifrarAutoridad(existente.valor as ValorCifrado);
    }

    const autoridad = generarAutoridadSimulada();
    const cifrado = this.aesGcm.cifrar(JSON.stringify(autoridad));
    await this.parametros
      .createQueryBuilder()
      .insert()
      .into(ParametroSistema)
      .values({
        clave: CLAVE_PARAMETRO,
        valor: { cifrado } satisfies ValorCifrado,
        descripcion: 'CA raíz y TSA simuladas efímeras (PEMs cifrados) — ver docs/PLAN.md sección 6.3',
        editable: false,
      })
      .orIgnore()
      .execute();

    // Si otro proceso ganó la carrera de inserción (ON CONFLICT DO NOTHING), se relee su fila para
    // que toda la aplicación use la misma autoridad simulada, no una generada por este proceso.
    const fila = await this.parametros.findOneOrFail({ where: { clave: CLAVE_PARAMETRO } });
    return this.descifrarAutoridad(fila.valor as ValorCifrado);
  }

  private descifrarAutoridad(valor: ValorCifrado): AutoridadSimulada {
    return JSON.parse(this.aesGcm.descifrar(valor.cifrado)) as AutoridadSimulada;
  }
}
