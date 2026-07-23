import { createHash } from 'crypto';
import { webcrypto } from 'crypto';
import {
  buscarElementoPorId,
  completarConSelloTiempo,
  firmarNodoXadesBes,
  Parse,
  serializar,
  validarFirmaXades,
} from '@psdte/xml-engine';
import {
  ConsultarEstadoResultado,
  EstadoSolicitudFirma,
  FirmaProviderPort,
  PruebaConexionResultado,
  SolicitarFirmaRequest,
  SolicitarFirmaResultado,
  TsaProviderPort,
  ValidacionFirma,
} from '../ports';
import { AutoridadSimulada, emitirCertificadoFirmante } from './ca';

interface SolicitudRegistrada {
  estado: EstadoSolicitudFirma;
  xadesXml?: string;
}

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

/**
 * Firma XAdES-T real (no un mock): genera un certificado F3-like para el firmante emitido por la
 * CA efímera, firma con una clave WebCrypto generada al vuelo (el sistema nunca custodia claves de
 * las partes, I9) y sella el resultado con la TSA simulada. Modo síncrono ("auto"): resuelve
 * `FIRMADA` en la misma llamada; el modo manual (`/dev/firmador`) se agrega en F12.
 */
export class FirmaSimulador implements FirmaProviderPort {
  private readonly solicitudes = new Map<string, SolicitudRegistrada>();

  constructor(
    private readonly autoridad: AutoridadSimulada,
    private readonly tsaProvider: TsaProviderPort,
  ) {}

  async solicitarFirma(req: SolicitarFirmaRequest): Promise<SolicitarFirmaResultado> {
    const documento = Parse(req.xmlCanonico.toString('utf8'));

    const keys = await webcrypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey));
    const certificado = emitirCertificadoFirmante(this.autoridad, req.firmante, spki);

    const pendiente = await firmarNodoXadesBes(documento, {
      clavePrivada: keys.privateKey,
      clavePublica: keys.publicKey,
      certificadoDer: certificado.certificadoDer,
      referenciasAdicionales: req.referencias.map((uri) => ({ uri })),
      uriNodoPrincipal: req.uriNodoPrincipal,
    });

    const hashFirma = createHash('sha256').update(pendiente.valorFirma).digest();
    const { tokenTsrDer } = await this.tsaProvider.sellarHash(hashFirma);
    const uriPrincipal = req.uriNodoPrincipal ?? '';
    const nodoDestino = uriPrincipal ? buscarElementoPorId(documento, uriPrincipal.replace(/^#/, '')) : undefined;
    completarConSelloTiempo(documento, pendiente, tokenTsrDer, nodoDestino);

    const xadesXml = serializar(documento);
    this.solicitudes.set(req.solicitudId, { estado: 'FIRMADA', xadesXml });

    return { providerRef: req.solicitudId, estado: 'FIRMADA', xadesXml };
  }

  async consultarEstado(providerRef: string): Promise<ConsultarEstadoResultado> {
    const solicitud = this.solicitudes.get(providerRef);
    if (!solicitud) {
      return { estado: 'EXPIRADA', detalle: 'Solicitud desconocida por el simulador' };
    }
    return { estado: solicitud.estado, xadesXml: solicitud.xadesXml };
  }

  async validarFirma(xadesXml: string, xmlContexto: Buffer): Promise<ValidacionFirma> {
    try {
      const documentoContexto = Parse(xmlContexto.toString('utf8'));
      const firmasEnContexto = documentoContexto.getElementsByTagNameNS(DS_NS, 'Signature');

      let elementoFirma: Element | undefined;
      if (firmasEnContexto.length === 1) {
        elementoFirma = firmasEnContexto[0] as unknown as Element;
      } else if (firmasEnContexto.length > 1) {
        const documentoFirma = Parse(xadesXml);
        const idBuscado = documentoFirma.documentElement.getAttribute('Id');
        for (let i = 0; i < firmasEnContexto.length; i += 1) {
          const candidato = firmasEnContexto[i] as unknown as Element;
          if (candidato.getAttribute('Id') === idBuscado) {
            elementoFirma = candidato;
            break;
          }
        }
      }

      if (!elementoFirma) {
        return { valida: false, motivo: 'No se encontró la firma dentro del contexto XML provisto' };
      }

      const resultado = await validarFirmaXades(documentoContexto, elementoFirma);
      return resultado.valida ? { valida: true } : { valida: false, motivo: resultado.motivo };
    } catch (err) {
      return { valida: false, motivo: err instanceof Error ? err.message : String(err) };
    }
  }

  async probarConexion(): Promise<PruebaConexionResultado> {
    return { ok: true, latenciaMs: 0, detalle: 'Simulador de firma operativo' };
  }
}
