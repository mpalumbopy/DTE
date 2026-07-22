-- ============================================================================
-- SISTEMA PSDTE - PAGARÉ ELECTRÓNICO (DTE)
-- Modelo de Base de Datos - PostgreSQL 15+
-- Versión 1.0 - Basado en ERS v1.1, DOC-DTE-01 v2.0 y XML de ejemplo
-- (namespace http://acraiz.gov.py/pagare/arhivos-en-xsd)
-- ============================================================================
-- Principios de diseño:
--  1. Registro append-only de eventos y auditoría (triggers bloquean UPDATE/DELETE)
--  2. Control exclusivo: un único tenedor/controlador vigente por DTE
--     (índice único parcial)
--  3. Singularidad: ID-DTE único e irrepetible (UNIQUE + sin reutilización)
--  4. Trazabilidad: hash encadenado en eventos y auditoría
--  5. El XML firmado es la fuente de verdad jurídica; las tablas relacionales
--     son la proyección operativa para consultas, validaciones y UI
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS psdte;
SET search_path TO psdte;

CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;    -- exclusion constraints

-- ============================================================================
-- 1. CATÁLOGOS (CAT-DTE-01 a CAT-DTE-10)
--    Todos versionados: los catálogos gobiernan validaciones, estados,
--    eventos, rechazos, API, UI, auditoría y pruebas.
-- ============================================================================

-- CAT-DTE-01: Estados del pagaré-DTE
CREATE TABLE cat_estado_dte (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(60) NOT NULL UNIQUE,
    descripcion       TEXT NOT NULL,
    es_final          BOOLEAN NOT NULL DEFAULT FALSE,
    permite_endoso    BOOLEAN NOT NULL DEFAULT FALSE,
    permite_pago      BOOLEAN NOT NULL DEFAULT FALSE,
    version_catalogo  VARCHAR(10) NOT NULL DEFAULT '1.0',
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- CAT-DTE-02: Eventos del ciclo de vida
-- Códigos observados en el XML de ejemplo: 1=CANCELACION DEL DTE, 3=ENDOSO, 4=PAGO
CREATE TABLE cat_tipo_evento (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(60) NOT NULL UNIQUE,
    descripcion       TEXT NOT NULL,
    requiere_firma_endosante   BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_firma_endosatario BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_firma_psdte       BOOLEAN NOT NULL DEFAULT TRUE,
    version_catalogo  VARCHAR(10) NOT NULL DEFAULT '1.0',
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- CAT-DTE-03: Matriz de transiciones críticas (estado_origen + evento -> estado_destino)
CREATE TABLE cat_transicion (
    id                SERIAL PRIMARY KEY,
    estado_origen     SMALLINT NOT NULL REFERENCES cat_estado_dte(codigo),
    tipo_evento       SMALLINT NOT NULL REFERENCES cat_tipo_evento(codigo),
    estado_destino    SMALLINT NOT NULL REFERENCES cat_estado_dte(codigo),
    condicion         TEXT,              -- regla semántica adicional (ej.: saldo = 0)
    version_catalogo  VARCHAR(10) NOT NULL DEFAULT '1.0',
    vigente           BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (estado_origen, tipo_evento, condicion)
);

-- CAT-DTE-04: Roles, permisos y niveles de acceso
CREATE TABLE cat_rol (
    codigo            VARCHAR(30) PRIMARY KEY,   -- ADMIN_PSDTE, OPERADOR_EMISION, TENEDOR, DEUDOR, AUDITOR, AUTORIDAD, CONSULTA_PUBLICA...
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    nivel_acceso      SMALLINT NOT NULL,          -- vincula con CAT-DTE-08
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cat_permiso (
    codigo            VARCHAR(50) PRIMARY KEY,   -- DTE_EMITIR, DTE_ENDOSAR, DTE_BLOQUEAR, DTE_CONSULTAR...
    descripcion       TEXT NOT NULL
);

CREATE TABLE cat_rol_permiso (
    rol_codigo        VARCHAR(30) REFERENCES cat_rol(codigo),
    permiso_codigo    VARCHAR(50) REFERENCES cat_permiso(codigo),
    PRIMARY KEY (rol_codigo, permiso_codigo)
);

-- CAT-DTE-05: Actos externos y anotaciones (protesto, oficio judicial, etc.)
CREATE TABLE cat_acto_externo (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    requiere_autoridad BOOLEAN NOT NULL DEFAULT TRUE,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- CAT-DTE-06: Causales de bloqueo y conservación reforzada
CREATE TABLE cat_causal_bloqueo (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    descripcion       TEXT,
    origen            VARCHAR(20) NOT NULL CHECK (origen IN ('JUDICIAL','ADMINISTRATIVA','OPERATIVA')),
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- CAT-DTE-07: Evidencias, firmas, sellos y validaciones
CREATE TABLE cat_tipo_evidencia (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,      -- FIRMA_XADES, SELLO_PSDTE, SELLO_TIEMPO, OCSP, CRL, TSL, HASH, MANIFIESTO, PDF_A, CONTENEDOR
    descripcion       TEXT,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- CAT-DTE-08: Niveles de consulta y verificación
CREATE TABLE cat_nivel_consulta (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(60) NOT NULL,      -- PUBLICO, INTERVINIENTE, AUTORIDAD, AUDITOR
    campos_visibles   JSONB NOT NULL,            -- lista de campos expuestos por nivel
    descripcion       TEXT
);

-- CAT-DTE-09: Notificaciones y acuses
CREATE TABLE cat_tipo_notificacion (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    canal             VARCHAR(20) NOT NULL CHECK (canal IN ('EMAIL','SMS','PUSH','SISTEMA')),
    plantilla         TEXT,
    requiere_acuse    BOOLEAN NOT NULL DEFAULT FALSE,
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- CAT-DTE-10: Errores técnicos, rechazos e incidencias API
CREATE TABLE cat_error (
    codigo            VARCHAR(20) PRIMARY KEY,   -- ej.: ERR-XSD-001, ERR-FIRMA-002, ERR-ESTADO-003
    http_status       SMALLINT NOT NULL,
    mensaje           TEXT NOT NULL,
    descripcion       TEXT,
    categoria         VARCHAR(30) NOT NULL CHECK (categoria IN
        ('VALIDACION_XSD','VALIDACION_SEMANTICA','FIRMA','ESTADO','AUTORIZACION',
         'CONCURRENCIA','PKI','TSA','SISTEMA')),
    vigente           BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- 2. CATÁLOGOS GEOGRÁFICOS (códigos usados en el XML: país 600 = Paraguay)
-- ============================================================================

CREATE TABLE cat_pais (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL
);

CREATE TABLE cat_departamento (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    pais_codigo       SMALLINT NOT NULL REFERENCES cat_pais(codigo)
);

CREATE TABLE cat_distrito (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    departamento_codigo SMALLINT NOT NULL REFERENCES cat_departamento(codigo)
);

CREATE TABLE cat_ciudad (
    codigo            SMALLINT PRIMARY KEY,
    nombre            VARCHAR(80) NOT NULL,
    distrito_codigo   SMALLINT NOT NULL REFERENCES cat_distrito(codigo)
);

CREATE TABLE cat_moneda (
    codigo            CHAR(3) PRIMARY KEY,        -- ISO 4217: PYG, USD...
    descripcion       VARCHAR(40) NOT NULL        -- "Guaraníes"
);

CREATE TABLE cat_tipo_documento_identidad (
    codigo            SMALLINT PRIMARY KEY,       -- 1 = CI (observado en XML)
    sigla             VARCHAR(10) NOT NULL,       -- CI, RUC, PASAPORTE
    descripcion       VARCHAR(60) NOT NULL
);

-- ============================================================================
-- 3. SEGURIDAD: USUARIOS Y ACCESOS (MFA, mínimo privilegio, segregación)
-- ============================================================================

CREATE TABLE usuario (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username          VARCHAR(80) NOT NULL UNIQUE,
    email             VARCHAR(160) NOT NULL UNIQUE,
    password_hash     TEXT,                       -- Argon2id; NULL si federado
    mfa_habilitado    BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secreto_cifrado TEXT,                     -- TOTP cifrado (KMS)
    persona_id        UUID,                       -- FK diferida a persona
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    intentos_fallidos SMALLINT NOT NULL DEFAULT 0,
    bloqueado_hasta   TIMESTAMPTZ,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usuario_rol (
    usuario_id        UUID REFERENCES usuario(id),
    rol_codigo        VARCHAR(30) REFERENCES cat_rol(codigo),
    otorgado_por      UUID REFERENCES usuario(id),
    otorgado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, rol_codigo)
);

CREATE TABLE sesion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES usuario(id),
    token_hash        TEXT NOT NULL,
    ip                INET,
    user_agent        TEXT,
    mfa_verificada    BOOLEAN NOT NULL DEFAULT FALSE,
    creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en         TIMESTAMPTZ NOT NULL,
    revocada_en       TIMESTAMPTZ
);

-- ============================================================================
-- 4. PERSONAS E INTERVINIENTES
-- ============================================================================

CREATE TABLE persona (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_persona          SMALLINT NOT NULL CHECK (tipo_persona IN (1, 2)),  -- 1=Física, 2=Jurídica
    nombres_apellidos     VARCHAR(200),          -- persona física
    razon_social          VARCHAR(200),          -- persona jurídica
    tipo_documento        SMALLINT NOT NULL REFERENCES cat_tipo_documento_identidad(codigo),
    numero_documento      VARCHAR(30) NOT NULL,
    pais_documento        SMALLINT NOT NULL REFERENCES cat_pais(codigo),
    ruc                   VARCHAR(20),
    email                 VARCHAR(160),
    telefono              VARCHAR(30),
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tipo_documento, numero_documento, pais_documento),
    CHECK ( (tipo_persona = 1 AND nombres_apellidos IS NOT NULL)
         OR (tipo_persona = 2 AND razon_social IS NOT NULL) )
);

ALTER TABLE usuario
    ADD CONSTRAINT fk_usuario_persona FOREIGN KEY (persona_id) REFERENCES persona(id);

CREATE TABLE persona_direccion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    persona_id            UUID NOT NULL REFERENCES persona(id),
    direccion             VARCHAR(200) NOT NULL,
    numero_casa           VARCHAR(20),
    ciudad_codigo         SMALLINT REFERENCES cat_ciudad(codigo),
    distrito_codigo       SMALLINT REFERENCES cat_distrito(codigo),
    departamento_codigo   SMALLINT REFERENCES cat_departamento(codigo),
    pais_codigo           SMALLINT REFERENCES cat_pais(codigo),
    principal             BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- 5. NÚCLEO: PAGARÉ-DTE
-- ============================================================================

CREATE TABLE dte (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Identificadores del perfil DTE (observados en el XML de ejemplo)
    id_dte                VARCHAR(40) NOT NULL UNIQUE,   -- atributo id de <DTE>  (vDTE...)
    id_datos_generales    VARCHAR(40) NOT NULL UNIQUE,   -- atributo id de <gDatosGeneralesDTE> (dDTE...)
    version_perfil        VARCHAR(10) NOT NULL DEFAULT '1.0',
    -- Datos generales
    codigo_tipo_dte       SMALLINT NOT NULL,             -- 1 = PAGARE A LA ORDEN
    descripcion_tipo_dte  VARCHAR(60) NOT NULL,
    numero_dte            BIGINT NOT NULL,               -- correlativo interno del PSDTE
    fecha_emision         TIMESTAMPTZ NOT NULL,
    fecha_vencimiento     TIMESTAMPTZ NOT NULL,
    moneda_codigo         CHAR(3) NOT NULL REFERENCES cat_moneda(codigo),
    monto                 NUMERIC(18,2) NOT NULL CHECK (monto > 0),
    monto_letras          VARCHAR(300) NOT NULL,
    texto_promesa_pago    TEXT NOT NULL,
    enlace_qr             TEXT,
    -- Estado vigente único (invariante de singularidad)
    estado_actual         SMALLINT NOT NULL REFERENCES cat_estado_dte(codigo),
    saldo_pendiente       NUMERIC(18,2) NOT NULL,
    version_vigente       INTEGER NOT NULL DEFAULT 1,    -- versión del XML vigente
    hash_vigente          CHAR(64),                      -- SHA-256 hex del XML canónico vigente
    -- Lugar de emisión (desnormalizado del XML)
    emision_direccion     VARCHAR(200) NOT NULL,
    emision_numero_casa   VARCHAR(20),
    emision_ciudad_codigo SMALLINT REFERENCES cat_ciudad(codigo),
    emision_distrito_codigo SMALLINT REFERENCES cat_distrito(codigo),
    emision_departamento_codigo SMALLINT REFERENCES cat_departamento(codigo),
    emision_pais_codigo   SMALLINT REFERENCES cat_pais(codigo),
    -- Metadatos
    creado_por            UUID NOT NULL REFERENCES usuario(id),
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fecha_vencimiento > fecha_emision),
    CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= monto)
);

CREATE INDEX idx_dte_estado ON dte(estado_actual);
CREATE INDEX idx_dte_vencimiento ON dte(fecha_vencimiento);

-- Lugares de pago (el XSD admite múltiples gLugarPagoDTE)
CREATE TABLE dte_lugar_pago (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    orden                 SMALLINT NOT NULL DEFAULT 1,
    direccion             VARCHAR(200) NOT NULL,
    numero_casa           VARCHAR(20),
    ciudad_codigo         SMALLINT REFERENCES cat_ciudad(codigo),
    distrito_codigo       SMALLINT REFERENCES cat_distrito(codigo),
    departamento_codigo   SMALLINT REFERENCES cat_departamento(codigo),
    pais_codigo           SMALLINT REFERENCES cat_pais(codigo),
    UNIQUE (dte_id, orden)
);

-- Condiciones del emisor (gCondicionesEmisorDTE)
CREATE TABLE dte_condicion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    orden                 SMALLINT NOT NULL,
    descripcion           TEXT NOT NULL,
    UNIQUE (dte_id, orden)
);

-- Intervinientes del DTE (acreedor inicial, deudor, codeudor, avalista...)
CREATE TABLE dte_parte (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    persona_id            UUID NOT NULL REFERENCES persona(id),
    rol_parte             VARCHAR(30) NOT NULL CHECK (rol_parte IN
        ('ACREEDOR_INICIAL','DEUDOR','CODEUDOR','AVALISTA','ENDOSANTE','ENDOSATARIO','TENEDOR')),
    condicion_firmante    VARCHAR(40),            -- ej.: "Deudor-1", "CoDeudor-001", "Endosante-2"
    orden                 SMALLINT NOT NULL DEFAULT 1,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dte_id, rol_parte, orden)
);

CREATE INDEX idx_dte_parte_persona ON dte_parte(persona_id);

-- ============================================================================
-- 6. CONTROL EXCLUSIVO: TENENCIA DEL DTE
--    Invariante: exactamente UN tenedor/controlador vigente por DTE.
-- ============================================================================

CREATE TABLE dte_tenencia (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    persona_id            UUID NOT NULL REFERENCES persona(id),
    origen                VARCHAR(30) NOT NULL CHECK (origen IN ('EMISION','ENDOSO','ORDEN_AUTORIDAD')),
    evento_id             UUID,                    -- FK diferida a dte_evento (evento que originó la tenencia)
    desde                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    hasta                 TIMESTAMPTZ,             -- NULL = vigente
    CHECK (hasta IS NULL OR hasta > desde)
);

-- CONTROL EXCLUSIVO: solo puede existir UNA tenencia vigente por DTE
CREATE UNIQUE INDEX uq_tenencia_vigente ON dte_tenencia(dte_id) WHERE hasta IS NULL;
-- No solapamiento de períodos de tenencia (defensa adicional)
ALTER TABLE dte_tenencia ADD CONSTRAINT excl_tenencia_solapada
    EXCLUDE USING gist (
        dte_id WITH =,
        tstzrange(desde, COALESCE(hasta, 'infinity'::timestamptz)) WITH &&
    );

-- ============================================================================
-- 7. REGISTRO APPEND-ONLY: EVENTOS DEL CICLO DE VIDA
-- ============================================================================

CREATE TABLE dte_evento (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    id_evento_xml         VARCHAR(50) NOT NULL UNIQUE,    -- atributo ID de <gEvento> (eDTE...-001)
    secuencia             INTEGER NOT NULL,               -- orden global dentro del DTE (1,2,3...)
    numero_evento         VARCHAR(10) NOT NULL,           -- <numeroEvento> del XML
    tipo_evento           SMALLINT NOT NULL REFERENCES cat_tipo_evento(codigo),
    fecha_evento          TIMESTAMPTZ NOT NULL,           -- fecha declarada en el XML
    fecha_registro        TIMESTAMPTZ NOT NULL DEFAULT now(), -- fecha de registro en el sistema
    -- Trazabilidad exigida por la invariante crítica del ERS:
    actor_usuario_id      UUID REFERENCES usuario(id),
    actor_descripcion     VARCHAR(200) NOT NULL,          -- actor/fuente (puede ser autoridad externa)
    rol_actor             VARCHAR(30) NOT NULL,
    estado_previo         SMALLINT NOT NULL REFERENCES cat_estado_dte(codigo),
    estado_resultante     SMALLINT NOT NULL REFERENCES cat_estado_dte(codigo),
    -- Payload completo del evento tal como quedó en el XML
    payload               JSONB NOT NULL,
    -- Encadenamiento probatorio
    hash_evento           CHAR(64) NOT NULL,              -- SHA-256 del nodo XML canónico del evento
    hash_anterior         CHAR(64),                       -- hash del evento previo (cadena)
    ip_origen             INET,
    UNIQUE (dte_id, secuencia)
);

CREATE INDEX idx_evento_dte ON dte_evento(dte_id, secuencia);
CREATE INDEX idx_evento_tipo ON dte_evento(tipo_evento);
CREATE INDEX idx_evento_payload ON dte_evento USING gin(payload);

ALTER TABLE dte_tenencia
    ADD CONSTRAINT fk_tenencia_evento FOREIGN KEY (evento_id) REFERENCES dte_evento(id);

-- APPEND-ONLY: prohibir UPDATE y DELETE sobre eventos
CREATE OR REPLACE FUNCTION fn_bloquear_modificacion() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Tabla append-only: % no permite %', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evento_append_only
    BEFORE UPDATE OR DELETE ON dte_evento
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

-- ============================================================================
-- 8. DETALLES POR TIPO DE EVENTO
-- ============================================================================

-- ENDOSO (codigoTipoEvento = 3)
CREATE TABLE dte_endoso (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    numero_endoso         SMALLINT NOT NULL,              -- <numeroEndoso>: 01, 02...
    endosante_persona_id  UUID NOT NULL REFERENCES persona(id),
    endosante_condicion   VARCHAR(40),                    -- "Endosante-1"
    endosatario_persona_id UUID NOT NULL REFERENCES persona(id),
    texto_endoso          TEXT NOT NULL,
    UNIQUE (dte_id, numero_endoso),
    CHECK (endosante_persona_id <> endosatario_persona_id)
);

-- PAGO (codigoTipoEvento = 4)
CREATE TABLE dte_pago (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    numero_pago           SMALLINT NOT NULL,
    monto_pagado          NUMERIC(18,2) NOT NULL CHECK (monto_pagado > 0),
    saldo_pendiente       NUMERIC(18,2) NOT NULL CHECK (saldo_pendiente >= 0),
    medio_pago            VARCHAR(40),
    referencia_externa    VARCHAR(80),
    UNIQUE (dte_id, numero_pago)
);

-- CANCELACIÓN / EXTINCIÓN (codigoTipoEvento = 1)
CREATE TABLE dte_cancelacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES dte_evento(id),
    dte_id                UUID NOT NULL UNIQUE REFERENCES dte(id),  -- solo una cancelación por DTE
    motivo                TEXT NOT NULL
);

-- BLOQUEO / MEDIDA CAUTELAR / CONSERVACIÓN REFORZADA
CREATE TABLE dte_bloqueo (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    causal_codigo         SMALLINT NOT NULL REFERENCES cat_causal_bloqueo(codigo),
    autoridad             VARCHAR(200) NOT NULL,          -- juzgado / autoridad que ordena
    numero_oficio         VARCHAR(80),
    fecha_orden           DATE NOT NULL,
    fecha_recepcion       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_aplicacion      TIMESTAMPTZ NOT NULL DEFAULT now(), -- SLA: "sin demora indebida"
    evento_levantamiento_id UUID REFERENCES dte_evento(id),   -- NULL = bloqueo vigente
    documento_respaldo    TEXT                             -- referencia al oficio digitalizado
);

CREATE INDEX idx_bloqueo_vigente ON dte_bloqueo(dte_id) WHERE evento_levantamiento_id IS NULL;

-- ANOTACIONES / ACTOS EXTERNOS (CAT-DTE-05): protesto, presentación al cobro, etc.
CREATE TABLE dte_anotacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id             UUID NOT NULL UNIQUE REFERENCES dte_evento(id),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    acto_externo_codigo   SMALLINT NOT NULL REFERENCES cat_acto_externo(codigo),
    descripcion           TEXT NOT NULL,
    autoridad             VARCHAR(200),
    referencia_externa    VARCHAR(120)
);

-- ============================================================================
-- 9. VERSIONES DEL XML Y ALMACENAMIENTO PROBATORIO
--    El XML firmado es la fuente de verdad. Cada mutación genera una versión.
-- ============================================================================

CREATE TABLE dte_xml_version (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    version               INTEGER NOT NULL,
    evento_id             UUID REFERENCES dte_evento(id), -- evento que generó esta versión (NULL = emisión)
    hash_sha256           CHAR(64) NOT NULL,
    tamano_bytes          BIGINT NOT NULL,
    almacenamiento        VARCHAR(20) NOT NULL DEFAULT 'DB' CHECK (almacenamiento IN ('DB','OBJECT_STORE')),
    contenido_xml         XML,                            -- si almacenamiento = DB
    uri_objeto            TEXT,                           -- si almacenamiento = OBJECT_STORE (WORM/S3 Object Lock)
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dte_id, version),
    CHECK ( (almacenamiento='DB' AND contenido_xml IS NOT NULL)
         OR (almacenamiento='OBJECT_STORE' AND uri_objeto IS NOT NULL) )
);

