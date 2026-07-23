import { request } from '@playwright/test';
import { writeFileSync } from 'fs';
import { authenticator } from 'otplib';
import { DEMO_MFA_SECRET, DEMO_PASSWORD, API_BASE, TOKENS_FILE } from './sesion';

const USUARIOS_NECESARIOS = ['admin', 'operador', 'tenedor', 'deudor', 'autoridad'];

/**
 * POST /auth/login está limitado a 5 intentos/60s por IP (anti fuerza bruta) y todos los specs de
 * Playwright comparten esa misma IP local. Con Playwright, cada archivo de specs carga en un
 * contexto de módulos propio (el estado de un módulo top-level, como un caché en memoria, NO
 * persiste entre archivos aunque `workers` sea 1) — así que un caché en memoria por archivo no
 * evita repetir el login real por cada spec que necesite el mismo rol. Este `globalSetup` corre
 * UNA sola vez antes de toda la suite, hace el login real de cada usuario demo exactamente una vez,
 * y persiste los tokens en un archivo JSON que todos los specs leen (support/sesion.ts) — así el
 * total de peticiones reales a /auth/login para la corrida completa es igual al número de roles
 * distintos usados (6), muy por debajo del límite.
 */
export default async function globalSetup(): Promise<void> {
  const contexto = await request.newContext();
  const tokens: Record<string, string> = {};

  for (const username of USUARIOS_NECESARIOS) {
    const res = await contexto.post(`${API_BASE}/auth/login`, { data: { username, password: DEMO_PASSWORD } });
    const body = await res.json();
    if (body.requiereMfa) {
      const mfaRes = await contexto.post(`${API_BASE}/auth/mfa/verify`, {
        data: { mfaPendingToken: body.mfaPendingToken, codigo: authenticator.generate(DEMO_MFA_SECRET) },
      });
      tokens[username] = (await mfaRes.json()).accessToken;
    } else {
      tokens[username] = body.accessToken;
    }
  }

  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  await contexto.dispose();
}
