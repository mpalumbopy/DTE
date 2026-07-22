import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Parse, validarFirmaXades } from '@psdte/xml-engine';
import { leerTokenTsa } from '@psdte/crypto-providers';
import { crearAppDePrueba } from '../support/test-app';
import { ProviderFactoryService } from '../../src/modules/integraciones/provider-factory.service';
import { EnvConfig } from '../../src/config/config.schema';
import { verificarCandadoSimulador } from '../../src/main';

const DS_NS = 'http://www.w3.org/2000/09/xmldsig#';

function configFalso(valores: Partial<EnvConfig>): ConfigService<EnvConfig, true> {
  return {
    get: (clave: keyof EnvConfig) => valores[clave],
  } as unknown as ConfigService<EnvConfig, true>;
}

/**
 * F5 DoD (docs/PLAN.md sección 13): el ProviderFactory resuelve los adaptadores desde
 * `integracion_ws` (aquí en SIMULADOR, sembrado por 05_integraciones.sql) y con
 * ALLOW_SIMULATOR=false en producción el arranque falla con mensaje claro si una integración
 * crítica sigue en SIMULADOR.
 */
describe('ProviderFactory + candado ALLOW_SIMULATOR (F5 e2e)', () => {
  let app: INestApplication;
  let providerFactory: ProviderFactoryService;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    providerFactory = app.get(ProviderFactoryService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('resuelve el FirmaProviderPort desde la BD (SIMULADOR) y la firma valida criptográficamente', async () => {
    const firma = await providerFactory.obtenerProveedorFirma();
    const xmlCanonico = Buffer.from(
      '<eventoDte xmlns="urn:psdte:test" Id="eDTE-PF-001">contenido via ProviderFactory</eventoDte>',
    );

    const resultado = await firma.solicitarFirma({
      solicitudId: 'pf-sol-001',
      xmlCanonico,
      referencias: [],
      firmante: { documento: '1234567', tipoDocumento: 'CI', nombre: 'Firmante ProviderFactory' },
      rolFirmante: 'DEUDOR',
      callbackUrl: 'https://localhost/callback',
      expiraEn: new Date(Date.now() + 60_000),
    });

    expect(resultado.estado).toBe('FIRMADA');
    const documento = Parse(resultado.xadesXml!);
    const elementoFirma = documento.getElementsByTagNameNS(DS_NS, 'Signature')[0] as unknown as Element;
    const verificacion = await validarFirmaXades(documento, elementoFirma);
    expect(verificacion.valida).toBe(true);
  });

  it('resuelve el TsaProviderPort desde la BD (SIMULADOR) y el token parsea como RFC 3161', async () => {
    const tsa = await providerFactory.obtenerProveedorTsa();
    const hash = createHash('sha256').update('provider-factory-e2e').digest();
    const resultado = await tsa.sellarHash(hash);
    const leido = leerTokenTsa(resultado.tokenTsrDer);
    expect(leido.hashedMessage.equals(hash)).toBe(true);
  });

  it('estadoSimuladorCritico() informa que FIRMA/TSA/OCSP siguen en SIMULADOR (seed por defecto)', async () => {
    const estado = await providerFactory.estadoSimuladorCritico();
    expect(estado.enSimulador).toBe(true);
    expect(estado.tipos).toEqual(expect.arrayContaining(['FIRMA', 'TSA', 'OCSP']));
  });

  it('no bloquea el arranque en desarrollo aunque ALLOW_SIMULATOR sea false', async () => {
    await expect(
      verificarCandadoSimulador(app, configFalso({ NODE_ENV: 'development', ALLOW_SIMULATOR: false })),
    ).resolves.toBeUndefined();
  });

  it('no bloquea el arranque en producción si ALLOW_SIMULATOR es true', async () => {
    await expect(
      verificarCandadoSimulador(app, configFalso({ NODE_ENV: 'production', ALLOW_SIMULATOR: true })),
    ).resolves.toBeUndefined();
  });

  it('bloquea el arranque en producción con ALLOW_SIMULATOR=false si FIRMA sigue en SIMULADOR', async () => {
    await expect(
      verificarCandadoSimulador(app, configFalso({ NODE_ENV: 'production', ALLOW_SIMULATOR: false })),
    ).rejects.toThrow(/ALLOW_SIMULATOR=false.*SIMULADOR/s);
  });
});
