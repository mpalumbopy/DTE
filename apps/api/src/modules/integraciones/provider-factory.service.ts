import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ErrorDominio } from '@psdte/shared';
import {
  ConfigAuth,
  ConfigIntegracionResuelta,
  FirmaProviderPort,
  RevocacionProviderPort,
  TsaProviderPort,
  crearProveedorFirma,
  crearProveedorRevocacion,
  crearProveedorTsa,
} from '@psdte/crypto-providers';
import { AesGcmService } from '../../common/crypto/aes-gcm.service';
import { IntegracionWs, TipoIntegracionWs } from '../../entities/integracion-ws.entity';
import { PkiSimuladaService } from './pki-simulada.service';

const TTL_CACHE_MS = 60_000;
const TIPOS_CRITICOS: TipoIntegracionWs[] = ['FIRMA', 'TSA', 'OCSP'];

interface EntradaCache {
  fila: IntegracionWs;
  expiraEn: number;
}

export interface EstadoSimuladorCritico {
  enSimulador: boolean;
  tipos: TipoIntegracionWs[];
}

/**
 * Único punto de resolución de adaptadores de firma/TSA/revocación (ver docs/PLAN.md sección 6.2).
 * Ningún otro módulo debe importar adaptadores concretos de @psdte/crypto-providers: siempre a
 * través de este servicio. Cachea la configuración de `integracion_ws` por 60s por tipo.
 */
@Injectable()
export class ProviderFactoryService {
  private readonly cache = new Map<TipoIntegracionWs, EntradaCache>();

  constructor(
    @InjectRepository(IntegracionWs) private readonly integraciones: Repository<IntegracionWs>,
    private readonly aesGcm: AesGcmService,
    private readonly pkiSimulada: PkiSimuladaService,
  ) {}

  /** Invalida la caché de configuración (llamar tras editar una integración desde /admin/integraciones). */
  invalidarCache(tipo?: TipoIntegracionWs): void {
    if (tipo) {
      this.cache.delete(tipo);
    } else {
      this.cache.clear();
    }
  }

  async obtenerProveedorFirma(): Promise<FirmaProviderPort> {
    const [fila, autoridad, tsaProvider] = await Promise.all([
      this.obtenerFila('FIRMA'),
      this.pkiSimulada.obtenerAutoridad(),
      this.obtenerProveedorTsa(),
    ]);
    return crearProveedorFirma(this.resolverConfig(fila), autoridad, tsaProvider);
  }

  async obtenerProveedorTsa(): Promise<TsaProviderPort> {
    const [fila, autoridad] = await Promise.all([this.obtenerFila('TSA'), this.pkiSimulada.obtenerAutoridad()]);
    return crearProveedorTsa(this.resolverConfig(fila), autoridad);
  }

  async obtenerProveedorRevocacion(tipo: 'OCSP' | 'CRL' = 'OCSP'): Promise<RevocacionProviderPort> {
    const fila = await this.obtenerFila(tipo);
    return crearProveedorRevocacion(this.resolverConfig(fila));
  }

  /** FIRMA/TSA/OCSP son las integraciones críticas para emitir y verificar (candado ALLOW_SIMULATOR). */
  async estadoSimuladorCritico(): Promise<EstadoSimuladorCritico> {
    const filas = await this.integraciones.find({ where: { tipo: In(TIPOS_CRITICOS), activo: true } });
    const tipos = filas.filter((f) => f.modo === 'SIMULADOR').map((f) => f.tipo);
    return { enSimulador: tipos.length > 0, tipos };
  }

  private async obtenerFila(tipo: TipoIntegracionWs): Promise<IntegracionWs> {
    const cacheado = this.cache.get(tipo);
    if (cacheado && cacheado.expiraEn > Date.now()) {
      return cacheado.fila;
    }
    const fila = await this.integraciones.findOne({
      where: { tipo, activo: true },
      order: { actualizadoEn: 'DESC' },
    });
    if (!fila) {
      throw new ErrorDominio('ERR-PKI-503', `No hay integración activa configurada para "${tipo}"`);
    }
    this.cache.set(tipo, { fila, expiraEn: Date.now() + TTL_CACHE_MS });
    return fila;
  }

  private resolverConfig(fila: IntegracionWs): ConfigIntegracionResuelta {
    return {
      nombre: fila.nombre,
      modo: fila.modo,
      baseUrl: fila.baseUrl ?? undefined,
      endpoints: fila.endpoints,
      auth: this.resolverAuth(fila),
      headersExtra: fila.headersExtra,
      timeoutMs: fila.timeoutMs,
      reintentos: fila.reintentos,
      backoffMs: fila.backoffMs,
      mapeoPayload: fila.mapeoPayload as ConfigIntegracionResuelta['mapeoPayload'],
      verificarTls: fila.verificarTls,
    };
  }

  private resolverAuth(fila: IntegracionWs): ConfigAuth {
    switch (fila.authTipo) {
      case 'BASIC': {
        const { usuario, clave } = this.descifrarJson<{ usuario: string; clave: string }>(fila.credencialesCifradas);
        return { tipo: 'BASIC', usuario, clave };
      }
      case 'BEARER': {
        const { token } = this.descifrarJson<{ token: string }>(fila.credencialesCifradas);
        return { tipo: 'BEARER', token };
      }
      case 'API_KEY': {
        const { apiKeyHeader, apiKeyValor } = this.descifrarJson<{ apiKeyHeader: string; apiKeyValor: string }>(
          fila.credencialesCifradas,
        );
        return { tipo: 'API_KEY', apiKeyHeader, apiKeyValor };
      }
      case 'MTLS':
        return {
          tipo: 'MTLS',
          mtlsCertPem: fila.mtlsCertCifrado ? this.aesGcm.descifrar(fila.mtlsCertCifrado) : undefined,
          mtlsKeyPem: fila.mtlsKeyCifrada ? this.aesGcm.descifrar(fila.mtlsKeyCifrada) : undefined,
        };
      case 'NONE':
      default:
        return { tipo: 'NONE' };
    }
  }

  private descifrarJson<T>(valorCifrado: string | null): T {
    if (!valorCifrado) {
      return {} as T;
    }
    return JSON.parse(this.aesGcm.descifrar(valorCifrado)) as T;
  }
}
