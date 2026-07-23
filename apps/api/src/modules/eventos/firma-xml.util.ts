import { createHash, X509Certificate } from 'crypto';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const XADES_SIGNED_PROPS_TYPE = 'http://uri.etsi.org/01903#SignedProperties';

export interface DetalleFirmaXml {
  xmlSignatureId: string;
  algoritmoFirma: string;
  algoritmoDigest: string;
  signingTime: Date;
  referencias: string[];
  signatureValueHash: string;
  certificadoDer: Buffer;
  selloTiempoTsa: string | null;
  x509: X509Certificate;
}

/** Extrae los metadatos persistibles (Certificado/Firma) de un `ds:Signature` ya validado
 * (usado por emisión y por los eventos de F7 — endoso/pago/bloqueo/cancelación). */
export function extraerDetalleFirma(elementoFirma: Element): DetalleFirmaXml {
  const signatureMethod = elementoFirma.getElementsByTagNameNS(DS_NS, 'SignatureMethod')[0] as Element | undefined;
  const digestMethod = elementoFirma.getElementsByTagNameNS(DS_NS, 'DigestMethod')[0] as Element | undefined;
  const signingTimeEl = elementoFirma.getElementsByTagNameNS(XADES_NS, 'SigningTime')[0] as Element | undefined;
  const x509CertEl = elementoFirma.getElementsByTagNameNS(DS_NS, 'X509Certificate')[0] as Element | undefined;
  const signatureValueEl = elementoFirma.getElementsByTagNameNS(DS_NS, 'SignatureValue')[0] as Element | undefined;
  const tsaEl = elementoFirma.getElementsByTagNameNS(XADES_NS, 'EncapsulatedTimeStamp')[0] as Element | undefined;

  const referenciasEls = Array.from(elementoFirma.getElementsByTagNameNS(DS_NS, 'Reference')) as Element[];
  const referencias = referenciasEls
    .filter((r) => r.getAttribute('Type') !== XADES_SIGNED_PROPS_TYPE)
    .map((r) => r.getAttribute('URI') ?? '')
    .filter((uri) => !uri.startsWith('#keyInfo-'));

  const signatureValueBytes = Buffer.from(signatureValueEl?.textContent?.trim() ?? '', 'base64');
  const certificadoDer = Buffer.from(x509CertEl?.textContent?.trim() ?? '', 'base64');

  return {
    xmlSignatureId: elementoFirma.getAttribute('Id') ?? '',
    algoritmoFirma: signatureMethod?.getAttribute('Algorithm') ?? '',
    algoritmoDigest: digestMethod?.getAttribute('Algorithm') ?? '',
    signingTime: signingTimeEl?.textContent ? new Date(signingTimeEl.textContent) : new Date(),
    referencias,
    signatureValueHash: createHash('sha256').update(signatureValueBytes).digest('hex'),
    certificadoDer,
    selloTiempoTsa: tsaEl?.textContent?.trim() ?? null,
    x509: new X509Certificate(certificadoDer),
  };
}
