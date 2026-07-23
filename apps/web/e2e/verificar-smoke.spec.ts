import { test, expect } from '@playwright/test';

test('verificar: código inexistente muestra mensaje claro', async ({ page }) => {
  await page.goto('/verificar/CODIGO-NO-EXISTE-123');
  await expect(page.getByTestId('no-existe')).toBeVisible();
});

test('verificar: código existente muestra estado, QR y permite reverificar', async ({ page }) => {
  await page.goto('/verificar/vDTE-TEST-d89835b0-b0e');
  await expect(page.getByTestId('resultado-verificacion')).toBeVisible();
  await expect(page.getByTestId('dato-existe')).toHaveText('Sí');
  await expect(page.getByTestId('qr-verificacion')).toBeVisible();
  await page.getByTestId('btn-reverificar').click();
  await expect(page.getByTestId('dato-existe')).toHaveText('Sí');
});
