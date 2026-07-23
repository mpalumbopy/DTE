/** Nombres de cola (sección 9 del plan) — compartidos entre el registro de colas, los
 * procesadores y el scheduler para no repetir strings mágicos. */
export const COLA_RESELLADO_LTV = 'resellado-ltv';
export const COLA_RECONCILIACION = 'reconciliacion';
export const COLA_NOTIFICACIONES = 'notificaciones';
export const COLA_VENCIMIENTOS_PROXIMOS = 'vencimientos-proximos';

export const TODAS_LAS_COLAS = [COLA_RESELLADO_LTV, COLA_RECONCILIACION, COLA_NOTIFICACIONES, COLA_VENCIMIENTOS_PROXIMOS];