CREATE TRIGGER trg_xml_version_append_only
    BEFORE UPDATE OR DELETE ON dte_xml_version
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

-- ============================================================================
-- 10. FIRMAS, CERTIFICADOS Y EVIDENCIAS CRIPTOGRÁFICAS
-- ============================================================================

CREATE TABLE certificado (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_serie          VARCHAR(80) NOT NULL,
    subject_dn            TEXT NOT NULL,
    issuer_dn             TEXT NOT NULL,
    tipo                  VARCHAR(30) NOT NULL CHECK (tipo IN ('FIRMA_CUALIFICADA','SELLO_PSDTE','TSA','CA')),
    nivel                 VARCHAR(10),                    -- ej.: F3 (observado en el XML)
    documento_titular     VARCHAR(30),                    -- ej.: CI5419723 extraído del subject
    persona_id            UUID REFERENCES persona(id),
    valido_desde          TIMESTAMPTZ NOT NULL,
    valido_hasta          TIMESTAMPTZ NOT NULL,
    certificado_der       BYTEA NOT NULL,                 -- X509 completo
    en_tsl                BOOLEAN NOT NULL DEFAULT FALSE, -- verificado contra TSL-Py
    revocado              BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_revocacion      TIMESTAMPTZ,
    UNIQUE (numero_serie, issuer_dn)
);

