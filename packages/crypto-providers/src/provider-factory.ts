import { ConfigAuth, ConfigClienteHttp } from './http/cliente-http';
import { MapeoOperacion } from './http/adaptador-base';
import { FirmaHttpAdapter } from './http/firma-http.adapter';
import { TsaHttpAdapter } from './http/tsa-http.adapter';
import { RevocacionHttpAdapter } from './http/revocacion-http.adapter';
import { FirmaProviderPort, RevocacionProviderPort, TsaProviderPort } from './ports';
import { ProveedorDeshabilitado } from './proveedor-deshabilitado';
import { AutoridadSimulada } from './simulador/ca';
import { FirmaSimulador } from './simulador/firma.simulador';
import { TsaSimulador } from './simulador/tsa.simulador';
import { RevocacionSimulador } from './simulador/revocacion.simulador';

export type ModoIntegracion = 'SIMULADOR' | 'REAL' | 'DESHABILITADO';

export interface ConfigIntegracionResuelta {
  nombre: string;
  modo: ModoIntegracion;
  baseUrl?: string;
  endpoints: Record<string, string>;
  auth: ConfigAuth;
  headersExtra?: Record<string, string>;
  timeoutMs?: number;
  reintentos?: number;
  backoffMs?: number;
  mapeoPayload: Record<string, MapeoOperacion>;
  verificarTls?: boolean;
}

function configClienteHttp(config: ConfigIntegracionResuelta): ConfigClienteHttp {
  return {
    baseUrl: config.baseUrl ?? '',
    auth: config.auth,
    headersExtra: config.headersExtra,
    timeoutMs: config.timeoutMs,
    reintentos: config.reintentos,
    backoffMs: config.backoffMs,
    verificarTls: config.verificarTls,
  };
}

/**
 * Resuelve el adaptador de firma según el modo configurado. Ningún módulo debe importar un
 * adaptador concreto directamente: siempre a través de esta función (ver docs/PLAN.md sección 6.2).
 */
export function crearProveedorFirma(
  config: ConfigIntegracionResuelta,
  autoridad: AutoridadSimulada,
  tsaProvider: TsaProviderPort,
): FirmaProviderPort {
  switch (config.modo) {
    case 'SIMULADOR':
      return new FirmaSimulador(autoridad, tsaProvider);
    case 'REAL':
      return new FirmaHttpAdapter({
        cliente: configClienteHttp(config),
        endpoints: config.endpoints,
        mapeoPayload: config.mapeoPayload,
      });
    case 'DESHABILITADO':
    default:
      return new ProveedorDeshabilitado(config.nombre);
  }
}

export function crearProveedorTsa(config: ConfigIntegracionResuelta, autoridad: AutoridadSimulada): TsaProviderPort {
  switch (config.modo) {
    case 'SIMULADOR':
      return new TsaSimulador(autoridad);
    case 'REAL':
      return new TsaHttpAdapter({
        cliente: configClienteHttp(config),
        endpoints: config.endpoints,
        mapeoPayload: config.mapeoPayload,
      });
    case 'DESHABILITADO':
    default:
      return new ProveedorDeshabilitado(config.nombre);
  }
}

export function crearProveedorRevocacion(config: ConfigIntegracionResuelta): RevocacionProviderPort {
  switch (config.modo) {
    case 'SIMULADOR':
      return new RevocacionSimulador();
    case 'REAL':
      return new RevocacionHttpAdapter({
        cliente: configClienteHttp(config),
        endpoints: config.endpoints,
        mapeoPayload: config.mapeoPayload,
      });
    case 'DESHABILITADO':
    default:
      return new ProveedorDeshabilitado(config.nombre);
  }
}
