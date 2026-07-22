import { montoALetras } from './index';

describe('montoALetras (es-PY)', () => {
  it.each([
    [0, 'Cero'],
    [1, 'Uno'],
    [15, 'Quince'],
    [21, 'Veintiuno'],
    [31, 'Treinta y uno'],
    [100, 'Cien'],
    [101, 'Ciento uno'],
    [200, 'Doscientos'],
    [999, 'Novecientos noventa y nueve'],
    [1000, 'Mil'],
    [1001, 'Mil uno'],
    [1021, 'Mil veintiuno'],
    [21000, 'Veintiún mil'],
    [100000, 'Cien mil'],
    [1000000, 'Un millón'],
    [1000001, 'Un millón uno'],
    [2000000, 'Dos millones'],
    [21000000, 'Veintiún millones'],
    [1000000000, 'Mil millones'],
    [2500000000, 'Dos mil quinientos millones'],
  ])('convierte %d → "%s"', (monto, esperado) => {
    expect(montoALetras(monto)).toBe(esperado);
  });

  it('agrega la fracción "con NN/100" cuando hay decimales', () => {
    expect(montoALetras(1000000.5)).toBe('Un millón con 50/100');
    expect(montoALetras(100.05)).toBe('Cien con 05/100');
  });

  it('no agrega fracción cuando el monto es entero', () => {
    expect(montoALetras(1000000)).not.toContain('con');
  });

  it('rechaza montos negativos', () => {
    expect(() => montoALetras(-1)).toThrow();
  });

  it('rechaza montos no finitos', () => {
    expect(() => montoALetras(NaN)).toThrow();
    expect(() => montoALetras(Infinity)).toThrow();
  });

  it('rechaza montos fuera del rango soportado', () => {
    expect(() => montoALetras(1_000_000_000_000)).toThrow();
  });
});
