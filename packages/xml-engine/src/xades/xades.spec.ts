import { webcrypto } from 'crypto';
import { canonicalizarExclusivo } from '../c14n';
import { sha256Hex } from '../hash';
import { completarConSelloTiempo, firmarNodoXadesBes, Parse, serializar, validarFirmaXades } from './index';
import { generarCertificadoDePrueba } from './test-cert';

const CERT_DER_PRUEBA = generarCertificadoDePrueba();

async function generarClaves(): Promise<CryptoKeyPair> {
  return webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;
}

describe('xades (XAdES-T sobre WebCrypto nativo de Node)', () => {
  it('firma un documento y la firma resultante valida criptográficamente', async () => {
    const claves = await generarClaves();
    const documento = Parse('<root xmlns="urn:psdte:test"><dato Id="d1">contenido</dato></root>');

    const pendiente = await firmarNodoXadesBes(documento, {
      clavePrivada: claves.privateKey,
      clavePublica: claves.publicKey,
      certificadoDer: CERT_DER_PRUEBA,
    });

    const tokenFalso = Buffer.from('token-tsa-de-prueba');
    const elementoFirma = completarConSelloTiempo(documento, pendiente, tokenFalso);
    expect(elementoFirma.tagName).toBe('ds:Signature');

    const resultado = await validarFirmaXades(documento, elementoFirma);
    expect(resultado.valida).toBe(true);
  });

  it('detecta la alteración del contenido firmado', async () => {
    const claves = await generarClaves();
    const documento = Parse('<root xmlns="urn:psdte:test"><dato Id="d1">contenido original</dato></root>');
    const pendiente = await firmarNodoXadesBes(documento, {
      clavePrivada: claves.privateKey,
      clavePublica: claves.publicKey,
      certificadoDer: CERT_DER_PRUEBA,
    });
    const elementoFirma = completarConSelloTiempo(documento, pendiente, Buffer.from('token'));
    const xmlFirmado = serializar(documento);

    const xmlAlterado = xmlFirmado.replace('contenido original', 'contenido alterado');
    const documentoAlterado = Parse(xmlAlterado);
    const firmaEnAlterado = documentoAlterado.getElementsByTagNameNS(
      'http://www.w3.org/2000/09/xmldsig#',
      'Signature',
    )[0] as unknown as Element;

    const resultado = await validarFirmaXades(documentoAlterado, firmaEnAlterado);
    expect(resultado.valida).toBe(false);
    expect(elementoFirma).toBeTruthy();
  });

  it('encadena una firma a un evento anterior por referencia (I7) y detecta su alteración', async () => {
    const claves = await generarClaves();
    const documento = Parse(
      '<root xmlns="urn:psdte:test">' +
        '<eventoAnterior Id="eDTE-001">evento previo</eventoAnterior>' +
        '<eventoActual Id="eDTE-002">evento actual</eventoActual>' +
        '</root>',
    );

    const pendiente = await firmarNodoXadesBes(documento, {
      clavePrivada: claves.privateKey,
      clavePublica: claves.publicKey,
      certificadoDer: CERT_DER_PRUEBA,
      referenciasAdicionales: [{ uri: '#eDTE-001' }],
    });
    completarConSelloTiempo(documento, pendiente, Buffer.from('token'));
    const xmlFirmado = serializar(documento);

    const doc2 = Parse(xmlFirmado);
    const firma2 = doc2.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0] as unknown as Element;
    expect((await validarFirmaXades(doc2, firma2)).valida).toBe(true);

    const alterado = xmlFirmado.replace('evento previo', 'evento previo ALTERADO');
    const doc3 = Parse(alterado);
    const firma3 = doc3.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0] as unknown as Element;
    const resultado3 = await validarFirmaXades(doc3, firma3);
    expect(resultado3.valida).toBe(false);
  });

  it('embebe el sello de tiempo como xades:SignatureTimeStamp/EncapsulatedTimeStamp', async () => {
    const claves = await generarClaves();
    const documento = Parse('<root xmlns="urn:psdte:test"><dato Id="d1">x</dato></root>');
    const pendiente = await firmarNodoXadesBes(documento, {
      clavePrivada: claves.privateKey,
      clavePublica: claves.publicKey,
      certificadoDer: CERT_DER_PRUEBA,
    });
    const tokenTsa = Buffer.from('token-rfc3161-simulado');
    completarConSelloTiempo(documento, pendiente, tokenTsa);
    const xml = serializar(documento);

    const doc2 = Parse(xml);
    const nodos = doc2.getElementsByTagNameNS('http://uri.etsi.org/01903/v1.3.2#', 'EncapsulatedTimeStamp');
    expect(nodos.length).toBe(1);
    const contenidoBase64 = nodos[0].textContent;
    expect(Buffer.from(contenidoBase64!, 'base64').toString('utf8')).toBe('token-rfc3161-simulado');
  });

  it('apila varias firmas dentro de un nodo anidado (no la raíz), cada una válida por separado', async () => {
    // Reproduce el patrón real del perfil pagaré-DTE: gDatosGeneralesDTE recibe 3 firmas propias
    // (Deudor, CoDeudor, sello PSDTE), cada una referenciando el nodo por su id, no la raíz.
    const documento = Parse(
      '<rDTE xmlns="urn:psdte:test"><DTE id="vDTE-1"><gDatosGeneralesDTE id="dDTE-1">contenido</gDatosGeneralesDTE></DTE></rDTE>',
    );
    const nodoDatosGenerales = documento.getElementsByTagName('gDatosGeneralesDTE')[0] as unknown as Element;

    for (let i = 0; i < 3; i += 1) {
      const claves = await generarClaves();
      const pendiente = await firmarNodoXadesBes(documento, {
        clavePrivada: claves.privateKey,
        clavePublica: claves.publicKey,
        certificadoDer: CERT_DER_PRUEBA,
        uriNodoPrincipal: '#dDTE-1',
      });
      completarConSelloTiempo(documento, pendiente, Buffer.from(`token-${i}`), nodoDatosGenerales);
    }

    const xmlFirmado = serializar(documento);
    const doc2 = Parse(xmlFirmado);
    const firmas = doc2.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature');
    expect(firmas.length).toBe(3);
    for (let i = 0; i < 3; i += 1) {
      const resultado = await validarFirmaXades(doc2, firmas[i] as unknown as Element);
      expect(resultado.valida).toBe(true);
    }

    // Las 3 firmas deben quedar anidadas DENTRO de gDatosGeneralesDTE, no como hijas de la raíz.
    const nodoDatosGenerales2 = doc2.getElementsByTagName('gDatosGeneralesDTE')[0] as unknown as Element;
    expect(nodoDatosGenerales2.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature').length).toBe(
      3,
    );

    // Alterar el contenido invalida las 3, porque todas referencian el mismo nodo (dDTE-1).
    const alterado = xmlFirmado.replace('contenido', 'contenido ALTERADO');
    const doc3 = Parse(alterado);
    const firmasAlteradas = doc3.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature');
    for (let i = 0; i < 3; i += 1) {
      const resultado = await validarFirmaXades(doc3, firmasAlteradas[i] as unknown as Element);
      expect(resultado.valida).toBe(false);
    }
  });

  it('canonicalizarExclusivo + sha256Hex son consistentes entre dos parseos del mismo XML', () => {
    const xml = '<root xmlns="urn:psdte:test"><a>1</a><b>2</b></root>';
    const doc1 = Parse(xml);
    const doc2 = Parse(xml);
    const c1 = canonicalizarExclusivo(doc1.documentElement);
    const c2 = canonicalizarExclusivo(doc2.documentElement);
    expect(c1).toBe(c2);
    expect(sha256Hex(c1)).toBe(sha256Hex(c2));
  });
});
