const LOCALE = 'es-PY';

/** Monto formateado es-PY con el símbolo/código de la moneda del propio DTE (nunca asume PYG). */
export function formatearMonto(monto: string | number, monedaCodigo: string): string {
  const valor = typeof monto === 'string' ? Number(monto) : monto;
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: monedaCodigo, maximumFractionDigits: 2 }).format(valor);
  } catch {
    return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(valor)} ${monedaCodigo}`;
  }
}

export function formatearFecha(fecha: string | Date): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' }).format(d);
}

export function formatearFechaHora(fecha: string | Date): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}
