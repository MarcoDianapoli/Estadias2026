USE monitoreo;

-- Cuentas locales de Loganmex. El PIN se guarda como hash scrypt, nunca en texto.
CREATE TABLE IF NOT EXISTS ticket_users (
    id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(80) NOT NULL,
    pin_salt CHAR(32) NOT NULL,
    pin_hash CHAR(64) NOT NULL,
    rol ENUM('usuario', 'tecnico', 'admin') NOT NULL DEFAULT 'usuario',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    creado_en TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ticket_users_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_sessions (
    id INT NOT NULL AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT current_timestamp,
    expira_en TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ticket_sessions_token (token_hash),
    KEY idx_ticket_sessions_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_events (
    id INT NOT NULL AUTO_INCREMENT,
    ticket_id INT NOT NULL,
    usuario_id INT NULL,
    accion VARCHAR(40) NOT NULL,
    detalle VARCHAR(255) NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    KEY idx_ticket_events_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_messages (
    id INT NOT NULL AUTO_INCREMENT,
    ticket_id INT NOT NULL,
    usuario_id INT NOT NULL,
    mensaje TEXT NOT NULL,
    leido_en TIMESTAMP NULL DEFAULT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT current_timestamp,
    PRIMARY KEY (id),
    KEY idx_ticket_messages_ticket (ticket_id),
    KEY idx_ticket_messages_chat (ticket_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- La tabla tickets ya existía; solo agregamos quién reporta, quién atiende y cuándo cierra.
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS solicitante_usuario_id INT NULL AFTER responsable,
    ADD COLUMN IF NOT EXISTS tecnico_usuario_id INT NULL AFTER solicitante_usuario_id,
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(60) NULL AFTER codigo,
    ADD COLUMN IF NOT EXISTS tomado_en TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
    ADD COLUMN IF NOT EXISTS resuelto_en TIMESTAMP NULL DEFAULT NULL AFTER tomado_en,
    ADD COLUMN IF NOT EXISTS cerrado_en TIMESTAMP NULL DEFAULT NULL AFTER resuelto_en;
