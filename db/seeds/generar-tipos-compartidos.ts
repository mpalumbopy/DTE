/* eslint-disable no-console */
// Genera packages/shared/src/generated/catalogos.generated.ts a partir de los catálogos ya
// sembrados en la base de datos (ver docs/PLAN.md sección 0.3: "tipos compartidos generados en
// packages/shared desde seeds"). Correr después de aplicar db/seeds/data/*.sql.
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

const envPath = process.env.ENV_FILE ? resolve(process.cwd(), process.env.ENV_FILE) : join(__dirname, '../../.env');
loadEnv({ path: envPath });

const DESTINO = join(__dirname, '../../packages/shared/src/generated/catalogos.generated.ts');

const DIACRITICOS_COMBINADOS = new RegExp('[̀-ͯ]', 'g');

function aClaveConstante(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(DIACRITICOS_COMBINADOS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function bloqueNumerico(constante: string, tipo: string, filas: Array<{ codigo: number; nombre: string }>): string {
  const entradas = filas.map((f) => `  ${aClaveConstante(f.nombre)}: ${f.codigo},`).join('\n');
  return [
    `export const ${constante} = {`,
    entradas,
    `} as const;`,
    `export type ${tipo} = (typeof ${constante})[keyof typeof ${constante}];`,
    '',
  ].join('\n');
}

function bloqueTexto(constante: string, tipo: string, codigos: string[]): string {
  const entradas = codigos.map((c) => `  '${c}',`).join('\n');
  return [
    `export const ${constante} = [`,
    entradas,
    `] as const;`,
    `export type ${tipo} = (typeof ${constante})[number];`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const estados = await client.query<{ codigo: number; nombre: string }>(
      'SELECT codigo, nombre FROM psdte.cat_estado_dte WHERE vigente ORDER BY codigo',
    );
    const eventos = await client.query<{ codigo: number; nombre: string }>(
      'SELECT codigo, nombre FROM psdte.cat_tipo_evento WHERE vigente ORDER BY codigo',
    );
    const roles = await client.query<{ codigo: string }>(
      'SELECT codigo FROM psdte.cat_rol WHERE vigente ORDER BY codigo',
    );
    const errores = await client.query<{ codigo: string }>(
      'SELECT codigo FROM psdte.cat_error WHERE vigente ORDER BY codigo',
    );
    const permisos = await client.query<{ codigo: string }>('SELECT codigo FROM psdte.cat_permiso ORDER BY codigo');

    const contenido = [
      '// GENERADO AUTOMÁTICAMENTE por db/seeds/generar-tipos-compartidos.ts — no editar a mano.',
      '// Fuente: catálogos CAT-DTE-01..10 sembrados desde db/seeds/data/*.sql.',
      '',
      bloqueNumerico('CAT_ESTADO_DTE', 'CodigoEstadoDte', estados.rows),
      bloqueNumerico('CAT_TIPO_EVENTO', 'CodigoTipoEvento', eventos.rows),
      bloqueTexto('CAT_ROL_CODIGOS', 'CodigoRol', roles.rows.map((r) => r.codigo)),
      bloqueTexto('CAT_ERROR_CODIGOS', 'CodigoError', errores.rows.map((r) => r.codigo)),
      bloqueTexto('CAT_PERMISO_CODIGOS', 'CodigoPermiso', permisos.rows.map((r) => r.codigo)),
    ].join('\n');

    writeFileSync(DESTINO, contenido, 'utf8');
    console.log(`[codegen] ${DESTINO} actualizado`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[codegen] error:', err);
  process.exit(1);
});
