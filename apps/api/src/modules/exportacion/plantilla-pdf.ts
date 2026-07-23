import { Dte } from '../../entities/dte.entity';
import { DteParte } from '../../entities/dte-parte.entity';
import { DteCondicion } from '../../entities/dte-condicion.entity';
import { Persona } from '../../entities/persona.entity';

function escaparHtml(valor: string | number): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface ParteConPersona {
  parte: DteParte;
  persona: Persona;
}

/** Representación PDF/A del pagaré (docs/PLAN.md sección 9): documento probatorio de respaldo del
 * XML, no reemplaza al XML como fuente de verdad jurídica (I8). */
export function construirHtmlRepresentacion(dte: Dte, partes: ParteConPersona[], condiciones: DteCondicion[]): string {
  const filasPartes = partes
    .map(
      ({ parte, persona }) => `
      <tr>
        <td>${escaparHtml(parte.rolParte)}</td>
        <td>${escaparHtml(persona.nombresApellidos ?? persona.razonSocial ?? '')}</td>
        <td>${escaparHtml(persona.numeroDocumento)}</td>
        <td>${escaparHtml(parte.condicionFirmante ?? '')}</td>
      </tr>`,
    )
    .join('');

  const filasCondiciones = condiciones.map((c) => `<li>${escaparHtml(c.descripcion)}</li>`).join('');

  return `<!doctype html>
<html lang="es-PY">
<head>
<meta charset="utf-8" />
<title>Pagaré Electrónico ${escaparHtml(dte.idDte)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 32px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; font-size: 11px; }
  .campo { margin: 4px 0; }
  .campo strong { display: inline-block; min-width: 180px; }
  .pie { margin-top: 32px; font-size: 10px; color: #555; }
</style>
</head>
<body>
  <h1>Pagaré Electrónico — ${escaparHtml(dte.descripcionTipoDte)}</h1>
  <div class="campo"><strong>ID-DTE:</strong> ${escaparHtml(dte.idDte)}</div>
  <div class="campo"><strong>Fecha de emisión:</strong> ${dte.fechaEmision.toISOString()}</div>
  <div class="campo"><strong>Fecha de vencimiento:</strong> ${dte.fechaVencimiento.toISOString()}</div>
  <div class="campo"><strong>Monto:</strong> ${escaparHtml(dte.monto)} ${escaparHtml(dte.monedaCodigo)} (${escaparHtml(dte.montoLetras)})</div>
  <div class="campo"><strong>Saldo pendiente:</strong> ${escaparHtml(dte.saldoPendiente)}</div>
  <div class="campo"><strong>Estado actual (código):</strong> ${escaparHtml(dte.estadoActual)}</div>
  <div class="campo"><strong>Hash vigente:</strong> ${escaparHtml(dte.hashVigente ?? '')}</div>

  <p>${escaparHtml(dte.textoPromesaPago)}</p>

  <h2>Partes intervinientes</h2>
  <table>
    <thead><tr><th>Rol</th><th>Nombre</th><th>Documento</th><th>Condición firmante</th></tr></thead>
    <tbody>${filasPartes}</tbody>
  </table>

  <h2>Condiciones</h2>
  <ul>${filasCondiciones}</ul>

  <div class="pie">
    Esta representación es una reproducción probatoria del pagaré electrónico. El XML firmado
    (dte.xml, incluido en el contenedor de exportación) es la fuente de verdad jurídica —
    docs/PLAN.md, invariante I8.
  </div>
</body>
</html>`;
}
