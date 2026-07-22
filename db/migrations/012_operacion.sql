-- Up Migration
-- Consulta, verificación, exportación y notificaciones (ver db/modelo_datos_psdte.sql secciones 11-12).

CREATE TABLE psdte.consulta_verificacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID REFERENCES psdte.dte(id),
    id_dte_consultado     VARCHAR(40) NOT NULL,
    nivel_codigo          SMALLINT NOT NULL REFERENCES psdte.cat_nivel_consulta(codigo),
    usuario_id            UUID REFERENCES psdte.usuario(id),
    ip                    INET,
    resultado             VARCHAR(30) NOT NULL,
    detalle               JSONB,
    consultado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consulta_dte ON psdte.consulta_verificacion(dte_id, consultado_en);

CREATE TABLE psdte.exportacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    xml_version_id        UUID NOT NULL REFERENCES psdte.dte_xml_version(id),
    tipo                  VARCHAR(20) NOT NULL CHECK (tipo IN ('PDF_A','CONTENEDOR')),
    hash_sha256           CHAR(64) NOT NULL,
    manifiesto            JSONB NOT NULL,
    uri_objeto            TEXT NOT NULL,
    solicitado_por        UUID REFERENCES psdte.usuario(id),
    generado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE psdte.notificacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_codigo           SMALLINT NOT NULL REFERENCES psdte.cat_tipo_notificacion(codigo),
    dte_id                UUID REFERENCES psdte.dte(id),
    evento_id             UUID REFERENCES psdte.dte_evento(id),
    destinatario_persona_id UUID REFERENCES psdte.persona(id),
    destino               VARCHAR(200) NOT NULL,
    asunto                VARCHAR(200),
    cuerpo                TEXT,
    estado                VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN
        ('PENDIENTE','ENVIADA','ENTREGADA','FALLIDA','ACUSADA')),
    intentos              SMALLINT NOT NULL DEFAULT 0,
    enviada_en            TIMESTAMPTZ,
    acusada_en            TIMESTAMPTZ,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS psdte.notificacion;
DROP TABLE IF EXISTS psdte.exportacion;
DROP TABLE IF EXISTS psdte.consulta_verificacion;
