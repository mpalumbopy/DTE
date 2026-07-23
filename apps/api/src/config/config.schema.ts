import { existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

/**
 * Resuelto vía require.resolve (no una ruta relativa a `cwd`): `cwd` varía según quién arranque el
 * proceso (turbo desde la raíz del monorepo, Jest desde `apps/api`, la imagen de producción), pero
 * la resolución de módulos de Node siempre encuentra el paquete workspace correctamente.
 */
function rutaXsdPorDefecto(): string {
  const pkgJson = require.resolve('@psdte/xml-engine/package.json');
  return join(dirname(pkgJson), 'schema', 'pagare-dte.provisional.xsd');
}

/** Busca un Chromium ya instalado (p. ej. el que gestiona Playwright vía `PLAYWRIGHT_BROWSERS_PATH`
 * en este entorno) antes de asumir que el binario está en PATH — evita depender de descargarlo. */
function rutaChromiumPorDefecto(): string {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    const revision = readdirSync(base).find((n) => n.startsWith('chromium-'));
    if (revision) {
      const candidato = join(base, revision, 'chrome-linux', 'chrome');
      if (existsSync(candidato)) return candidato;
    }
  }
  return 'chromium';
}

function rutaExportacionesPorDefecto(): string {
  return join(process.cwd(), 'var', 'exportaciones');
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es requerida'),
  REDIS_URL: z.string().min(1, 'REDIS_URL es requerida'),
  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY es requerida (PEM RS256 en base64)'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY es requerida (PEM RS256 en base64)'),
  APP_ENCRYPTION_KEY: z.string().min(1, 'APP_ENCRYPTION_KEY es requerida (32 bytes en base64)'),
  HMAC_CALLBACK_SECRET: z.string().min(1, 'HMAC_CALLBACK_SECRET es requerida'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  ALLOW_SIMULATOR: boolFromString.default(true),
  PROCESS_ROLE: z.enum(['api', 'worker']).default('api'),
  XSD_PATH: z.string().default(rutaXsdPorDefecto()),
  EXPORT_DIR: z.string().default(rutaExportacionesPorDefecto()),
  CHROMIUM_PATH: z.string().default(rutaChromiumPorDefecto()),
  GHOSTSCRIPT_PATH: z.string().default('gs'),
  SEED_DEMO: boolFromString.default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración de entorno inválida: ${detalle}`);
  }
  return parsed.data;
}

/** Decodifica un valor JWT_PRIVATE_KEY/JWT_PUBLIC_KEY (base64) a PEM. */
export function decodificarPem(valorBase64: string): string {
  return Buffer.from(valorBase64, 'base64').toString('utf8');
}
