import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearPersona, crearPersonaDireccion } from '../support/fixtures';

/**
 * F7 DoD (docs/PLAN.md sección 13): ciclo 2 endosos + pago total + cancelación · carrera de 20
 * endosos concurrentes (1 OK, 19 ERR-CTRL-001) · bloqueo detiene endoso (ERR-ESTADO-003) y
 * levantamiento restaura el estado previo · cadena de hashes de eventos verificable.
 */
describe('Eventos (F7 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;
  let tokenTenedor: string;
  let tokenDeudor: string;
  let tokenAutoridad: string;
  let tenedorPersonaId: string;
  let deudorPersonaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
    tokenTenedor = await loginDemo(app, 'tenedor');
    tokenDeudor = await loginDemo(app, 'deudor');
    tokenAutoridad = await loginDemo(app, 'autoridad');

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

  it('2 endosos + pago total + cancelación: ciclo completo con cadena de hashes verificable', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(1_000_000);

    // Endoso 1: tenedor -> deudor.
    const endoso1 = await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ endosatarioPersonaId: deudorPersonaId })
      .expect(201);
    expect(endoso1.body.numeroEndoso).toBe(1);
    expect(endoso1.body.estadoActual).toBe(2); // ENDOSADO

    // Endoso 2: deudor -> tenedor (vuelve al tenedor original).
    const endoso2 = await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenDeudor}`)
      .send({ endosatarioPersonaId: tenedorPersonaId })
      .expect(201);
    expect(endoso2.body.numeroEndoso).toBe(2);
    expect(endoso2.body.estadoActual).toBe(2);

    // Pago total: tenedor recibe el pago y salda el DTE.
    const pago = await request(server)
      .post(`/api/v1/dte/${dteId}/pagos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ montoPagado: 1_000_000, medioPago: 'TRANSFERENCIA' })
      .expect(201);
    expect(pago.body.saldoPendiente).toBe('0');
    expect(pago.body.estadoActual).toBe(5); // PAGADO_TOTAL

    // Cancelación: cierra el DTE (estado final).
    const cancelacion = await request(server)
      .post(`/api/v1/dte/${dteId}/cancelacion`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ motivo: 'Saldo cancelado en su totalidad, se extingue el título' })
      .expect(201);
    expect(cancelacion.body.estadoActual).toBe(8); // CANCELADO

    const { rows: dteRows } = await dbClient.query(
      `SELECT estado_actual, version_vigente, hash_vigente FROM psdte.dte WHERE id = $1`,
      [dteId],
    );
    expect(dteRows[0].estado_actual).toBe(8);
    expect(dteRows[0].version_vigente).toBe(5); // emisión + 2 endosos + pago + cancelación

    // El XML final refleja el sello de cierre como hermano de <DTE> bajo <rDTE> (sin firma dentro
    // del gEvento de cancelación — ver ADR-014).
    const { rows: xmlRows } = await dbClient.query(
      `SELECT contenido_xml FROM psdte.dte_xml_version WHERE dte_id = $1 AND version = 5`,
      [dteId],
    );
    const xmlFinal: string = xmlRows[0].contenido_xml;
    expect((xmlFinal.match(/<ds:Signature[ >]/g) ?? []).length).toBe(8);

    // Cadena de hashes de eventos (I5/I7): cada evento referencia el hash del anterior.
    const { rows: eventoRows } = await dbClient.query(
      `SELECT secuencia, tipo_evento, hash_evento, hash_anterior FROM psdte.dte_evento WHERE dte_id = $1 ORDER BY secuencia`,
      [dteId],
    );
    expect(eventoRows).toHaveLength(4);
    expect(eventoRows[0].hash_anterior).toBeNull();
    for (let i = 1; i < eventoRows.length; i += 1) {
      expect(eventoRows[i].hash_anterior).toBe(eventoRows[i - 1].hash_evento);
    }
  }, 60000);

  it('carrera de 20 endosos concurrentes: exactamente 1 prospera, 19 ERR-CTRL-001', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(500_000);

    const sufijo = dteId.slice(0, 8);
    const endosatarios = await Promise.all(
      Array.from({ length: 20 }, (_, i) => crearPersona(dbClient, `Endosatario Carrera ${i}`, `R${sufijo}${i}`)),
    );

    const respuestas = await Promise.all(
      endosatarios.map((endosatarioPersonaId) =>
        request(server)
          .post(`/api/v1/dte/${dteId}/endosos`)
          .set('Authorization', `Bearer ${tokenTenedor}`)
          .send({ endosatarioPersonaId }),
      ),
    );

    const exitosos = respuestas.filter((r) => r.status === 201);
    const rechazados = respuestas.filter((r) => r.status !== 201);
    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(19);
    expect(rechazados.every((r) => r.body.error === 'ERR-CTRL-001')).toBe(true);

    const { rows } = await dbClient.query(`SELECT COUNT(*) AS n FROM psdte.dte_endoso WHERE dte_id = $1`, [dteId]);
    expect(Number(rows[0].n)).toBe(1);
  }, 90000);

  it('bloqueo detiene endoso (ERR-ESTADO-003) y el levantamiento restaura el estado previo', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(750_000);

    const bloqueoRes = await request(server)
      .post(`/api/v1/dte/${dteId}/bloqueos`)
      .set('Authorization', `Bearer ${tokenAutoridad}`)
      .send({
        causalCodigo: 1,
        autoridad: 'Juzgado de Prueba N.º 1',
        numeroOficio: 'OF-2026-001',
        fechaOrden: new Date().toISOString(),
      })
      .expect(201);
    expect(bloqueoRes.body.estadoActual).toBe(7); // BLOQUEADO
    const bloqueoId = bloqueoRes.body.bloqueoId;

    const endosoBloqueadoRes = await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ endosatarioPersonaId: deudorPersonaId });
    expect(endosoBloqueadoRes.status).toBe(423);
    expect(endosoBloqueadoRes.body.error).toBe('ERR-ESTADO-003');

    const levantamientoRes = await request(server)
      .delete(`/api/v1/dte/${dteId}/bloqueos/${bloqueoId}`)
      .set('Authorization', `Bearer ${tokenAutoridad}`)
      .send({ motivo: 'Orden judicial revocada' })
      .expect(200);
    expect(levantamientoRes.body.estadoActual).toBe(1); // EMITIDO (estado previo al bloqueo)

    const endosoRes = await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ endosatarioPersonaId: deudorPersonaId })
      .expect(201);
    expect(endosoRes.body.estadoActual).toBe(2); // ENDOSADO
  }, 60000);
});
