import { join } from 'path';
import { readFileSync } from 'fs';
import { construirDatosGeneralesDte } from '../builder';
import { montoALetras } from '../monto-letras';
import { parsearDte } from '../parser';
import { serializar } from '../xades';
import { validarContraXsd, validarSemantica } from './index';
import { AcreedorInicialInput, DatosGeneralesDteInput, DeudorInput, DireccionInput } from '../modelo/tipos';

const RUTA_XSD = join(__dirname, '../../schema/pagare-dte.provisional.xsd');
const XML_REFERENCIA = readFileSync(join(__dirname, '../../test/fixtures/pagare-referencia-firmado.xml'), 'utf8');

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
};

const DEUDOR: DeudorInput = {
  condicionFirmante: 'Deudor-1',
  nombresApellidos: 'Daniel Arce',
  documento: { codigoTipo: 1, tipo: 'CI', numero: '6543210', codigoPais: 1, pais: 'Paraguay' },
  direccion: DIRECCION,
};

function datosGeneralesDePrueba(): DatosGeneralesDteInput {
  return {
    idDte: 'vDTE2025070920251021000000055',
    idDatosGenerales: 'dDTE2025070920251021000000055',
    codigoTipoDte: 1,
    descripcionTipoDte: 'PAGARE A LA ORDEN',
    numeroDte: 55,
    fechaEmision: new Date('2025-07-09T03:45:52Z'),
    fechaVencimiento: new Date('2026-07-09T03:45:52Z'),
    codigoMoneda: 'PYG',
    descripcionMoneda: 'Guaraníes',
    monto: 1_000_000,
    lugarEmision: DIRECCION,
    lugaresPago: [DIRECCION],
    acreedorInicial: ACREEDOR,
    deudores: [DEUDOR],
    condiciones: ['Condición de prueba.'],
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

describe('validarContraXsd', () => {
  it('valida un XML equivalente al de referencia (sin firmas) construido por el builder (F4 DoD)', () => {
    const input = datosGeneralesDePrueba();
    const { documento } = construirDatosGeneralesDte(input, montoALetras(input.monto));
    const xml = serializar(documento);

    const resultado = validarContraXsd(xml, RUTA_XSD);
    expect(resultado.errores).toEqual([]);
    expect(resultado.valido).toBe(true);
  });

  it('rechaza un XML con la estructura del perfil incompleta (falta gAcreedorInicial)', () => {
    const xmlIncompleto =
      '<rDTE xmlns="http://acraiz.gov.py/pagare/arhivos-en-xsd">' +
      '<DTE id="vDTE1" version="1.0"><gDatosGeneralesDTE id="dDTE1">' +
      '<codigoTipoDTE>1</codigoTipoDTE>' +
      '</gDatosGeneralesDTE></DTE></rDTE>';

    const resultado = validarContraXsd(xmlIncompleto, RUTA_XSD);
    expect(resultado.valido).toBe(false);
    expect(resultado.errores.length).toBeGreaterThan(0);
  });
});

describe('validarSemantica', () => {
  it('no reporta errores sobre el XML de referencia real (monto↔letras, fechas, condicionFirmante)', () => {
    const { datosGenerales, eventos } = parsearDte(XML_REFERENCIA);
    const errores = validarSemantica({ datosGenerales, eventos });
    expect(errores).toEqual([]);
  });

  it('detecta un desajuste entre montoDTE y montoDTELetras', () => {
    const errores = validarSemantica({
      datosGenerales: { monto: '1000000', montoLetras: 'Dos millones', deudores: [], codeudores: [] } as never,
      eventos: [],
    });
    expect(errores.some((e) => e.codigo === 'ERR-SEM-001')).toBe(true);
  });

  it('detecta fechaVencimientoDTE anterior o igual a fechaEmisionDTE', () => {
    const errores = validarSemantica({
      datosGenerales: {
        fechaEmision: '2026-01-01T00:00:00Z',
        fechaVencimiento: '2025-01-01T00:00:00Z',
        deudores: [],
        codeudores: [],
      } as never,
      eventos: [],
    });
    expect(errores.some((e) => e.codigo === 'ERR-SEM-002')).toBe(true);
  });

  it('detecta condicionFirmante duplicada entre deudor y codeudor', () => {
    const errores = validarSemantica({
      datosGenerales: {
        deudores: [{ condicionFirmante: 'Deudor-1', documento: {} }],
        codeudores: [{ condicionFirmante: 'Deudor-1', documento: {} }],
      } as never,
      eventos: [],
    });
    expect(errores.some((e) => e.codigo === 'ERR-SEM-002' && e.mensaje.includes('duplicada'))).toBe(true);
  });

  it('detecta un evento con fecha anterior al evento previo', () => {
    const errores = validarSemantica({
      datosGenerales: { fechaEmision: '2026-01-01T00:00:00Z', deudores: [], codeudores: [] } as never,
      eventos: [
        { idEvento: 'e-001', posicion: 0, fechaEvento: '2026-06-01T00:00:00Z', clase: 'DESCONOCIDO' },
        { idEvento: 'e-002', posicion: 1, fechaEvento: '2026-03-01T00:00:00Z', clase: 'DESCONOCIDO' },
      ] as never,
    });
    expect(errores.some((e) => e.mensaje.includes('e-002'))).toBe(true);
  });
});
