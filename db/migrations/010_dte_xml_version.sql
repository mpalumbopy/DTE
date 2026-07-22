-- Up Migration
-- Versiones del XML probatorio (ver db/modelo_datos_psdte.sql sección 9). Invariante I4/I8.

CREATE TABLE psdte.dte_xml_version (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    version               INTEGER NOT NULL,
    evento_id             UUID REFERENCES psdte.dte_evento(id),
    hash_sha256           CHAR(64) NOT NULL,
    tamano_bytes          BIGINT NOT NULL,
    almacenamiento        VARCHAR(20) NOT NULL DEFAULT 'DB' CHECK (almacenamiento IN ('DB','OBJECT_STORE')),
    contenido_xml         XML,
    uri_objeto            TEXT,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dte_id, version),
    CHECK ( (almacenamiento='DB' AND contenido_xml IS NOT NULL)
         OR (almacenamiento='OBJECT_STORE' AND uri_objeto IS NOT NULL) )
);

CREATE TRIGGER trg_xml_version_append_only
    BEFORE UPDATE OR DELETE ON psdte.dte_xml_version
    FOR EACH ROW EXECUTE FUNCTION psdte.fn_bloquear_modificacion();

-- Down Migration
DROP TRIGGER IF EXISTS trg_xml_version_append_only ON psdte.dte_xml_version;
DROP TABLE IF EXISTS psdte.dte_xml_version;
