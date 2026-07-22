-- Up Migration
-- Control exclusivo: tenencia (ver db/modelo_datos_psdte.sql sección 6). Invariante I2.

CREATE TABLE psdte.dte_tenencia (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    persona_id            UUID NOT NULL REFERENCES psdte.persona(id),
    origen                VARCHAR(30) NOT NULL CHECK (origen IN ('EMISION','ENDOSO','ORDEN_AUTORIDAD')),
    evento_id             UUID,
    desde                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    hasta                 TIMESTAMPTZ,
    CHECK (hasta IS NULL OR hasta > desde)
);

CREATE UNIQUE INDEX uq_tenencia_vigente ON psdte.dte_tenencia(dte_id) WHERE hasta IS NULL;

ALTER TABLE psdte.dte_tenencia ADD CONSTRAINT excl_tenencia_solapada
    EXCLUDE USING gist (
        dte_id WITH =,
        tstzrange(desde, COALESCE(hasta, 'infinity'::timestamptz)) WITH &&
    );

-- Down Migration
DROP TABLE IF EXISTS psdte.dte_tenencia;
