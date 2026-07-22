-- Up Migration
-- Firmas, certificados y evidencias criptográficas (ver db/modelo_datos_psdte.sql sección 10). Invariante I7/I9.

CREATE TABLE psdte.certificado (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_serie          VARCHAR(80) NOT NULL,
    subject_dn            TEXT NOT NULL,
    issuer_dn             TEXT NOT NULL,
    tipo                  VARCHAR(30) NOT NULL CHECK (tipo IN ('FIRMA_CUALIFICADA','SELLO_PSDTE','TSA','CA')),
    nivel                 VARCHAR(10),
    documento_titular     VARCHAR(30),
    persona_id            UUID REFERENCES psdte.persona(id),
    valido_desde          TIMESTAMPTZ NOT NULL,
    valido_hasta          TIMESTAMPTZ NOT NULL,
    certificado_der       BYTEA NOT NULL,
    en_tsl                BOOLEAN NOT NULL DEFAULT FALSE,
    revocado              BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_revocacion      TIMESTAMPTZ,
    UNIQUE (numero_serie, issuer_dn)
);

CREATE TABLE psdte.firma (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    evento_id             UUID REFERENCES psdte.dte_evento(id),
    xml_signature_id      VARCHAR(80) NOT NULL UNIQUE,
    ambito                VARCHAR(30) NOT NULL CHECK (ambito IN
        ('DATOS_GENERALES','EVENTO','DOCUMENTO')),
    rol_firmante          VARCHAR(30) NOT NULL,
    certificado_id        UUID NOT NULL REFERENCES psdte.certificado(id),
    formato               VARCHAR(20) NOT NULL DEFAULT 'XAdES-T',
    algoritmo_firma       VARCHAR(80) NOT NULL,
    algoritmo_digest      VARCHAR(80) NOT NULL,
    signing_time          TIMESTAMPTZ NOT NULL,
    referencias           JSONB NOT NULL,
    signature_value_hash  CHAR(64) NOT NULL,
    sello_tiempo_tsa      TEXT,
    tsa_fecha             TIMESTAMPTZ,
    estado_validacion     VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_validacion IN
        ('PENDIENTE','VALIDA','INVALIDA','INDETERMINADA')),
    validada_en           TIMESTAMPTZ,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_firma_dte ON psdte.firma(dte_id);
CREATE TRIGGER trg_firma_append_only
    BEFORE UPDATE OF xml_signature_id, referencias, signature_value_hash ON psdte.firma
    FOR EACH ROW EXECUTE FUNCTION psdte.fn_bloquear_modificacion();

CREATE TABLE psdte.evidencia_revocacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificado_id        UUID NOT NULL REFERENCES psdte.certificado(id),
    firma_id              UUID REFERENCES psdte.firma(id),
    tipo                  VARCHAR(10) NOT NULL CHECK (tipo IN ('OCSP','CRL')),
    resultado             VARCHAR(20) NOT NULL CHECK (resultado IN ('GOOD','REVOKED','UNKNOWN')),
    respuesta_raw         BYTEA NOT NULL,
    consultado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE psdte.evidencia (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID REFERENCES psdte.dte(id),
    evento_id             UUID REFERENCES psdte.dte_evento(id),
    tipo_codigo           SMALLINT NOT NULL REFERENCES psdte.cat_tipo_evidencia(codigo),
    hash_sha256           CHAR(64) NOT NULL,
    contenido             BYTEA,
    uri_objeto            TEXT,
    metadatos             JSONB,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_evidencia_append_only
    BEFORE UPDATE OR DELETE ON psdte.evidencia
    FOR EACH ROW EXECUTE FUNCTION psdte.fn_bloquear_modificacion();

CREATE TABLE psdte.resellado_ltv (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    xml_version_id        UUID NOT NULL REFERENCES psdte.dte_xml_version(id),
    token_tsa             BYTEA NOT NULL,
    algoritmo             VARCHAR(40) NOT NULL,
    aplicado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    proximo_resellado     TIMESTAMPTZ NOT NULL
);

-- Down Migration
DROP TABLE IF EXISTS psdte.resellado_ltv;
DROP TRIGGER IF EXISTS trg_evidencia_append_only ON psdte.evidencia;
DROP TABLE IF EXISTS psdte.evidencia;
DROP TABLE IF EXISTS psdte.evidencia_revocacion;
DROP TRIGGER IF EXISTS trg_firma_append_only ON psdte.firma;
DROP TABLE IF EXISTS psdte.firma;
DROP TABLE IF EXISTS psdte.certificado;
