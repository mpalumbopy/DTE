import { webcrypto } from 'crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { PruebaConexionResultado, SellarHashResultado, TsaProviderPort } from '../ports';
import { AutoridadSimulada, emitirCertificadoFirmante } from './ca';
import { asegurarMotorPkijs } from './pkijs-engine';

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';
/** OID de política de TSA simulada — no corresponde a ninguna política real. */
const OID_POLITICA_SIMULADA = '1.3.6.1.4.1.0.9999.1';
const NOMBRE_TSA = 'TSA Simulada PSDTE';

interface ClavesTsa {
  privateKey: CryptoKey;
  certificado: pkijs.Certificate;
}

async function generarClavesTsa(autoridad: AutoridadSimulada): Promise<ClavesTsa> {
  const keys = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', keys.publicKey));
  const certificadoEmitido = emitirCertificadoFirmante(autoridad, { nombre: NOMBRE_TSA, documento: 'TSA-000' }, spki);
  const asn1Cert = asn1js.fromBER(certificadoEmitido.certificadoDer);
  const certificado = new pkijs.Certificate({ schema: asn1Cert.result });
  return { privateKey: keys.privateKey, certificado };
}

/**
 * Sella hashes SHA-256 con un token RFC 3161 (CMS SignedData conteniendo un TSTInfo), firmado por
 * una TSA simulada emitida por la CA efímera (ver docs/PLAN.md sección 6.3). No usar en producción:
 * la política y la CA no son legalmente válidas.
 */
export class TsaSimulador implements TsaProviderPort {
  private readonly clavesListo: Promise<ClavesTsa>;

  constructor(autoridad: AutoridadSimulada) {
    asegurarMotorPkijs();
    this.clavesListo = generarClavesTsa(autoridad);
  }

  async sellarHash(hashSha256: Buffer): Promise<SellarHashResultado> {
    const { privateKey, certificado } = await this.clavesListo;
    const fecha = new Date();

    const tstInfo = new pkijs.TSTInfo({
      version: 1,
      policy: OID_POLITICA_SIMULADA,
      messageImprint: new pkijs.MessageImprint({
        hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
        hashedMessage: new asn1js.OctetString({ valueHex: new Uint8Array(hashSha256) }),
      }),
      serialNumber: new asn1js.Integer({ value: Date.now() }),
      genTime: fecha,
    });
    const tstInfoBer = tstInfo.toSchema().toBER(false);

    const signedData = new pkijs.SignedData({
      version: 1,
      encapContentInfo: new pkijs.EncapsulatedContentInfo({
        eContentType: OID_TST_INFO,
        eContent: new asn1js.OctetString({ valueHex: tstInfoBer }),
      }),
      signerInfos: [
        new pkijs.SignerInfo({
          sid: new pkijs.IssuerAndSerialNumber({
            issuer: certificado.issuer,
            serialNumber: certificado.serialNumber,
          }),
        }),
      ],
      certificates: [certificado],
    });
    await signedData.sign(privateKey, 0, 'SHA-256');

    const contentInfo = new pkijs.ContentInfo({
      contentType: pkijs.ContentInfo.SIGNED_DATA,
      content: signedData.toSchema(true),
    });
    const tokenTsrDer = Buffer.from(contentInfo.toSchema().toBER(false));

    return { tokenTsrDer, fecha, tsaSubject: NOMBRE_TSA };
  }

  async probarConexion(): Promise<PruebaConexionResultado> {
    const inicio = Date.now();
    await this.clavesListo;
    return { ok: true, latenciaMs: Date.now() - inicio, detalle: 'Simulador de TSA operativo' };
  }
}

export interface TokenTsaLeido {
  genTime: Date;
  policy: string;
  hashedMessage: Buffer;
  certificadoFirmante: pkijs.Certificate;
}

/**
 * Parsea un token TSR (RFC 3161) y extrae sus campos, sin depender del verificador de alto nivel
 * de pkijs (que tiene un problema conocido desenvolviendo `eContent` para contenido TSTInfo tras
 * un round-trip por DER — ver docs/DECISIONES.md ADR-012). Usado para validar la estructura y por
 * los tests de este paquete.
 */
export function leerTokenTsa(tokenTsrDer: Buffer): TokenTsaLeido {
  const asn1ContentInfo = asn1js.fromBER(tokenTsrDer);
  const contentInfo = new pkijs.ContentInfo({ schema: asn1ContentInfo.result });
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });

  const eContentEnvuelto = signedData.encapContentInfo.eContent as unknown as {
    valueBlock: { value: Array<{ valueBlock: { valueHexView: Uint8Array } }>; valueHexView: Uint8Array };
  };
  // El contenido de EncapsulatedContentInfo.eContent va dentro de un tag [0] EXPLICIT: el OCTET
  // STRING real es el único hijo de `valueBlock.value`, no `valueBlock.valueHexView` directamente.
  const tstInfoDer = eContentEnvuelto.valueBlock.value[0].valueBlock.valueHexView;
  const tstInfo = new pkijs.TSTInfo({ schema: asn1js.fromBER(tstInfoDer).result });

  const hashedMessage = Buffer.from(
    (tstInfo.messageImprint.hashedMessage as unknown as { valueBlock: { valueHexView: Uint8Array } }).valueBlock
      .valueHexView,
  );

  const certificadoFirmante = signedData.certificates?.[0] as pkijs.Certificate;

  return {
    genTime: tstInfo.genTime,
    policy: tstInfo.policy,
    hashedMessage,
    certificadoFirmante,
  };
}
