USE monitoreo;

CREATE TABLE IF NOT EXISTS tickets (
    id INT NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(32) DEFAULT NULL,
    titulo VARCHAR(180) NOT NULL,
    descripcion TEXT DEFAULT NULL,
    estado ENUM('Abierto', 'En proceso', 'Resuelto', 'Cerrado') NOT NULL DEFAULT 'Abierto',
    prioridad ENUM('Baja', 'Media', 'Alta') NOT NULL DEFAULT 'Media',
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
    fecha_programada DATETIME NOT NULL,
    estatus ENUM('Pendiente', 'En proceso', 'Completado', 'Cancelado') NOT NULL DEFAULT 'Pendiente',
    responsable VARCHAR(128) DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    KEY idx_maintenance_fecha (fecha_programada),
    KEY idx_maintenance_estatus (estatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
