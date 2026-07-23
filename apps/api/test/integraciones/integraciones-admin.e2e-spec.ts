import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';

/**
 * F10 DoD (docs/PLAN.md sección 13/6.5 — requisito explícito del usuario): editar TSA → probar
 * conexión OK → guardar → conmutar a REAL exige test previo y re-password → historial registra →
 * volver a SIMULADOR → banner reaparece · API nunca devuelve credenciales en claro.
 */
describe('Admin de integraciones — API (F10 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenAdmin: string;
  let tsaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenAdmin = await loginDemo(app, 'admin');

    const { rows } = await dbClient.query<{ id: string }>(`SELECT id FROM psdte.integracion_ws WHERE tipo = 'TSA'`);
    tsaId = rows[0].id;
  });

  afterAll(async () => {
    await app.close();
    await dbClient.end();
  }, 30000);

  function server() {
    return app.getHttpServer();
  }

  function dtoBase(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      modo: 'SIMULADOR',
      baseUrl: null,
      endpoints: {},
      authTipo: 'NONE',
      headersExtra: {},
      timeoutMs: 15000,
      reintentos: 3,
      backoffMs: 2000,
      mapeoPayload: {},
      verificarTls: true,
      ...overrides,
    };
  }

  it('lista integraciones sin exponer credenciales en claro', async () => {
    const res = await request(server())
      .get('/api/v1/admin/integraciones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    for (const integracion of res.body) {
      expect(integracion.credencialesCifradas).toBeUndefined();
      expect(integracion.mtlsCertCifrado).toBeUndefined();
      expect(integracion.mtlsKeyCifrada).toBeUndefined();
    }
  });

  it('estado-global refleja integraciones críticas en SIMULADOR', async () => {
    const res = await request(server())
      .get('/api/v1/admin/integraciones/estado-global')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(res.body.enSimulador).toBe(true);
    expect(res.body.tipos).toEqual(expect.arrayContaining(['TSA']));
  });

  it('probar conexión (formulario, sin guardar) devuelve resultado ok para el simulador de TSA', async () => {
    const res = await request(server())
      .post(`/api/v1/admin/integraciones/${tsaId}/test`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(dtoBase())
      .expect(201);
    expect(res.body.ok).toBe(true);

    // No se persistió: el próximo GET no debe traer ultimoTest fresco de este test de formulario.
    const antes = await dbClient.query(`SELECT ultimo_test FROM psdte.integracion_ws WHERE id = $1`, [tsaId]);
    if (antes.rows[0].ultimo_test) {
      expect(new Date(antes.rows[0].ultimo_test.fecha).getTime()).toBeLessThan(Date.now() - 1000);
    }
  });

  it('guardar (PUT) revalida y persiste ultimo_test, y registra en el historial', async () => {
    const historialAntes = await dbClient.query(`SELECT COUNT(*) AS n FROM psdte.integracion_ws_historial WHERE integracion_id = $1`, [tsaId]);

    const res = await request(server())
      .put(`/api/v1/admin/integraciones/${tsaId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(dtoBase({ timeoutMs: 20000 }))
      .expect(200);
    expect(res.body.ultimoTest.ok).toBe(true);
    expect(res.body.timeoutMs).toBe(20000);

    const historialDespues = await dbClient.query(`SELECT COUNT(*) AS n FROM psdte.integracion_ws_historial WHERE integracion_id = $1`, [tsaId]);
    expect(Number(historialDespues.rows[0].n)).toBeGreaterThan(Number(historialAntes.rows[0].n));

    const historialRes = await request(server())
      .get(`/api/v1/admin/integraciones/${tsaId}/historial`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(historialRes.body[0].cambio.accion).toBe('ACTUALIZAR');
  });

  it('PUT no permite pasar a REAL directamente (solo /conmutar)', async () => {
    const res = await request(server())
      .put(`/api/v1/admin/integraciones/${tsaId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send(dtoBase({ modo: 'REAL' }));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ERR-ESTADO-001');
  });

  it('conmutar a REAL sin test previo/contraseña falla; con ambos, prospera; volver a SIMULADOR reaparece en el banner', async () => {
    // OCSP nunca fue tocado por otros tests de este archivo: su ultimo_test sigue null (seed) —
    // conmutar a REAL debe rechazarse por falta de test previo.
    const { rows: ocspRows } = await dbClient.query<{ id: string }>(`SELECT id FROM psdte.integracion_ws WHERE tipo = 'OCSP'`);
    const ocspId = ocspRows[0].id;
    const sinTestRes = await request(server())
      .post(`/api/v1/admin/integraciones/${ocspId}/conmutar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ modoDestino: 'REAL' });
    expect(sinTestRes.status).toBe(409);
    expect(sinTestRes.body.error).toBe('ERR-ESTADO-001');

    // TSA sí tiene un test SIMULADOR reciente exitoso (de los tests anteriores de este archivo) —
    // habilita la conmutación a REAL en cuanto a "test previo", pero sigue exigiendo contraseña.
    const sinPasswordConTestOkRes = await request(server())
      .post(`/api/v1/admin/integraciones/${tsaId}/conmutar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ modoDestino: 'REAL' });
    expect(sinPasswordConTestOkRes.status).toBe(401);
    expect(sinPasswordConTestOkRes.body.error).toBe('ERR-AUTH-001');

    const passwordIncorrectaRes = await request(server())
      .post(`/api/v1/admin/integraciones/${tsaId}/conmutar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ modoDestino: 'REAL', passwordAdmin: 'incorrecta' });
    expect(passwordIncorrectaRes.status).toBe(401);

    const conmutarOkRes = await request(server())
      .post(`/api/v1/admin/integraciones/${tsaId}/conmutar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ modoDestino: 'REAL', passwordAdmin: 'Cambiar.123' })
      .expect(201);
    expect(conmutarOkRes.body.modo).toBe('REAL');

    // Banner: mientras TSA esté en REAL, ya no cuenta como "en simulador" por ese tipo (aunque
    // otras integraciones críticas sigan en SIMULADOR, el banner las sigue listando a ellas).
    const estadoTrasReal = await request(server())
      .get('/api/v1/admin/integraciones/estado-global')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(estadoTrasReal.body.tipos).not.toEqual(expect.arrayContaining(['TSA']));

    // Volver a SIMULADOR reaparece en el banner.
    await request(server())
      .post(`/api/v1/admin/integraciones/${tsaId}/conmutar`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ modoDestino: 'SIMULADOR' })
      .expect(201);
    const estadoTrasVolver = await request(server())
      .get('/api/v1/admin/integraciones/estado-global')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(estadoTrasVolver.body.tipos).toEqual(expect.arrayContaining(['TSA']));
  }, 30000);
});
