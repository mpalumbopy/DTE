-- Up Migration
-- Detalles por tipo de evento (ver db/modelo_datos_psdte.sql sección 8).

CREATE TABLE psdte.dte_endoso (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES psdte.dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    numero_endoso         SMALLINT NOT NULL,
    endosante_persona_id  UUID NOT NULL REFERENCES psdte.persona(id),
    endosante_condicion   VARCHAR(40),
    endosatario_persona_id UUID NOT NULL REFERENCES psdte.persona(id),
    texto_endoso          TEXT NOT NULL,
    UNIQUE (dte_id, numero_endoso),
    CHECK (endosante_persona_id <> endosatario_persona_id)
);

CREATE TABLE psdte.dte_pago (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES psdte.dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    numero_pago           SMALLINT NOT NULL,
    monto_pagado          NUMERIC(18,2) NOT NULL CHECK (monto_pagado > 0),
    saldo_pendiente       NUMERIC(18,2) NOT NULL CHECK (saldo_pendiente >= 0),
    medio_pago            VARCHAR(40),
    referencia_externa    VARCHAR(80),
    UNIQUE (dte_id, numero_pago)
);

CREATE TABLE psdte.dte_cancelacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES psdte.dte_evento(id),
    dte_id                UUID NOT NULL UNIQUE REFERENCES psdte.dte(id),
    motivo                TEXT NOT NULL
);

CREATE TABLE psdte.dte_bloqueo (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES psdte.dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    causal_codigo         SMALLINT NOT NULL REFERENCES psdte.cat_causal_bloqueo(codigo),
    autoridad             VARCHAR(200) NOT NULL,
    numero_oficio         VARCHAR(80),
    fecha_orden           DATE NOT NULL,
    fecha_recepcion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_aplicacion      TIMESTAMPTZ NOT NULL DEFAULT now(),
    evento_levantamiento_id UUID REFERENCES psdte.dte_evento(id),
    documento_respaldo    TEXT
);

CREATE INDEX idx_bloqueo_vigente ON psdte.dte_bloqueo(dte_id) WHERE evento_levantamiento_id IS NULL;

CREATE TABLE psdte.dte_anotacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES psdte.dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    acto_externo_codigo   SMALLINT NOT NULL REFERENCES psdte.cat_acto_externo(codigo),
    descripcion           TEXT NOT NULL,
    autoridad             VARCHAR(200),
    referencia_externa    VARCHAR(120)
);

-- Down Migration
DROP TABLE IF EXISTS psdte.dte_anotacion;
DROP TABLE IF EXISTS psdte.dte_bloqueo;
DROP TABLE IF EXISTS psdte.dte_cancelacion;
DROP TABLE IF EXISTS psdte.dte_pago;
DROP TABLE IF EXISTS psdte.dte_endoso;
