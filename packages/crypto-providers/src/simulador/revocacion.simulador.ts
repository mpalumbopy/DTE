import * as forge from 'node-forge';
import { PruebaConexionResultado, RevocacionProviderPort, TslSnapshot, VerificarCertificadoResultado } from '../ports';
import { esCertificadoDeQaRevocado } from './ca';

/**
 * Responde GOOD/enTsl:true por defecto; los certificados marcados OU=REVOCADO-TEST responden
 * REVOKED para poder ejercitar ese camino en QA (ver docs/PLAN.md sección 6.3).
 */
export class RevocacionSimulador implements RevocacionProviderPort {
  async verificarCertificado(certDer: Buffer): Promise<VerificarCertificadoResultado> {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary')));
    const cert = forge.pki.certificateFromAsn1(asn1);
    const pem = forge.pki.certificateToPem(cert);
    const revocado = esCertificadoDeQaRevocado(pem);

    const evidenciaRaw = Buffer.from(
      JSON.stringify({
        simulado: true,
        verificadoEn: new Date().toISOString(),
        resultado: revocado ? 'REVOKED' : 'GOOD',
      }),
    );

    return {
      resultado: revocado ? 'REVOKED' : 'GOOD',
      via: 'OCSP',
      evidenciaRaw,
      enTsl: true,
      cadenaOk: true,
    };
  }

  async obtenerTslSnapshot(): Promise<TslSnapshot> {
    return {
      xml: Buffer.from('<TrustServiceStatusList simulado="true"/>', 'utf8'),
      fecha: new Date(),
    };
  }

  async probarConexion(): Promise<PruebaConexionResultado> {
    return { ok: true, latenciaMs: 0, detalle: 'Simulador de revocación operativo' };
  }
}
