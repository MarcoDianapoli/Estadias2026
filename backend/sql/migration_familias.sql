-- Familias de la hoja "Familias" del Excel: CPU, Teclado, Ratón, Monitor, Laptop.
-- Se guardan en un solo campo separado por comas para poder filtrar por familia.
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS familias VARCHAR(255) DEFAULT NULL AFTER tipo;
