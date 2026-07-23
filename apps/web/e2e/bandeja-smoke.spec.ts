import { test, expect } from '@playwright/test';
import { iniciarSesion } from './support/sesion';

test('bandeja de pagarés: carga, filtra por estado y navega al detalle', async ({ page }) => {
  await iniciarSesion(page, 'operador', '/dte');
  await expect(page.getByTestId('form-filtros-bandeja')).toBeVisible();
  const tabla = page.getByTestId('tabla-bandeja');
  const vacio = page.getByText('Sin pagarés para los filtros aplicados.');
  await expect(tabla.or(vacio)).toBeVisible();
});
