USE monitoreo;

-- Migración idempotente: agrega los campos del inventario SGL a una BD ya creada.

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD COLUMN codigo VARCHAR(32) NULL AFTER qr_token', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'codigo');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD COLUMN ip_address VARCHAR(45) NULL AFTER hostname', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'ip_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD COLUMN correo VARCHAR(255) NULL AFTER ip_address', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'correo');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD COLUMN vnc VARCHAR(64) NULL AFTER correo', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'vnc');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD COLUMN password_cifrado TEXT NULL AFTER vnc', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'password_cifrado');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD COLUMN admin_password_cifrado TEXT NULL AFTER password_cifrado', 'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'admin_password_cifrado');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Código para los registros que ya existían (por ejemplo, el equipo de prueba).
UPDATE assets
SET codigo = CONCAT('SGL-', LPAD(id, 4, '0'))
WHERE codigo IS NULL OR codigo = '';

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets'
     AND COLUMN_NAME = 'codigo' AND IS_NULLABLE = 'YES') > 0,
  'ALTER TABLE assets MODIFY codigo VARCHAR(32) NOT NULL', 'SELECT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assets ADD UNIQUE KEY uq_assets_codigo (codigo)', 'SELECT 1')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND INDEX_NAME = 'uq_assets_codigo');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS asset_sequence (
    id INT NOT NULL PRIMARY KEY,
    next_value INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO asset_sequence (id, next_value) VALUES (1, 1)
    ON DUPLICATE KEY UPDATE id = id;

UPDATE asset_sequence
SET next_value = GREATEST(next_value,
    (SELECT IFNULL(MAX(CAST(SUBSTRING(codigo, 5) AS UNSIGNED)), 0) + 1
     FROM assets WHERE codigo REGEXP '^SGL-[0-9]+$'))
WHERE id = 1;

SHOW COLUMNS FROM assets;
SELECT * FROM asset_sequence;
