import { test, expect } from '@playwright/test';
import { iniciarSesion } from './support/sesion';

/** F12 DoD: "responsive". Verifica que las páginas clave no generen scroll horizontal en un
 * viewport móvil (375×667, iPhone SE) — el body nunca debería ser más ancho que el viewport. */
const ANCHO_MOVIL = 375;

async function sinScrollHorizontal(page: import('@playwright/test').Page) {
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('Responsive (F12)', () => {
  test.use({ viewport: { width: ANCHO_MOVIL, height: 667 } });

  test('login: sin scroll horizontal en móvil', async ({ page }) => {
    await page.goto('/login');
    await sinScrollHorizontal(page);
  });

  test('verificar: sin scroll horizontal en móvil', async ({ page }) => {
    await page.goto('/verificar/CODIGO-NO-EXISTE-123');
    await sinScrollHorizontal(page);
  });

  test('dashboard y bandeja: sin scroll horizontal en móvil (con menú)', async ({ page }) => {
    await iniciarSesion(page, 'operador', '/dashboard');
    await sinScrollHorizontal(page);
    await expect(page.getByTestId('btn-menu-movil')).toBeVisible();

    await page.goto('/dte');
    await sinScrollHorizontal(page);
  });

  test('emitir: sin scroll horizontal en móvil', async ({ page }) => {
    await iniciarSesion(page, 'operador', '/emitir');
    await sinScrollHorizontal(page);
  });
});
