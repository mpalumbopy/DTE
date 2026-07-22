import * as forge from 'node-forge';

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const NOMBRE_CA = 'AC SIMULADA PSDTE — NO VÁLIDA LEGALMENTE';
const NOMBRE_TSA = 'TSA SIMULADA PSDTE — NO VÁLIDA LEGALMENTE';

export interface ParPemClave {
  certificadoPem: string;
  clavePrivadaPem: string;
}

export interface AutoridadSimulada {
  ca: ParPemClave;
  tsa: ParPemClave;
}

function crearNombre(commonName: string, extra: forge.pki.CertificateField[] = []): forge.pki.CertificateField[] {
  return [
    // valueTagClass: UTF8 evita que forge codifique como PrintableString (su default), que
    // corrompe el DER al truncar/mal-codificar el em-dash y las vocales acentuadas del nombre.
    {
      name: 'commonName',
      value: commonName,
      valueTagClass: forge.asn1.Type.UTF8,
    } as unknown as forge.pki.CertificateField,
    { name: 'countryName', value: 'PY' },
    ...extra,
  ];
}

function nuevoCertificadoBase(publicKey: forge.pki.rsa.PublicKey, diasValidez: number): forge.pki.Certificate {
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + diasValidez * UN_DIA_MS);
  return cert;
}

/** Genera una CA raíz efímera y una TSA intermedia firmada por ella (ver docs/PLAN.md sección 6.3). */
export function generarAutoridadSimulada(): AutoridadSimulada {
  const clavesCa = forge.pki.rsa.generateKeyPair(2048);
  const certCa = nuevoCertificadoBase(clavesCa.publicKey, 3650);
  const nombreCa = crearNombre(NOMBRE_CA);
  certCa.setSubject(nombreCa);
  certCa.setIssuer(nombreCa);
  certCa.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true },
  ]);
  certCa.sign(clavesCa.privateKey, forge.md.sha256.create());

  const clavesTsa = forge.pki.rsa.generateKeyPair(2048);
  const certTsa = nuevoCertificadoBase(clavesTsa.publicKey, 1825);
  certTsa.setSubject(crearNombre(NOMBRE_TSA));
  certTsa.setIssuer(nombreCa);
  certTsa.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', timeStamping: true },
  ]);
  certTsa.sign(clavesCa.privateKey, forge.md.sha256.create());

  return {
    ca: {
      certificadoPem: forge.pki.certificateToPem(certCa),
      clavePrivadaPem: forge.pki.privateKeyToPem(clavesCa.privateKey),
    },
    tsa: {
      certificadoPem: forge.pki.certificateToPem(certTsa),
      clavePrivadaPem: forge.pki.privateKeyToPem(clavesTsa.privateKey),
    },
  };
}

export interface CertificadoFirmanteSimulado {
  certificadoPem: string;
  certificadoDer: Buffer;
}

/**
 * Emite al vuelo un certificado F3-like para un firmante (CN=nombre, SERIALNUMBER=CI<doc>), para
 * la clave pública dada (SPKI DER). La clave privada correspondiente la genera y retiene quien
 * llama (WebCrypto, ver FirmaSimulador) — este módulo nunca ve ni genera claves privadas de
 * terceros (I9).
 */
export function emitirCertificadoFirmante(
  autoridad: AutoridadSimulada,
  firmante: { nombre: string; documento: string },
  clavePublicaSpkiDer: Buffer,
): CertificadoFirmanteSimulado {
  const claveCa = forge.pki.privateKeyFromPem(autoridad.ca.clavePrivadaPem);
  const certCa = forge.pki.certificateFromPem(autoridad.ca.certificadoPem);

  const asn1ClavePublica = forge.asn1.fromDer(forge.util.createBuffer(clavePublicaSpkiDer.toString('binary')));
  const clavePublica = forge.pki.publicKeyFromAsn1(asn1ClavePublica) as forge.pki.rsa.PublicKey;

  const cert = nuevoCertificadoBase(clavePublica, 365);
  cert.setSubject(
    crearNombre(firmante.nombre, [{ name: 'serialNumber', value: `CI${firmante.documento}` }]),
  );
  cert.setIssuer(certCa.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(claveCa, forge.md.sha256.create());

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return {
    certificadoPem: forge.pki.certificateToPem(cert),
    certificadoDer: Buffer.from(der, 'binary'),
  };
}

/** true si el certificado fue marcado como revocado a propósito para QA (OU=REVOCADO-TEST, ver sección 6.3). */
export function esCertificadoDeQaRevocado(certificadoPem: string): boolean {
  const cert = forge.pki.certificateFromPem(certificadoPem);
  return cert.subject.attributes.some((attr) => attr.shortName === 'OU' && attr.value === 'REVOCADO-TEST');
}
