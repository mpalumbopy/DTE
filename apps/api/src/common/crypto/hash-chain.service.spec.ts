import { HashChainService } from './hash-chain.service';

describe('HashChainService', () => {
  const service = new HashChainService();

  it('produce el mismo hash sin importar el orden de las claves', () => {
    const a = service.calcularHash({ x: 1, y: 2 }, null);
    const b = service.calcularHash({ y: 2, x: 1 }, null);
    expect(a).toBe(b);
  });

  it('produce hashes distintos si cambia el hash_anterior', () => {
    const a = service.calcularHash({ x: 1 }, null);
    const b = service.calcularHash({ x: 1 }, 'algun-hash-anterior');
    expect(a).not.toBe(b);
  });

  it('produce hashes distintos si cambia el contenido', () => {
    const a = service.calcularHash({ x: 1 }, null);
    const b = service.calcularHash({ x: 2 }, null);
    expect(a).not.toBe(b);
  });

  it('devuelve un hex de 64 caracteres (sha256)', () => {
    const hash = service.calcularHash({ x: 1 }, null);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
