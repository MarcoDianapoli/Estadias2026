USE monitoreo;

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
