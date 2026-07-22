import { readFileSync } from 'fs';
import { join } from 'path';
import { parsearDte } from './index';

const XML_REFERENCIA = readFileSync(
  join(__dirname, '../../test/fixtures/pagare-referencia-firmado.xml'),
  'utf8',
);

describe('parsearDte — fixture real (F4 DoD: "parser tolerante lee el XML de referencia completo")', () => {
  it('parsea el XML de referencia completo sin lanzar, con 9 firmas y 4 eventos', () => {
    const resultado = parsearDte(XML_REFERENCIA);

    expect(resultado.idDte).toBe('vDTE2025070920251021000000001');
    expect(resultado.idDatosGenerales).toBe('dDTE2025070920251021000000001');
    expect(resultado.idEventos).toBe('eDTE2025070920251021000000001');

    expect(resultado.firmas).toHaveLength(9);
    expect(resultado.firmas.every((f) => f.tieneSelloTiempo)).toBe(true);

    expect(resultado.eventos).toHaveLength(4);
    expect(resultado.eventos.map((e) => e.clase)).toEqual(['ENDOSO', 'ENDOSO', 'PAGO', 'CANCELACION']);
  });

  it('extrae los datos generales del pagaré (monto, acreedor, deudor, condiciones, PSDTE)', () => {
    const { datosGenerales } = parsearDte(XML_REFERENCIA);

    expect(datosGenerales.monto).toBe('1000000');
    expect(datosGenerales.montoLetras).toBe('Un Millon');
    expect(datosGenerales.acreedorInicial.nombre).toBe('Justo Gonzalez');
    expect(datosGenerales.acreedorInicial.documento.numero).toBe('8526585');
    expect(datosGenerales.acreedorInicial.direcciones).toHaveLength(1);
    expect(datosGenerales.acreedorInicial.direcciones[0].pais).toBe('Paraguay');

    expect(datosGenerales.deudores).toHaveLength(1);
    expect(datosGenerales.deudores[0].nombre).toBe('Daniel Arce');
    expect(datosGenerales.deudores[0].condicionFirmante).toBe('Deudor-1');

    expect(datosGenerales.codeudores).toHaveLength(1);
    expect(datosGenerales.codeudores[0].nombre).toBe('Jenny Ruiz');

    expect(datosGenerales.condiciones).toHaveLength(4);
    expect(datosGenerales.prestadorServicio.nombre).toBe('TUPAGARE EMITENTE');
  });

  it('extrae los eventos (endoso x2, pago, cancelación) con sus campos propios', () => {
    const { eventos } = parsearDte(XML_REFERENCIA);

    const [endoso1, endoso2, pago, cancelacion] = eventos;
    expect(endoso1.clase).toBe('ENDOSO');
    if (endoso1.clase === 'ENDOSO') {
      expect(endoso1.numeroEndoso).toBe('01');
      expect(endoso1.endosante.nombre).toBe('Justo Gonzalez');
      expect(endoso1.endosatario.nombre).toBe('Juan Perez');
    }
    expect(endoso2.clase).toBe('ENDOSO');
    if (endoso2.clase === 'ENDOSO') {
      expect(endoso2.numeroEndoso).toBe('02');
      expect(endoso2.endosatario.nombre).toBe('Thiago Soto');
    }
    expect(pago.clase).toBe('PAGO');
    if (pago.clase === 'PAGO') {
      expect(pago.montoPagado).toBe('1000000');
      expect(pago.saldoPendiente).toBe('0');
    }
    expect(cancelacion.clase).toBe('CANCELACION');
    if (cancelacion.clase === 'CANCELACION') {
      expect(cancelacion.motivo).toBe('Pago terminado');
    }
  });

  it('reporta como avisos (no como errores) las inconsistencias conocidas del XML de referencia', () => {
    const { avisos } = parsearDte(XML_REFERENCIA);

    const codigos = avisos.map((a) => a.codigo);
    // numeroEvento="001" se repite en el evento 2 (endoso 02) y en el evento 4 (cancelación).
    expect(codigos.filter((c) => c === 'NUMERO_EVENTO_NO_SECUENCIAL').length).toBeGreaterThanOrEqual(2);
    // TextoPromesaPago y ambos TextoEndoso quedan con placeholders [Clave] sin resolver.
    expect(codigos.filter((c) => c === 'PLACEHOLDER_SIN_RESOLVER').length).toBeGreaterThanOrEqual(3);
  });

  it('lanza solo si falta la estructura mínima del perfil (no XML del pagaré)', () => {
    expect(() => parsearDte('<algoDistinto/>')).toThrow();
  });
});
