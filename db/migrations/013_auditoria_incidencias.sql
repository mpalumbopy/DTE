-- Up Migration
-- Auditoría general encadenada e incidencias (ver db/modelo_datos_psdte.sql secciones 13-14). Invariante I5.

CREATE TABLE psdte.auditoria_log (
    id                    BIGSERIAL PRIMARY KEY,
    ocurrido_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id            UUID REFERENCES psdte.usuario(id),
    accion                VARCHAR(60) NOT NULL,
    entidad               VARCHAR(60),
    entidad_id            TEXT,
    ip                    INET,
    user_agent            TEXT,
    detalle               JSONB,
    hash_registro         CHAR(64) NOT NULL,
    hash_anterior         CHAR(64)
);

CREATE TRIGGER trg_auditoria_append_only
    BEFORE UPDATE OR DELETE ON psdte.auditoria_log
    FOR EACH ROW EXECUTE FUNCTION psdte.fn_bloquear_modificacion();

CREATE INDEX idx_auditoria_fecha ON psdte.auditoria_log(ocurrido_en);
CREATE INDEX idx_auditoria_entidad ON psdte.auditoria_log(entidad, entidad_id);

CREATE TABLE psdte.incidencia (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_codigo          VARCHAR(20) REFERENCES psdte.cat_error(codigo),
    dte_id                UUID REFERENCES psdte.dte(id),
    endpoint              VARCHAR(120),
    request_id            UUID,
    detalle               JSONB,
    severidad             VARCHAR(10) NOT NULL DEFAULT 'MEDIA' CHECK (severidad IN ('BAJA','MEDIA','ALTA','CRITICA')),
    estado                VARCHAR(20) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','EN_ANALISIS','RESUELTA','CERRADA')),
    ocurrido_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelto_en           TIMESTAMPTZ
);

-- Down Migration
DROP TABLE IF EXISTS psdte.incidencia;
DROP TRIGGER IF EXISTS trg_auditoria_append_only ON psdte.auditoria_log;
DROP TABLE IF EXISTS psdte.auditoria_log;
