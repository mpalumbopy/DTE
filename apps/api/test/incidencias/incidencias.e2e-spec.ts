import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';

/**
 * F11 DoD (docs/PLAN.md sección 13): pantalla/API de incidencias lista y filtra por estado y
 * severidad, y permite transicionar el estado (solo ADMIN_PSDTE). Las incidencias no se crean vía
 * API — hoy el único escritor es ReconciliacionService (F9); aquí se inserta una fila directamente
 * (mismo patrón usado en otros e2e para preparar estado) para probar lectura/filtrado/transición.
 */
describe('Incidencias (F11 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenAdmin: string;
  let tokenAuditor: string;
  let tokenTenedor: string;
  let incidenciaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenAdmin = await loginDemo(app, 'admin');
    tokenAuditor = await loginDemo(app, 'auditor');
    tokenTenedor = await loginDemo(app, 'tenedor');

    const { rows } = await dbClient.query<{ id: string }>(
      `INSERT INTO psdte.incidencia (error_codigo, endpoint, request_id, detalle, severidad, estado)
       VALUES ($1, $2, $3, $4, 'ALTA', 'ABIERTA') RETURNING id`,
      ['ERR-XSD-001', '/api/v1/dte/exportacion/test', randomUUID(), JSON.stringify({ motivo: 'prueba F11' })],
    );
    incidenciaId = rows[0].id;
  });

  afterAll(async () => {
    await app.close();
    await dbClient.end();
  }, 30000);

  it('lista y filtra por estado y severidad', async () => {
    const server = app.getHttpServer();

    const porEstado = await request(server)
      .get('/api/v1/admin/incidencias')
      .query({ estado: 'ABIERTA' })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(porEstado.body.some((i: { id: string }) => i.id === incidenciaId)).toBe(true);

    const porSeveridad = await request(server)
      .get('/api/v1/admin/incidencias')
      .query({ severidad: 'ALTA' })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(porSeveridad.body.some((i: { id: string }) => i.id === incidenciaId)).toBe(true);

    const porSeveridadDistinta = await request(server)
      .get('/api/v1/admin/incidencias')
      .query({ severidad: 'BAJA' })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(porSeveridadDistinta.body.some((i: { id: string }) => i.id === incidenciaId)).toBe(false);
  });

  it('AUDITOR puede leer pero no cambiar estado; ADMIN_PSDTE puede ambos', async () => {
    const server = app.getHttpServer();

    await request(server)
      .get('/api/v1/admin/incidencias')
      .set('Authorization', `Bearer ${tokenAuditor}`)
      .expect(200);

    await request(server)
      .put(`/api/v1/admin/incidencias/${incidenciaId}/estado`)
      .set('Authorization', `Bearer ${tokenAuditor}`)
      .send({ estado: 'EN_ANALISIS' })
      .expect(403);

    await request(server)
      .get('/api/v1/admin/incidencias')
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(403);

    const cambioRes = await request(server)
      .put(`/api/v1/admin/incidencias/${incidenciaId}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'EN_ANALISIS' })
      .expect(200);
    expect(cambioRes.body.estado).toBe('EN_ANALISIS');
    expect(cambioRes.body.resueltoEn).toBeNull();

    const cierreRes = await request(server)
      .put(`/api/v1/admin/incidencias/${incidenciaId}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'RESUELTA' })
      .expect(200);
    expect(cierreRes.body.estado).toBe('RESUELTA');
    expect(cierreRes.body.resueltoEn).not.toBeNull();
  });

  it('rechaza un estado fuera del catálogo permitido', async () => {
    const server = app.getHttpServer();
    await request(server)
      .put(`/api/v1/admin/incidencias/${incidenciaId}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ estado: 'NO_EXISTE' })
      .expect(400);
  });
});
