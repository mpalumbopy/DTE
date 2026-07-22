/** Interpolador mínimo `{{a.b.c}}` (sin condicionales/loops) para armar el payload de request. */
export function interpolarPlantilla(plantilla: unknown, contexto: Record<string, unknown>): unknown {
  if (typeof plantilla === 'string') {
    const coincidenciaCompleta = plantilla.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (coincidenciaCompleta) {
      return resolverRuta(contexto, coincidenciaCompleta[1]);
    }
    return plantilla.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, ruta: string) => {
      const valor = resolverRuta(contexto, ruta);
      return valor === undefined || valor === null ? '' : String(valor);
    });
  }
  if (Array.isArray(plantilla)) {
    return plantilla.map((item) => interpolarPlantilla(item, contexto));
  }
  if (plantilla && typeof plantilla === 'object') {
    return Object.fromEntries(
      Object.entries(plantilla as Record<string, unknown>).map(([clave, valor]) => [
        clave,
        interpolarPlantilla(valor, contexto),
      ]),
    );
  }
  return plantilla;
}

function resolverRuta(objeto: unknown, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((actual, clave) => {
    if (actual === undefined || actual === null) return undefined;
    return (actual as Record<string, unknown>)[clave];
  }, objeto);
}

/** JSONPath mínimo: `$.a.b.c` / `$.a[0].b` (sin filtros ni wildcards) para leer la respuesta. */
export function resolverJsonPath(objeto: unknown, ruta: string): unknown {
  if (!ruta.startsWith('$')) {
    return undefined;
  }
  const segmentos = ruta
    .slice(1)
    .split(/\.|\[|\]/)
    .filter((s) => s.length > 0);
  return segmentos.reduce<unknown>((actual, segmento) => {
    if (actual === undefined || actual === null) return undefined;
    const indice = Number(segmento);
    if (!Number.isNaN(indice) && Array.isArray(actual)) {
      return actual[indice];
    }
    return (actual as Record<string, unknown>)[segmento];
  }, objeto);
}

/** Aplica el mapeo de respuesta ({destino: jsonPathOrLiteral, map_estado?: {...}}) sobre un JSON crudo. */
export function mapearRespuesta(
  cuerpoRespuesta: unknown,
  mapeo: Record<string, string | Record<string, string>>,
): Record<string, unknown> {
  const resultado: Record<string, unknown> = {};
  for (const [clave, definicion] of Object.entries(mapeo)) {
    if (clave.startsWith('map_')) {
      continue;
    }
    if (typeof definicion !== 'string') {
      continue;
    }
    let valor = resolverJsonPath(cuerpoRespuesta, definicion);
    const claveMapeo = `map_${clave}`;
    const tablaMapeo = mapeo[claveMapeo];
    if (tablaMapeo && typeof tablaMapeo === 'object' && typeof valor === 'string') {
      valor = (tablaMapeo as Record<string, string>)[valor] ?? valor;
    }
    resultado[clave] = valor;
  }
  return resultado;
}