CREATE TABLE firma (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    evento_id             UUID REFERENCES dte_evento(id), -- NULL = firma sobre gDatosGeneralesDTE o documento
    xml_signature_id      VARCHAR(80) NOT NULL UNIQUE,    -- atributo Id del ds:Signature
    ambito                VARCHAR(30) NOT NULL CHECK (ambito IN
        ('DATOS_GENERALES','EVENTO','DOCUMENTO')),
    rol_firmante          VARCHAR(30) NOT NULL,           -- DEUDOR, CODEUDOR, ACREEDOR, ENDOSANTE, ENDOSATARIO, PSDTE
    certificado_id        UUID NOT NULL REFERENCES certificado(id),
    formato               VARCHAR(20) NOT NULL DEFAULT 'XAdES-T',
    algoritmo_firma       VARCHAR(80) NOT NULL,           -- rsa-sha256
    algoritmo_digest      VARCHAR(80) NOT NULL,           -- sha256
    signing_time          TIMESTAMPTZ NOT NULL,           -- xades:SigningTime
    referencias           JSONB NOT NULL,                 -- URIs firmadas (encadenamiento)
    signature_value_hash  CHAR(64) NOT NULL,              -- SHA-256 del SignatureValue
    sello_tiempo_tsa      TEXT,                           -- token TSA (base64) del SignatureTimeStamp
    tsa_fecha             TIMESTAMPTZ,
    estado_validacion     VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_validacion IN
        ('PENDIENTE','VALIDA','INVALIDA','INDETERMINADA')),
    validada_en           TIMESTAMPTZ,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_firma_dte ON firma(dte_id);
