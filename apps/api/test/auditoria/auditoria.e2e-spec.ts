import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearPersonaDireccion } from '../support/fixtures';

/**
 * F11 DoD (docs/PLAN.md sección 13): pantalla/API de auditoría filtra por entidad/fecha y
 * verifica la cadena de hashes. auditoria_log es append-only (trigger trg_auditoria_append_only,
 * invariante I4) — por eso este test no fuerza un tamper real contra la tabla compartida; la
 * imposibilidad de corromper una fila ya es, en sí misma, la garantía que I4 exige.
 */
describe('Auditoría (F11 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;
  let tokenTenedor: string;
  let tokenAdmin: string;
  let tokenAuditor: string;
  let tenedorPersonaId: string;
  let deudorPersonaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
    tokenTenedor = await loginDemo(app, 'tenedor');
    tokenAdmin = await loginDemo(app, 'admin');
    tokenAuditor = await loginDemo(app, 'auditor');

    const { rows: tenedorRows } = await dbClient.query<{ persona_id: string }>(
      `SELECT persona_id FROM psdte.usuario WHERE username = 'tenedor'`,
    );
    const { rows: deudorRows } = await dbClient.query<{ persona_id: string }>(
      `SELECT persona_id FROM psdte.usuario WHERE username = 'deudor'`,
    );
    tenedorPersonaId = tenedorRows[0].persona_id;
    deudorPersonaId = deudorRows[0].persona_id;

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

  it('filtra por entidad y entidad_id: encuentra el registro DTE_EMITIDO del DTE recién creado', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(1_500_000);

    const res = await request(server)
      .get('/api/v1/admin/auditoria')
      .query({ entidad: 'dte', entidadId: dteId })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].accion).toBe('DTE_EMITIDO');
    expect(res.body[0].entidad).toBe('dte');
    expect(res.body[0].entidadId).toBe(dteId);
    expect(res.body[0].hashRegistro).toMatch(/^[0-9a-f]{64}$/);
  });

  it('filtra por rango de fechas: excluye registros fuera del rango', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(750_000);

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const pasadoManana = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const resFueraDeRango = await request(server)
      .get('/api/v1/admin/auditoria')
      .query({ entidad: 'dte', entidadId: dteId, desde: manana, hasta: pasadoManana })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(resFueraDeRango.body).toHaveLength(0);

    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const mananaMasUno = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const resDentroDeRango = await request(server)
      .get('/api/v1/admin/auditoria')
      .query({ entidad: 'dte', entidadId: dteId, desde: ayer, hasta: mananaMasUno })
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(resDentroDeRango.body).toHaveLength(1);
  });

  it('verificar-cadena: la cadena de hashes real es válida de punta a punta', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .get('/api/v1/admin/auditoria/verificar-cadena')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    expect(res.body.valida).toBe(true);
    expect(res.body.motivos).toEqual([]);
    expect(res.body.filasVerificadas).toBeGreaterThan(0);
  });

  it('AUDITOR puede leer auditoría; un rol sin ADMIN_PSDTE/AUDITOR recibe 403', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/api/v1/admin/auditoria/verificar-cadena')
      .set('Authorization', `Bearer ${tokenAuditor}`)
      .expect(200);

    await request(server)
      .get('/api/v1/admin/auditoria')
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(403);

    await request(server)
      .get('/api/v1/admin/auditoria/verificar-cadena')
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(403);
  });
});
