import { XMLSerializer } from '@xmldom/xmldom';
import { Parse, SignedXml } from 'xadesjs';
import * as xadesXml from 'xadesjs';
import type { Signature } from 'xmldsigjs';
import { asegurarEntornoNodeXml } from '../bootstrap-node';

// Se registra al importar el módulo: Parse (reexportado) se puede llamar sin pasos previos.
asegurarEntornoNodeXml();

export { Parse };

export function serializar(nodo: Node): string {
  return new XMLSerializer().serializeToString(nodo);
}

/** Referencia adicional por URI (p. ej. al evento anterior, para el encadenamiento de firmas de I7). */
export interface ReferenciaAdicional {
  uri: string;
}

export interface OpcionesFirmarXades {
  clavePrivada: CryptoKey;
  clavePublica: CryptoKey;
  certificadoDer: Buffer;
  referenciasAdicionales?: ReferenciaAdicional[];
  fechaFirma?: Date;
  signatureId?: string;
}

export interface FirmaBesPendiente {
  /** Instancia viva de SignedXml: sus Properties/UnsignedProperties se completan antes de serializar. */
  signedXml: SignedXml;
  /** Objeto Signature devuelto por Sign(): su GetXml() se vuelve a invocar tras completar el sello. */
  signature: Signature;
  /** Bytes de ds:SignatureValue — lo que la TSA debe sellar para lograr XAdES-T. */
  valorFirma: Uint8Array;
}

/**
 * Firma un nodo (enveloped) produciendo XAdES-BES: SignedProperties + SigningTime +
 * referencia enveloped al nodo + una referencia SHA-256/C14N por cada URI adicional indicada
 * (usado para el encadenamiento `#evento_N` -> `#evento_N-1` de I7). No adjunta el resultado al
 * documento todavía: eso lo hace `completarConSelloTiempo`, para poder sellar el hash de
 * ds:SignatureValue con la TSA antes de fijar el XML final (XAdES-T real, no solo BES).
 */
export async function firmarNodoXadesBes(
  documento: Document,
  opciones: OpcionesFirmarXades,
): Promise<FirmaBesPendiente> {
  asegurarEntornoNodeXml();

  const signedXml = new SignedXml();
  const referencias = [
    { hash: 'SHA-256', transforms: ['enveloped', 'c14n'] },
    ...(opciones.referenciasAdicionales ?? []).map((r) => ({
      uri: r.uri,
      hash: 'SHA-256',
      transforms: ['c14n'],
    })),
  ];

  const signature = await signedXml.Sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    opciones.clavePrivada,
    documento,
    {
      id: opciones.signatureId,
      keyValue: opciones.clavePublica,
      x509: [opciones.certificadoDer.toString('base64')],
      references: referencias,
      signingTime: { value: opciones.fechaFirma ?? new Date() },
    },
  );

  if (!signature.SignatureValue) {
    throw new Error('xadesjs no devolvió SignatureValue tras firmar');
  }

  return { signedXml, signature, valorFirma: signature.SignatureValue };
}

/**
 * Embebe el token TSA (DER, RFC 3161) como xades:SignatureTimeStamp dentro de
 * UnsignedProperties, finaliza el XML de la firma (XAdES-T) y lo adjunta al documento.
 * Debe llamarse una sola vez por firma, después de `firmarNodoXadesBes`.
 */
export function completarConSelloTiempo(
  documento: Document,
  firmaPendiente: FirmaBesPendiente,
  tokenTsaDer: Buffer,
): Element {
  const marcaTiempo = new xadesXml.xml.SignatureTimeStamp();
  const encapsulado = new xadesXml.xml.EncapsulatedTimeStamp();
  encapsulado.Value = new Uint8Array(tokenTsaDer);
  marcaTiempo.EncapsulatedTimeStamp.Add(encapsulado);
  firmaPendiente.signedXml.UnsignedProperties.UnsignedSignatureProperties.Add(marcaTiempo);

  const elementoFinal = firmaPendiente.signature.GetXml();
  if (!elementoFinal) {
    throw new Error('xadesjs no devolvió el elemento de firma al finalizar');
  }
  documento.documentElement.appendChild(elementoFinal);
  return elementoFinal;
}

export interface ResultadoValidacionXades {
  valida: boolean;
  motivo?: string;
}

/** Valida criptográficamente un ds:Signature ya presente en `documento` (I7/I9: nunca confiar sin validar). */
export async function validarFirmaXades(documento: Document, elementoFirma: Element): Promise<ResultadoValidacionXades> {
  asegurarEntornoNodeXml();
  try {
    const verificador = new SignedXml(documento);
    verificador.LoadXml(elementoFirma);
    const valida = await verificador.Verify();
    return valida ? { valida: true } : { valida: false, motivo: 'La verificación devolvió false' };
  } catch (err) {
    return { valida: false, motivo: err instanceof Error ? err.message : String(err) };
  }
}
