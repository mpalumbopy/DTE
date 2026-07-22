-- Parámetros generales editables desde /admin/parametros (ver docs/PLAN.md sección 4.2).
-- Los valores de psdte.datos son placeholders: se completan desde la UI antes de operar en producción.

INSERT INTO psdte.parametro_sistema (clave, valor, descripcion, editable) VALUES
    ('psdte.datos', '{
        "nombre": "PSDTE Demo",
        "nombre_fantasia": "PSDTE Demo",
        "ruc": "80000000-0",
        "resolucion_mic": "0391/2026",
        "telefono": "+595 21 000-000",
        "email": "contacto@psdte.example.py",
        "sitio_web": "https://psdte.example.py"
    }'::jsonb, 'Datos del PSDTE mostrados en el XML, PDF/A y exportaciones', TRUE),

    ('verificacion.base_url', '"http://localhost:3000/verificar"'::jsonb,
        'Base pública para el enlaceQRDTE de verificación', TRUE),

    ('exportacion.retencion_dias', '3650'::jsonb,
        'Días mínimos de conservación de exportaciones (preservación >= 10 años)', TRUE),

    ('ltv.resello_meses', '12'::jsonb,
        'Periodicidad de resellado LTV (agilidad criptográfica) en meses', TRUE),

    ('password.politica', '{
        "minLength": 12,
        "requireUpper": true,
        "requireLower": true,
        "requireNumber": true,
        "requireSymbol": true,
        "maxAgeDays": 180
    }'::jsonb, 'Política de contraseñas aplicada en alta/cambio de usuario', TRUE),

    ('psdte.fecha_autorizacion', '"20260101"'::jsonb,
        'Fecha de autorización (AAAAMMDD) usada por IdDteService (ver plan sección 5.3)', TRUE)
ON CONFLICT (clave) DO NOTHING;
