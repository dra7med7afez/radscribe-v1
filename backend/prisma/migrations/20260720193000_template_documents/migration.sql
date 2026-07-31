ALTER TABLE `Template`
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `document` JSON NULL,
    ADD COLUMN `editorSettings` JSON NULL;
