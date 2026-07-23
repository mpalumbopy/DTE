import { test, expect, Page } from '@playwright/test';
import { iniciarSesion } from './support/sesion';

/**
 * F11 DoD (docs/PLAN.md sección 13): "pantalla auditoría filtra por entidad/fecha y verifica
 * cadena". Incidencias no está en el DoD explícito de F11 (solo la descripción de fase la
 * menciona; sección 8 la deja para F12) pero ya existe como página funcional — se cubre aquí
 * con un smoke test ligero.
 *
 * La sesión de admin se inyecta una sola vez (support/sesion.ts cachea el token entre archivos)
 * y se comparte entre los 3 tests — el login/MFA real ya se prueba en auth-ui.spec.ts.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Auditoría e incidencias (F11)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await iniciarSesion(page, 'admin');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('auditoría: filtra por entidad y verifica la cadena de hashes', async () => {
    await page.goto('/auditoria');

    await page.getByTestId('input-entidad').fill('dte');
    await page.getByTestId('btn-filtrar').click();

    const tabla = page.getByTestId('tabla-auditoria');
    const sinRegistros = page.getByText('Sin registros para los filtros aplicados.');
    await expect(tabla.or(sinRegistros)).toBeVisible();

    await page.getByTestId('btn-verificar-cadena').click();
    await expect(page.getByTestId('resultado-verificacion')).toContainText('Cadena válida', { timeout: 15000 });
  });

  test('auditoría: un rango de fechas futuro no devuelve registros', async () => {
    await page.goto('/auditoria');

    const mañana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pasadoMañana = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const aInputLocal = (d: Date) => d.toISOString().slice(0, 16);

    await page.getByTestId('input-desde').fill(aInputLocal(mañana));
    await page.getByTestId('input-hasta').fill(aInputLocal(pasadoMañana));
    await page.getByTestId('btn-filtrar').click();

    await expect(page.getByText('Sin registros para los filtros aplicados.')).toBeVisible();
  });

  test('incidencias: la pantalla carga con sus filtros', async () => {
    await page.goto('/incidencias');

    await expect(page.getByTestId('select-estado')).toBeVisible();
    await expect(page.getByTestId('select-severidad')).toBeVisible();

    await page.getByTestId('select-severidad').selectOption('CRITICA');
    const tabla = page.getByTestId('tabla-incidencias');
    const sinIncidencias = page.getByText('Sin incidencias para los filtros aplicados.');
    await expect(tabla.or(sinIncidencias)).toBeVisible();
  });
});
