-- Up Migration
-- Catálogos geográficos y de identidad (ver db/modelo_datos_psdte.sql sección 2).

CREATE TABLE psdte.cat_pais (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL
);

CREATE TABLE psdte.cat_departamento (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    pais_codigo       SMALLINT NOT NULL REFERENCES psdte.cat_pais(codigo)
);

CREATE TABLE psdte.cat_distrito (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    departamento_codigo SMALLINT NOT NULL REFERENCES psdte.cat_departamento(codigo)
);

CREATE TABLE psdte.cat_ciudad (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    distrito_codigo   SMALLINT NOT NULL REFERENCES psdte.cat_distrito(codigo)
);

CREATE TABLE psdte.cat_moneda (
    codigo            CHAR(3) PRIMARY KEY,
    descripcion       VARCHAR(40) NOT NULL
);

CREATE TABLE psdte.cat_tipo_documento_identidad (
    codigo            SMALLINT PRIMARY KEY,
    sigla             VARCHAR(10) NOT NULL,
    descripcion       VARCHAR(60) NOT NULL
);

-- Down Migration
DROP TABLE IF EXISTS psdte.cat_tipo_documento_identidad;
DROP TABLE IF EXISTS psdte.cat_moneda;
DROP TABLE IF EXISTS psdte.cat_ciudad;
DROP TABLE IF EXISTS psdte.cat_distrito;
DROP TABLE IF EXISTS psdte.cat_departamento;
DROP TABLE IF EXISTS psdte.cat_pais;
