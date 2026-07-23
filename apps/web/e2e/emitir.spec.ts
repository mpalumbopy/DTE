import { test, expect } from '@playwright/test';
import { iniciarSesion } from './support/sesion';

/**
 * F12: wizard de emisión (5 pasos: datos generales → partes → condiciones → revisión →
 * firmas/confirmación). En modo SIMULADOR la firma de cada parte es sincrónica (no hay ronda
 * asincrónica real que sondear todavía) — el paso de "firmas" refleja eso mostrando el resultado
 * inmediato en vez de un estado pendiente por firmante.
 */
test('emitir pagaré: wizard completo de 5 pasos', async ({ page }) => {
  await iniciarSesion(page, 'operador', '/emitir');

  const vencimiento = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByTestId('input-fecha-vencimiento').fill(vencimiento);
  await page.getByTestId('input-monto-emision').fill('750000');
  await page.getByTestId('lugar-emision-direccion').fill('Av. Mcal. Lopez 566');
  await page.getByTestId('lugar-pago-direccion').fill('Av. España 5681');
  await page.getByTestId('btn-siguiente-paso1').click();

  await page.getByTestId('acreedor-input-documento').fill('1111111');
  await page.getByTestId('acreedor-btn-buscar').click();
  await expect(page.locator('[data-testid^="acreedor-resultado-"]').first()).toBeVisible();
  await page.locator('[data-testid^="acreedor-resultado-"]').first().click();

  await page.getByTestId('deudor-emision-input-documento').fill('2222222');
  await page.getByTestId('deudor-emision-btn-buscar').click();
  await expect(page.locator('[data-testid^="deudor-emision-resultado-"]').first()).toBeVisible();
  await page.locator('[data-testid^="deudor-emision-resultado-"]').first().click();
  await page.getByTestId('btn-siguiente-paso2').click();

  await page.getByTestId('input-condiciones').fill(
    'La parte deudora se obliga a pagar incondicionalmente la suma indicada.\nEste pagaré constituye documento transmisible electrónico conforme a la Ley N° 6822/2021.',
  );
  await page.getByTestId('btn-siguiente-paso3').click();

  await expect(page.getByTestId('revision-emision')).toBeVisible();
  await page.getByTestId('btn-solicitar-firmas').click();

  await expect(page.getByTestId('paso-firmas')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('firmantes-completos')).toContainText('1 firmante');

  await page.getByTestId('btn-confirmar-emision').click();
  await expect(page).toHaveURL(/\/dte\/[0-9a-f-]+$/, { timeout: 15000 });
  await expect(page.getByTestId('detalle-id-dte')).toBeVisible();
});
