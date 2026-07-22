-- Up Migration
-- Núcleo del pagaré-DTE (ver db/modelo_datos_psdte.sql sección 5).

CREATE TABLE psdte.dte (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_dte                VARCHAR(40) NOT NULL UNIQUE,
    id_datos_generales    VARCHAR(40) NOT NULL UNIQUE,
    version_perfil        VARCHAR(10) NOT NULL DEFAULT '1.0',
    codigo_tipo_dte       SMALLINT NOT NULL,
    descripcion_tipo_dte  VARCHAR(60) NOT NULL,
    numero_dte            BIGINT NOT NULL,
    fecha_emision         TIMESTAMPTZ NOT NULL,
    fecha_vencimiento     TIMESTAMPTZ NOT NULL,
    moneda_codigo         CHAR(3) NOT NULL REFERENCES psdte.cat_moneda(codigo),
    monto                 NUMERIC(18,2) NOT NULL CHECK (monto > 0),
    monto_letras          VARCHAR(300) NOT NULL,
    texto_promesa_pago    TEXT NOT NULL,
    enlace_qr             TEXT,
    estado_actual         SMALLINT NOT NULL REFERENCES psdte.cat_estado_dte(codigo),
    saldo_pendiente       NUMERIC(18,2) NOT NULL,
    version_vigente       INTEGER NOT NULL DEFAULT 1,
    hash_vigente          CHAR(64),
    emision_direccion     VARCHAR(200) NOT NULL,
    emision_numero_casa   VARCHAR(20),
    emision_ciudad_codigo SMALLINT REFERENCES psdte.cat_ciudad(codigo),
    emision_distrito_codigo SMALLINT REFERENCES psdte.cat_distrito(codigo),
    emision_departamento_codigo SMALLINT REFERENCES psdte.cat_departamento(codigo),
    emision_pais_codigo   SMALLINT REFERENCES psdte.cat_pais(codigo),
    creado_por            UUID NOT NULL REFERENCES psdte.usuario(id),
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_vencimiento > fecha_emision),
    CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= monto)
);

CREATE INDEX idx_dte_estado ON psdte.dte(estado_actual);
CREATE INDEX idx_dte_vencimiento ON psdte.dte(fecha_vencimiento);

CREATE TABLE psdte.dte_lugar_pago (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    orden                 SMALLINT NOT NULL DEFAULT 1,
    direccion             VARCHAR(200) NOT NULL,
    numero_casa           VARCHAR(20),
    ciudad_codigo         SMALLINT REFERENCES psdte.cat_ciudad(codigo),
    distrito_codigo       SMALLINT REFERENCES psdte.cat_distrito(codigo),
    departamento_codigo   SMALLINT REFERENCES psdte.cat_departamento(codigo),
    pais_codigo           SMALLINT REFERENCES psdte.cat_pais(codigo),
    UNIQUE (dte_id, orden)
);

CREATE TABLE psdte.dte_condicion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    orden                 SMALLINT NOT NULL,
    descripcion           TEXT NOT NULL,
    UNIQUE (dte_id, orden)
);

CREATE TABLE psdte.dte_parte (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES psdte.dte(id),
    persona_id            UUID NOT NULL REFERENCES psdte.persona(id),
    rol_parte             VARCHAR(30) NOT NULL CHECK (rol_parte IN
        ('ACREEDOR_INICIAL','DEUDOR','CODEUDOR','AVALISTA','ENDOSANTE','ENDOSATARIO','TENEDOR')),
    condicion_firmante    VARCHAR(40),
    orden                 SMALLINT NOT NULL DEFAULT 1,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dte_id, rol_parte, orden)
);

CREATE INDEX idx_dte_parte_persona ON psdte.dte_parte(persona_id);

-- Down Migration
DROP TABLE IF EXISTS psdte.dte_parte;
DROP TABLE IF EXISTS psdte.dte_condicion;
DROP TABLE IF EXISTS psdte.dte_lugar_pago;
DROP TABLE IF EXISTS psdte.dte;
