-- CAT-DTE-07 (evidencias) y CAT-DTE-09 (notificaciones), usados desde F6 (Emisión).
-- Códigos observados/derivados del XML de referencia y de docs/PLAN.md sección 6.3/9.

INSERT INTO psdte.cat_tipo_evidencia (codigo, nombre, descripcion) VALUES
    (1, 'XML_FIRMADO', 'Versión completa del XML firmado del DTE (dte_xml_version)'),
    (2, 'SELLO_TIEMPO', 'Token TSA (RFC 3161) embebido en una firma XAdES-T'),
    (3, 'REVOCACION_OCSP_CRL', 'Respuesta de verificación de revocación consultada al firmar'),
    (4, 'TSL_SNAPSHOT', 'Snapshot de la Trusted List (TSL-PY) al momento de validar'),
    (5, 'MANIFIESTO_EXPORTACION', 'Manifiesto de un contenedor de exportación probatoria')
ON CONFLICT (codigo) DO NOTHING;

-- F11: los 6 tipos de email de docs/PLAN.md sección 11 (emisión, solicitud de firma, endoso
-- recibido, pago, bloqueo, vencimiento próximo) + DTE_CANCELADO (ya observado en el catálogo desde
-- F6). DO UPDATE (no DO NOTHING): re-sembrar debe corregir canal/requiere_acuse de filas ya
-- creadas por una versión anterior de este seed (venían en 'SISTEMA', ver ADR F11).
INSERT INTO psdte.cat_tipo_notificacion (codigo, nombre, canal, requiere_acuse) VALUES
    (1, 'EMISION_CONFIRMADA', 'EMAIL', TRUE),
    (2, 'ENDOSO_REGISTRADO', 'EMAIL', TRUE),
    (3, 'PAGO_REGISTRADO', 'EMAIL', FALSE),
    (4, 'BLOQUEO_APLICADO', 'EMAIL', TRUE),
    (5, 'DTE_CANCELADO', 'EMAIL', FALSE),
    (6, 'SOLICITUD_FIRMA', 'EMAIL', TRUE),
    (7, 'VENCIMIENTO_PROXIMO', 'EMAIL', FALSE)
ON CONFLICT (codigo) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    canal = EXCLUDED.canal,
    requiere_acuse = EXCLUDED.requiere_acuse;
