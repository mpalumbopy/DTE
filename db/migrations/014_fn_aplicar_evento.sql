-- Up Migration
-- Función de transición atómica: única puerta de mutación de estado (ver
-- db/modelo_datos_psdte.sql sección 15). Invariantes I3, I6, I10.

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
    UUID, SMALLINT, VARCHAR, VARCHAR, TIMESTAMPTZ, UUID, VARCHAR, VARCHAR, JSONB, CHAR(64)
);
