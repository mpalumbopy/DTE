-- Up Migration
-- Capa de integraciones configurables (ver docs/PLAN.md sección 4.1): firma/TSA/OCSP/CRL/TSL/notif.

CREATE TABLE psdte.integracion_ws (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo              VARCHAR(20) NOT NULL CHECK (tipo IN ('FIRMA','TSA','OCSP','CRL','TSL','NOTIF_EMAIL')),
    nombre            VARCHAR(80) NOT NULL,
    modo              VARCHAR(12) NOT NULL DEFAULT 'SIMULADOR' CHECK (modo IN ('SIMULADOR','REAL','DESHABILITADO')),
    base_url          TEXT,
    endpoints         JSONB NOT NULL DEFAULT '{}'::jsonb,
    auth_tipo         VARCHAR(12) NOT NULL DEFAULT 'NONE' CHECK (auth_tipo IN ('NONE','BASIC','BEARER','API_KEY','MTLS')),
    credenciales_cifradas TEXT,
    mtls_cert_cifrado TEXT,
    mtls_key_cifrada  TEXT,
    headers_extra     JSONB NOT NULL DEFAULT '{}'::jsonb,
    timeout_ms        INTEGER NOT NULL DEFAULT 15000,
    reintentos        SMALLINT NOT NULL DEFAULT 3,
    backoff_ms        INTEGER NOT NULL DEFAULT 2000,
    mapeo_payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    verificar_tls     BOOLEAN NOT NULL DEFAULT TRUE,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_test       JSONB,
    actualizado_por   UUID REFERENCES psdte.usuario(id),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo, nombre)
);

CREATE UNIQUE INDEX uq_integracion_activa_por_tipo
    ON psdte.integracion_ws(tipo) WHERE modo <> 'DESHABILITADO' AND activo;

CREATE TABLE psdte.integracion_ws_historial (
    id                BIGSERIAL PRIMARY KEY,
    integracion_id    UUID NOT NULL REFERENCES psdte.integracion_ws(id),
    cambio            JSONB NOT NULL,
    usuario_id        UUID REFERENCES psdte.usuario(id),
    ocurrido_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE psdte.solicitud_firma (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id            UUID REFERENCES psdte.dte(id),
    ambito            VARCHAR(30) NOT NULL,
    nodo_ref          VARCHAR(80) NOT NULL,
    firmante_persona_id UUID NOT NULL REFERENCES psdte.persona(id),
    rol_firmante      VARCHAR(30) NOT NULL,
    estado            VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','ENVIADA','FIRMADA','RECHAZADA','EXPIRADA','ERROR')),
    provider_ref      TEXT,
    xml_a_firmar_hash CHAR(64) NOT NULL,
    resultado         JSONB,
    expira_en         TIMESTAMPTZ NOT NULL,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitud_firma_pend ON psdte.solicitud_firma(estado) WHERE estado IN ('PENDIENTE','ENVIADA');

CREATE TABLE psdte.parametro_sistema (
    clave             VARCHAR(60) PRIMARY KEY,
    valor             JSONB NOT NULL,
    descripcion       TEXT,
    editable          BOOLEAN NOT NULL DEFAULT TRUE,
    actualizado_por   UUID REFERENCES psdte.usuario(id),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS psdte.parametro_sistema;
DROP TABLE IF EXISTS psdte.solicitud_firma;
DROP TABLE IF EXISTS psdte.integracion_ws_historial;
DROP TABLE IF EXISTS psdte.integracion_ws;
