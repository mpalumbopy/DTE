-- Up Migration
-- Registro append-only de eventos (ver db/modelo_datos_psdte.sql sección 7). Invariantes I4, I5.

CREATE TABLE psdte.dte_evento (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    id_evento_xml         VARCHAR(50) NOT NULL UNIQUE,
    secuencia             INTEGER NOT NULL,
    numero_evento         VARCHAR(10) NOT NULL,
    tipo_evento           SMALLINT NOT NULL REFERENCES psdte.cat_tipo_evento(codigo),
    fecha_evento          TIMESTAMPTZ NOT NULL,
    fecha_registro        TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_usuario_id      UUID REFERENCES psdte.usuario(id),
    actor_descripcion     VARCHAR(200) NOT NULL,
    rol_actor             VARCHAR(30) NOT NULL,
    estado_previo         SMALLINT NOT NULL REFERENCES psdte.cat_estado_dte(codigo),
    estado_resultante     SMALLINT NOT NULL REFERENCES psdte.cat_estado_dte(codigo),
    payload               JSONB NOT NULL,
    hash_evento           CHAR(64) NOT NULL,
    hash_anterior         CHAR(64),
    ip_origen             INET,
    UNIQUE (dte_id, secuencia)
);

CREATE INDEX idx_evento_dte ON psdte.dte_evento(dte_id, secuencia);
CREATE INDEX idx_evento_tipo ON psdte.dte_evento(tipo_evento);
CREATE INDEX idx_evento_payload ON psdte.dte_evento USING gin(payload);

ALTER TABLE psdte.dte_tenencia
    ADD CONSTRAINT fk_tenencia_evento FOREIGN KEY (evento_id) REFERENCES psdte.dte_evento(id);

CREATE TRIGGER trg_evento_append_only
    BEFORE UPDATE OR DELETE ON psdte.dte_evento
    FOR EACH ROW EXECUTE FUNCTION psdte.fn_bloquear_modificacion();

-- Down Migration
DROP TRIGGER IF EXISTS trg_evento_append_only ON psdte.dte_evento;
ALTER TABLE psdte.dte_tenencia DROP CONSTRAINT IF EXISTS fk_tenencia_evento;
DROP TABLE IF EXISTS psdte.dte_evento;
