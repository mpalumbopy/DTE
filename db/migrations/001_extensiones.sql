-- Up Migration
-- Ver db/modelo_datos_psdte.sql sección 0 (DDL de referencia).

CREATE SCHEMA IF NOT EXISTS psdte;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Función de guarda append-only (usada por varias tablas en migraciones posteriores).
CREATE OR REPLACE FUNCTION psdte.fn_bloquear_modificacion() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Tabla append-only: % no permite %', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

-- Down Migration
DROP FUNCTION IF EXISTS psdte.fn_bloquear_modificacion();
DROP SCHEMA IF EXISTS psdte CASCADE;
