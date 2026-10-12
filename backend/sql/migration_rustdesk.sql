USE monitoreo;

ALTER TABLE assets
    ADD COLUMN rustdesk_password_cifrado TEXT DEFAULT NULL AFTER admin_password_cifrado;
