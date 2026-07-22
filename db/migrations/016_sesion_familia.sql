-- Up Migration
-- Rotación de refresh token con detección de reuso (ver docs/PLAN.md sección 5.1/10 y
-- docs/DECISIONES.md ADR-007): el DDL de referencia no modela la "familia" de sesiones
-- rotadas. Se agrega familia_id (compartido por todas las sesiones nacidas del mismo login)
-- para poder revocar la familia completa ante el reuso de un refresh ya rotado.

ALTER TABLE psdte.sesion ADD COLUMN familia_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE psdte.sesion ADD COLUMN reemplazada_por_id UUID REFERENCES psdte.sesion(id);

CREATE INDEX idx_sesion_familia ON psdte.sesion(familia_id);

-- Down Migration
DROP INDEX IF EXISTS psdte.idx_sesion_familia;
ALTER TABLE psdte.sesion DROP COLUMN IF EXISTS reemplazada_por_id;
ALTER TABLE psdte.sesion DROP COLUMN IF EXISTS familia_id;
