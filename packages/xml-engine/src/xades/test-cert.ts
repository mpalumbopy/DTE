import * as forge from 'node-forge';

/** Certificado autofirmado de prueba (no vinculado a ninguna clave WebCrypto): solo para exercitar
 * el parseo/embebido de ds:X509Certificate en los tests de este paquete. */
export function generarCertificadoDePrueba(commonName = 'Prueba xml-engine'): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const atributos = [{ name: 'commonName', value: commonName }];
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return Buffer.from(der, 'binary');
}
