export interface Transicion {
  estadoOrigen: number;
  tipoEvento: number;
  estadoDestino: number;
  condicion: string | null;
}

export interface AccionDte {
  tipoEvento: number;
  etiqueta: string;
  ruta: (dteId: string) => string;
}

/** Solo los tipos de evento con flujo implementado (F7) tienen una acción de UI — el resto de
 * CAT-DTE-03 (presentación al cobro, protesto, anotación de autoridad) son transiciones válidas en
 * el catálogo pero sin endpoint todavía (ver docs/ESTADO.md, "Pendiente" de F7). El SET de acciones
 * mostradas siempre se calcula filtrando por la matriz — nunca se hardcodea qué botón mostrar por
 * estado, solo qué tipos de evento ya tienen ruta implementada. */
const ACCIONES_IMPLEMENTADAS: Record<number, { etiqueta: string; ruta: (dteId: string) => string; roles: string[] }> = {
  3: { etiqueta: 'Endosar', ruta: (id) => `/dte/${id}/endosar`, roles: ['TENEDOR', 'DEUDOR', 'ADMIN_PSDTE'] },
  4: { etiqueta: 'Registrar pago', ruta: (id) => `/dte/${id}/pagar`, roles: ['TENEDOR', 'DEUDOR', 'ADMIN_PSDTE'] },
  2: { etiqueta: 'Bloquear', ruta: (id) => `/dte/${id}/bloquear`, roles: ['AUTORIDAD', 'ADMIN_PSDTE'] },
  1: { etiqueta: 'Cancelar', ruta: (id) => `/dte/${id}/cancelar`, roles: ['TENEDOR', 'DEUDOR', 'ADMIN_PSDTE'] },
};

export function accionesDisponibles(estadoActual: number, transiciones: Transicion[], roles: string[]): AccionDte[] {
  const tiposDesdeEsteEstado = new Set(transiciones.filter((t) => t.estadoOrigen === estadoActual).map((t) => t.tipoEvento));
  return Object.entries(ACCIONES_IMPLEMENTADAS)
    .filter(([tipoEvento, accion]) => tiposDesdeEsteEstado.has(Number(tipoEvento)) && accion.roles.some((r) => roles.includes(r)))
    .map(([tipoEvento, accion]) => ({ tipoEvento: Number(tipoEvento), etiqueta: accion.etiqueta, ruta: accion.ruta }));
}

/** Levantamiento de bloqueo (tipo_evento 7) se resuelve como acción inline (necesita el
 * bloqueoActivoId, no una navegación a wizard) — se calcula igual desde la matriz. */
export function puedeLevantarBloqueo(estadoActual: number, transiciones: Transicion[], roles: string[]): boolean {
  const CODIGO_LEVANTAMIENTO = 7;
  return (
    (roles.includes('AUTORIDAD') || roles.includes('ADMIN_PSDTE')) &&
    transiciones.some((t) => t.estadoOrigen === estadoActual && t.tipoEvento === CODIGO_LEVANTAMIENTO)
  );
}
