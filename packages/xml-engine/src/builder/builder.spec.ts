import { agregarEvento, construirDatosGeneralesDte, construirTextoEndoso, construirTextoPromesaPago } from './index';
import { montoALetras } from '../monto-letras';
import { serializar } from '../xades';
import {
  AcreedorInicialInput,
  DatosGeneralesDteInput,
  DeudorInput,
  DireccionInput,
  EventoEndosoInput,
  EventoPagoInput,
  EventoCancelacionInput,
  EventoBloqueoInput,
  EventoLevantamientoBloqueoInput,
} from '../modelo/tipos';

const DIRECCION: DireccionInput = {
  direccion: 'Av. Mcal. Lopez',
  numeroCasa: '566',
  codigoCiudad: 1,
  ciudad: 'Asuncion',
  codigoDistrito: 1,
  distrito: 'Asuncion',
  codigoDepartamento: 1,
  departamento: 'Capital',
  codigoPais: 600,
  pais: 'Paraguay',
};

const ACREEDOR: AcreedorInicialInput = {
  nombresApellidos: 'Justo Gonzalez',
  documento: { codigoTipo: 1, tipo: 'CI', numero: '8526585', codigoPais: 1, pais: 'Paraguay' },
  direcciones: [DIRECCION],
  email: 'soporte@ada.com',
  telefono: '098154151',
};

const DEUDOR: DeudorInput = {
  condicionFirmante: 'Deudor-1',
  nombresApellidos: 'Daniel Arce',
  documento: { codigoTipo: 1, tipo: 'CI', numero: '6543210', codigoPais: 1, pais: 'Paraguay' },
  direccion: DIRECCION,
};

function datosGeneralesDePrueba(): DatosGeneralesDteInput {
  return {
    idDte: 'vDTE2025070920251021000000099',
    idDatosGenerales: 'dDTE2025070920251021000000099',
    codigoTipoDte: 1,
    descripcionTipoDte: 'PAGARE A LA ORDEN',
    numeroDte: 99,
    fechaEmision: new Date('2025-07-09T03:45:52Z'),
    fechaVencimiento: new Date('2026-07-09T03:45:52Z'),
    codigoMoneda: 'PYG',
    descripcionMoneda: 'Guaraníes',
    monto: 1_000_000,
    lugarEmision: DIRECCION,
    lugaresPago: [DIRECCION],
    acreedorInicial: ACREEDOR,
    deudores: [DEUDOR],
    condiciones: ['La parte deudora se obliga a pagar incondicionalmente la suma indicada.'],
    prestadorServicio: {
      nombre: 'TUPAGARE EMITENTE',
      nombreFantasia: 'TUPAGARE SA',
      ruc: '80113823-2',
      resolucionMic: '12345/2025',
      telefono: '021 220 0 220',
      email: 'tupagare@tupagare.com.py',
      sitioWeb: 'www.tupagare.com.py',
    },
    enlaceQr: 'https://tupagare.com.py/consultas/',
  };
}

