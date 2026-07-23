import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';

describe('Catálogos, personas y parámetros (F3 e2e)', () => {
  let app: INestApplication;
  let tokenAdmin: string;
  let tokenOperador: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    tokenAdmin = await loginDemo(app, 'admin');
    tokenOperador = await loginDemo(app, 'operador');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rechaza el acceso a catálogos sin autenticación', async () => {
    await request(app.getHttpServer()).get('/api/v1/catalogos/CAT-DTE-01').expect(401);
  });

  it('GET /catalogos/CAT-DTE-03 responde la matriz de transiciones sembrada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/catalogos/CAT-DTE-03')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(res.body.codigo).toBe('CAT-DTE-03');
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.headers['x-catalogos-version']).toBeTruthy();

    const emitidoMasEndoso = res.body.items.find(
      (t: { estadoOrigen: number; tipoEvento: number }) => t.estadoOrigen === 1 && t.tipoEvento === 3,
    );
    expect(emitidoMasEndoso).toBeTruthy();
    expect(emitidoMasEndoso.estadoDestino).toBe(2);
  });

  it('GET /catalogos/CAT-DTE-01 responde los estados del DTE', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/catalogos/CAT-DTE-01')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(res.body.items.some((e: { nombre: string }) => e.nombre === 'EMITIDO')).toBe(true);
  });

  it('devuelve ERR-DTE-404 para un catálogo inexistente', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/catalogos/CAT-DTE-99')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(404);
    expect(res.body.error).toBe('ERR-DTE-404');
  });

  it('crea una persona, rechaza el documento duplicado y permite buscarla', async () => {
    const numeroDocumento = `TEST-${randomUUID().slice(0, 8)}`;
    const nueva = await request(app.getHttpServer())
      .post('/api/v1/personas')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({
        tipoPersona: 1,
        nombresApellidos: 'Persona de Prueba',
        tipoDocumento: 1,
        numeroDocumento,
        paisDocumento: 600,
      })
      .expect(201);
    expect(nueva.body.id).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/personas')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({
        tipoPersona: 1,
        nombresApellidos: 'Otra Persona',
        tipoDocumento: 1,
        numeroDocumento,
        paisDocumento: 600,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.error).toBe('ERR-PERSONA-409');
      });

    const encontrada = await request(app.getHttpServer())
      .get(`/api/v1/personas?documento=${numeroDocumento}`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .expect(200);
    expect(encontrada.body).toHaveLength(1);
    expect(encontrada.body[0].id).toBe(nueva.body.id);
  });

  it('rechaza crear personas a un rol sin permiso (deudor)', async () => {
    const tokenDeudor = await loginDemo(app, 'deudor');
    await request(app.getHttpServer())
      .post('/api/v1/personas')
      .set('Authorization', `Bearer ${tokenDeudor}`)
      .send({
        tipoPersona: 1,
        nombresApellidos: 'No debería crearse',
        tipoDocumento: 1,
        numeroDocumento: `NOPE-${randomUUID().slice(0, 8)}`,
        paisDocumento: 600,
      })
      .expect(403);
  });

  it('F12: un tenedor puede buscar una persona por documento (para endosar) pero no listar el padrón completo', async () => {
    const tokenTenedor = await loginDemo(app, 'tenedor');
    const numeroDocumento = `TEST-TEN-${randomUUID().slice(0, 8)}`;
    await request(app.getHttpServer())
      .post('/api/v1/personas')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({
        tipoPersona: 1,
        nombresApellidos: 'Buscable por Tenedor',
        tipoDocumento: 1,
        numeroDocumento,
        paisDocumento: 600,
      })
      .expect(201);

    const buscada = await request(app.getHttpServer())
      .get(`/api/v1/personas?documento=${numeroDocumento}`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(200);
    expect(buscada.body).toHaveLength(1);

    const listadoCompleto = await request(app.getHttpServer())
      .get('/api/v1/personas')
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(403);
    expect(listadoCompleto.body.error).toBe('ERR-DTE-403');
  });

  it('lista y actualiza parámetros del sistema (solo ADMIN_PSDTE)', async () => {
    const lista = await request(app.getHttpServer())
      .get('/api/v1/parametros')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    const parametro = lista.body.find((p: { clave: string }) => p.clave === 'ltv.resello_meses');
    expect(parametro).toBeTruthy();

    const actualizado = await request(app.getHttpServer())
      .put('/api/v1/parametros/ltv.resello_meses')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ valor: 24 })
      .expect(200);
    expect(actualizado.body.valor).toBe(24);

    await request(app.getHttpServer())
      .put('/api/v1/parametros/ltv.resello_meses')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({ valor: 6 })
      .expect(403);
  });

  it('devuelve ERR-PARAM-404 para una clave inexistente', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/v1/parametros/no.existe')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ valor: 1 })
      .expect(404);
    expect(res.body.error).toBe('ERR-PARAM-404');
  });
});
