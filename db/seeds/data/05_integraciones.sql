-- Una fila por tipo de integración en modo SIMULADOR (ver docs/PLAN.md sección 4.2 y 6).
-- Configuración real (URL/auth/mapeo) se carga luego desde /admin/integraciones (F10).

INSERT INTO psdte.integracion_ws (tipo, nombre, modo, base_url, endpoints, auth_tipo) VALUES
    ('FIRMA', 'Simulador de Firma XAdES-T', 'SIMULADOR', NULL, '{}'::jsonb, 'NONE'),
    ('TSA', 'Simulador de Sello de Tiempo (RFC 3161)', 'SIMULADOR', NULL, '{}'::jsonb, 'NONE'),
    ('OCSP', 'Simulador de Validación OCSP', 'SIMULADOR', NULL, '{}'::jsonb, 'NONE'),
    ('CRL', 'Simulador de Listas de Revocación', 'SIMULADOR', NULL, '{}'::jsonb, 'NONE'),
    ('TSL', 'Simulador de Trusted List (TSL-PY)', 'SIMULADOR', NULL, '{}'::jsonb, 'NONE'),
    ('NOTIF_EMAIL', 'MailHog (desarrollo)', 'SIMULADOR', 'smtp://localhost:1025', '{}'::jsonb, 'NONE')
ON CONFLICT (tipo, nombre) DO NOTHING;
