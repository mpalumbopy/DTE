-- Up Migration
-- Extiende fn_aplicar_evento con un p_estado_destino opcional: CAT-DTE-03 (cat_transicion) tiene
-- más de una fila para (estado_origen, tipo_evento) en los casos de PAGO (condicion 'saldo > 0' vs
-- 'saldo = 0') y de LEVANTAMIENTO_BLOQUEO ("restaurar estado previo", hardcodeado a un solo destino
-- en el seed) — el SELECT...LIMIT 1 original no evalúa `condicion`, así que no puede distinguir cuál
-- de las dos aplica. En vez de parsear texto de `condicion` dentro de PL/pgSQL, el cálculo de negocio
-- (saldo resultante, estado previo a un bloqueo) lo hace EventosService (TypeScript) y se lo pasa
-- explícito a la función, que igual valida que sea una transición real y vigente en cat_transicion
-- antes de aplicarla (ver ADR-004/F7 en docs/DECISIONES.md).

-- CREATE OR REPLACE no sustituye una función existente cuando cambia la cantidad de parámetros:
-- crea un OVERLOAD nuevo y deja el de 10 parámetros vivo (ambiguo con llamadas de 11 args). Se
-- elimina explícitamente antes de crear la versión extendida.
DROP FUNCTION IF EXISTS psdte.fn_aplicar_evento(
    UUID, SMALLINT, VARCHAR, VARCHAR, TIMESTAMPTZ, UUID, VARCHAR, VARCHAR, JSONB, CHAR(64)
);

