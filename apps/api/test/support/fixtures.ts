import { Client } from 'pg';
import { randomUUID } from 'crypto';

export async function crearUsuarioOperador(client: Client): Promise<string> {
  const sufijo = randomUUID().slice(0, 8);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO psdte.usuario (username, email) VALUES ($1, $2) RETURNING id`,
    [`test_operador_${sufijo}`, `test_operador_${sufijo}@psdte.local`],
  );
  return rows[0].id;
}

export async function crearPersona(
  client: Client,
  nombresApellidos: string,
  numeroDocumento: string,
  email: string | null = null,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO psdte.persona (tipo_persona, nombres_apellidos, tipo_documento, numero_documento, pais_documento, email)
     VALUES (1, $1, 1, $2, 600, $3) RETURNING id`,
    [nombresApellidos, numeroDocumento, email],
  );
  return rows[0].id;
}

export async function crearPersonaDireccion(client: Client, personaId: string, direccion = 'Av. de Prueba 123'): Promise<void> {
  await client.query(
    `INSERT INTO psdte.persona_direccion
        (persona_id, direccion, ciudad_codigo, distrito_codigo, departamento_codigo, pais_codigo, principal)
     VALUES ($1, $2, 1, 1, 0, 600, TRUE)`,
    [personaId, direccion],
  );
}

export interface DteFixture {
  dteId: string;
  idDte: string;
}

export async function crearDte(
  client: Client,
  creadoPor: string,
  opciones: { estadoActual?: number; monto?: number; saldoPendiente?: number } = {},
): Promise<DteFixture> {
  const sufijo = randomUUID().slice(0, 12);
  const idDte = `vDTE-TEST-${sufijo}`;
  const idDatosGenerales = `dDTE-TEST-${sufijo}`;
  const monto = opciones.monto ?? 1000000;
  const saldoPendiente = opciones.saldoPendiente ?? monto;
  const estadoActual = opciones.estadoActual ?? 1;

  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO psdte.dte (
        id_dte, id_datos_generales, codigo_tipo_dte, descripcion_tipo_dte, numero_dte,
        fecha_emision, fecha_vencimiento, moneda_codigo, monto, monto_letras, texto_promesa_pago,
        estado_actual, saldo_pendiente, emision_direccion, creado_por
     ) VALUES (
        $1, $2, 1, 'PAGARE A LA ORDEN', $3,
        now(), now() + interval '30 days', 'PYG', $4, 'un millon de guaranies', 'Debo y pagare',
        $5, $6, 'Direccion de prueba', $7
     ) RETURNING id`,
    [idDte, idDatosGenerales, Date.now() % 1000000000, monto, estadoActual, saldoPendiente, creadoPor],
  );
  return { dteId: rows[0].id, idDte };
}

export async function crearTenenciaVigente(
  client: Client,
  dteId: string,
  personaId: string,
  origen: 'EMISION' | 'ENDOSO' | 'ORDEN_AUTORIDAD' = 'EMISION',
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO psdte.dte_tenencia (dte_id, persona_id, origen) VALUES ($1, $2, $3) RETURNING id`,
    [dteId, personaId, origen],
  );
  return rows[0].id;
}

export function hashFalso(semilla: string): string {
  return semilla.padEnd(64, '0').slice(0, 64);
}
