-- Up Migration
-- Detalle del último error de envío (F11): estado='FALLIDA' + intentos ya existían, pero no había
-- forma de saber POR QUÉ falló sin ir al log de la aplicación.

ALTER TABLE psdte.notificacion ADD COLUMN error_mensaje TEXT;

-- Down Migration
ALTER TABLE psdte.notificacion DROP COLUMN IF EXISTS error_mensaje;
