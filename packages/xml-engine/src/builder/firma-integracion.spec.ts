import { webcrypto } from 'crypto';
import { agregarEvento, construirDatosGeneralesDte } from './index';
import { montoALetras } from '../monto-letras';
import { completarConSelloTiempo, firmarNodoXadesBes, Parse, serializar, validarFirmaXades } from '../xades';
import { generarCertificadoDePrueba } from '../xades/test-cert';
import { AcreedorInicialInput, DatosGeneralesDteInput, DeudorInput, DireccionInput, EventoEndosoInput } from '../modelo/tipos';

const CERT_DER_PRUEBA = generarCertificadoDePrueba();
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

async function generarClaves(): Promise<CryptoKeyPair> {
  return webcrypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;
}

/** Firma `nodo` (dentro de `documento`) referenciando `uriNodo`, más referencias adicionales (I7). */
async function firmarYAdjuntar(
  documento: Document,
  nodo: Element,
  uriNodo: string,
  referenciasAdicionales: string[] = [],
): Promise<Element> {
  const claves = await generarClaves();
  const pendiente = await firmarNodoXadesBes(documento, {
    clavePrivada: claves.privateKey,
    clavePublica: claves.publicKey,
    certificadoDer: CERT_DER_PRUEBA,
    uriNodoPrincipal: uriNodo,
    referenciasAdicionales: referenciasAdicionales.map((uri) => ({ uri })),
  });
  return completarConSelloTiempo(documento, pendiente, Buffer.from('token-tsa-simulado'), nodo);
}

const DIRECCION: DireccionInput = {
  direccion: 'Av. Mcal. Lopez',
  codigoCiudad: 1,
  ciudad: 'Asuncion',
  codigoDistrito: 1,
  distrito: 'Asuncion',
  codigoDepartamento: 1,
  departamento: 'Capital',
  codigoPais: 600,
  pais: 'Paraguay',
};

const ACREEDOR: AcreedorInicialInput = {
  nombresApellidos: 'Justo Gonzalez',
  documento: { codigoTipo: 1, tipo: 'CI', numero: '8526585', codigoPais: 1, pais: 'Paraguay' },
  direcciones: [DIRECCION],
};

const DEUDOR: DeudorInput = {
  condicionFirmante: 'Deudor-1',
  nombresApellidos: 'Daniel Arce',
  documento: { codigoTipo: 1, tipo: 'CI', numero: '6543210', codigoPais: 1, pais: 'Paraguay' },
  direccion: DIRECCION,
};

function datosGeneralesDePrueba(): DatosGeneralesDteInput {
  return {
    idDte: 'vDTE2025070920251021000000077',
    idDatosGenerales: 'dDTE2025070920251021000000077',
    codigoTipoDte: 1,
    descripcionTipoDte: 'PAGARE A LA ORDEN',
    numeroDte: 77,
    fechaEmision: new Date('2025-07-09T03:45:52Z'),
    fechaVencimiento: new Date('2026-07-09T03:45:52Z'),
    codigoMoneda: 'PYG',
    descripcionMoneda: 'Guaraníes',
    monto: 1_000_000,
    lugarEmision: DIRECCION,
    lugaresPago: [DIRECCION],
    acreedorInicial: ACREEDOR,
    deudores: [DEUDOR],
    condiciones: ['Condición de prueba.'],
    prestadorServicio: {
      nombre: 'TUPAGARE EMITENTE',
      nombreFantasia: 'TUPAGARE SA',
      ruc: '80113823-2',
      resolucionMic: '12345/2025',
      telefono: '021 220 0 220',
      email: 'tupagare@tupagare.com.py',
      sitioWeb: 'www.tupagare.com.py',
    },
    enlaceQr: 'https://tupagare.com.py/consultas/',
  };
}

describe('Integración builder + xades: reproduce el patrón de firmas del XML de referencia (F4 DoD)', () => {
  it('emisión (3 firmas sobre gDatosGeneralesDTE) + endoso (2 firmas encadenadas) validan independientemente', async () => {
    const input = datosGeneralesDePrueba();
    const { documento, nodoDatosGenerales, uriDatosGenerales } = construirDatosGeneralesDte(
      input,
      montoALetras(input.monto),
    );

    // 3 firmas de emisión (Deudor, CoDeudor/omitido aquí, sello PSDTE) — todas referencian solo #dDTE...
    await firmarYAdjuntar(documento, nodoDatosGenerales, uriDatosGenerales);
    await firmarYAdjuntar(documento, nodoDatosGenerales, uriDatosGenerales);
    await firmarYAdjuntar(documento, nodoDatosGenerales, uriDatosGenerales);

    // Evento 1 (endoso): Endosante + sello PSDTE, ambos referenciando el evento Y el nodo anterior
    // (dDTE, porque es el primer evento — ver ADR de encadenamiento I7 en docs/DECISIONES.md).
    const endoso1: EventoEndosoInput = {
      tipo: 'ENDOSO',
      idEvento: 'eDTE2025070920251021000000077-001',
      numeroEvento: '001',
      fechaEvento: new Date('2026-02-09T03:45:52Z'),
      numeroEndoso: '01',
      endosante: { condicionFirmante: 'Endosante-1', ...ACREEDOR },
      endosatario: { nombresApellidos: 'Juan Perez', documento: DEUDOR.documento },
    };
    const { nodoEvento: nodoEvento1, uriEvento: uriEvento1 } = agregarEvento(documento, input.idDte, endoso1);
    await firmarYAdjuntar(documento, nodoEvento1, uriEvento1, [uriDatosGenerales]);
    await firmarYAdjuntar(documento, nodoEvento1, uriEvento1, [uriDatosGenerales]);

    const xmlFinal = serializar(documento);
    const documentoReleido = Parse(xmlFinal);
    const firmas = documentoReleido.getElementsByTagNameNS(DS_NS, 'Signature');
    expect(firmas.length).toBe(5);

    for (let i = 0; i < firmas.length; i += 1) {
      const resultado = await validarFirmaXades(documentoReleido, firmas[i] as unknown as Element);
      expect(resultado.valida).toBe(true);
    }

    // Las 3 primeras quedan anidadas en gDatosGeneralesDTE; las 2 últimas, en el gEvento.
    const nodoDatosGeneralesReleido = documentoReleido.getElementsByTagName('gDatosGeneralesDTE')[0] as unknown as Element;
    expect(nodoDatosGeneralesReleido.getElementsByTagNameNS(DS_NS, 'Signature').length).toBe(3);
    const nodoEventoReleido = documentoReleido.getElementsByTagName('gEvento')[0] as unknown as Element;
    expect(nodoEventoReleido.getElementsByTagNameNS(DS_NS, 'Signature').length).toBe(2);

    // Alterar el evento invalida sus propias firmas pero NO las de emisión (nodos distintos, I7).
    const alterado = xmlFinal.replace('Juan Perez', 'Juan Perez ALTERADO');
    const docAlterado = Parse(alterado);
    const firmasAlteradas = docAlterado.getElementsByTagNameNS(DS_NS, 'Signature');
    const resultadosAlterados = await Promise.all(
      Array.from({ length: firmasAlteradas.length }, (_, i) =>
        validarFirmaXades(docAlterado, firmasAlteradas[i] as unknown as Element),
      ),
    );
    expect(resultadosAlterados.slice(0, 3).every((r) => r.valida)).toBe(true);
    expect(resultadosAlterados.slice(3).some((r) => !r.valida)).toBe(true);
  });
});
