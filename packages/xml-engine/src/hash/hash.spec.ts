import { sha256Base64, sha256Hex } from './index';

describe('hash', () => {
  it('sha256Hex produce 64 caracteres hexadecimales', () => {
    const hash = sha256Hex('hola mundo');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Hex es determinístico', () => {
    expect(sha256Hex('dato')).toBe(sha256Hex('dato'));
  });

  it('sha256Base64 produce el equivalente en base64 del mismo hash', () => {
    const hex = sha256Hex('dato');
    const base64 = sha256Base64('dato');
    expect(Buffer.from(hex, 'hex').toString('base64')).toBe(base64);
  });
});
