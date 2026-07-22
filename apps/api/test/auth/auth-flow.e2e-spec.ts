import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authenticator } from 'otplib';
import { Client } from 'pg';
import { crearAppDePrueba } from '../support/test-app';
import { conectarTestDb } from '../support/test-db';

const DEMO_MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const DEMO_PASSWORD = 'Cambiar.123';

function extraerCookie(setCookieHeader: unknown, nombre: string): string {
  const valores = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [String(setCookieHeader)] : [];
  const cookie = valores.find((c) => c.startsWith(`${nombre}=`));
  if (!cookie) {
    throw new Error(`No se encontró la cookie ${nombre} en la respuesta`);
  }
  return cookie.split(';')[0];
}

describe('Auth (F2 e2e)', () => {
  let app: INestApplication;
  let dbClient: Client;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    dbClient = await conectarTestDb();
  });

  afterAll(async () => {
    await app.close();
    await dbClient.end();
  });

  it('login de admin exige MFA; TOTP correcto emite tokens; el access token accede a un endpoint protegido', async () => {
    const server = app.getHttpServer();

    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: DEMO_PASSWORD })
      .expect(200);

    expect(loginRes.body.requiereMfa).toBe(true);
    expect(typeof loginRes.body.mfaPendingToken).toBe('string');

    const codigo = authenticator.generate(DEMO_MFA_SECRET);

    const mfaRes = await request(server)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaPendingToken: loginRes.body.mfaPendingToken, codigo })
      .expect(200);

    expect(typeof mfaRes.body.accessToken).toBe('string');
    expect(mfaRes.headers['set-cookie']).toBeTruthy();

    const usuariosRes = await request(server)
      .get('/api/v1/usuarios')
      .set('Authorization', `Bearer ${mfaRes.body.accessToken}`)
      .expect(200);
    expect(Array.isArray(usuariosRes.body)).toBe(true);
    expect(usuariosRes.body.some((u: { username: string }) => u.username === 'admin')).toBe(true);
  });

  it('rechaza credenciales inválidas con ERR-AUTH-001', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'incorrecta-a-proposito' })
      .expect(401);
    expect(res.body.error).toBe('ERR-AUTH-001');
  });

  it('rechaza un código MFA incorrecto con ERR-AUTH-003', async () => {
    const server = app.getHttpServer();
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'auditor', password: DEMO_PASSWORD })
      .expect(200);

    const res = await request(server)
      .post('/api/v1/auth/mfa/verify')
      .send({ mfaPendingToken: loginRes.body.mfaPendingToken, codigo: '000000' })
      .expect(403);
    expect(res.body.error).toBe('ERR-AUTH-003');
  });

  it('un usuario sin rol crítico no requiere MFA', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'tenedor', password: DEMO_PASSWORD })
      .expect(200);
    expect(res.body.requiereMfa).toBe(false);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rota el refresh token y revoca toda la familia ante un reuso (ADR-007)', async () => {
    const server = app.getHttpServer();

    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ username: 'deudor', password: DEMO_PASSWORD })
      .expect(200);
    const cookieInicial = extraerCookie(loginRes.headers['set-cookie'], 'refresh_token');

    const refresh1 = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieInicial)
      .expect(200);
    const cookieRotada = extraerCookie(refresh1.headers['set-cookie'], 'refresh_token');
    expect(typeof refresh1.body.accessToken).toBe('string');

    // Reuso del refresh original (ya rotado) -> rechazado.
    const reuso = await request(server).post('/api/v1/auth/refresh').set('Cookie', cookieInicial).expect(401);
    expect(reuso.body.error).toBe('ERR-AUTH-002');

    // La sesión rotada, aunque válida hasta hace un instante, queda revocada junto con la familia.
    const posReuso = await request(server).post('/api/v1/auth/refresh').set('Cookie', cookieRotada).expect(401);
    expect(posReuso.body.error).toBe('ERR-AUTH-002');
  });

  it('encadena hashes en auditoria_log tras las mutaciones anteriores (I5)', async () => {
    const { rows } = await dbClient.query<{ id: string; hash_registro: string; hash_anterior: string | null }>(
      'SELECT id, hash_registro, hash_anterior FROM psdte.auditoria_log ORDER BY id ASC',
    );
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].hash_anterior).toBe(rows[i - 1].hash_registro);
    }
  });
});
