
CREATE DATABASE IF NOT EXISTS monitoreo
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;


USE monitoreo;

CREATE TABLE IF NOT EXISTS devices (
    id INT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(64) NOT NULL UNIQUE,
    hostname VARCHAR(128) default null,
    ip_address VARCHAR(45) default null,
    asset_code VARCHAR(32) default null,
    network_interfaces TEXT default null,
    created_at TIMESTAMP NOT NULL default current_timestamp,
    last_seen TIMESTAMP NULL default NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS metrics(
    id BIGINT NOT NULL AUTO_INCREMENT,
    device_id VARCHAR(64) NOT NULL,
    cpu_usage DECIMAL(5,2) DEFAULT NULL,
    cpu_speed_ghz DECIMAL(6,2) DEFAULT NULL,
    memory_usage DECIMAL(5,2) DEFAULT NULL,
    memory_total BIGINT DEFAULT NULL,
    disk_usage DECIMAL(5,2) DEFAULT NULL,
    disk_total BIGINT DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    KEY idx_metrics_device (device_id),
    KEY idx_metrics_fecha (recorded_at),
    CONSTRAINT fk_metrics_device FOREIGN KEY (device_id)
        REFERENCES devices(device_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(32) NOT NULL UNIQUE,
    qr_token VARCHAR(64) NOT NULL UNIQUE,
    device_id VARCHAR(64) DEFAULT NULL,
    tipo VARCHAR(64) NOT NULL DEFAULT 'equipo',
    familias VARCHAR(255) DEFAULT NULL,
    marca VARCHAR(64) DEFAULT NULL,
    modelo VARCHAR(64) DEFAULT NULL,
    numero_serie VARCHAR(128) DEFAULT NULL,
    hostname VARCHAR(128) DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    correo VARCHAR(255) DEFAULT NULL,
    vnc VARCHAR(64) DEFAULT NULL,
    password_cifrado TEXT DEFAULT NULL,
    admin_password_cifrado TEXT DEFAULT NULL,
    rustdesk_password_cifrado TEXT DEFAULT NULL,
    ubicacion VARCHAR(128) DEFAULT NULL,
    responsable VARCHAR(128) DEFAULT NULL,
    notas TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp ON UPDATE current_timestamp,
    PRIMARY KEY (id),
    KEY idx_assets_device (device_id),
    CONSTRAINT fk_assets_device FOREIGN KEY (device_id)
        REFERENCES devices(device_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comentarios de la ficha de cada equipo.
CREATE TABLE IF NOT EXISTS asset_comments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    asset_id INT NOT NULL,
    autor VARCHAR(128) DEFAULT NULL,
    comentario TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    KEY idx_asset_comments_asset (asset_id),
    CONSTRAINT fk_asset_comments_asset FOREIGN KEY (asset_id)
        REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tickets de soporte (el módulo frontend está en preparación).
CREATE TABLE IF NOT EXISTS tickets (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(32) DEFAULT NULL,
    titulo VARCHAR(180) NOT NULL,
    descripcion TEXT DEFAULT NULL,
    estado ENUM('abierto', 'en proceso', 'resuelto', 'cerrado') NOT NULL DEFAULT 'abierto',
    prioridad ENUM('baja', 'media', 'alta') NOT NULL DEFAULT 'media',
    responsable VARCHAR(128) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp ON UPDATE current_timestamp,
    PRIMARY KEY (id),
    KEY idx_tickets_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mantenimientos programados (el módulo frontend está en preparación).
CREATE TABLE IF NOT EXISTS maintenance (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(32) DEFAULT NULL,
    actividad VARCHAR(180) NOT NULL,
    fecha_programada DATETIME NOT NULL,
    estatus ENUM('pendiente', 'en proceso', 'completado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    responsable VARCHAR(128) DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    origen ENUM('manual', 'anual') NOT NULL DEFAULT 'manual',
    anio_plan INT DEFAULT NULL,
    ronda TINYINT DEFAULT NULL,
    semana TINYINT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    KEY idx_maintenance_fecha (fecha_programada),
    KEY idx_maintenance_estatus (estatus),
    KEY idx_maintenance_plan (origen, anio_plan),
    KEY idx_maintenance_ronda (anio_plan, ronda, semana)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contador atómico para los códigos sgl-0001, sgl-0002, ...
CREATE TABLE IF NOT EXISTS asset_sequence (
    id INT NOT NULL PRIMARY KEY,
    next_value INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO asset_sequence (id, next_value) VALUES (1, 1)
    ON DUPLICATE KEY UPDATE id = id;