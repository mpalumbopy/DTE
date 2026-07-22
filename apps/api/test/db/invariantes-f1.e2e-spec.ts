import { Client } from 'pg';
import { conectarTestDb } from '../support/test-db';
import {
  crearDte,
  crearPersona,
  crearTenenciaVigente,
  crearUsuarioOperador,
  hashFalso,
} from '../support/fixtures';

/**
 * F1 DoD (docs/PLAN.md sección 13): doble tenencia vigente rechazada, UPDATE sobre
 * dte_evento rechazado, transición inválida lanza ERR-ESTADO-001, fn_aplicar_evento feliz.
 */
describe('Invariantes de base de datos (F1)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await conectarTestDb();
  });

  afterAll(async () => {
    await client.end();
  });

  it('I2: rechaza una segunda tenencia vigente para el mismo DTE', async () => {
    const operador = await crearUsuarioOperador(client);
    const { dteId } = await crearDte(client, operador);
    const personaA = await crearPersona(client, 'Persona A', `A-${Date.now()}`);
    const personaB = await crearPersona(client, 'Persona B', `B-${Date.now()}`);

    await crearTenenciaVigente(client, dteId, personaA, 'EMISION');

    await expect(crearTenenciaVigente(client, dteId, personaB, 'ENDOSO')).rejects.toThrow();
  });

  it('I4: rechaza UPDATE y DELETE sobre dte_evento (append-only)', async () => {
    const operador = await crearUsuarioOperador(client);
    const { dteId } = await crearDte(client, operador);

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO psdte.dte_evento (
          dte_id, id_evento_xml, secuencia, numero_evento, tipo_evento, fecha_evento,
          actor_descripcion, rol_actor, estado_previo, estado_resultante, payload, hash_evento
       ) VALUES ($1, $2, 1, '001', 4, now(), 'Operador de prueba', 'DEUDOR', 1, 4, '{}'::jsonb, $3)
       RETURNING id`,
      [dteId, `eDTE-TEST-${dteId}-001`, hashFalso('evt1')],
    );
    const eventoId = rows[0].id;

    await expect(
      client.query(`UPDATE psdte.dte_evento SET numero_evento = '002' WHERE id = $1`, [eventoId]),
    ).rejects.toThrow(/append-only/);

    await expect(
      client.query(`DELETE FROM psdte.dte_evento WHERE id = $1`, [eventoId]),
    ).rejects.toThrow(/append-only/);
  });

  it('ERR-ESTADO-001: fn_aplicar_evento rechaza una transición no definida en cat_transicion', async () => {
    const operador = await crearUsuarioOperador(client);
    // Estado 8 = CANCELADO (final): no tiene transiciones salientes seedeadas.
    const { dteId } = await crearDte(client, operador, { estadoActual: 8, saldoPendiente: 0 });

    await expect(
      client.query(
        `SELECT psdte.fn_aplicar_evento(
            $1::uuid, 4::smallint, $2::varchar, '001'::varchar, now(),
            $3::uuid, 'Operador de prueba'::varchar, 'DEUDOR'::varchar, '{}'::jsonb, $4::char(64)
         )`,
        [dteId, `eDTE-TEST-${dteId}-001`, operador, hashFalso('evt-invalido')],
      ),
    ).rejects.toThrow(/ERR-ESTADO-001/);
  });

  it('fn_aplicar_evento: camino feliz encadena eventos y actualiza el estado vigente', async () => {
    const operador = await crearUsuarioOperador(client);
    const { dteId } = await crearDte(client, operador, { estadoActual: 1 });

    // Se usa ENDOSO (3) en ambos pasos porque (1,3,2,NULL) y (2,3,2,NULL) son transiciones
    // sin ambigüedad en cat_transicion (una sola fila por estado_origen+tipo_evento). Las
    // transiciones de PAGO tienen dos filas (condicion 'saldo > 0' / 'saldo = 0') y
    // fn_aplicar_evento no evalúa esa condición por sí sola (queda a cargo del llamador en
    // F7): el orden de LIMIT 1 entre ellas no está garantizado, así que no sirven para un
    // assert determinístico aquí.
    const primero = await client.query<{ fn_aplicar_evento: string }>(
      `SELECT psdte.fn_aplicar_evento(
          $1::uuid, 3::smallint, $2::varchar, '01'::varchar, now(),
          $3::uuid, 'Tenedor de prueba'::varchar, 'TENEDOR'::varchar, '{"endosatario":"X"}'::jsonb, $4::char(64)
       )`,
      [dteId, `eDTE-TEST-${dteId}-001`, operador, hashFalso('evt1')],
    );
    const evento1Id = primero.rows[0].fn_aplicar_evento;
    expect(evento1Id).toBeTruthy();

    const { rows: dteFilas1 } = await client.query<{ estado_actual: number; version_vigente: number }>(
      `SELECT estado_actual, version_vigente FROM psdte.dte WHERE id = $1`,
      [dteId],
    );
    // (1,3,2,NULL): EMITIDO + ENDOSO -> ENDOSADO.
    expect(dteFilas1[0].estado_actual).toBe(2);
    expect(dteFilas1[0].version_vigente).toBe(2);

    const segundo = await client.query<{ fn_aplicar_evento: string }>(
      `SELECT psdte.fn_aplicar_evento(
          $1::uuid, 3::smallint, $2::varchar, '02'::varchar, now(),
          $3::uuid, 'Tenedor de prueba'::varchar, 'TENEDOR'::varchar, '{"endosatario":"Y"}'::jsonb, $4::char(64)
       )`,
      [dteId, `eDTE-TEST-${dteId}-002`, operador, hashFalso('evt2')],
    );
    const evento2Id = segundo.rows[0].fn_aplicar_evento;

    const { rows: eventos } = await client.query<{
      secuencia: number;
      hash_evento: string;
      hash_anterior: string | null;
    }>(`SELECT secuencia, hash_evento, hash_anterior FROM psdte.dte_evento WHERE dte_id = $1 ORDER BY secuencia`, [
      dteId,
    ]);

    expect(eventos).toHaveLength(2);
    expect(eventos[0].secuencia).toBe(1);
    expect(eventos[0].hash_anterior).toBeNull();
    expect(eventos[1].secuencia).toBe(2);
    // I5: encadenamiento de hashes entre eventos consecutivos.
    expect(eventos[1].hash_anterior).toBe(eventos[0].hash_evento);

    const { rows: dteFilas2 } = await client.query<{ estado_actual: number }>(
      `SELECT estado_actual FROM psdte.dte WHERE id = $1`,
      [dteId],
    );
    // (2,3,2,NULL): ENDOSADO + ENDOSO -> ENDOSADO.
    expect(dteFilas2[0].estado_actual).toBe(2);
    expect(evento2Id).toBeTruthy();
  });
});
