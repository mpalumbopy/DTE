-- Up Migration
-- Usuarios, roles y sesiones (ver db/modelo_datos_psdte.sql sección 3).

CREATE TABLE psdte.usuario (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username          VARCHAR(80) NOT NULL UNIQUE,
    email             VARCHAR(160) NOT NULL UNIQUE,
    password_hash     TEXT,
    mfa_habilitado    BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secreto_cifrado TEXT,
    persona_id        UUID,
    activo            BOOLEAN NOT NULL DEFAULT TRUE,
    intentos_fallidos SMALLINT NOT NULL DEFAULT 0,
    bloqueado_hasta   TIMESTAMPTZ,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE psdte.usuario_rol (
    usuario_id        UUID REFERENCES psdte.usuario(id),
    rol_codigo        VARCHAR(30) REFERENCES psdte.cat_rol(codigo),
    otorgado_por      UUID REFERENCES psdte.usuario(id),
    otorgado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, rol_codigo)
);

CREATE TABLE psdte.sesion (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id        UUID NOT NULL REFERENCES psdte.usuario(id),
    token_hash        TEXT NOT NULL,
    ip                INET,
    user_agent        TEXT,
    mfa_verificada    BOOLEAN NOT NULL DEFAULT FALSE,
    creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_en         TIMESTAMPTZ NOT NULL,
    revocada_en       TIMESTAMPTZ
);

-- Down Migration
DROP TABLE IF EXISTS psdte.sesion;
DROP TABLE IF EXISTS psdte.usuario_rol;
DROP TABLE IF EXISTS psdte.usuario;
