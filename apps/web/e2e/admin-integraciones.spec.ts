import { test, expect } from '@playwright/test';
import { authenticator } from 'otplib';

const DEMO_MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const DEMO_PASSWORD = 'Cambiar.123';

/**
 * F10 DoD (docs/PLAN.md sección 6.5/13 — requisito explícito del usuario): editar TSA → probar
 * conexión (mock) OK → guardar → conmutar a REAL exige test previo y re-password → historial
 * registra → volver a SIMULADOR → banner reaparece · nunca se ve una credencial en claro.
 */
test.describe('Admin de integraciones', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('input-username').fill('admin');
    await page.getByTestId('input-password').fill(DEMO_PASSWORD);
    await page.getByTestId('btn-login').click();

    await expect(page.getByTestId('form-mfa')).toBeVisible();
    const codigo = authenticator.generate(DEMO_MFA_SECRET);
    await page.getByTestId('input-mfa').fill(codigo);
    await page.getByTestId('btn-mfa').click();

    await expect(page).toHaveURL(/\/admin\/integraciones/);
  });

  test('banner de simulador visible al entrar (TSA/FIRMA/OCSP arrancan en SIMULADOR)', async ({ page }) => {
    await expect(page.getByTestId('banner-simulador')).toBeVisible();
    await expect(page.getByTestId('banner-simulador')).toContainText('MODO SIMULADOR');
  });

  test('conmutar a REAL sin haber probado la conexión antes queda bloqueado', async ({ page }) => {
    await page.getByTestId('card-integracion-OCSP').click();
    await expect(page.getByTestId('formulario-integracion')).toBeVisible();
    await page.getByTestId('btn-conmutar-real').click();
    await page.getByTestId('input-password-conmutar').fill(DEMO_PASSWORD);
    await page.getByTestId('btn-confirmar-conmutar').click();
    await expect(page.getByTestId('error-accion')).toContainText('ERR-ESTADO-001');
  });

  test('editar TSA → probar conexión OK → guardar → conmutar a REAL (test previo + password) → historial → volver a SIMULADOR → banner reaparece', async ({
    page,
  }) => {
    await page.getByTestId('card-integracion-TSA').click();
    await expect(page.getByTestId('formulario-integracion')).toBeVisible();

    // Nunca se ve una credencial en claro: el campo de credenciales actuales solo muestra "********".
    const enmascaradas = page.getByTestId('credenciales-enmascaradas');
    if (await enmascaradas.count()) {
      await expect(enmascaradas).toHaveText('********');
    }

    await page.getByTestId('input-timeout').fill('12000');

    // Probar conexión (mock/simulador) desde el formulario, sin guardar todavía.
    await page.getByTestId('btn-probar-conexion').click();
    await expect(page.getByTestId('resultado-prueba')).toContainText('OK');

    // Guardar.
    await page.getByTestId('btn-guardar').click();
    await expect(page.getByTestId('error-accion')).toHaveCount(0);

    // Conmutar a REAL: exige contraseña — probamos primero sin ella, luego con la incorrecta,
    // luego con la correcta.
    await page.getByTestId('btn-conmutar-real').click();
    await expect(page.getByTestId('modal-conmutar')).toBeVisible();
    await page.getByTestId('btn-confirmar-conmutar').click();
    await expect(page.getByTestId('error-accion')).toContainText('ERR-AUTH-001');

    await page.getByTestId('input-password-conmutar').fill('contraseña-incorrecta');
    await page.getByTestId('btn-confirmar-conmutar').click();
    await expect(page.getByTestId('error-accion')).toContainText('ERR-AUTH-001');

    await page.getByTestId('input-password-conmutar').fill(DEMO_PASSWORD);
    await page.getByTestId('btn-confirmar-conmutar').click();
    await expect(page.getByTestId('modal-conmutar')).toBeHidden();
    await expect(page.getByTestId('modo-TSA')).toHaveText('REAL');

    // El historial registra la conmutación.
    await expect(page.getByTestId('lista-historial')).toContainText('CONMUTAR');
    await expect(page.getByTestId('lista-historial')).toContainText('SIMULADOR → REAL');

    // Volver a SIMULADOR.
    await page.getByTestId('btn-volver-simulador').click();
    await expect(page.getByTestId('modo-TSA')).toHaveText('SIMULADOR');
    await expect(page.getByTestId('lista-historial')).toContainText('REAL → SIMULADOR');

    // El banner de simulador reaparece (TSA vuelve a contar como integración crítica en simulador).
    await expect(page.getByTestId('banner-simulador')).toBeVisible();
  });
});
