-- CAT-DTE-05 (actos externos) y CAT-DTE-06 (causales de bloqueo), usados desde F7 (Eventos).

INSERT INTO psdte.cat_causal_bloqueo (codigo, nombre, descripcion, origen) VALUES
    (1, 'ORDEN_JUDICIAL', 'Medida cautelar ordenada por juzgado competente', 'JUDICIAL'),
    (2, 'ORDEN_ADMINISTRATIVA', 'Medida ordenada por autoridad administrativa', 'ADMINISTRATIVA'),
    (3, 'INCIDENCIA_OPERATIVA', 'Bloqueo preventivo por incidencia detectada por el PSDTE', 'OPERATIVA')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO psdte.cat_acto_externo (codigo, nombre, descripcion, requiere_autoridad) VALUES
    (1, 'PRESENTACION_COBRO', 'Presentación al deudor para pago', FALSE),
    (2, 'PROTESTO', 'Protesto por falta de pago', TRUE)
ON CONFLICT (codigo) DO NOTHING;
