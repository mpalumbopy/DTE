import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearPersonaDireccion } from '../support/fixtures';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(__dirname, '../../../..');

/**
 * F9 DoD (docs/PLAN.md sección 13): contenedor generado se verifica offline OK; alterar un
 * artefacto → el manifiesto lo detecta; PDF pasa chequeo PDF/A (estructural — ver ADR); job de
 * resellado agrega token a resellado_ltv.
 */
describe('Exportación y preservación (F9 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;
  let tokenOperador: string;
  let tokenAdmin: string;
  let tenedorPersonaId: string;
  let deudorPersonaId: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
    tokenOperador = await loginDemo(app, 'operador');
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

  async function emitirDte(): Promise<{ dteId: string; idDte: string }> {
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

  it('genera un contenedor que se verifica offline OK, y detecta un artefacto alterado', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte();

    const genRes = await request(server)
      .post(`/api/v1/dte/${dteId}/exportacion`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({ tipo: 'CONTENEDOR' })
      .expect(201);
    expect(genRes.body.hashSha256).toMatch(/^[0-9a-f]{64}$/);

    const { rows } = await dbClient.query(
      `SELECT tipo, hash_sha256, manifiesto, uri_objeto FROM psdte.exportacion WHERE id = $1`,
      [genRes.body.exportacionId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tipo).toBe('CONTENEDOR');
    expect(rows[0].manifiesto.archivos.some((a: { archivo: string }) => a.archivo === 'dte.xml')).toBe(true);

    const descargaRes = await request(server)
      .get(`/api/v1/exportaciones/${genRes.body.exportacionId}/descargar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const zipBuffer: Buffer = descargaRes.body;
    expect(zipBuffer.length).toBeGreaterThan(0);

    // Verificación offline real: recompila/usa el mismo módulo que la CLI (@psdte/xml-engine), sin
    // pasar por la API ni la BD.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { verificarContenedorOffline } = require('@psdte/xml-engine');
    const resultadoOk = await verificarContenedorOffline(zipBuffer);
    expect(resultadoOk.valido).toBe(true);
    expect(resultadoOk.motivos).toHaveLength(0);

    // Alterar 1 byte de un artefacto dentro del zip (sin tocar el manifiesto ni el sello) — el
    // manifiesto debe detectarlo.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip');
    const zipAlterado = new AdmZip(zipBuffer);
    const xmlOriginal: Buffer = zipAlterado.getEntry('dte.xml').getData();
    const xmlAlterado = Buffer.from(xmlOriginal.toString('utf8').replace('PAGARE A LA ORDEN', 'PAGARE ALTERADO'), 'utf8');
    zipAlterado.updateFile('dte.xml', xmlAlterado);
    const resultadoAlterado = await verificarContenedorOffline(zipAlterado.toBuffer());
    expect(resultadoAlterado.valido).toBe(false);
    expect(resultadoAlterado.motivos.some((m: string) => m.includes('dte.xml'))).toBe(true);
  }, 60000);

  it('la CLI `pnpm verificar` verifica el contenedor real generado', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte();

    const genRes = await request(server)
      .post(`/api/v1/dte/${dteId}/exportacion`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({ tipo: 'CONTENEDOR' })
      .expect(201);

    const { rows } = await dbClient.query(`SELECT uri_objeto FROM psdte.exportacion WHERE id = $1`, [genRes.body.exportacionId]);
    const rutaZip: string = rows[0].uri_objeto;

    const { stdout } = await execFileAsync('node', ['packages/xml-engine/dist/cli/verificar.js', rutaZip], { cwd: REPO_ROOT });
    const resultado = JSON.parse(stdout);
    expect(resultado.valido).toBe(true);
  }, 60000);

  it('genera un PDF/A (representación) y persiste su chequeo de conformidad', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte();

    const genRes = await request(server)
      .post(`/api/v1/dte/${dteId}/exportacion`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .send({ tipo: 'PDF_A' })
      .expect(201);
    expect(genRes.body.hashSha256).toMatch(/^[0-9a-f]{64}$/);

    const { rows } = await dbClient.query(`SELECT tipo, manifiesto FROM psdte.exportacion WHERE id = $1`, [genRes.body.exportacionId]);
    expect(rows[0].tipo).toBe('PDF_A');
    expect(rows[0].manifiesto.conformidadPdfA).toBeDefined();
    expect(typeof rows[0].manifiesto.conformidadPdfA.conforme).toBe('boolean');

    const descargaRes = await request(server)
      .get(`/api/v1/exportaciones/${genRes.body.exportacionId}/descargar`)
      .set('Authorization', `Bearer ${tokenOperador}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const pdfBuffer: Buffer = descargaRes.body;
    expect(pdfBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 60000);

  it('el job de resellado LTV agrega un token nuevo a resellado_ltv', async () => {
    const server = app.getHttpServer();
    await emitirDte();

    const antes = await dbClient.query(`SELECT COUNT(*) AS n FROM psdte.resellado_ltv`);
    const nAntes = Number(antes.rows[0].n);

    const res = await request(server)
      .post('/api/v1/admin/jobs/resellado-ltv')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({})
      .expect(201);
    expect(res.body.procesados).toBeGreaterThan(0);

    const despues = await dbClient.query(`SELECT COUNT(*) AS n FROM psdte.resellado_ltv`);
    expect(Number(despues.rows[0].n)).toBeGreaterThan(nAntes);
  }, 180000);

  it('la reconciliación detecta un DTE consistente (no genera incidencia)', async () => {
    const server = app.getHttpServer();
    const { dteId } = await emitirDte();

    const res = await request(server)
      .get(`/api/v1/admin/jobs/reconciliacion?dteId=${dteId}`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);
    expect(res.body.consistente).toBe(true);
    expect(res.body.discrepancias).toHaveLength(0);
  }, 30000);
});
