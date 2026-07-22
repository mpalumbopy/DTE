import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authenticator } from 'otplib';

export const DEMO_MFA_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
export const DEMO_PASSWORD = 'Cambiar.123';

/** Login completo (con MFA si el usuario demo la requiere) devolviendo el access token. */
export async function loginDemo(app: INestApplication, username: string): Promise<string> {
  const server = app.getHttpServer();
  const loginRes = await request(server)
    .post('/api/v1/auth/login')
    .send({ username, password: DEMO_PASSWORD })
    .expect(200);

  if (!loginRes.body.requiereMfa) {
    return loginRes.body.accessToken;
  }

  const codigo = authenticator.generate(DEMO_MFA_SECRET);
  const mfaRes = await request(server)
    .post('/api/v1/auth/mfa/verify')
    .send({ mfaPendingToken: loginRes.body.mfaPendingToken, codigo })
    .expect(200);
  return mfaRes.body.accessToken;
}
