import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

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
  XSD_PATH: z.string().default('./packages/xml-engine/schema/pagare-dte.provisional.xsd'),
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
