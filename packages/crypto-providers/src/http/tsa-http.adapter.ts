import { PruebaConexionResultado, SellarHashResultado, TsaProviderPort } from '../ports';
import { AdaptadorHttpBase } from './adaptador-base';

/** Adaptador HTTP genérico para un WS de TSA real (ver docs/PLAN.md sección 6.4). */
export class TsaHttpAdapter extends AdaptadorHttpBase implements TsaProviderPort {
  async sellarHash(hashSha256: Buffer): Promise<SellarHashResultado> {
    const contexto = { hashHex: hashSha256.toString('hex'), algoritmo: 'SHA-256' };
    const mapeado = await this.llamar('sellarHash', this.ruta('sellarHash'), contexto);
    const tokenB64 = mapeado.tokenB64 as string | undefined;
    if (!tokenB64) {
      throw new Error('La respuesta de la TSA no incluyó tokenB64');
    }
    return {
      tokenTsrDer: Buffer.from(tokenB64, 'base64'),
      fecha: mapeado.fecha ? new Date(String(mapeado.fecha)) : new Date(),
      tsaSubject: (mapeado.tsaSubject as string) ?? 'desconocido',
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