CREATE OR REPLACE FUNCTION psdte.fn_aplicar_evento(
    p_dte_id          UUID,
    p_tipo_evento     SMALLINT,
    p_id_evento_xml   VARCHAR,
    p_numero_evento   VARCHAR,
    p_fecha_evento    TIMESTAMPTZ,
    p_actor_usuario   UUID,
    p_actor_desc      VARCHAR,
    p_rol_actor       VARCHAR,
    p_payload         JSONB,
    p_hash_evento     CHAR(64),
    p_estado_destino  SMALLINT DEFAULT NULL
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
    FROM psdte.dte WHERE id = p_dte_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR-DTE-404: DTE inexistente';
    END IF;

    -- 2. Bloqueo vigente impide todo salvo levantamiento por autoridad
    IF EXISTS (SELECT 1 FROM psdte.dte_bloqueo b
               WHERE b.dte_id = p_dte_id AND b.evento_levantamiento_id IS NULL)
       AND p_tipo_evento NOT IN (SELECT codigo FROM psdte.cat_tipo_evento WHERE nombre IN ('LEVANTAMIENTO_BLOQUEO','ANOTACION_AUTORIDAD'))
    THEN
        RAISE EXCEPTION 'ERR-ESTADO-003: DTE bloqueado por medida vigente';
    END IF;

    -- 3. Validar transición contra CAT-DTE-03
    IF p_estado_destino IS NOT NULL THEN
        -- El llamador ya resolvió la ambigüedad (saldo resultante, estado previo a un bloqueo, etc.):
        -- se valida que esa transición exista y esté vigente, no se re-deriva.
        SELECT estado_destino INTO v_estado_destino
        FROM psdte.cat_transicion
        WHERE estado_origen = v_estado_actual
          AND tipo_evento    = p_tipo_evento
          AND estado_destino = p_estado_destino
          AND vigente
        LIMIT 1;
    ELSE
        SELECT estado_destino INTO v_estado_destino
        FROM psdte.cat_transicion
        WHERE estado_origen = v_estado_actual
          AND tipo_evento   = p_tipo_evento
          AND vigente
        LIMIT 1;
    END IF;

    IF v_estado_destino IS NULL THEN
        RAISE EXCEPTION 'ERR-ESTADO-001: transición no permitida desde estado % con evento %',
            v_estado_actual, p_tipo_evento;
    END IF;

    -- 4. Encadenamiento
    SELECT COALESCE(MAX(secuencia),0)+1 INTO v_secuencia FROM psdte.dte_evento WHERE dte_id = p_dte_id;
    SELECT hash_evento INTO v_hash_anterior
    FROM psdte.dte_evento WHERE dte_id = p_dte_id ORDER BY secuencia DESC LIMIT 1;

    -- 5. Insertar evento (append-only)
    INSERT INTO psdte.dte_evento (dte_id, id_evento_xml, secuencia, numero_evento, tipo_evento,
        fecha_evento, actor_usuario_id, actor_descripcion, rol_actor,
        estado_previo, estado_resultante, payload, hash_evento, hash_anterior)
    VALUES (p_dte_id, p_id_evento_xml, v_secuencia, p_numero_evento, p_tipo_evento,
        p_fecha_evento, p_actor_usuario, p_actor_desc, p_rol_actor,
        v_estado_actual, v_estado_destino, p_payload, p_hash_evento, v_hash_anterior)
    RETURNING id INTO v_evento_id;

    -- 6. Actualizar estado vigente único
    UPDATE psdte.dte SET estado_actual = v_estado_destino,
                   version_vigente = version_vigente + 1,
                   actualizado_en = now()
    WHERE id = p_dte_id;

    RETURN v_evento_id;
END;
$$ LANGUAGE plpgsql;

-- Down Migration
DROP FUNCTION IF EXISTS psdte.fn_aplicar_evento(
    UUID, SMALLINT, VARCHAR, VARCHAR, TIMESTAMPTZ, UUID, VARCHAR, VARCHAR, JSONB, CHAR(64), SMALLINT
);

CREATE OR REPLACE FUNCTION psdte.fn_aplicar_evento(
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
    SELECT estado_actual INTO v_estado_actual
    FROM psdte.dte WHERE id = p_dte_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR-DTE-404: DTE inexistente';
    END IF;

    IF EXISTS (SELECT 1 FROM psdte.dte_bloqueo b
               WHERE b.dte_id = p_dte_id AND b.evento_levantamiento_id IS NULL)
       AND p_tipo_evento NOT IN (SELECT codigo FROM psdte.cat_tipo_evento WHERE nombre IN ('LEVANTAMIENTO_BLOQUEO','ANOTACION_AUTORIDAD'))
    THEN
        RAISE EXCEPTION 'ERR-ESTADO-003: DTE bloqueado por medida vigente';
    END IF;

    SELECT estado_destino INTO v_estado_destino
    FROM psdte.cat_transicion
    WHERE estado_origen = v_estado_actual
      AND tipo_evento   = p_tipo_evento
      AND vigente
    LIMIT 1;

    IF v_estado_destino IS NULL THEN
        RAISE EXCEPTION 'ERR-ESTADO-001: transición no permitida desde estado % con evento %',
            v_estado_actual, p_tipo_evento;
    END IF;

    SELECT COALESCE(MAX(secuencia),0)+1 INTO v_secuencia FROM psdte.dte_evento WHERE dte_id = p_dte_id;
    SELECT hash_evento INTO v_hash_anterior
    FROM psdte.dte_evento WHERE dte_id = p_dte_id ORDER BY secuencia DESC LIMIT 1;

    INSERT INTO psdte.dte_evento (dte_id, id_evento_xml, secuencia, numero_evento, tipo_evento,
        fecha_evento, actor_usuario_id, actor_descripcion, rol_actor,
        estado_previo, estado_resultante, payload, hash_evento, hash_anterior)
    VALUES (p_dte_id, p_id_evento_xml, v_secuencia, p_numero_evento, p_tipo_evento,
        p_fecha_evento, p_actor_usuario, p_actor_desc, p_rol_actor,
        v_estado_actual, v_estado_destino, p_payload, p_hash_evento, v_hash_anterior)
    RETURNING id INTO v_evento_id;

    UPDATE psdte.dte SET estado_actual = v_estado_destino,
                   version_vigente = version_vigente + 1,
                   actualizado_en = now()
    WHERE id = p_dte_id;

    RETURN v_evento_id;
END;
$$ LANGUAGE plpgsql;
