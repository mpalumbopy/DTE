import {
  PruebaConexionResultado,
  RevocacionProviderPort,
  TslSnapshot,
  VerificarCertificadoResultado,
} from '../ports';
import { AdaptadorHttpBase } from './adaptador-base';

/** Adaptador HTTP genérico para un WS de OCSP/CRL/TSL real (ver docs/PLAN.md sección 6.4). */
export class RevocacionHttpAdapter extends AdaptadorHttpBase implements RevocacionProviderPort {
  async verificarCertificado(certDer: Buffer): Promise<VerificarCertificadoResultado> {
    const contexto = { certificadoB64: certDer.toString('base64') };
    const mapeado = await this.llamar('verificarCertificado', this.ruta('verificarCertificado'), contexto);
    return {
      resultado: (mapeado.resultado as 'GOOD' | 'REVOKED' | 'UNKNOWN') ?? 'UNKNOWN',
      via: (mapeado.via as 'OCSP' | 'CRL') ?? 'OCSP',
      evidenciaRaw: mapeado.evidenciaB64 ? Buffer.from(String(mapeado.evidenciaB64), 'base64') : Buffer.alloc(0),
      enTsl: Boolean(mapeado.enTsl),
      cadenaOk: Boolean(mapeado.cadenaOk),
    };
  }

  async obtenerTslSnapshot(): Promise<TslSnapshot> {
    const mapeado = await this.llamar('obtenerTslSnapshot', this.ruta('obtenerTslSnapshot'), {}, 'GET');
    return {
      xml: mapeado.xmlB64 ? Buffer.from(String(mapeado.xmlB64), 'base64') : Buffer.alloc(0),
      fecha: mapeado.fecha ? new Date(String(mapeado.fecha)) : new Date(),
    };
  }

  async probarConexion(): Promise<PruebaConexionResultado> {
    const inicio = Date.now();
    try {
      await this.llamar('probarConexion', this.ruta('probarConexion'), {}, 'GET');
      return { ok: true, latenciaMs: Date.now() - inicio, detalle: 'Conexión exitosa' };
    } catch (err) {
      return { ok: false, latenciaMs: Date.now() - inicio, detalle: err instanceof Error ? err.message : String(err) };
    }
  }
}
