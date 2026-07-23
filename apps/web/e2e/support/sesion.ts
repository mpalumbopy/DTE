import { readFileSync } from 'fs';
import { join } from 'path';
import { Page } from '@playwright/test';

export const DEMO_MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const DEMO_PASSWORD = 'Cambiar.123';
export const API_BASE = 'http://localhost:3001/api/v1';
export const TOKENS_FILE = join(__dirname, '.tokens-demo.json');

/**
 * POST /auth/login está limitado a 5 intentos/60s por IP (anti fuerza bruta, ver
 * auth.controller.ts) y todas las specs de Playwright comparten esa misma IP local. Playwright
 * carga cada archivo de specs en su propio contexto de módulos — un caché en memoria a nivel de
 * módulo NO sobrevive entre archivos aunque `workers` sea 1 — así que el login real de cada rol
 * demo se hace UNA sola vez en `global-setup.ts` (antes de que arranque cualquier test) y se
 * persiste en este archivo; todos los specs leen de aquí en vez de repetir el login.
 */
function leerTokenCacheado(username: string): string {
  const tokens = JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) as Record<string, string>;
  const token = tokens[username];
  if (!token) {
    throw new Error(`No hay token cacheado para "${username}" — agregarlo a USUARIOS_NECESARIOS en global-setup.ts`);
  }
  return token;
}

/** Inyecta el access token cacheado directamente en sessionStorage (mismo mecanismo que
 * auth-context.tsx) en vez de repetir el formulario de login — el login/MFA real por UI se prueba
 * una sola vez, con respuestas mockeadas, en auth-ui.spec.ts (no gasta cupo del throttle). */
export async function iniciarSesion(page: Page, username: string, urlDestino = '/dashboard'): Promise<void> {
  const token = leerTokenCacheado(username);
  await page.goto('/login');
  await page.evaluate((t) => window.sessionStorage.setItem('psdte.accessToken', t), token);
  await page.goto(urlDestino);
}

export function tokenCacheado(username: string): string {
  return leerTokenCacheado(username);
}
