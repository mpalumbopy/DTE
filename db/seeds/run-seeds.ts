/* eslint-disable no-console */
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import * as argon2 from 'argon2';
import { cifrarAesGcm } from '@psdte/shared';

const envPath = process.env.ENV_FILE
  ? resolve(process.cwd(), process.env.ENV_FILE)
  : join(__dirname, '../../.env');
loadEnv({ path: envPath });

const DATA_DIR = join(__dirname, 'data');
const DEMO_PASSWORD = 'Cambiar.123';
// Secreto TOTP fijo de demo (base32) — ver docs/RUNBOOK.md para generar códigos de prueba.
const DEMO_MFA_SECRET_BASE32 = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

interface UsuarioDemo {
  username: string;
  email: string;
  rol: string;
  mfaHabilitado: boolean;
  persona?: {
    tipoDocumento: number;
    numeroDocumento: string;
    nombresApellidos: string;
  };
}

const USUARIOS_DEMO: UsuarioDemo[] = [
  { username: 'admin', email: 'admin@psdte.local', rol: 'ADMIN_PSDTE', mfaHabilitado: true },
  { username: 'operador', email: 'operador@psdte.local', rol: 'OPERADOR_EMISION', mfaHabilitado: true },
  {
    username: 'tenedor',
    email: 'tenedor@psdte.local',
    rol: 'TENEDOR',
    mfaHabilitado: false,
    persona: { tipoDocumento: 1, numeroDocumento: '1111111', nombresApellidos: 'Tenedor Demo' },
  },
  {
    username: 'deudor',
    email: 'deudor@psdte.local',
    rol: 'DEUDOR',
    mfaHabilitado: false,
    persona: { tipoDocumento: 1, numeroDocumento: '2222222', nombresApellidos: 'Deudor Demo' },
  },
  { username: 'autoridad', email: 'autoridad@psdte.local', rol: 'AUTORIDAD', mfaHabilitado: true },
  { username: 'auditor', email: 'auditor@psdte.local', rol: 'AUDITOR', mfaHabilitado: true },
];

async function ejecutarSeedsSql(client: Client): Promise<void> {
  const archivos = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const archivo of archivos) {
    const sql = readFileSync(join(DATA_DIR, archivo), 'utf8');
    console.log(`[seed] ${archivo}`);
    await client.query(sql);
  }
}

async function seedUsuariosDemo(client: Client): Promise<void> {
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('APP_ENCRYPTION_KEY no está definida: requerida para sembrar usuarios demo');
  }
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const mfaSecretoCifrado = cifrarAesGcm(DEMO_MFA_SECRET_BASE32, encryptionKey);

  for (const demo of USUARIOS_DEMO) {
    let personaId: string | null = null;
    if (demo.persona) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO psdte.persona (tipo_persona, nombres_apellidos, tipo_documento, numero_documento, pais_documento, email)
         VALUES (1, $1, $2, $3, 600, $4)
         ON CONFLICT (tipo_documento, numero_documento, pais_documento) DO UPDATE SET actualizado_en = now(), email = EXCLUDED.email
         RETURNING id`,
        [demo.persona.nombresApellidos, demo.persona.tipoDocumento, demo.persona.numeroDocumento, demo.email],
      );
      personaId = rows[0].id;
    }

    const { rows: usuarioRows } = await client.query<{ id: string }>(
      `INSERT INTO psdte.usuario (username, email, password_hash, mfa_habilitado, mfa_secreto_cifrado, persona_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         mfa_habilitado = EXCLUDED.mfa_habilitado,
         mfa_secreto_cifrado = EXCLUDED.mfa_secreto_cifrado,
         persona_id = EXCLUDED.persona_id
       RETURNING id`,
      [demo.username, demo.email, passwordHash, demo.mfaHabilitado, mfaSecretoCifrado, personaId],
    );
    const usuarioId = usuarioRows[0].id;

    await client.query(
      `INSERT INTO psdte.usuario_rol (usuario_id, rol_codigo)
       VALUES ($1, $2)
       ON CONFLICT (usuario_id, rol_codigo) DO NOTHING`,
      [usuarioId, demo.rol],
    );

    console.log(`[seed] usuario demo: ${demo.email} (${demo.rol})`);
  }
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await ejecutarSeedsSql(client);
    await client.query('COMMIT');

    if (process.env.SEED_DEMO === 'true') {
      await client.query('BEGIN');
      await seedUsuariosDemo(client);
      await client.query('COMMIT');
    } else {
      console.log('[seed] SEED_DEMO != true: se omiten usuarios demo');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log('[seed] completo');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[seed] error:', err);
    process.exit(1);
  });
