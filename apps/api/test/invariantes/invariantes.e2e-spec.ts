import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';
import { crearDte, crearPersona, crearPersonaDireccion, crearUsuarioOperador, crearTenenciaVigente, hashFalso } from '../support/fixtures';
import { ReconciliacionService } from '../../src/modules/exportacion/reconciliacion.service';

/**
 * F14 DoD (docs/PLAN.md sección 13): "revisión de invariantes I1–I10 con test dedicado por
 * invariante". Cada invariante tiene AL MENOS un `it` propio y explícito acá, con el número I<n>
 * en el nombre del test para que un `grep`/reporte de CI muestre de un vistazo cuáles están
 * cubiertos. Varios ya tenían cobertura dispersa en specs de fase anterior (F1, F7) — este archivo
 * no las reemplaza, es el punto único de verificación consolidada al cierre del proyecto.
 */
describe('Invariantes I1-I10 (F14 e2e)', () => {
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

  it('I1: id_dte es UNIQUE en BD (rechaza duplicado) y ningún código de producción hace DELETE sobre psdte.dte', async () => {
    const operador = await crearUsuarioOperador(dbClient);
    const { idDte } = await crearDte(dbClient, operador);

    await expect(
      dbClient.query(
        `INSERT INTO psdte.dte (
            id_dte, id_datos_generales, codigo_tipo_dte, descripcion_tipo_dte, numero_dte,
            fecha_emision, fecha_vencimiento, moneda_codigo, monto, monto_letras, texto_promesa_pago,
            estado_actual, saldo_pendiente, emision_direccion, creado_por
         ) VALUES ($1, $2, 1, 'PAGARE A LA ORDEN', $3, now(), now() + interval '30 days', 'PYG',
                   500000, 'quinientos mil guaranies', 'Debo y pagare', 1, 500000, 'otra direccion', $4)`,
        [idDte, `dDTE-TEST-DUPLICADO-${Date.now()}`, Date.now() % 1000000000, operador],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);

    // Barrido estático: si alguien alguna vez agrega un DELETE sobre `dte`, este test debe fallar
    // antes de que llegue a producción — I1 es "jamás reutilizado", no solo "único mientras exista".
    const srcDir = join(__dirname, '../../src');
    const archivosConDelete: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (entrada.name.endsWith('.ts')) {
          const contenido = readFileSync(ruta, 'utf8');
          if (/DELETE\s+FROM\s+psdte\.dte\b(?!_)/i.test(contenido) || /dteRepo\.(delete|remove)\(/.test(contenido)) {
            archivosConDelete.push(ruta);
          }
        }
      }
    };
    recorrer(srcDir);
    expect(archivosConDelete).toEqual([]);
  });

  it('I2: rechaza una segunda tenencia vigente para el mismo DTE', async () => {
    const operador = await crearUsuarioOperador(dbClient);
    const { dteId } = await crearDte(dbClient, operador);
    const personaA = await crearPersona(dbClient, 'Persona A', `I2-A-${Date.now()}`);
    const personaB = await crearPersona(dbClient, 'Persona B', `I2-B-${Date.now()}`);

    await crearTenenciaVigente(dbClient, dteId, personaA, 'EMISION');
    await expect(crearTenenciaVigente(dbClient, dteId, personaB, 'ENDOSO')).rejects.toThrow();
  });

  it('I3: 20 endosos concurrentes sobre el mismo DTE — exactamente 1 prospera (fn_aplicar_evento con FOR UPDATE)', async () => {
    const { dteId } = await emitirDte(2_000_000);
    const server = app.getHttpServer();

    const respuestas = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(server).post(`/api/v1/dte/${dteId}/endosos`).set('Authorization', `Bearer ${tokenTenedor}`).send({
          endosatarioPersonaId: deudorPersonaId,
        }),
      ),
    );
    const exitosos = respuestas.filter((r) => r.status === 201);
    const rechazados = respuestas.filter((r) => r.status !== 201);
    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(19);
  }, 90000);

  it('I4: rechaza UPDATE y DELETE sobre dte_evento (append-only)', async () => {
    const operador = await crearUsuarioOperador(dbClient);
    const { dteId } = await crearDte(dbClient, operador);

    const { rows } = await dbClient.query<{ id: string }>(
      `INSERT INTO psdte.dte_evento (
          dte_id, id_evento_xml, secuencia, numero_evento, tipo_evento, fecha_evento,
          actor_descripcion, rol_actor, estado_previo, estado_resultante, payload, hash_evento
       ) VALUES ($1, $2, 1, '001', 4, now(), 'Operador de prueba', 'DEUDOR', 1, 4, '{}'::jsonb, $3)
       RETURNING id`,
      [dteId, `eDTE-I4-${dteId}`, hashFalso('i4')],
    );
    const eventoId = rows[0].id;

    await expect(
      dbClient.query(`UPDATE psdte.dte_evento SET numero_evento = '002' WHERE id = $1`, [eventoId]),
    ).rejects.toThrow(/append-only/);
    await expect(dbClient.query(`DELETE FROM psdte.dte_evento WHERE id = $1`, [eventoId])).rejects.toThrow(/append-only/);
  });

  it('I5: cadena de hashes entre eventos consecutivos (hash_anterior del evento N = hash_evento del N-1)', async () => {
    const { dteId } = await emitirDte(1_500_000);
    const server = app.getHttpServer();

    await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ endosatarioPersonaId: deudorPersonaId })
      .expect(201);
    await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenDeudor}`)
      .send({ endosatarioPersonaId: tenedorPersonaId })
      .expect(201);

    const { rows: eventos } = await dbClient.query<{ secuencia: number; hash_evento: string; hash_anterior: string | null }>(
      `SELECT secuencia, hash_evento, hash_anterior FROM psdte.dte_evento WHERE dte_id = $1 ORDER BY secuencia`,
      [dteId],
    );
    expect(eventos.length).toBeGreaterThanOrEqual(2);
    expect(eventos[0].hash_anterior).toBeNull();
    for (let i = 1; i < eventos.length; i++) {
      expect(eventos[i].hash_anterior).toBe(eventos[i - 1].hash_evento);
    }
  });

  it('I6: fn_aplicar_evento rechaza una transición no definida en cat_transicion (ERR-ESTADO-001)', async () => {
    const operador = await crearUsuarioOperador(dbClient);
    // Estado 8 = CANCELADO (final): sin transiciones salientes seedeadas.
    const { dteId } = await crearDte(dbClient, operador, { estadoActual: 8, saldoPendiente: 0 });

    await expect(
      dbClient.query(
        `SELECT psdte.fn_aplicar_evento(
            $1::uuid, 4::smallint, $2::varchar, '001'::varchar, now(),
            $3::uuid, 'Operador de prueba'::varchar, 'DEUDOR'::varchar, '{}'::jsonb, $4::char(64)
         )`,
        [dteId, `eDTE-I6-${dteId}`, operador, hashFalso('i6')],
      ),
    ).rejects.toThrow(/ERR-ESTADO-001/);
  });

  it('I7: la firma del evento de endoso referencia el evento anterior (#idEventoAnterior) en el XML resultante', async () => {
    const { dteId } = await emitirDte(1_200_000);
    const server = app.getHttpServer();

    const endoso1 = await request(server)
      .post(`/api/v1/dte/${dteId}/endosos`)
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ endosatarioPersonaId: deudorPersonaId })
      .expect(201);
    expect(endoso1.body.numeroEndoso).toBe(1);

    const { rows: eventosPrevios } = await dbClient.query<{ id_evento_xml: string }>(
      `SELECT id_evento_xml FROM psdte.dte_evento WHERE dte_id = $1 ORDER BY secuencia LIMIT 1`,
      [dteId],
    );
    const idEventoEmision = eventosPrevios[0].id_evento_xml;

    const { rows: xmlRows } = await dbClient.query<{ contenido_xml: string }>(
      `SELECT contenido_xml FROM psdte.dte_xml_version WHERE dte_id = $1 ORDER BY version DESC LIMIT 1`,
      [dteId],
    );
    expect(xmlRows[0].contenido_xml).toContain(`#${idEventoEmision}`);
  });

  it('I8: una discrepancia hash BD↔XML es detectada por la reconciliación y abre una incidencia ALTA', async () => {
    const { dteId } = await emitirDte(900_000);
    await dbClient.query(`UPDATE psdte.dte SET hash_vigente = $1 WHERE id = $2`, [hashFalso('i8-corrupto'), dteId]);

    const reconciliacionService = app.get(ReconciliacionService);
    const resultado = await reconciliacionService.reconciliarDte(dteId);
    expect(resultado.consistente).toBe(false);
    expect(resultado.discrepancias.length).toBeGreaterThan(0);

    const { rows: incidencias } = await dbClient.query<{ severidad: string; estado: string }>(
      `SELECT severidad, estado FROM psdte.incidencia WHERE dte_id = $1 AND endpoint = 'reconciliacion' ORDER BY ocurrido_en DESC LIMIT 1`,
      [dteId],
    );
    expect(incidencias[0].severidad).toBe('ALTA');
    expect(incidencias[0].estado).toBe('ABIERTA');
  });

  it('I9: ningún endpoint expone credenciales/claves privadas de terceros en claro', async () => {
    const server = app.getHttpServer();
    const res = await request(server)
      .get('/api/v1/admin/integraciones')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .expect(200);

    for (const integracion of res.body) {
      expect(integracion.credencialesCifradas).toBeUndefined();
      expect(integracion.mtlsCertCifrado).toBeUndefined();
      expect(integracion.mtlsKeyCifrada).toBeUndefined();
    }

    // Barrido estático complementario: ningún módulo de producción declara un campo de clave
    // privada perteneciente a un firmante/tercero (la única clave privada en todo el código es la
    // propia del sistema para firmar JWT, o la CA efímera que el simulador genera para SÍ MISMO en
    // packages/crypto-providers — ninguna de las dos es la clave de un tercero).
    const srcDir = join(__dirname, '../../src');
    const coincidencias: string[] = [];
    const recorrer = (dir: string) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) recorrer(ruta);
        else if (entrada.name.endsWith('.ts')) {
          const contenido = readFileSync(ruta, 'utf8');
          if (/clavePrivadaFirmante|privateKeyFirmante|clave_privada_firmante/i.test(contenido)) {
            coincidencias.push(ruta);
          }
        }
      }
    };
    recorrer(srcDir);
    expect(coincidencias).toEqual([]);
  });

  it('I10: reintentar una mutación con la misma Idempotency-Key devuelve la respuesta cacheada sin re-ejecutar el evento', async () => {
    const { dteId } = await emitirDte(700_000);
    const server = app.getHttpServer();
    const claveIdempotencia = `test-i10-${Date.now()}`;

    const primeraRespuesta = await request(server)
      .post(`/api/v1/dte/${dteId}/bloqueos`)
      .set('Authorization', `Bearer ${tokenAutoridad}`)
      .set('Idempotency-Key', claveIdempotencia)
      .send({ causalCodigo: 1, autoridad: 'Juzgado de Prueba', fechaOrden: new Date().toISOString() })
      .expect(201);

    const segundaRespuesta = await request(server)
      .post(`/api/v1/dte/${dteId}/bloqueos`)
      .set('Authorization', `Bearer ${tokenAutoridad}`)
      .set('Idempotency-Key', claveIdempotencia)
      .send({ causalCodigo: 1, autoridad: 'Juzgado de Prueba', fechaOrden: new Date().toISOString() })
      .expect(201);

    expect(segundaRespuesta.headers['idempotent-replay']).toBe('true');
    expect(segundaRespuesta.body).toEqual(primeraRespuesta.body);

    // Solo debe existir UN bloqueo real (I10: nunca a medias, la segunda petición no reejecutó el
    // evento) — no dos, aunque el endpoint se haya llamado dos veces con el mismo payload.
    const { rows: bloqueos } = await dbClient.query<{ count: string }>(
      `SELECT count(*)::text FROM psdte.dte_evento WHERE dte_id = $1 AND tipo_evento = (
         SELECT codigo FROM psdte.cat_tipo_evento WHERE nombre = 'BLOQUEO'
       )`,
      [dteId],
    );
    expect(Number(bloqueos[0].count)).toBe(1);

    // Una Idempotency-Key DISTINTA sobre OTRO DTE sí ejecuta una mutación real (no es un cache
    // global por clave sola) — se usa un DTE nuevo porque el primero ya quedó bloqueado y una
    // segunda medida cautelar real sobre el mismo DTE bloqueado es un escenario distinto (ERR-
    // ESTADO-003), no lo que esta parte del test quiere aislar.
    const { dteId: otroDteId } = await emitirDte(650_000);
    await request(server)
      .post(`/api/v1/dte/${otroDteId}/bloqueos`)
      .set('Authorization', `Bearer ${tokenAutoridad}`)
      .set('Idempotency-Key', `${claveIdempotencia}-otra`)
      .send({ causalCodigo: 2, autoridad: 'Otra autoridad', fechaOrden: new Date().toISOString() })
      .expect(201);

    const { rows: bloqueosOtro } = await dbClient.query<{ count: string }>(
      `SELECT count(*)::text FROM psdte.dte_evento WHERE dte_id = $1 AND tipo_evento = (
         SELECT codigo FROM psdte.cat_tipo_evento WHERE nombre = 'BLOQUEO'
       )`,
      [otroDteId],
    );
    expect(Number(bloqueosOtro[0].count)).toBe(1);
  });
});
