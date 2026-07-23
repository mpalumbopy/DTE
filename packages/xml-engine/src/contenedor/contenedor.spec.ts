import { webcrypto } from 'crypto';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { construirManifiesto, construirZip, verificarContenedorOffline } from './index';
import { sha256Hex } from '../hash';

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';

/** Emite un token RFC 3161 mínimo (autofirmado) para probar el verificador sin depender de
 * @psdte/crypto-providers (evita el ciclo de dependencias entre paquetes). */
async function sellarHashDePrueba(hash: Buffer): Promise<Buffer> {
  const keys = await webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const certificado = new pkijs.Certificate();
  certificado.version = 2;
  certificado.serialNumber = new asn1js.Integer({ value: 1 });
  certificado.issuer.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: 'TSA de prueba' }) }),
  );
  certificado.subject.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({ type: '2.5.4.3', value: new asn1js.Utf8String({ value: 'TSA de prueba' }) }),
  );
  certificado.notBefore.value = new Date();
  certificado.notAfter.value = new Date(Date.now() + 86_400_000);
  await certificado.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificado.sign(keys.privateKey, 'SHA-256');

  const tstInfo = new pkijs.TSTInfo({
    version: 1,
    policy: '1.3.6.1.4.1.0.9999.1',
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: OID_SHA256 }),
      hashedMessage: new asn1js.OctetString({ valueHex: new Uint8Array(hash) }),
    }),
    serialNumber: new asn1js.Integer({ value: Date.now() }),
    genTime: new Date(),
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
        sid: new pkijs.IssuerAndSerialNumber({ issuer: certificado.issuer, serialNumber: certificado.serialNumber }),
      }),
    ],
    certificates: [certificado],
  });
  await signedData.sign(keys.privateKey, 0, 'SHA-256');

  const contentInfo = new pkijs.ContentInfo({ contentType: pkijs.ContentInfo.SIGNED_DATA, content: signedData.toSchema(true) });
  return Buffer.from(contentInfo.toSchema().toBER(false));
}

describe('contenedor (F9)', () => {
  it('construye un ZIP verificable offline y detecta un artefacto alterado', async () => {
    const archivos = [
      { nombre: 'dte.xml', contenido: Buffer.from('<rDTE xmlns="ns"><DTE/></rDTE>', 'utf8') },
      { nombre: 'certificados/0.der', contenido: Buffer.from([1, 2, 3, 4]) },
    ];
    const manifiesto = construirManifiesto('vDTE-TEST-001', 1, archivos);
    const manifiestoBytes = Buffer.from(JSON.stringify(manifiesto, null, 2), 'utf8');
    const sello = await sellarHashDePrueba(Buffer.from(sha256Hex(manifiestoBytes), 'hex'));

    const zip = construirZip(archivos, manifiesto, sello);

    const resultadoOk = await verificarContenedorOffline(zip);
    expect(resultadoOk.valido).toBe(true);
    expect(resultadoOk.motivos).toHaveLength(0);

    // Alterar 1 byte de un archivo listado en el manifiesto (sin tocar el manifiesto ni el sello).
    const AdmZip = (await import('adm-zip')).default;
    const zipAlterado = new AdmZip(zip);
    zipAlterado.updateFile('certificados/0.der', Buffer.from([9, 9, 9, 9]));
    const zipAlteradoBuffer = zipAlterado.toBuffer();

    const resultadoAlterado = await verificarContenedorOffline(zipAlteradoBuffer);
    expect(resultadoAlterado.valido).toBe(false);
    expect(resultadoAlterado.motivos.some((m) => m.includes('certificados/0.der'))).toBe(true);
  });

  it('detecta un manifiesto reemplazado (hash sellado ya no coincide)', async () => {
    const archivos = [{ nombre: 'dte.xml', contenido: Buffer.from('<rDTE/>', 'utf8') }];
    const manifiesto = construirManifiesto('vDTE-TEST-002', 1, archivos);
    const manifiestoBytes = Buffer.from(JSON.stringify(manifiesto, null, 2), 'utf8');
    const sello = await sellarHashDePrueba(Buffer.from(sha256Hex(manifiestoBytes), 'hex'));
    const zip = construirZip(archivos, manifiesto, sello);

    const AdmZip = (await import('adm-zip')).default;
    const zipAlterado = new AdmZip(zip);
    const manifiestoFalso = { ...manifiesto, idDte: 'vDTE-SUPLANTADO' };
    zipAlterado.updateFile('manifiesto.json', Buffer.from(JSON.stringify(manifiestoFalso, null, 2), 'utf8'));

    const resultado = await verificarContenedorOffline(zipAlterado.toBuffer());
    expect(resultado.valido).toBe(false);
    expect(resultado.motivos.some((m) => m.includes('reemplazado'))).toBe(true);
  });
});
