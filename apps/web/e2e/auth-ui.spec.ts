import { test, expect } from '@playwright/test';

/**
 * Único spec que ejercita el formulario de login + MFA en sí mismo. El backend responde con
 * respuestas mockeadas (page.route) en vez de golpear el POST /auth/login real: esa lógica de
 * autenticación (credenciales, MFA, emisión de JWT) ya tiene su propia cobertura e2e dedicada en
 * apps/api/test/auth/auth-flow.e2e-spec.ts — lo que este spec verifica es que el FORMULARIO de
 * /login conecta correctamente sus estados a lo que el backend devuelve, sin gastar cupo del
 * límite de 5 intentos/60s de POST /auth/login que necesitan compartir el resto de las specs
 * (ver global-setup.ts).
 */
test('login: credenciales + MFA llevan al dashboard', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requiereMfa: true, mfaPendingToken: 'mock-pending-token' }) }),
  );
  await page.route('**/api/v1/auth/mfa/verify', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: crearJwtFalso(['ADMIN_PSDTE']) }) }),
  );

  await page.goto('/login');
  await page.getByTestId('input-username').fill('admin');
  await page.getByTestId('input-password').fill('Cambiar.123');
  await page.getByTestId('btn-login').click();

  await expect(page.getByTestId('form-mfa')).toBeVisible();
  await page.getByTestId('input-mfa').fill('123456');
  await page.getByTestId('btn-mfa').click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('btn-logout')).toBeVisible();
});

test('login: credenciales inválidas muestran el error del backend', async ({ page }) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'ERR-AUTH-001', mensaje: 'Credenciales inválidas' }) }),
  );

  await page.goto('/login');
  await page.getByTestId('input-username').fill('admin');
  await page.getByTestId('input-password').fill('contraseña-incorrecta');
  await page.getByTestId('btn-login').click();

  await expect(page.getByTestId('login-error')).toContainText('ERR-AUTH-001');
});

/** JWT con firma falsa: alcanza para que auth-context.tsx decodifique el payload (no valida la
 * firma en el cliente, solo lee `roles` de la carga útil) — el backend real firma con RS256 y
 * valida en cada request; eso ya está cubierto por los e2e de la API. */
function crearJwtFalso(roles: string[]): string {
  const encabezado = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const carga = Buffer.from(JSON.stringify({ sub: 'mock', roles, sesionId: 'mock', mfaVerificada: true })).toString('base64url');
  return `${encabezado}.${carga}.`;
}
