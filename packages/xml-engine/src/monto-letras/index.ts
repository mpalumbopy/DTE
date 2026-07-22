const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DIECIS = [
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
];
const VEINTIS = [
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
];
const DECENAS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
];

function convertirDecenas(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DIECIS[n - 10];
  if (n < 30) return VEINTIS[n - 20];
  const decena = Math.floor(n / 10);
  const unidad = n % 10;
  return unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} y ${UNIDADES[unidad]}`;
}

function convertirGrupo(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto > 0) partes.push(convertirDecenas(resto));
  return partes.join(' ');
}

/** Apocopa "uno" → "un" cuando el grupo antecede a un sustantivo ("mil", "millón/millones"). */
function apocopar(texto: string): string {
  if (texto === 'veintiuno') return 'veintiún';
  if (texto === 'uno') return 'un';
  if (texto.endsWith(' uno')) return `${texto.slice(0, -4)} un`;
  return texto;
}

/** Convierte 0-999.999 (un "período" completo: miles + centenas), sin escala de millón. */
function convertirHastaNoveCientosNoventaYNueveMil(n: number): string {
  if (n === 0) return '';
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (miles > 0) {
    partes.push(miles === 1 ? 'mil' : `${apocopar(convertirGrupo(miles))} mil`);
  }
  if (resto > 0) {
    partes.push(convertirGrupo(resto));
  }
  return partes.join(' ');
}

const LIMITE_SOPORTADO = 999_999_999_999.99;

/**
 * Convierte un monto a su expresión en letras en español (es-PY), para `montoDTELetras`
 * (ver docs/PLAN.md sección 7). Soporta hasta 999.999.999.999 con hasta 2 decimales, expresados
 * como fracción "con NN/100" (convención habitual en títulos valores, sin deletrear los centavos).
 */
export function montoALetras(monto: number): string {
  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error(`Monto inválido para conversión a letras: ${monto}`);
  }
  if (monto > LIMITE_SOPORTADO) {
    throw new Error(`Monto fuera del rango soportado por montoALetras (máx. ${LIMITE_SOPORTADO}): ${monto}`);
  }

  const entero = Math.trunc(monto);
  const centavos = Math.round((monto - entero) * 100);

  let letras: string;
  if (entero === 0) {
    letras = 'Cero';
  } else {
    const millones = Math.floor(entero / 1_000_000);
    const unidadesFinales = entero % 1_000_000;

    const partes: string[] = [];
    if (millones > 0) {
      const sufijo = millones === 1 ? 'millón' : 'millones';
      const texto =
        millones === 1 ? `un ${sufijo}` : `${apocopar(convertirHastaNoveCientosNoventaYNueveMil(millones))} ${sufijo}`;
      partes.push(texto);
    }
    if (unidadesFinales > 0 || millones === 0) {
      partes.push(convertirHastaNoveCientosNoventaYNueveMil(unidadesFinales));
    }
    letras = partes.join(' ');
    letras = letras.charAt(0).toUpperCase() + letras.slice(1);
  }

  return centavos > 0 ? `${letras} con ${String(centavos).padStart(2, '0')}/100` : letras;
}
