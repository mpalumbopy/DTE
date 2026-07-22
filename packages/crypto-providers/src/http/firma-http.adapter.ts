import {
  ConsultarEstadoResultado,
  EstadoSolicitudFirma,
  FirmaProviderPort,
  PruebaConexionResultado,
  SolicitarFirmaRequest,
  SolicitarFirmaResultado,
  ValidacionFirma,
} from '../ports';
import { AdaptadorHttpBase } from './adaptador-base';

/** Adaptador HTTP genérico para un WS de firma real (ver docs/PLAN.md sección 6.4). */
export class FirmaHttpAdapter extends AdaptadorHttpBase implements FirmaProviderPort {
  async solicitarFirma(req: SolicitarFirmaRequest): Promise<SolicitarFirmaResultado> {
    const contexto = {
      solicitudId: req.solicitudId,
      xmlCanonicoB64: req.xmlCanonico.toString('base64'),
      referenciasCsv: req.referencias.join(','),
      uriNodoPrincipal: req.uriNodoPrincipal ?? '',
      firmante: req.firmante,
      rolFirmante: req.rolFirmante,
      callbackUrl: req.callbackUrl,
      expiraEn: req.expiraEn.toISOString(),
    };
    const mapeado = await this.llamar('solicitarFirma', this.ruta('solicitarFirma'), contexto);
    return {
      providerRef: String(mapeado.providerRef ?? ''),
      estado: (mapeado.estado as 'ENVIADA' | 'FIRMADA') ?? 'ENVIADA',
      xadesXml: mapeado.xadesXml as string | undefined,
    };
  }

  async consultarEstado(providerRef: string): Promise<ConsultarEstadoResultado> {
    const ruta = this.ruta('consultarEstado', { providerRef });
    const mapeado = await this.llamar('consultarEstado', ruta, {}, 'GET');
    return {
      estado: (mapeado.estado as EstadoSolicitudFirma) ?? 'PENDIENTE',
      xadesXml: mapeado.xadesXml as string | undefined,
      detalle: mapeado.detalle as string | undefined,
    };
  }

  async validarFirma(xadesXml: string, xmlContexto: Buffer): Promise<ValidacionFirma> {
    const contexto = { xadesXml, xmlContextoB64: xmlContexto.toString('base64') };
    const mapeado = await this.llamar('validarFirma', this.ruta('validarFirma'), contexto);
    return { valida: Boolean(mapeado.valida), motivo: mapeado.motivo as string | undefined };
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
