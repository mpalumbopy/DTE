import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { crearAppDePrueba } from '../support/test-app';
import { loginDemo } from '../support/auth-helpers';

/**
 * F12: firmador de desarrollo (sección 8, "dev/firmador/page.tsx — solo ALLOW_SIMULATOR"). El
 * entorno de test corre con ALLOW_SIMULATOR=true (.env.test), así que el caso "deshabilitado" no
 * se puede probar aquí sin reconfigurar env en caliente — se documenta como comportamiento
 * esperado (guard de `ConfigService`), no se fuerza un segundo proceso de Nest solo para esto.
 */
describe('Dev — firmador manual (F12 e2e)', () => {
  let app: INestApplication;
  let tokenAdmin: string;
  let tokenTenedor: string;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    tokenAdmin = await loginDemo(app, 'admin');
    tokenTenedor = await loginDemo(app, 'tenedor');
  });

  afterAll(async () => {
    await app.close();
  });

  it('ADMIN_PSDTE puede firmar un texto libre contra el simulador', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/dev/firmador')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ texto: 'Documento de prueba', nombreFirmante: 'Firmante de Prueba' })
      .expect(201);

    expect(res.body.providerRef).toBeTruthy();
    expect(res.body.xadesXml).toContain('<ds:Signature');
  });

  it('un rol sin ADMIN_PSDTE no puede usar el firmador de desarrollo', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/dev/firmador')
      .set('Authorization', `Bearer ${tokenTenedor}`)
      .send({ texto: 'x' })
      .expect(403);
  });

  it('rechaza un texto vacío', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/dev/firmador')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ texto: '' })
      .expect(400);
  });
});
