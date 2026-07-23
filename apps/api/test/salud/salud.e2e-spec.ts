import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearAppDePrueba } from '../support/test-app';

/**
 * F13: `readyz` ahora también confirma que el ProviderFactory resuelve FIRMA/TSA/OCSP (sección 11
 * del plan: "readyz verifica BD, Redis y que el ProviderFactory resuelva las integraciones
 * activas"), no solo BD y Redis — este chequeo faltaba desde F2 (comentario obsoleto decía
 * "se agrega en F5", pero nunca se hizo hasta que F13 lo exigió explícitamente para los probes de K8s).
 */
describe('Salud — healthz/readyz/metrics (F13 e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await crearAppDePrueba();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/healthz responde ok sin autenticación', async () => {
    const res = await request(app.getHttpServer()).get('/api/healthz').expect(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });

  it('GET /api/readyz confirma BD, Redis e integraciones críticas resolubles', async () => {
    const res = await request(app.getHttpServer()).get('/api/readyz').expect(200);
    expect(res.body).toEqual({ ok: true, baseDeDatos: true, redis: true, integraciones: true });
  });

  it('GET /api/metrics expone métricas en formato Prometheus', async () => {
    const res = await request(app.getHttpServer()).get('/api/metrics').expect(200);
    expect(res.text).toContain('# HELP');
  });
});
