-- Up Migration
-- Personas e intervinientes (ver db/modelo_datos_psdte.sql sección 4).

CREATE TABLE psdte.persona (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona          SMALLINT NOT NULL CHECK (tipo_persona IN (1, 2)),
    nombres_apellidos     VARCHAR(200),
    razon_social          VARCHAR(200),
    tipo_documento        SMALLINT NOT NULL REFERENCES psdte.cat_tipo_documento_identidad(codigo),
    numero_documento      VARCHAR(30) NOT NULL,
    pais_documento        SMALLINT NOT NULL REFERENCES psdte.cat_pais(codigo),
    ruc                   VARCHAR(20),
    email                 VARCHAR(160),
    telefono              VARCHAR(30),
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo_documento, numero_documento, pais_documento),
    CHECK ( (tipo_persona = 1 AND nombres_apellidos IS NOT NULL)
         OR (tipo_persona = 2 AND razon_social IS NOT NULL) )
);

ALTER TABLE psdte.usuario
    ADD CONSTRAINT fk_usuario_persona FOREIGN KEY (persona_id) REFERENCES psdte.persona(id);

CREATE TABLE psdte.persona_direccion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id            UUID NOT NULL REFERENCES psdte.persona(id),
    direccion             VARCHAR(200) NOT NULL,
    numero_casa           VARCHAR(20),
    ciudad_codigo         SMALLINT REFERENCES psdte.cat_ciudad(codigo),
    distrito_codigo       SMALLINT REFERENCES psdte.cat_distrito(codigo),
    departamento_codigo   SMALLINT REFERENCES psdte.cat_departamento(codigo),
    pais_codigo           SMALLINT REFERENCES psdte.cat_pais(codigo),
    principal             BOOLEAN NOT NULL DEFAULT TRUE
);

-- Down Migration
DROP TABLE IF EXISTS psdte.persona_direccion;
ALTER TABLE psdte.usuario DROP CONSTRAINT IF EXISTS fk_usuario_persona;
DROP TABLE IF EXISTS psdte.persona;
