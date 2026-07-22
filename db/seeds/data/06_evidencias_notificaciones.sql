-- CAT-DTE-07 (evidencias) y CAT-DTE-09 (notificaciones), usados desde F6 (Emisión).
-- Códigos observados/derivados del XML de referencia y de docs/PLAN.md sección 6.3/9.

INSERT INTO psdte.cat_tipo_evidencia (codigo, nombre, descripcion) VALUES
    (1, 'XML_FIRMADO', 'Versión completa del XML firmado del DTE (dte_xml_version)'),
    (2, 'SELLO_TIEMPO', 'Token TSA (RFC 3161) embebido en una firma XAdES-T'),
    (3, 'REVOCACION_OCSP_CRL', 'Respuesta de verificación de revocación consultada al firmar'),
    (4, 'TSL_SNAPSHOT', 'Snapshot de la Trusted List (TSL-PY) al momento de validar'),
    (5, 'MANIFIESTO_EXPORTACION', 'Manifiesto de un contenedor de exportación probatoria')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_tipo_notificacion (codigo, nombre, canal, requiere_acuse) VALUES
    (1, 'EMISION_CONFIRMADA', 'SISTEMA', FALSE),
    (2, 'ENDOSO_REGISTRADO', 'SISTEMA', FALSE),
    (3, 'PAGO_REGISTRADO', 'SISTEMA', FALSE),
    (4, 'BLOQUEO_APLICADO', 'SISTEMA', FALSE),
    (5, 'DTE_CANCELADO', 'SISTEMA', FALSE)
ON CONFLICT (codigo) DO NOTHING;
