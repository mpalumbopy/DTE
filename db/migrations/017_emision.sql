-- Up Migration
-- Secuencial global del ID-DTE (ver docs/PLAN.md sección 5.3, IdDteService) — F6.

CREATE SEQUENCE psdte.seq_dte START WITH 1 INCREMENT BY 1;

-- Down Migration
DROP SEQUENCE IF EXISTS psdte.seq_dte;
