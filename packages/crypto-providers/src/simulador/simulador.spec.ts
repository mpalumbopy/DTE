import { createHash } from 'crypto';
import { validarFirmaXades, Parse } from '@psdte/xml-engine';
import { generarAutoridadSimulada } from './ca';
import { FirmaSimulador } from './firma.simulador';
import { TsaSimulador, leerTokenTsa } from './tsa.simulador';
import { RevocacionSimulador } from './revocacion.simulador';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

describe('Simulador (F5 DoD)', () => {
  const autoridad = generarAutoridadSimulada();

  describe('FirmaSimulador', () => {
    const tsaProvider = new TsaSimulador(autoridad);
    const firmaSimulador = new FirmaSimulador(autoridad, tsaProvider);

    it('firma un nodo XML y la firma valida criptográficamente con un verificador XAdES independiente', async () => {
      const xmlCanonico = Buffer.from(
        '<eventoDte xmlns="urn:psdte:test" Id="eDTE-TEST-001">contenido del evento</eventoDte>',
      );

      const resultado = await firmaSimulador.solicitarFirma({
        solicitudId: 'sol-001',
        xmlCanonico,
        referencias: [],
        firmante: { documento: '1234567', tipoDocumento: 'CI', nombre: 'Firmante de Prueba' },
        rolFirmante: 'DEUDOR',
        callbackUrl: 'https://localhost/callback',
        expiraEn: new Date(Date.now() + 60_000),
      });

      expect(resultado.estado).toBe('FIRMADA');
      expect(resultado.xadesXml).toBeTruthy();

      // Verificación XAdES independiente (no reutiliza el mismo objeto SignedXml de la firma).
      const documento = Parse(resultado.xadesXml!);
      const elementoFirma = documento.getElementsByTagNameNS(DS_NS, 'Signature')[0] as unknown as Element;
      const verificacion = await validarFirmaXades(documento, elementoFirma);
      expect(verificacion.valida).toBe(true);
    });

    it('detecta la alteración del XML firmado', async () => {
      const xmlCanonico = Buffer.from(
        '<eventoDte xmlns="urn:psdte:test" Id="eDTE-TEST-002">contenido original</eventoDte>',
      );
      const resultado = await firmaSimulador.solicitarFirma({
        solicitudId: 'sol-002',
        xmlCanonico,
        referencias: [],
        firmante: { documento: '1234567', tipoDocumento: 'CI', nombre: 'Firmante de Prueba' },
        rolFirmante: 'DEUDOR',
        callbackUrl: 'https://localhost/callback',
        expiraEn: new Date(Date.now() + 60_000),
      });

      const alterado = resultado.xadesXml!.replace('contenido original', 'contenido alterado');
      const documento = Parse(alterado);
      const elementoFirma = documento.getElementsByTagNameNS(DS_NS, 'Signature')[0] as unknown as Element;
      const verificacion = await validarFirmaXades(documento, elementoFirma);
      expect(verificacion.valida).toBe(false);
    });

    it('consultarEstado devuelve la firma ya registrada', async () => {
      const resultado = await firmaSimulador.solicitarFirma({
        solicitudId: 'sol-003',
        xmlCanonico: Buffer.from('<x xmlns="urn:t" Id="e1">y</x>'),
        referencias: [],
        firmante: { documento: '1', tipoDocumento: 'CI', nombre: 'N' },
        rolFirmante: 'DEUDOR',
        callbackUrl: 'https://localhost/callback',
        expiraEn: new Date(Date.now() + 60_000),
      });
      const estado = await firmaSimulador.consultarEstado('sol-003');
      expect(estado.estado).toBe('FIRMADA');
      expect(estado.xadesXml).toBe(resultado.xadesXml);
    });

    it('validarFirma valida una firma ya emitida contra su propio documento como contexto', async () => {
      const resultado = await firmaSimulador.solicitarFirma({
        solicitudId: 'sol-004',
        xmlCanonico: Buffer.from('<x xmlns="urn:t" Id="e1">y</x>'),
        referencias: [],
        firmante: { documento: '1', tipoDocumento: 'CI', nombre: 'N' },
        rolFirmante: 'DEUDOR',
        callbackUrl: 'https://localhost/callback',
        expiraEn: new Date(Date.now() + 60_000),
      });
      const verificacion = await firmaSimulador.validarFirma(resultado.xadesXml!, Buffer.from(resultado.xadesXml!));
      expect(verificacion.valida).toBe(true);
    });
  });

  describe('TsaSimulador', () => {
    it('sella un hash y el token resultante parsea como RFC 3161', async () => {
      const tsaSimulador = new TsaSimulador(autoridad);
      const hash = createHash('sha256').update('contenido-a-sellar').digest();

      const resultado = await tsaSimulador.sellarHash(hash);
      expect(resultado.tokenTsrDer.length).toBeGreaterThan(0);
      expect(resultado.tsaSubject).toContain('TSA');

      const leido = leerTokenTsa(resultado.tokenTsrDer);
      expect(leido.hashedMessage.equals(hash)).toBe(true);
      expect(leido.genTime.getTime()).toBeCloseTo(Date.now(), -3);
      expect(leido.certificadoFirmante).toBeTruthy();
    });

    it('probarConexion informa ok:true', async () => {
      const tsaSimulador = new TsaSimulador(autoridad);
      const resultado = await tsaSimulador.probarConexion();
      expect(resultado.ok).toBe(true);
    });
  });

  describe('RevocacionSimulador', () => {
    it('responde GOOD y enTsl:true para un certificado normal', async () => {
      const tsaSimulador = new TsaSimulador(autoridad);
      // Cualquier certificado DER sirve para este test; usamos el de la propia TSA.
      const hash = createHash('sha256').update('x').digest();
      const { tokenTsrDer } = await tsaSimulador.sellarHash(hash);
      const { certificadoFirmante } = leerTokenTsa(tokenTsrDer);
      const certDer = Buffer.from(certificadoFirmante.toSchema().toBER(false));

      const revocacionSimulador = new RevocacionSimulador();
      const resultado = await revocacionSimulador.verificarCertificado(certDer);
      expect(resultado.resultado).toBe('GOOD');
      expect(resultado.enTsl).toBe(true);
      expect(resultado.evidenciaRaw.length).toBeGreaterThan(0);
    });
  });
});
