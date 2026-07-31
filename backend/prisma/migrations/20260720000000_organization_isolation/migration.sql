-- Organization isolation and credential invalidation.
-- Existing accounts receive an individual organization using their user ID;
-- this retains every existing record while preventing future cross-account
-- reads and writes.

CREATE TABLE `Organization` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `User`
    ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `authVersion` INTEGER NOT NULL DEFAULT 0;

INSERT INTO `Organization` (`id`, `name`, `createdAt`, `updatedAt`)
SELECT
    `id`,
    COALESCE(NULLIF(`organizationName`, ''), CONCAT(COALESCE(NULLIF(`name`, ''), `email`), ' personal workspace')),
    NOW(3),
    NOW(3)
FROM `User`;

UPDATE `User` SET `organizationId` = `id` WHERE `organizationId` IS NULL;
ALTER TABLE `User` MODIFY `organizationId` VARCHAR(191) NOT NULL;
CREATE INDEX `User_organizationId_idx` ON `User`(`organizationId`);
ALTER TABLE `User` ADD CONSTRAINT `User_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Template` ADD COLUMN `organizationId` VARCHAR(191) NULL;
UPDATE `Template` t JOIN `User` u ON u.`id` = t.`ownerId`
SET t.`organizationId` = u.`organizationId`
WHERE t.`ownerId` IS NOT NULL;
CREATE INDEX `Template_organizationId_idx` ON `Template`(`organizationId`);
ALTER TABLE `Template` ADD CONSTRAINT `Template_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Deleting the owner must never turn a private template into a global template.
ALTER TABLE `Template` DROP FOREIGN KEY `Template_ownerId_fkey`;
ALTER TABLE `Template` ADD CONSTRAINT `Template_ownerId_fkey`
    FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Report`
    ADD COLUMN `organizationId` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;
UPDATE `Report` r JOIN `User` u ON u.`id` = r.`ownerId`
SET r.`organizationId` = u.`organizationId`
WHERE r.`organizationId` IS NULL;
ALTER TABLE `Report` MODIFY `organizationId` VARCHAR(191) NOT NULL;
CREATE INDEX `Report_organizationId_updatedAt_idx` ON `Report`(`organizationId`, `updatedAt`);
ALTER TABLE `Report` ADD CONSTRAINT `Report_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ReportVersion` ADD COLUMN `signedById` VARCHAR(191) NULL;

ALTER TABLE `Patient` ADD COLUMN `organizationId` VARCHAR(191) NULL;
UPDATE `Patient` p JOIN `User` u ON u.`id` = p.`ownerId`
SET p.`organizationId` = u.`organizationId`
WHERE p.`organizationId` IS NULL;
ALTER TABLE `Patient` MODIFY `organizationId` VARCHAR(191) NOT NULL;
CREATE INDEX `Patient_organizationId_createdAt_idx` ON `Patient`(`organizationId`, `createdAt`);
CREATE INDEX `Patient_organizationId_mrn_idx` ON `Patient`(`organizationId`, `mrn`);
ALTER TABLE `Patient` ADD CONSTRAINT `Patient_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Integration` ADD COLUMN `organizationId` VARCHAR(191) NULL;
-- Legacy integrations were not owned. Assign any to the oldest account so
-- they remain visible for explicit administrator review instead of becoming
-- public configuration.
UPDATE `Integration`
SET `ownerId` = (SELECT `id` FROM `User` ORDER BY `createdAt` ASC LIMIT 1)
WHERE `ownerId` IS NULL;
DELETE FROM `Integration` WHERE `ownerId` IS NULL;
UPDATE `Integration` i JOIN `User` u ON u.`id` = i.`ownerId`
SET i.`organizationId` = u.`organizationId`
WHERE i.`organizationId` IS NULL;
ALTER TABLE `Integration`
    MODIFY `ownerId` VARCHAR(191) NOT NULL,
    MODIFY `organizationId` VARCHAR(191) NOT NULL;
CREATE INDEX `Integration_organizationId_idx` ON `Integration`(`organizationId`);
ALTER TABLE `Integration` ADD CONSTRAINT `Integration_ownerId_fkey`
    FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Integration` ADD CONSTRAINT `Integration_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
