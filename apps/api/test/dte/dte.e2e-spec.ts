import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearDte, crearPersona, crearPersonaDireccion } from '../support/fixtures';

/**
 * F12: bandeja (`GET /dte`) y XML por versión (`GET /dte/:id/xml`) — endpoints que F8 dejó
 * explícitamente pendientes para cuando el frontend los necesitara (ver docs/ESTADO.md, F8).
 * Visibilidad: roles operativos (ADMIN_PSDTE/OPERADOR_EMISION/AUTORIDAD/AUDITOR) ven todo;
 * TENEDOR/DEUDOR (partes) solo ven los DTE en los que participan.
 */
describe('DTE — bandeja y XML (F12 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;
  let tokenTenedor: string;
  let tokenDeudor: string;
  let tokenAdmin: string;
  let tenedorPersonaId: string;
  let deudorPersonaId: string;
  let operadorUsuarioId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
    tokenTenedor = await loginDemo(app, 'tenedor');
    tokenDeudor = await loginDemo(app, 'deudor');
    tokenAdmin = await loginDemo(app, 'admin');

    const { rows: tenedorRows } = await dbClient.query<{ persona_id: string }>(
      `SELECT persona_id FROM psdte.usuario WHERE username = 'tenedor'`,
    );
    const { rows: deudorRows } = await dbClient.query<{ persona_id: string }>(
      `SELECT persona_id FROM psdte.usuario WHERE username = 'deudor'`,
    );
    tenedorPersonaId = tenedorRows[0].persona_id;
    deudorPersonaId = deudorRows[0].persona_id;

    const { rows: operadorRows } = await dbClient.query<{ id: string }>(
      `SELECT id FROM psdte.usuario WHERE username = 'operador'`,
    );
    operadorUsuarioId = operadorRows[0].id;

    for (const personaId of [tenedorPersonaId, deudorPersonaId]) {
      const { rows } = await dbClient.query(
        `SELECT 1 FROM psdte.persona_direccion WHERE persona_id = $1 AND principal = TRUE`,
        [personaId],
      );
      if (rows.length === 0) {
        await crearPersonaDireccion(dbClient, personaId);
      }
    }
  });

  afterAll(async () => {
    await app.close();
    await dbClient.end();
  }, 30000);

  function direccionDto(direccion: string) {
    return { direccion, codigoCiudad: 1, codigoDistrito: 1, codigoDepartamento: 0, codigoPais: 600 };
  }

  async function emitirDte(monto = 1_000_000): Promise<{ dteId: string; idDte: string }> {
    const server = app.getHttpServer();
    const crearRes = await request(server)
      .post('/api/v1/dte/emisiones')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({
        fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        monto,
        codigoMoneda: 'PYG',
        lugarEmision: direccionDto('Av. Mcal. Lopez 566'),
        lugaresPago: [direccionDto('Av. España 5681')],
        acreedorInicialPersonaId: tenedorPersonaId,
        deudores: [{ personaId: deudorPersonaId, condicionFirmante: 'Deudor-1' }],
        condiciones: [
          'La parte deudora se obliga a pagar incondicionalmente la suma indicada.',
          'Este pagaré constituye documento transmisible electrónico conforme a la Ley N° 6822/2021.',
        ],
      })
      .expect(201);
    const { idDatosGenerales, idDte } = crearRes.body;

    await request(server)
      .post(`/api/v1/dte/emisiones/${idDatosGenerales}/firmas/solicitar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({})
      .expect(201);

    const confirmarRes = await request(server)
      .post(`/api/v1/dte/emisiones/${idDatosGenerales}/confirmar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({})
      .expect(201);

    return { dteId: confirmarRes.body.dteId, idDte };
  }

  it('operador (visibilidad completa) ve el DTE en la bandeja; filtra por estado y por texto', async () => {
    const server = app.getHttpServer();
    const { dteId, idDte } = await emitirDte(1_234_000);

    const resTodos = await request(server)
      .get('/api/v1/dte')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .expect(200);
    expect(resTodos.body.items.some((i: { id: string }) => i.id === dteId)).toBe(true);
    expect(resTodos.body.total).toBeGreaterThan(0);

    const resFiltroTexto = await request(server)
      .get('/api/v1/dte')
      .query({ q: idDte })
      .set('Authorization', `Bearer ${tokenOperador}`)
      .expect(200);
    expect(resFiltroTexto.body.items).toHaveLength(1);
    expect(resFiltroTexto.body.items[0].id).toBe(dteId);
    expect(resFiltroTexto.body.items[0].estadoNombre).toBeTruthy();

    const resFiltroEstadoDistinto = await request(server)
      .get('/api/v1/dte')
      .query({ q: idDte, estado: 8 }) // CANCELADO — este DTE está EMITIDO(1)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .expect(200);
    expect(resFiltroEstadoDistinto.body.items).toHaveLength(0);
  });

  it('tenedor/deudor (partes) solo ven los DTE en los que participan', async () => {
    const server = app.getHttpServer();
    const { dteId, idDte } = await emitirDte(555_000);

    const resTenedor = await request(server)
      .get('/api/v1/dte')
      .query({ q: idDte })
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(200);
    expect(resTenedor.body.items.map((i: { id: string }) => i.id)).toContain(dteId);

    const resDeudor = await request(server)
      .get('/api/v1/dte')
      .query({ q: idDte })
      .set('Authorization', `Bearer ${tokenDeudor}`)
      .expect(200);
    expect(resDeudor.body.items.map((i: { id: string }) => i.id)).toContain(dteId);
  });

  it('GET /dte/:id/xml devuelve la versión vigente por defecto y una versión específica si se pide', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(2_000_000);

    const resVigente = await request(server)
      .get(`/api/v1/dte/${dteId}/xml`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(resVigente.body.version).toBe(1);
    expect(resVigente.body.xml).toContain('<rDTE');

    await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ endosatarioPersonaId: deudorPersonaId })
      .expect(201);

    const resV1 = await request(server)
      .get(`/api/v1/dte/${dteId}/xml`)
      .query({ version: 1 })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(resV1.body.version).toBe(1);

    const resVigenteTrasEndoso = await request(server)
      .get(`/api/v1/dte/${dteId}/xml`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(resVigenteTrasEndoso.body.version).toBe(2);
  });

  it('un tercero sin relación con el DTE no puede leer su XML (ERR-DTE-403)', async () => {
    const sufijo = Date.now() % 1000000;
    const terceroPersonaId = await crearPersona(dbClient, 'Tercero Ajeno', `TERC${sufijo}`);
    const { dteId } = await crearDte(dbClient, operadorUsuarioId);
    await dbClient.query(
      `INSERT INTO psdte.dte_parte (dte_id, persona_id, rol_parte, orden) VALUES ($1, $2, 'ACREEDOR_INICIAL', 1)`,
      [dteId, terceroPersonaId],
    );

    const server = app.getHttpServer();
    const res = await request(server)
      .get(`/api/v1/dte/${dteId}/xml`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(403);
    expect(res.body.error).toBe('ERR-DTE-403');
  });
});
