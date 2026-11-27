USE monitoreo;

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

CREATE TABLE IF NOT EXISTS maintenance (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(32) DEFAULT NULL,
    actividad VARCHAR(180) NOT NULL,
    tipo ENUM('logico', 'fisico') NOT NULL DEFAULT 'logico',
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
