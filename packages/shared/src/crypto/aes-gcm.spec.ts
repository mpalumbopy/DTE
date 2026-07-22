import { cifrarAesGcm, descifrarAesGcm } from './aes-gcm';

describe('aes-gcm', () => {
  const clave = Buffer.alloc(32, 7).toString('base64');

  it('cifra y descifra el mismo texto', () => {
    const cifrado = cifrarAesGcm('secreto-de-prueba', clave);
    expect(descifrarAesGcm(cifrado, clave)).toBe('secreto-de-prueba');
  });

  it('produce salidas distintas para el mismo texto (IV aleatorio)', () => {
    const a = cifrarAesGcm('mismo-texto', clave);
    const b = cifrarAesGcm('mismo-texto', clave);
    expect(a).not.toBe(b);
  });

  it('rechaza una clave de longitud incorrecta', () => {
    const claveInvalida = Buffer.alloc(16, 1).toString('base64');
    expect(() => cifrarAesGcm('x', claveInvalida)).toThrow();
  });

  it('rechaza el descifrado si el authTag fue alterado', () => {
    const cifrado = cifrarAesGcm('dato-integro', clave);
    const bytes = Buffer.from(cifrado, 'base64');
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => descifrarAesGcm(bytes.toString('base64'), clave)).toThrow();
  });

  it('rechaza el descifrado con una clave distinta a la de cifrado', () => {
    const cifrado = cifrarAesGcm('dato', clave);
    const otraClave = Buffer.alloc(32, 9).toString('base64');
    expect(() => descifrarAesGcm(cifrado, otraClave)).toThrow();
  });
});
