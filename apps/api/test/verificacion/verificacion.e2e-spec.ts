import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearPersona, crearPersonaDireccion } from '../support/fixtures';

/**
 * F8 DoD (docs/PLAN.md sección 13): pública muestra existencia/estado/integridad sin datos
 * personales; alterar 1 byte del XML → integridad FALLA; interviniente ve timeline completo.
 */
describe('Verificación (F8 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;
  let tokenTenedor: string;
  let tokenAutoridad: string;
  let tenedorPersonaId: string;
  let deudorPersonaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
    tokenTenedor = await loginDemo(app, 'tenedor');
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

  async function emitirDte(acreedorPersonaId: string, deudorId: string): Promise<{ dteId: string; idDte: string }> {
    const server = app.getHttpServer();
    const crearRes = await request(server)
      .post('/api/v1/dte/emisiones')
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({
        fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        monto: 1_000_000,
        codigoMoneda: 'PYG',
        lugarEmision: direccionDto('Av. Mcal. Lopez 566'),
        lugaresPago: [direccionDto('Av. España 5681')],
        acreedorInicialPersonaId: acreedorPersonaId,
        deudores: [{ personaId: deudorId, condicionFirmante: 'Deudor-1' }],
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

  it('pública: existe/estado/hash + integridad OK para un DTE real; inexistente devuelve existe=false', async () => {
    const server = app.getHttpServer();
    const { idDte } = await emitirDte(tenedorPersonaId, deudorPersonaId);

    const res = await request(server).get(`/api/v1/verificacion?codigo=${idDte}`).expect(200);
    expect(res.body.existe).toBe(true);
    expect(res.body.idDte).toBe(idDte);
    expect(res.body.estado).toBe('EMITIDO');
    expect(res.body.hashVerificacion).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.integridadValida).toBe(true);
    // Sin datos personales: nombres/montos no deben aparecer en la respuesta pública.
    expect(res.body.monto).toBeUndefined();
    expect(res.body.monedaCodigo).toBeUndefined();

    const inexistenteRes = await request(server).get('/api/v1/verificacion?codigo=vDTE-NO-EXISTE-XYZ').expect(200);
    expect(inexistenteRes.body.existe).toBe(false);

    const { rows } = await dbClient.query(
      `SELECT resultado, nivel_codigo FROM psdte.consulta_verificacion WHERE id_dte_consultado = $1`,
      [idDte],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].resultado).toBe('ENCONTRADO');
    expect(rows[0].nivel_codigo).toBe(1);
  });

  it('alterar 1 byte del XML (versión nueva insertada) hace fallar la integridad', async () => {
    const server = app.getHttpServer();
    const { dteId, idDte } = await emitirDte(tenedorPersonaId, deudorPersonaId);

    const { rows: versionRows } = await dbClient.query(
      `SELECT version, contenido_xml FROM psdte.dte_xml_version WHERE dte_id = $1 ORDER BY version DESC LIMIT 1`,
      [dteId],
    );
    const xmlOriginal: string = versionRows[0].contenido_xml;
    const xmlAlterado = xmlOriginal.replace('PAGARE A LA ORDEN', 'PAGARE A LA ORDEN ALTERADO');
    expect(xmlAlterado).not.toBe(xmlOriginal);

    // INSERT (no UPDATE — dte_xml_version es append-only, I4) de una versión con el XML alterado
    // pero sin actualizar dte.hash_vigente: simula que el contenido fue corrompido después de
    // calcularse el hash — exactamente lo que la verificación de integridad debe detectar.
    await dbClient.query(
      `INSERT INTO psdte.dte_xml_version (dte_id, version, hash_sha256, tamano_bytes, almacenamiento, contenido_xml)
       VALUES ($1, $2, $3, $4, 'DB', $5)`,
      [dteId, versionRows[0].version + 1, '0'.repeat(64), Buffer.byteLength(xmlAlterado, 'utf8'), xmlAlterado],
    );

    const res = await request(server).get(`/api/v1/verificacion?codigo=${idDte}`).expect(200);
    expect(res.body.existe).toBe(true);
    expect(res.body.integridadValida).toBe(false);
  });

  it('interviniente relacionado (tenedor) ve timeline y firmas completos', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte(tenedorPersonaId, deudorPersonaId);

    const res = await request(server)
      .get(`/api/v1/dte/${dteId}/verificacion`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(200);

    expect(res.body.integridadValida).toBe(true);
    expect(res.body.cadenaHashValida).toBe(true);
    expect(res.body.monto).toBeDefined();
    expect(res.body.tenedorActualPersonaId).toBe(tenedorPersonaId);
    expect(Array.isArray(res.body.eventos)).toBe(true);
    expect(Array.isArray(res.body.firmas)).toBe(true);
    expect(res.body.firmas.length).toBeGreaterThan(0);
  });

  it('autoridad ve timeline completo aunque no sea parte del DTE', async () => {
    const server = app.getHttpServer();
    const sufijo = Date.now().toString(36);
    const ajenoAcreedorId = await crearPersona(dbClient, `Ajeno Acreedor ${sufijo}`, `AJA-${sufijo}`);
    const ajenoDeudorId = await crearPersona(dbClient, `Ajeno Deudor ${sufijo}`, `AJD-${sufijo}`);
    await Promise.all([
      crearPersonaDireccion(dbClient, ajenoAcreedorId),
      crearPersonaDireccion(dbClient, ajenoDeudorId),
    ]);
    const { dteId } = await emitirDte(ajenoAcreedorId, ajenoDeudorId);

    const res = await request(server)
      .get(`/api/v1/dte/${dteId}/verificacion`)
      .set('Authorization', `Bearer ${tokenAutoridad}`)
      .expect(200);

    expect(res.body.nivelAcceso).toBeGreaterThanOrEqual(3);
    // La emisión no es un dte_evento (solo el ciclo post-emisión lo es — ver ADR-014/018); las
    // firmas de emisión (deudor + sello PSDTE) sí quedan persistidas y visibles en el timeline.
    expect(Array.isArray(res.body.eventos)).toBe(true);
    expect(res.body.eventos).toHaveLength(0);
    expect(Array.isArray(res.body.firmas)).toBe(true);
    expect(res.body.firmas.length).toBeGreaterThan(0);
  });

  it('tenedor NO relacionado a un DTE ajeno solo ve el nivel público (sin eventos/montos)', async () => {
    const server = app.getHttpServer();
    const sufijo = Date.now().toString(36) + 'b';
    const ajenoAcreedorId = await crearPersona(dbClient, `Ajeno2 Acreedor ${sufijo}`, `AJA2-${sufijo}`);
    const ajenoDeudorId = await crearPersona(dbClient, `Ajeno2 Deudor ${sufijo}`, `AJD2-${sufijo}`);
    await Promise.all([
      crearPersonaDireccion(dbClient, ajenoAcreedorId),
      crearPersonaDireccion(dbClient, ajenoDeudorId),
    ]);
    const { dteId } = await emitirDte(ajenoAcreedorId, ajenoDeudorId);

    const res = await request(server)
      .get(`/api/v1/dte/${dteId}/verificacion`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .expect(200);

    expect(res.body.existe).toBe(true);
    expect(res.body.eventos).toBeUndefined();
    expect(res.body.firmas).toBeUndefined();
    expect(res.body.monto).toBeUndefined();
  });
});