CREATE TRIGGER trg_firma_append_only
    BEFORE UPDATE OF xml_signature_id, referencias, signature_value_hash ON firma
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

-- Respuestas OCSP/CRL capturadas al validar (evidencia LTV)
CREATE TABLE evidencia_revocacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificado_id        UUID NOT NULL REFERENCES certificado(id),
    firma_id              UUID REFERENCES firma(id),
    tipo                  VARCHAR(10) NOT NULL CHECK (tipo IN ('OCSP','CRL')),
    resultado             VARCHAR(20) NOT NULL CHECK (resultado IN ('GOOD','REVOKED','UNKNOWN')),
    respuesta_raw         BYTEA NOT NULL,                 -- respuesta completa para preservación
    consultado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evidencias generales (CAT-DTE-07): manifiestos, hashes, TSL snapshot, resellados LTV
CREATE TABLE evidencia (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID REFERENCES dte(id),
    evento_id             UUID REFERENCES dte_evento(id),
    tipo_codigo           SMALLINT NOT NULL REFERENCES cat_tipo_evidencia(codigo),
    hash_sha256           CHAR(64) NOT NULL,
    contenido             BYTEA,
    uri_objeto            TEXT,
    metadatos             JSONB,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_evidencia_append_only
    BEFORE UPDATE OR DELETE ON evidencia
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

-- Resellados LTV programados (agilidad criptográfica / preservación >= 10 años)
CREATE TABLE resellado_ltv (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    xml_version_id        UUID NOT NULL REFERENCES dte_xml_version(id),
    token_tsa             BYTEA NOT NULL,
    algoritmo             VARCHAR(40) NOT NULL,
    aplicado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    proximo_resellado     TIMESTAMPTZ NOT NULL
);

-- ============================================================================
-- 11. CONSULTA, VERIFICACIÓN Y EXPORTACIÓN
-- ============================================================================

CREATE TABLE consulta_verificacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID REFERENCES dte(id),
    id_dte_consultado     VARCHAR(40) NOT NULL,           -- lo que se consultó (aunque no exista)
    nivel_codigo          SMALLINT NOT NULL REFERENCES cat_nivel_consulta(codigo),
    usuario_id            UUID REFERENCES usuario(id),    -- NULL = consulta pública
    ip                    INET,
    resultado             VARCHAR(30) NOT NULL,           -- EXISTE_VIGENTE, EXISTE_CANCELADO, NO_EXISTE, INTEGRIDAD_OK, INTEGRIDAD_FALLA
    detalle               JSONB,
    consultado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consulta_dte ON consulta_verificacion(dte_id, consultado_en);

CREATE TABLE exportacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dte_id                UUID NOT NULL REFERENCES dte(id),
    xml_version_id        UUID NOT NULL REFERENCES dte_xml_version(id),
    tipo                  VARCHAR(20) NOT NULL CHECK (tipo IN ('PDF_A','CONTENEDOR')),
    hash_sha256           CHAR(64) NOT NULL,
    manifiesto            JSONB NOT NULL,                 -- inventario de artefactos del contenedor
    uri_objeto            TEXT NOT NULL,
    solicitado_por        UUID REFERENCES usuario(id),
    generado_en           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 12. NOTIFICACIONES Y ACUSES (CAT-DTE-09)
-- ============================================================================

CREATE TABLE notificacion (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_codigo           SMALLINT NOT NULL REFERENCES cat_tipo_notificacion(codigo),
    dte_id                UUID REFERENCES dte(id),
    evento_id             UUID REFERENCES dte_evento(id),
    destinatario_persona_id UUID REFERENCES persona(id),
    destino               VARCHAR(200) NOT NULL,          -- email/teléfono efectivo
    asunto                VARCHAR(200),
    cuerpo                TEXT,
    estado                VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN
        ('PENDIENTE','ENVIADA','ENTREGADA','FALLIDA','ACUSADA')),
    intentos              SMALLINT NOT NULL DEFAULT 0,
    enviada_en            TIMESTAMPTZ,
    acusada_en            TIMESTAMPTZ,
    creado_en             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 13. AUDITORÍA GENERAL APPEND-ONLY (con cadena de hashes)
-- ============================================================================

CREATE TABLE auditoria_log (
    id                    BIGSERIAL PRIMARY KEY,
    ocurrido_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_id            UUID REFERENCES usuario(id),
    accion                VARCHAR(60) NOT NULL,           -- LOGIN, DTE_EMITIDO, ENDOSO_REGISTRADO, CONSULTA...
    entidad               VARCHAR(60),
    entidad_id            TEXT,
    ip                    INET,
    user_agent            TEXT,
    detalle               JSONB,
    hash_registro         CHAR(64) NOT NULL,              -- SHA-256(registro + hash_anterior)
    hash_anterior         CHAR(64)
);

CREATE TRIGGER trg_auditoria_append_only
    BEFORE UPDATE OR DELETE ON auditoria_log
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_modificacion();

CREATE INDEX idx_auditoria_fecha ON auditoria_log(ocurrido_en);
CREATE INDEX idx_auditoria_entidad ON auditoria_log(entidad, entidad_id);

-- ============================================================================
-- 14. INCIDENCIAS Y ERRORES API (CAT-DTE-10)
-- ============================================================================

CREATE TABLE incidencia (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_codigo          VARCHAR(20) REFERENCES cat_error(codigo),
    dte_id                UUID REFERENCES dte(id),
    endpoint              VARCHAR(120),
    request_id            UUID,
    detalle               JSONB,
    severidad             VARCHAR(10) NOT NULL DEFAULT 'MEDIA' CHECK (severidad IN ('BAJA','MEDIA','ALTA','CRITICA')),
    estado                VARCHAR(20) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','EN_ANALISIS','RESUELTA','CERRADA')),
    ocurrido_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelto_en           TIMESTAMPTZ
);

-- ============================================================================
-- 15. FUNCIÓN DE TRANSICIÓN ATÓMICA (núcleo del control exclusivo)
--     Toda mutación de estado pasa por aquí, con bloqueo de fila (FOR UPDATE)
--     para serializar la concurrencia sobre el mismo DTE e impedir la doble
--     disposición.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_aplicar_evento(
    p_dte_id          UUID,
    p_tipo_evento     SMALLINT,
    p_id_evento_xml   VARCHAR,
    p_numero_evento   VARCHAR,
    p_fecha_evento    TIMESTAMPTZ,
    p_actor_usuario   UUID,
    p_actor_desc      VARCHAR,
    p_rol_actor       VARCHAR,
    p_payload         JSONB,
    p_hash_evento     CHAR(64)
) RETURNS UUID AS $$
DECLARE
    v_estado_actual   SMALLINT;
    v_estado_destino  SMALLINT;
    v_secuencia       INTEGER;
    v_hash_anterior   CHAR(64);
    v_evento_id       UUID;
BEGIN
    -- 1. Serialización: bloquear la fila del DTE (impide doble disposición)
    SELECT estado_actual INTO v_estado_actual
    FROM dte WHERE id = p_dte_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR-DTE-404: DTE inexistente';
    END IF;

    -- 2. Bloqueo vigente impide todo salvo levantamiento por autoridad
    IF EXISTS (SELECT 1 FROM dte_bloqueo b
               WHERE b.dte_id = p_dte_id AND b.evento_levantamiento_id IS NULL)
       AND p_tipo_evento NOT IN (SELECT codigo FROM cat_tipo_evento WHERE nombre IN ('LEVANTAMIENTO_BLOQUEO','ANOTACION_AUTORIDAD'))
    THEN
        RAISE EXCEPTION 'ERR-ESTADO-003: DTE bloqueado por medida vigente';
    END IF;

    -- 3. Validar transición contra CAT-DTE-03
    SELECT estado_destino INTO v_estado_destino
    FROM cat_transicion
    WHERE estado_origen = v_estado_actual
      AND tipo_evento   = p_tipo_evento
      AND vigente
    LIMIT 1;

    IF v_estado_destino IS NULL THEN
        RAISE EXCEPTION 'ERR-ESTADO-001: transición no permitida desde estado % con evento %',
            v_estado_actual, p_tipo_evento;
    END IF;

    -- 4. Encadenamiento
    SELECT COALESCE(MAX(secuencia),0)+1 INTO v_secuencia FROM dte_evento WHERE dte_id = p_dte_id;
    SELECT hash_evento INTO v_hash_anterior
    FROM dte_evento WHERE dte_id = p_dte_id ORDER BY secuencia DESC LIMIT 1;

    -- 5. Insertar evento (append-only)
    INSERT INTO dte_evento (dte_id, id_evento_xml, secuencia, numero_evento, tipo_evento,
        fecha_evento, actor_usuario_id, actor_descripcion, rol_actor,
        estado_previo, estado_resultante, payload, hash_evento, hash_anterior)
    VALUES (p_dte_id, p_id_evento_xml, v_secuencia, p_numero_evento, p_tipo_evento,
        p_fecha_evento, p_actor_usuario, p_actor_desc, p_rol_actor,
        v_estado_actual, v_estado_destino, p_payload, p_hash_evento, v_hash_anterior)
    RETURNING id INTO v_evento_id;

    -- 6. Actualizar estado vigente único
    UPDATE dte SET estado_actual = v_estado_destino,
                   version_vigente = version_vigente + 1,
                   actualizado_en = now()
    WHERE id = p_dte_id;

    RETURN v_evento_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 16. DATOS SEMILLA MÍNIMOS (propuesta - confirmar contra catálogos oficiales)
-- ============================================================================

INSERT INTO cat_pais (codigo, nombre) VALUES (600, 'Paraguay'), (1, 'Paraguay');
-- NOTA: el XML de ejemplo usa inconsistentemente 600 y 1 para Paraguay.
-- Confirmar con el catálogo oficial (probable ISO 3166-1 numérico: PY = 600).

INSERT INTO cat_moneda VALUES ('PYG','Guaraníes'), ('USD','Dólares americanos');

INSERT INTO cat_tipo_documento_identidad VALUES
    (1,'CI','Cédula de Identidad'),
    (2,'RUC','Registro Único de Contribuyente'),
    (3,'PAS','Pasaporte');

-- CAT-DTE-01 (PROPUESTA a validar contra el catálogo oficial del perfil DTE)
INSERT INTO cat_estado_dte (codigo,nombre,descripcion,es_final,permite_endoso,permite_pago) VALUES
 (1,'EMITIDO','Pagaré emitido, firmado y registrado; tenedor = acreedor inicial',FALSE,TRUE,TRUE),
 (2,'ENDOSADO','Control transferido a nuevo tenedor por endoso',FALSE,TRUE,TRUE),
 (3,'PRESENTADO_AL_COBRO','Presentado al deudor para pago',FALSE,FALSE,TRUE),
 (4,'PAGADO_PARCIAL','Pago parcial registrado; saldo pendiente > 0',FALSE,TRUE,TRUE),
 (5,'PAGADO_TOTAL','Saldo cero; pendiente de cancelación formal',FALSE,FALSE,FALSE),
 (6,'PROTESTADO','Protesto por falta de pago registrado',FALSE,FALSE,TRUE),
 (7,'BLOQUEADO','Inmovilizado por medida cautelar u orden de autoridad',FALSE,FALSE,FALSE),
 (8,'CANCELADO','Cancelado/extinguido; conservación >= 10 años',TRUE,FALSE,FALSE),
 (9,'VENCIDO','Vencido sin pago total; habilita protesto/acciones',FALSE,FALSE,TRUE);

-- CAT-DTE-02 (códigos 1, 3, 4 OBSERVADOS en el XML; el resto es propuesta)
INSERT INTO cat_tipo_evento (codigo,nombre,descripcion,requiere_firma_endosante,requiere_firma_endosatario) VALUES
 (1,'CANCELACION','Cancelación / extinción del DTE (observado en XML)',FALSE,FALSE),
 (2,'BLOQUEO','Bloqueo / medida cautelar (código a confirmar)',FALSE,FALSE),
 (3,'ENDOSO','Transferencia del control por endoso (observado en XML)',TRUE,TRUE),
 (4,'PAGO','Pago total o parcial (observado en XML)',FALSE,FALSE),
 (5,'PRESENTACION_COBRO','Presentación al cobro (código a confirmar)',FALSE,FALSE),
 (6,'PROTESTO','Protesto (código a confirmar)',FALSE,FALSE),
 (7,'LEVANTAMIENTO_BLOQUEO','Levantamiento de medida (código a confirmar)',FALSE,FALSE),
 (8,'ANOTACION_AUTORIDAD','Anotación ordenada por autoridad (código a confirmar)',FALSE,FALSE);

-- CAT-DTE-03: matriz de transiciones (propuesta inicial)
INSERT INTO cat_transicion (estado_origen,tipo_evento,estado_destino,condicion) VALUES
 (1,3,2,NULL),                       -- EMITIDO + ENDOSO -> ENDOSADO
 (2,3,2,NULL),                       -- ENDOSADO + ENDOSO -> ENDOSADO
 (1,4,4,'saldo > 0'),                -- EMITIDO + PAGO parcial
 (1,4,5,'saldo = 0'),                -- EMITIDO + PAGO total
 (2,4,4,'saldo > 0'),
 (2,4,5,'saldo = 0'),
 (4,4,4,'saldo > 0'),
 (4,4,5,'saldo = 0'),
 (4,3,2,NULL),                       -- PAGADO_PARCIAL + ENDOSO -> ENDOSADO
 (3,4,5,'saldo = 0'),
 (3,4,4,'saldo > 0'),
 (1,5,3,NULL), (2,5,3,NULL), (4,5,3,NULL), (9,5,3,NULL),
 (3,6,6,NULL), (9,6,6,NULL),         -- PROTESTO
 (5,1,8,NULL),                       -- PAGADO_TOTAL + CANCELACION -> CANCELADO
 (1,2,7,NULL), (2,2,7,NULL), (3,2,7,NULL), (4,2,7,NULL), (6,2,7,NULL), (9,2,7,NULL),
 (7,7,2,'restaurar estado previo');  -- levantamiento: la lógica de negocio restaura estado_previo

-- CAT-DTE-08: niveles de consulta
INSERT INTO cat_nivel_consulta (codigo,nombre,campos_visibles,descripcion) VALUES
 (1,'PUBLICO','["existencia","estado","fecha_emision","hash_verificacion"]','Verificación por QR/URI sin autenticación'),
 (2,'INTERVINIENTE','["*_propios","eventos","tenedor","montos","saldo"]','Partes del DTE autenticadas'),
 (3,'AUTORIDAD','["*"]','Autoridad de Aplicación / orden judicial'),
 (4,'AUDITOR','["*","logs","evidencias"]','Auditoría interna / OEC');

-- CAT-DTE-10: errores base
INSERT INTO cat_error (codigo,http_status,mensaje,categoria) VALUES
 ('ERR-XSD-001',422,'El XML no cumple el esquema XSD del perfil DTE','VALIDACION_XSD'),
 ('ERR-SEM-001',422,'Regla semántica violada: monto en letras no coincide','VALIDACION_SEMANTICA'),
 ('ERR-SEM-002',422,'Fecha de vencimiento anterior a la emisión','VALIDACION_SEMANTICA'),
 ('ERR-FIRMA-001',422,'Firma XAdES inválida o alterada','FIRMA'),
 ('ERR-FIRMA-002',422,'Certificado no cualificado o fuera de TSL','FIRMA'),
 ('ERR-FIRMA-003',422,'Certificado revocado (OCSP/CRL)','FIRMA'),
 ('ERR-FIRMA-004',422,'Sello de tiempo TSA ausente o inválido','TSA'),
 ('ERR-ESTADO-001',409,'Transición de estado no permitida','ESTADO'),
 ('ERR-ESTADO-002',409,'DTE cancelado: no admite nuevos eventos','ESTADO'),
 ('ERR-ESTADO-003',423,'DTE bloqueado por medida de autoridad','ESTADO'),
 ('ERR-CONC-001',409,'Conflicto de concurrencia: reintente la operación','CONCURRENCIA'),
 ('ERR-CTRL-001',403,'El solicitante no es el tenedor/controlador vigente','AUTORIZACION'),
 ('ERR-DTE-404',404,'DTE inexistente','VALIDACION_SEMANTICA'),
 ('ERR-DTE-409',409,'ID-DTE ya registrado: singularidad violada','VALIDACION_SEMANTICA'),
 ('ERR-PKI-503',503,'Servicio PCSC/TSL no disponible: degradación controlada','PKI');

-- ============================================================================
-- FIN DEL MODELO
-- ============================================================================
