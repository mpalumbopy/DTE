// GENERADO AUTOMÁTICAMENTE por db/seeds/generar-tipos-compartidos.ts — no editar a mano.
// Fuente: catálogos CAT-DTE-01..10 sembrados desde db/seeds/data/*.sql.

export const CAT_ESTADO_DTE = {
  EMITIDO: 1,
  ENDOSADO: 2,
  PRESENTADO_AL_COBRO: 3,
  PAGADO_PARCIAL: 4,
  PAGADO_TOTAL: 5,
  PROTESTADO: 6,
  BLOQUEADO: 7,
  CANCELADO: 8,
  VENCIDO: 9,
} as const;
export type CodigoEstadoDte = (typeof CAT_ESTADO_DTE)[keyof typeof CAT_ESTADO_DTE];

export const CAT_TIPO_EVENTO = {
  CANCELACION: 1,
  BLOQUEO: 2,
  ENDOSO: 3,
  PAGO: 4,
  PRESENTACION_COBRO: 5,
  PROTESTO: 6,
  LEVANTAMIENTO_BLOQUEO: 7,
  ANOTACION_AUTORIDAD: 8,
} as const;
export type CodigoTipoEvento = (typeof CAT_TIPO_EVENTO)[keyof typeof CAT_TIPO_EVENTO];

export const CAT_ROL_CODIGOS = [
  'ADMIN_PSDTE',
  'AUDITOR',
  'AUTORIDAD',
  'CONSULTA_PUBLICA',
  'DEUDOR',
  'OPERADOR_EMISION',
  'TENEDOR',
] as const;
export type CodigoRol = (typeof CAT_ROL_CODIGOS)[number];

export const CAT_ERROR_CODIGOS = [
  'ERR-AUTH-001',
  'ERR-AUTH-002',
  'ERR-AUTH-003',
  'ERR-AUTH-004',
  'ERR-AUTH-005',
  'ERR-CONC-001',
  'ERR-CTRL-001',
  'ERR-DTE-403',
  'ERR-DTE-404',
  'ERR-DTE-409',
  'ERR-ESTADO-001',
  'ERR-ESTADO-002',
  'ERR-ESTADO-003',
  'ERR-FIRMA-001',
  'ERR-FIRMA-002',
  'ERR-FIRMA-003',
  'ERR-FIRMA-004',
  'ERR-PARAM-403',
  'ERR-PARAM-404',
  'ERR-PERSONA-409',
  'ERR-PKI-503',
  'ERR-SEM-001',
  'ERR-SEM-002',
  'ERR-SISTEMA-001',
  'ERR-XSD-001',
] as const;
export type CodigoError = (typeof CAT_ERROR_CODIGOS)[number];

export const CAT_PERMISO_CODIGOS = [
  'AUDITORIA_CONSULTAR',
  'CATALOGOS_CONSULTAR',
  'DTE_BLOQUEAR',
  'DTE_CANCELAR',
  'DTE_CONSULTAR',
  'DTE_EMITIR',
  'DTE_ENDOSAR',
  'DTE_EXPORTAR',
  'DTE_PAGAR',
  'INTEGRACIONES_GESTIONAR',
  'PARAMETROS_GESTIONAR',
  'USUARIOS_GESTIONAR',
] as const;
export type CodigoPermiso = (typeof CAT_PERMISO_CODIGOS)[number];
