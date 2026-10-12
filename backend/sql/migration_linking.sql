USE monitoreo;

-- Migración idempotente: el agente reporta el código SGL del inventario.
SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE devices ADD COLUMN asset_code VARCHAR(32) NULL AFTER ip_address', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'asset_code');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SHOW COLUMNS FROM devices WHERE Field IN ('device_id', 'hostname', 'ip_address', 'asset_code');