describe('builder (perfil pagaré-DTE)', () => {
  it('construye gDatosGeneralesDTE con la forma esperada y sin placeholders sin resolver', () => {
    const input = datosGeneralesDePrueba();
    const montoLetras = montoALetras(input.monto);
    const { documento, nodoDatosGenerales, uriDatosGenerales } = construirDatosGeneralesDte(input, montoLetras);

    expect(uriDatosGenerales).toBe('#dDTE2025070920251021000000099');
    expect(nodoDatosGenerales.getAttribute('id')).toBe('dDTE2025070920251021000000099');

    const xml = serializar(documento);
    expect(xml).toContain('<montoDTE>1000000</montoDTE>');
    expect(xml).toContain('<montoDTELetras>Un millón</montoDTELetras>');
    expect(xml).toContain('Daniel Arce');
    expect(xml).toContain('Justo Gonzalez');
    expect(xml).not.toMatch(/\[[A-Za-zÁÉÍÓÚÑ]+\]/);

    const raiz = documento.documentElement;
    expect(raiz.tagName).toBe('rDTE');
    expect(nodoDatosGenerales.parentNode).toBeTruthy();
  });

  it('resuelve completamente los placeholders de TextoPromesaPago y TextoEndoso', () => {
    const input = datosGeneralesDePrueba();
    const promesa = construirTextoPromesaPago(input, montoALetras(input.monto));
    expect(promesa).toContain('Justo Gonzalez');
    expect(promesa).toContain('Un millón');
    expect(promesa).not.toMatch(/\[[A-Za-zÁÉÍÓÚÑ]+\]/);

    const endoso = construirTextoEndoso({ nombresApellidos: 'Juan Perez', documento: ACREEDOR.documento });
    expect(endoso).toBe('Páguese a la orden de Juan Perez identificado en este documento el presente pagaré.');
  });

  it('agrega dos endosos encadenados + un pago + una cancelación como gEvento anidados en gEventos', () => {
    const input = datosGeneralesDePrueba();
    const montoLetras = montoALetras(input.monto);
    const { documento } = construirDatosGeneralesDte(input, montoLetras);

    const endoso1: EventoEndosoInput = {
      tipo: 'ENDOSO',
      idEvento: 'eDTE2025070920251021000000099-001',
      numeroEvento: '001',
      fechaEvento: new Date('2026-02-09T03:45:52Z'),
      numeroEndoso: '01',
      endosante: { condicionFirmante: 'Endosante-1', ...ACREEDOR },
      endosatario: { nombresApellidos: 'Juan Perez', documento: DEUDOR.documento },
    };
    const r1 = agregarEvento(documento, input.idDte, endoso1);
    expect(r1.uriEvento).toBe('#eDTE2025070920251021000000099-001');

    const endoso2: EventoEndosoInput = {
      tipo: 'ENDOSO',
      idEvento: 'eDTE2025070920251021000000099-002',
      numeroEvento: '001',
      fechaEvento: new Date('2026-02-09T03:45:52Z'),
      numeroEndoso: '02',
      endosante: { condicionFirmante: 'Endosante-2', nombresApellidos: 'Juan Perez', documento: DEUDOR.documento },
      endosatario: { nombresApellidos: 'Thiago Soto', documento: ACREEDOR.documento },
    };
    agregarEvento(documento, input.idDte, endoso2);

    const pago: EventoPagoInput = {
      tipo: 'PAGO',
      idEvento: 'eDTE2025070920251021000000099-003',
      numeroEvento: '003',
      fechaEvento: new Date('2026-02-09T03:45:52Z'),
      numeroPago: '001',
      montoPagado: 1_000_000,
      saldoPendiente: 0,
    };
    agregarEvento(documento, input.idDte, pago);

    const cancelacion: EventoCancelacionInput = {
      tipo: 'CANCELACION',
      idEvento: 'eDTE2025070920251021000000099-004',
      numeroEvento: '004',
      fechaEvento: new Date('2026-06-09T03:45:52Z'),
      motivo: 'Pago terminado',
    };
    agregarEvento(documento, input.idDte, cancelacion);

    const gEventosNodos = documento.getElementsByTagName('gEventos');
    expect(gEventosNodos.length).toBe(1);
    expect((gEventosNodos[0] as unknown as Element).getAttribute('ID')).toBe('eDTE2025070920251021000000099');

    const eventos = documento.getElementsByTagName('gEvento');
    expect(eventos.length).toBe(4);
    expect((eventos[0] as unknown as Element).getAttribute('ID')).toBe('eDTE2025070920251021000000099-001');
    expect((eventos[3] as unknown as Element).getAttribute('ID')).toBe('eDTE2025070920251021000000099-004');

    const xml = serializar(documento);
    expect(xml).toContain('<tipoEvento>ENDOSO</tipoEvento>');
    expect(xml).toContain('<tipoEvento>PAGO</tipoEvento>');
    expect(xml).toContain('<tipoEvento>CANCELACION DEL DTE</tipoEvento>');
    expect(xml).toContain('Páguese a la orden de Juan Perez');
    expect(xml).toContain('Páguese a la orden de Thiago Soto');
  });

  it('agrega un bloqueo y su levantamiento (forma inferida, no observada en el XML de referencia)', () => {
    const input = datosGeneralesDePrueba();
    const montoLetras = montoALetras(input.monto);
    const { documento } = construirDatosGeneralesDte(input, montoLetras);

    const bloqueo: EventoBloqueoInput = {
      tipo: 'BLOQUEO',
      idEvento: 'eDTE2025070920251021000000099-001',
      numeroEvento: '001',
      fechaEvento: new Date('2026-03-01T00:00:00Z'),
      codigoCausalBloqueo: 1,
      causalBloqueo: 'ORDEN_JUDICIAL',
      autoridad: 'Juzgado de Paraguay',
      numeroOficio: 'OF-123/2026',
      fechaOrden: new Date('2026-02-28T00:00:00Z'),
    };
    agregarEvento(documento, input.idDte, bloqueo);

    const levantamiento: EventoLevantamientoBloqueoInput = {
      tipo: 'LEVANTAMIENTO_BLOQUEO',
      idEvento: 'eDTE2025070920251021000000099-002',
      numeroEvento: '002',
      fechaEvento: new Date('2026-04-01T00:00:00Z'),
      motivo: 'Orden judicial de levantamiento',
    };
    agregarEvento(documento, input.idDte, levantamiento);

    const xml = serializar(documento);
    expect(xml).toContain('<tipoEvento>BLOQUEO</tipoEvento>');
    expect(xml).toContain('<codigoCausalBloqueo>1</codigoCausalBloqueo>');
    expect(xml).toContain('<autoridad>Juzgado de Paraguay</autoridad>');
    expect(xml).toContain('<tipoEvento>LEVANTAMIENTO_BLOQUEO</tipoEvento>');
    expect(xml).toContain('Orden judicial de levantamiento');
  });
});
