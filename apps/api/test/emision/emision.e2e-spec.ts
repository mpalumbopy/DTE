import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearPersona, crearPersonaDireccion } from '../support/fixtures';

/**
 * F6 DoD (docs/PLAN.md sección 13): borrador → solicitar firmas → simulador firma → confirmar →
 * estado EMITIDO, XML v1 con firmas de partes + sello, hash registrado; ID-DTE duplicado → ERR-DTE-409.
 */
describe('Emisión (F6 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
  });

  afterAll(async () => {
    await app.close();
    await dbClient.end();
  });

  function direccionDto(direccion: string) {
    return { direccion, codigoCiudad: 1, codigoDistrito: 1, codigoDepartamento: 0, codigoPais: 600 };
  }

  async function crearEscenario() {
    const sufijo = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const acreedorId = await crearPersona(dbClient, `Acreedor ${sufijo}`, `ACR-${sufijo}`);
    const deudorId = await crearPersona(dbClient, `Deudor ${sufijo}`, `DEU-${sufijo}`);
    const codeudorId = await crearPersona(dbClient, `CoDeudor ${sufijo}`, `COD-${sufijo}`);
    await Promise.all([
      crearPersonaDireccion(dbClient, acreedorId),
      crearPersonaDireccion(dbClient, deudorId),
      crearPersonaDireccion(dbClient, codeudorId),
    ]);
    return { acreedorId, deudorId, codeudorId };
  }

  function dtoEmision(escenario: { acreedorId: string; deudorId: string; codeudorId: string }) {
    return {
      fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      monto: 1_000_000,
      codigoMoneda: 'PYG',
      lugarEmision: direccionDto('Av. Mcal. Lopez 566'),
      lugaresPago: [direccionDto('Av. España 5681')],
      acreedorInicialPersonaId: escenario.acreedorId,
      deudores: [{ personaId: escenario.deudorId, condicionFirmante: 'Deudor-1' }],
      codeudores: [{ personaId: escenario.codeudorId, condicionFirmante: 'CoDeudor-001' }],
      condiciones: [
        'La parte deudora se obliga a pagar incondicionalmente la suma indicada.',
        'Este pagaré constituye documento transmisible electrónico conforme a la Ley N° 6822/2021.',
      ],
    };
  }

  it('borrador → solicitar firmas → confirmar → EMITIDO con firmas de partes + sello y hash registrado', async () => {
    const server = app.getHttpServer();
    const escenario = await crearEscenario();

    const crearRes = await request(server)
      .post('/api/v1/dte/emisiones')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send(dtoEmision(escenario))
      .expect(201);

    const { idDatosGenerales, idDte } = crearRes.body;
    expect(idDte).toMatch(/^vDTE\d+$/);
    expect(idDatosGenerales).toMatch(/^dDTE\d+$/);

    const obtenerRes = await request(server)
      .get(`/api/v1/dte/emisiones/${idDatosGenerales}`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .expect(200);
    expect(obtenerRes.body.estado).toBe('BORRADOR');

    const solicitarRes = await request(server)
      .post(`/api/v1/dte/emisiones/${idDatosGenerales}/firmas/solicitar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({})
      .expect(201);
    expect(solicitarRes.body.estado).toBe('LISTO_PARA_CONFIRMAR');
    expect(solicitarRes.body.firmantesCompletos).toBe(2); // deudor + codeudor

    const confirmarRes = await request(server)
      .post(`/api/v1/dte/emisiones/${idDatosGenerales}/confirmar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({})
      .expect(201);

    expect(confirmarRes.body.idDte).toBe(idDte);
    expect(confirmarRes.body.estadoActual).toBe(1); // EMITIDO (CAT-DTE-01)

    const { rows: dteRows } = await dbClient.query(
      `SELECT id, estado_actual, hash_vigente, version_vigente FROM psdte.dte WHERE id_dte = $1`,
      [idDte],
    );
    expect(dteRows).toHaveLength(1);
    expect(dteRows[0].estado_actual).toBe(1);
    expect(dteRows[0].hash_vigente).toMatch(/^[0-9a-f]{64}$/);
    expect(dteRows[0].version_vigente).toBe(1);
    const dteId = dteRows[0].id;

    const { rows: xmlVersionRows } = await dbClient.query(
      `SELECT version, hash_sha256, contenido_xml FROM psdte.dte_xml_version WHERE dte_id = $1`,
      [dteId],
    );
    expect(xmlVersionRows).toHaveLength(1);
    expect(xmlVersionRows[0].version).toBe(1);
    expect(xmlVersionRows[0].hash_sha256).toBe(dteRows[0].hash_vigente);
    // 3 firmas embebidas: deudor + codeudor + sello PSDTE.
    expect((xmlVersionRows[0].contenido_xml.match(/<ds:Signature[ >]/g) ?? []).length).toBe(3);

    const { rows: firmaRows } = await dbClient.query(
      `SELECT rol_firmante, estado_validacion FROM psdte.firma WHERE dte_id = $1 ORDER BY creado_en`,
      [dteId],
    );
    expect(firmaRows).toHaveLength(3);
    expect(firmaRows.map((f) => f.rol_firmante)).toEqual(['DEUDOR', 'CODEUDOR', 'PSDTE']);
    expect(firmaRows.every((f) => f.estado_validacion === 'VALIDA')).toBe(true);

    const { rows: tenenciaRows } = await dbClient.query(
      `SELECT persona_id, origen, hasta FROM psdte.dte_tenencia WHERE dte_id = $1`,
      [dteId],
    );
    expect(tenenciaRows).toHaveLength(1);
    expect(tenenciaRows[0].persona_id).toBe(escenario.acreedorId);
    expect(tenenciaRows[0].origen).toBe('EMISION');
    expect(tenenciaRows[0].hasta).toBeNull();

    // El borrador se descarta tras confirmar.
    await request(server)
      .get(`/api/v1/dte/emisiones/${idDatosGenerales}`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .expect(404);
  });

  it('confirmar antes de solicitar firmas rechaza con ERR-ESTADO-001', async () => {
    const server = app.getHttpServer();
    const escenario = await crearEscenario();

    const crearRes = await request(server)
      .post('/api/v1/dte/emisiones')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send(dtoEmision(escenario))
      .expect(201);

    const res = await request(server)
      .post(`/api/v1/dte/emisiones/${crearRes.body.idDatosGenerales}/confirmar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ERR-ESTADO-001');
  });

  it('rechaza confirmar si el ID-DTE ya está registrado (singularidad, ERR-DTE-409)', async () => {
    const server = app.getHttpServer();
    const escenario = await crearEscenario();

    const crearRes = await request(server)
      .post('/api/v1/dte/emisiones')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send(dtoEmision(escenario))
      .expect(201);
    const { idDatosGenerales, idDte } = crearRes.body;

    // Simula que el ID-DTE ya existe (condición que fn de confirmación debe rechazar — I1).
    await dbClient.query(
      `INSERT INTO psdte.dte (
          id_dte, id_datos_generales, codigo_tipo_dte, descripcion_tipo_dte, numero_dte,
          fecha_emision, fecha_vencimiento, moneda_codigo, monto, monto_letras, texto_promesa_pago,
          estado_actual, saldo_pendiente, emision_direccion, creado_por
       ) VALUES (
          $1, $2, 1, 'PAGARE A LA ORDEN', 999999,
          now(), now() + interval '30 days', 'PYG', 1, 'Un millon', 'Debo y pagare',
          1, 1, 'Direccion de prueba', (SELECT id FROM psdte.usuario WHERE username = 'operador')
       )`,
      [idDte, `dDTE-DUP-${Date.now()}`],
    );

    await request(server)
      .post(`/api/v1/dte/emisiones/${idDatosGenerales}/firmas/solicitar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({})
      .expect(201);

    const res = await request(server)
      .post(`/api/v1/dte/emisiones/${idDatosGenerales}/confirmar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ERR-DTE-409');
  });
});
