-- CAT-DTE-04: roles y permisos. El DDL de referencia no trae seeds para estas tablas
-- (solo los nombres de ejemplo en el comentario de cat_rol); contenido propio, ver
-- docs/DECISIONES.md ADR-003.

INSERT INTO psdte.cat_rol (codigo, nombre, descripcion, nivel_acceso) VALUES
    ('ADMIN_PSDTE', 'Administrador PSDTE', 'Gestión de usuarios, parámetros e integraciones; no opera DTE', 4),
    ('OPERADOR_EMISION', 'Operador de emisión', 'Emite y consulta pagarés electrónicos', 2),
    ('TENEDOR', 'Tenedor', 'Parte tenedora/controladora vigente de uno o más DTE', 2),
    ('DEUDOR', 'Deudor', 'Parte obligada al pago de uno o más DTE', 2),
    ('AUTORIDAD', 'Autoridad', 'Autoridad judicial/administrativa: bloqueos y consulta ampliada', 3),
    ('AUDITOR', 'Auditor', 'Auditoría interna / OEC: solo lectura sobre todo el sistema', 4),
    ('CONSULTA_PUBLICA', 'Consulta pública', 'Verificación pública sin autenticación (rol lógico, no asignable)', 1)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_permiso (codigo, descripcion) VALUES
    ('DTE_EMITIR', 'Emitir un nuevo pagaré electrónico'),
    ('DTE_ENDOSAR', 'Iniciar o firmar un endoso'),
    ('DTE_PAGAR', 'Registrar un pago'),
    ('DTE_BLOQUEAR', 'Registrar o levantar un bloqueo de autoridad'),
    ('DTE_CANCELAR', 'Cancelar/extinguir un DTE'),
    ('DTE_CONSULTAR', 'Consultar el detalle y timeline de un DTE'),
    ('DTE_EXPORTAR', 'Exportar PDF/A o contenedor probatorio'),
    ('USUARIOS_GESTIONAR', 'Gestionar usuarios y roles'),
    ('INTEGRACIONES_GESTIONAR', 'Gestionar integraciones (firma/TSA/OCSP/CRL/TSL/notificaciones)'),
    ('PARAMETROS_GESTIONAR', 'Gestionar parámetros generales del sistema'),
    ('AUDITORIA_CONSULTAR', 'Consultar auditoría e incidencias'),
    ('CATALOGOS_CONSULTAR', 'Consultar catálogos del sistema')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_rol_permiso (rol_codigo, permiso_codigo) VALUES
    ('ADMIN_PSDTE', 'USUARIOS_GESTIONAR'),
    ('ADMIN_PSDTE', 'INTEGRACIONES_GESTIONAR'),
    ('ADMIN_PSDTE', 'PARAMETROS_GESTIONAR'),
    ('ADMIN_PSDTE', 'CATALOGOS_CONSULTAR'),
    ('OPERADOR_EMISION', 'DTE_EMITIR'),
    ('OPERADOR_EMISION', 'DTE_CONSULTAR'),
    ('OPERADOR_EMISION', 'DTE_EXPORTAR'),
    ('OPERADOR_EMISION', 'CATALOGOS_CONSULTAR'),
    ('TENEDOR', 'DTE_ENDOSAR'),
    ('TENEDOR', 'DTE_CANCELAR'),
    ('TENEDOR', 'DTE_CONSULTAR'),
    ('TENEDOR', 'DTE_EXPORTAR'),
    ('TENEDOR', 'CATALOGOS_CONSULTAR'),
    ('DEUDOR', 'DTE_PAGAR'),
    ('DEUDOR', 'DTE_CONSULTAR'),
    ('DEUDOR', 'CATALOGOS_CONSULTAR'),
    ('AUTORIDAD', 'DTE_BLOQUEAR'),
    ('AUTORIDAD', 'DTE_CONSULTAR'),
    ('AUDITOR', 'AUDITORIA_CONSULTAR'),
    ('AUDITOR', 'DTE_CONSULTAR'),
    ('AUDITOR', 'CATALOGOS_CONSULTAR')
ON CONFLICT (rol_codigo, permiso_codigo) DO NOTHING;
