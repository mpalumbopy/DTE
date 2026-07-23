import { test, expect, APIRequestContext, Page } from '@playwright/test';
import { API_BASE, iniciarSesion, tokenCacheado } from './support/sesion';

interface FixtureDte {
  personaTenedorId: string;
  personaDeudorId: string;
}

async function emitirDte(request: APIRequestContext, tokenOperador: string, fixture: FixtureDte, monto: number): Promise<string> {
  const crearRes = await request.post(`${API_BASE}/dte/emisiones`, {
    headers: { Authorization: `Bearer ${tokenOperador}` },
    data: {
      fechaVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      monto,
      codigoMoneda: 'PYG',
      lugarEmision: { direccion: 'Av. Mcal. Lopez 566', codigoCiudad: 1, codigoDistrito: 1, codigoDepartamento: 0, codigoPais: 600 },
      lugaresPago: [{ direccion: 'Av. España 5681', codigoCiudad: 1, codigoDistrito: 1, codigoDepartamento: 0, codigoPais: 600 }],
      acreedorInicialPersonaId: fixture.personaTenedorId,
      deudores: [{ personaId: fixture.personaDeudorId, condicionFirmante: 'Deudor-1' }],
      condiciones: [
        'La parte deudora se obliga a pagar incondicionalmente la suma indicada.',
        'Este pagaré constituye documento transmisible electrónico conforme a la Ley N° 6822/2021.',
      ],
    },
  });
  const { idDatosGenerales } = await crearRes.json();
  await request.post(`${API_BASE}/dte/emisiones/${idDatosGenerales}/firmas/solicitar`, {
    headers: { Authorization: `Bearer ${tokenOperador}` },
    data: {},
  });
  const confirmarRes = await request.post(`${API_BASE}/dte/emisiones/${idDatosGenerales}/confirmar`, {
    headers: { Authorization: `Bearer ${tokenOperador}` },
    data: {},
  });
  return (await confirmarRes.json()).dteId;
}

/**
 * F12: wizards de eventos (endosar/pagar/bloquear/levantar/cancelar/exportar) contra DTE reales,
 * emitidos vía API (el wizard de emisión en UI es la tarea siguiente de F12). Las sesiones se
 * inyectan desde el caché de tokens de global-setup.ts (ver support/sesion.ts) — ningún test aquí
 * hace login real.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Wizards de eventos (F12)', () => {
  let fixture: FixtureDte;
  let tokenOperador: string;
  let pageTenedor: Page;
  let pageDeudor: Page;
  let pageAutoridad: Page;

  test.beforeAll(async ({ browser, request }) => {
    tokenOperador = tokenCacheado('operador');
    const personasTenedor = await (
      await request.get(`${API_BASE}/personas?documento=1111111`, { headers: { Authorization: `Bearer ${tokenOperador}` } })
    ).json();
    const personasDeudor = await (
      await request.get(`${API_BASE}/personas?documento=2222222`, { headers: { Authorization: `Bearer ${tokenOperador}` } })
    ).json();
    fixture = { personaTenedorId: personasTenedor[0].id, personaDeudorId: personasDeudor[0].id };

    pageTenedor = await browser.newPage();
    await iniciarSesion(pageTenedor, 'tenedor');
    pageDeudor = await browser.newPage();
    await iniciarSesion(pageDeudor, 'deudor');
    pageAutoridad = await browser.newPage();
    await iniciarSesion(pageAutoridad, 'autoridad');
  });

  test.afterAll(async () => {
    await pageTenedor.close();
    await pageDeudor.close();
    await pageAutoridad.close();
  });

  test('endosar → pagar → cancelar → exportar: ciclo completo con un solo DTE', async ({ request }) => {
    const dteId = await emitirDte(request, tokenOperador, fixture, 900_000);

    await pageTenedor.goto(`/dte/${dteId}/endosar`);
    await pageTenedor.getByTestId('input-documento-endosatario').fill('2222222');
    await pageTenedor.getByTestId('btn-buscar-endosatario').click();
    await expect(pageTenedor.getByTestId('resultados-busqueda-persona')).toBeVisible();
    await pageTenedor.getByTestId(`resultado-persona-${fixture.personaDeudorId}`).click();
    await pageTenedor.getByTestId('btn-confirmar-endoso').click();
    await expect(pageTenedor).toHaveURL(new RegExp(`/dte/${dteId}$`), { timeout: 15000 });
    await expect(pageTenedor.getByTestId('detalle-id-dte')).toBeVisible();
    await expect(pageTenedor.getByTestId('lista-partes')).toBeVisible();
    await expect(pageTenedor.getByTestId('timeline-eventos')).toBeVisible();
    await expect(pageTenedor.getByTestId('acciones-dte')).toBeVisible();

    await pageDeudor.goto(`/dte/${dteId}/pagar`);
    await pageDeudor.getByTestId('input-monto-pagado').fill('900000');
    await pageDeudor.getByTestId('btn-confirmar-pago').click();
    await expect(pageDeudor).toHaveURL(new RegExp(`/dte/${dteId}$`), { timeout: 15000 });

    await pageDeudor.goto(`/dte/${dteId}/cancelar`);
    await pageDeudor.getByTestId('input-motivo-cancelacion').fill('Saldo cancelado en su totalidad, se extingue el título');
    await pageDeudor.getByTestId('btn-confirmar-cancelacion').click();
    await expect(pageDeudor).toHaveURL(new RegExp(`/dte/${dteId}$`), { timeout: 15000 });
    await expect(pageDeudor.getByTestId('detalle-estado')).toHaveText('CANCELADO');

    await pageDeudor.goto(`/dte/${dteId}/exportar`);
    await pageDeudor.getByTestId('btn-generar-contenedor').click();
    await expect(pageDeudor.getByTestId('btn-descargar-exportacion')).toBeVisible({ timeout: 15000 });
  });

  test('bloquear + levantar: autoridad bloquea un DTE distinto y luego levanta la medida', async ({ request }) => {
    const dteId = await emitirDte(request, tokenOperador, fixture, 450_000);

    await pageAutoridad.goto(`/dte/${dteId}/bloquear`);
    await pageAutoridad.getByTestId('select-causal-bloqueo').selectOption({ index: 1 });
    await pageAutoridad.getByTestId('input-autoridad').fill('Juzgado de Prueba N.º 1');
    await pageAutoridad.getByTestId('input-fecha-orden').fill(new Date().toISOString().slice(0, 10));
    await pageAutoridad.getByTestId('btn-confirmar-bloqueo').click();
    await expect(pageAutoridad).toHaveURL(new RegExp(`/dte/${dteId}$`), { timeout: 15000 });
    await expect(pageAutoridad.getByTestId('detalle-estado')).toHaveText('BLOQUEADO');

    await expect(pageAutoridad.getByTestId('btn-levantar-bloqueo')).toBeVisible();
    await pageAutoridad.getByTestId('btn-levantar-bloqueo').click();
    await pageAutoridad.getByTestId('input-motivo-levantamiento').fill('Orden judicial revocada');
    await pageAutoridad.getByTestId('btn-confirmar-levantamiento').click();
    await expect(pageAutoridad.getByTestId('detalle-estado')).toHaveText('EMITIDO', { timeout: 15000 });
  });
});
