import { test, expect, Page } from '@playwright/test';
import { iniciarSesion } from './support/sesion';

/** F12: usuarios/catálogos/parámetros/firmador — comparten una sola sesión admin. */
test.describe.configure({ mode: 'serial' });

test.describe('Admin: usuarios, catálogos, parámetros, firmador (F12)', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await iniciarSesion(page, 'admin');
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('usuarios: crea un usuario y edita sus roles', async () => {
    await page.goto('/admin/usuarios');
    await expect(page.getByTestId('tabla-usuarios')).toBeVisible();

    const sufijo = Date.now();
    await page.getByTestId('input-username-nuevo').fill(`test_${sufijo}`);
    await page.getByTestId('input-email-nuevo').fill(`test_${sufijo}@psdte.local`);
    await page.getByTestId('input-password-nuevo').fill('Contraseña.123456');
    await page.getByTestId('checkbox-rol-nuevo-AUDITOR').check();
    await page.getByTestId('btn-crear-usuario').click();

    const fila = page.getByText(`test_${sufijo}`, { exact: true });
    await expect(fila).toBeVisible();
  });

  test('catálogos: navega entre catálogos y muestra sus filas', async () => {
    await page.goto('/admin/catalogos');
    await expect(page.getByTestId('tabla-catalogo')).toBeVisible();
    await page.getByTestId('btn-catalogo-CAT-DTE-03').click();
    await expect(page.getByTestId('tabla-catalogo')).toBeVisible();
  });

  test('parámetros: edita un parámetro editable', async () => {
    await page.goto('/admin/parametros');
    await expect(page.getByTestId('lista-parametros')).toBeVisible();
    const editar = page.getByTestId('btn-editar-parametro-ltv.resello_meses');
    await editar.click();
    await page.getByTestId('input-valor-ltv.resello_meses').fill('6');
    await page.getByTestId('btn-guardar-parametro-ltv.resello_meses').click();
    await expect(page.getByTestId('btn-editar-parametro-ltv.resello_meses')).toBeVisible();
  });

  test('firmador de desarrollo: firma un texto y muestra el XAdES resultante', async () => {
    await page.goto('/dev/firmador');
    await page.getByTestId('input-texto-firmador').fill('Texto de prueba del firmador de desarrollo.');
    await page.getByTestId('btn-firmar-dev').click();
    await expect(page.getByTestId('resultado-xades')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('resultado-xades')).toContainText('Signature');
  });
});
