-- Up Migration
-- CAT-DTE-01..10 (ver db/modelo_datos_psdte.sql sección 1).

CREATE TABLE psdte.cat_estado_dte (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(60) NOT NULL UNIQUE,
    descripcion       TEXT NOT NULL,
    es_final          BOOLEAN NOT NULL DEFAULT FALSE,
    permite_endoso    BOOLEAN NOT NULL DEFAULT FALSE,
    permite_pago      BOOLEAN NOT NULL DEFAULT FALSE,
    version_catalogo  VARCHAR(10) NOT NULL DEFAULT '1.0',
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_tipo_evento (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(60) NOT NULL UNIQUE,
    descripcion       TEXT NOT NULL,
    requiere_firma_endosante   BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_firma_endosatario BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_firma_psdte       BOOLEAN NOT NULL DEFAULT TRUE,
    version_catalogo  VARCHAR(10) NOT NULL DEFAULT '1.0',
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_transicion (
    id                SERIAL PRIMARY KEY,
    estado_origen     SMALLINT NOT NULL REFERENCES psdte.cat_estado_dte(codigo),
    tipo_evento       SMALLINT NOT NULL REFERENCES psdte.cat_tipo_evento(codigo),
    estado_destino    SMALLINT NOT NULL REFERENCES psdte.cat_estado_dte(codigo),
    condicion         TEXT,
    version_catalogo  VARCHAR(10) NOT NULL DEFAULT '1.0',
    vigente           BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (estado_origen, tipo_evento, condicion)
);

CREATE TABLE psdte.cat_rol (
    codigo            VARCHAR(30) PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    nivel_acceso      SMALLINT NOT NULL,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_permiso (
    codigo            VARCHAR(50) PRIMARY KEY,
    descripcion       TEXT NOT NULL
);

CREATE TABLE psdte.cat_rol_permiso (
    rol_codigo        VARCHAR(30) REFERENCES psdte.cat_rol(codigo),
    permiso_codigo    VARCHAR(50) REFERENCES psdte.cat_permiso(codigo),
    PRIMARY KEY (rol_codigo, permiso_codigo)
);

CREATE TABLE psdte.cat_acto_externo (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    requiere_autoridad BOOLEAN NOT NULL DEFAULT TRUE,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_causal_bloqueo (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    origen            VARCHAR(20) NOT NULL CHECK (origen IN ('JUDICIAL','ADMINISTRATIVA','OPERATIVA')),
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_tipo_evidencia (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_nivel_consulta (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(60) NOT NULL,
    campos_visibles   JSONB NOT NULL,
    descripcion       TEXT
);

CREATE TABLE psdte.cat_tipo_notificacion (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    canal             VARCHAR(20) NOT NULL CHECK (canal IN ('EMAIL','SMS','PUSH','SISTEMA')),
    plantilla         TEXT,
    requiere_acuse    BOOLEAN NOT NULL DEFAULT FALSE,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE psdte.cat_error (
    codigo            VARCHAR(20) PRIMARY KEY,
    http_status       SMALLINT NOT NULL,
    mensaje           TEXT NOT NULL,
    descripcion       TEXT,
    categoria         VARCHAR(30) NOT NULL CHECK (categoria IN
        ('VALIDACION_XSD','VALIDACION_SEMANTICA','FIRMA','ESTADO','AUTORIZACION',
         'CONCURRENCIA','PKI','TSA','SISTEMA')),
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Down Migration
DROP TABLE IF EXISTS psdte.cat_error;
DROP TABLE IF EXISTS psdte.cat_tipo_notificacion;
DROP TABLE IF EXISTS psdte.cat_nivel_consulta;
DROP TABLE IF EXISTS psdte.cat_tipo_evidencia;
DROP TABLE IF EXISTS psdte.cat_causal_bloqueo;
DROP TABLE IF EXISTS psdte.cat_acto_externo;
DROP TABLE IF EXISTS psdte.cat_rol_permiso;
DROP TABLE IF EXISTS psdte.cat_permiso;
DROP TABLE IF EXISTS psdte.cat_rol;
DROP TABLE IF EXISTS psdte.cat_transicion;
DROP TABLE IF EXISTS psdte.cat_tipo_evento;
DROP TABLE IF EXISTS psdte.cat_estado_dte;
