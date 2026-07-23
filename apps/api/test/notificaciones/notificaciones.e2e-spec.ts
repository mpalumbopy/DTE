import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearPersonaDireccion } from '../support/fixtures';

const MAILDEV_URL = process.env.MAILDEV_URL ?? 'http://127.0.0.1:1080';

interface CorreoMaildev {
  subject: string;
  text: string;
  to: Array<{ address: string }>;
}

async function listarCorreos(): Promise<CorreoMaildev[]> {
  const res = await fetch(`${MAILDEV_URL}/email`);
  if (!res.ok) throw new Error(`maildev respondió ${res.status}`);
  return (await res.json()) as CorreoMaildev[];
}

/**
 * F11 DoD (docs/PLAN.md sección 13): al ocurrir cada evento de dominio se crea una notificación
 * PENDIENTE con plantilla renderizada; el job `enviarPendientes` las envía por SMTP y las
 * transiciona a ENVIADA. Este flujo toca 6 de los 7 tipos de `cat_tipo_notificacion` en un solo
 * ciclo de vida (el 7º, VENCIMIENTO_PROXIMO, se prueba por separado por ser temporal).
 */
describe('Notificaciones (F11 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;
  let tokenTenedor: string;
  let tokenDeudor: string;
  let tokenAutoridad: string;
  let tokenAdmin: string;
  let tenedorPersonaId: string;
  let deudorPersonaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
    tokenTenedor = await loginDemo(app, 'tenedor');
    tokenDeudor = await loginDemo(app, 'deudor');
    tokenAutoridad = await loginDemo(app, 'autoridad');
    tokenAdmin = await loginDemo(app, 'admin');

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

  it(
    'emisión + endoso + bloqueo/levantamiento + pago total + cancelación: crea 6 notificaciones y el job las envía por SMTP',
    async () => {
      const server = app.getHttpServer();
      const { dteId, idDte } = await emitirDte(2_000_000);

      // Endoso: tenedor -> deudor. Notifica ENDOSO_REGISTRADO al endosatario (deudor).
      await request(server)
        .post(`/api/v1/dte/${dteId}/endosos`)
        .set('Authorization', `Bearer ${tokenTenedor}`)
        .send({ endosatarioPersonaId: deudorPersonaId })
        .expect(201);

      // Bloqueo: notifica BLOQUEO_APLICADO al tenedor vigente (deudor).
      const bloqueoRes = await request(server)
        .post(`/api/v1/dte/${dteId}/bloqueos`)
        .set('Authorization', `Bearer ${tokenAutoridad}`)
        .send({
          causalCodigo: 1,
          autoridad: 'Juzgado de Prueba N.º 1',
          numeroOficio: 'OF-2026-NOTIF-001',
          fechaOrden: new Date().toISOString(),
        })
        .expect(201);

      // Levantamiento: no genera notificación (solo lo hace registrarBloqueo).
      await request(server)
        .delete(`/api/v1/dte/${dteId}/bloqueos/${bloqueoRes.body.bloqueoId}`)
        .set('Authorization', `Bearer ${tokenAutoridad}`)
        .send({ motivo: 'Orden judicial revocada' })
        .expect(200);

      // Pago total: el tenedor vigente (deudor, tras el endoso) registra el pago. Notifica PAGO_REGISTRADO.
      await request(server)
        .post(`/api/v1/dte/${dteId}/pagos`)
        .set('Authorization', `Bearer ${tokenDeudor}`)
        .send({ montoPagado: 2_000_000, medioPago: 'TRANSFERENCIA' })
        .expect(201);

      // Cancelación: el mismo tenedor vigente cierra el DTE. Notifica DTE_CANCELADO.
      await request(server)
        .post(`/api/v1/dte/${dteId}/cancelacion`)
        .set('Authorization', `Bearer ${tokenDeudor}`)
        .send({ motivo: 'Saldo cancelado en su totalidad, se extingue el título' })
        .expect(201);

      // SOLICITUD_FIRMA se crea antes de que exista el DTE (aún es un borrador de datos generales),
      // por lo que su fila no lleva dte_id — se identifica por idDte en el asunto en su lugar.
      const { rows: notifRows } = await dbClient.query<{ tipo_codigo: number; estado: string; destino: string }>(
        `SELECT tipo_codigo, estado, destino FROM psdte.notificacion WHERE dte_id = $1 OR asunto LIKE '%' || $2 || '%' ORDER BY creado_en ASC`,
        [dteId, idDte],
      );
      expect(notifRows.map((r) => r.tipo_codigo)).toEqual([6, 1, 2, 4, 3, 5]);
      expect(notifRows.every((r) => r.estado === 'PENDIENTE')).toBe(true);
      expect(notifRows.map((r) => r.destino)).toEqual([
        'deudor@psdte.local', // SOLICITUD_FIRMA
        'tenedor@psdte.local', // EMISION_CONFIRMADA
        'deudor@psdte.local', // ENDOSO_REGISTRADO
        'deudor@psdte.local', // BLOQUEO_APLICADO
        'deudor@psdte.local', // PAGO_REGISTRADO
        'deudor@psdte.local', // DTE_CANCELADO
      ]);

      const jobRes = await request(server)
        .post('/api/v1/admin/jobs/notificaciones')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({})
        .expect(201);
      expect(jobRes.body.enviadas).toBeGreaterThanOrEqual(6);
      expect(jobRes.body.fallidas).toBe(0);

      const { rows: notifEnviadas } = await dbClient.query<{ estado: string }>(
        `SELECT estado FROM psdte.notificacion WHERE dte_id = $1 OR asunto LIKE '%' || $2 || '%'`,
        [dteId, idDte],
      );
      expect(notifEnviadas).toHaveLength(6);
      expect(notifEnviadas.every((r) => r.estado === 'ENVIADA')).toBe(true);

      const correos = (await listarCorreos()).filter((c) => c.subject.includes(idDte) || c.text.includes(idDte));
      expect(correos).toHaveLength(6);
      const destinatarios = correos.flatMap((c) => c.to.map((t) => t.address)).sort();
      expect(destinatarios).toEqual(
        ['deudor@psdte.local', 'deudor@psdte.local', 'deudor@psdte.local', 'deudor@psdte.local', 'deudor@psdte.local', 'tenedor@psdte.local'].sort(),
      );
      expect(correos.some((c) => c.subject.includes('bloqueado'))).toBe(true);
      expect(correos.some((c) => c.subject.includes('cancelado'))).toBe(true);
    },
    60000,
  );

  it('vencimientos próximos: notifica DTE con vencimiento dentro de 7 días y no re-notifica el mismo día', async () => {
    const server = app.getHttpServer();
    const idDteSufijo = `NOTIF-VTO-${Date.now() % 1000000}`;
    const { rows: dteRows } = await dbClient.query<{ id: string }>(
      `INSERT INTO psdte.dte (
          id_dte, id_datos_generales, codigo_tipo_dte, descripcion_tipo_dte, numero_dte,
          fecha_emision, fecha_vencimiento, moneda_codigo, monto, monto_letras, texto_promesa_pago,
          estado_actual, saldo_pendiente, emision_direccion, creado_por
       ) VALUES (
          $1, $2, 1, 'PAGARE A LA ORDEN', $3,
          now(), now() + interval '3 days', 'PYG', 500000, 'quinientos mil guaranies', 'Debo y pagare',
          1, 500000, 'Direccion de prueba', (SELECT id FROM psdte.usuario WHERE username = 'operador')
       ) RETURNING id`,
      [`vDTE-${idDteSufijo}`, `dDTE-${idDteSufijo}`, Date.now() % 1000000000],
    );
    const dteId = dteRows[0].id;
    await dbClient.query(
      `INSERT INTO psdte.dte_tenencia (dte_id, persona_id, origen) VALUES ($1, $2, 'EMISION')`,
      [dteId, tenedorPersonaId],
    );

    const res1 = await request(server)
      .post('/api/v1/admin/jobs/vencimientos-proximos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({})
      .expect(201);
    expect(res1.body.notificados).toBeGreaterThanOrEqual(1);

    const { rows: notif1 } = await dbClient.query(
      `SELECT id FROM psdte.notificacion WHERE dte_id = $1 AND tipo_codigo = 7`,
      [dteId],
    );
    expect(notif1).toHaveLength(1);

    // Segunda corrida el mismo día: no debe duplicar la notificación de este DTE.
    await request(server)
      .post('/api/v1/admin/jobs/vencimientos-proximos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({})
      .expect(201);

    const { rows: notif2 } = await dbClient.query(
      `SELECT id FROM psdte.notificacion WHERE dte_id = $1 AND tipo_codigo = 7`,
      [dteId],
    );
    expect(notif2).toHaveLength(1);
  }, 30000);
});
