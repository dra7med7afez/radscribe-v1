-- Tenancy + hardening (2026-07-11):
--  1. Patient rows become per-user (ownerId) — patients are PHI and must never
--     be visible across accounts. Existing rows are backfilled to the oldest
--     ADMIN user (or the oldest user if no admin exists).
--  2. Report.ownerId FK changes CASCADE -> RESTRICT: deleting a user must fail
--     while their (potentially signed) reports exist. Same for Patient.ownerId.
--  3. RefreshToken.tokenHash gets an index — refresh/logout look tokens up by
--     hash and previously full-table-scanned.

-- 1a. Patient.ownerId (nullable first, for the backfill)
ALTER TABLE `Patient` ADD COLUMN `ownerId` VARCHAR(191) NULL;

-- 1b. Backfill existing patients to the oldest ADMIN, else the oldest user.
UPDATE `Patient` p
SET p.`ownerId` = COALESCE(
    (SELECT u.`id`
       FROM `User` u
       JOIN `UserRole` ur ON ur.`userId` = u.`id`
       JOIN `Role` r ON r.`id` = ur.`roleId` AND r.`name` = 'ADMIN'
      ORDER BY u.`createdAt` ASC
      LIMIT 1),
    (SELECT u2.`id` FROM `User` u2 ORDER BY u2.`createdAt` ASC LIMIT 1)
)
WHERE p.`ownerId` IS NULL;

-- Only possible when the User table is empty — such rows are unreachable anyway.
DELETE FROM `Patient` WHERE `ownerId` IS NULL;

ALTER TABLE `Patient` MODIFY `ownerId` VARCHAR(191) NOT NULL;

-- 1c. Index + FK
CREATE INDEX `Patient_ownerId_idx` ON `Patient`(`ownerId`);
ALTER TABLE `Patient` ADD CONSTRAINT `Patient_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Report owner FK: CASCADE -> RESTRICT (medico-legal record retention)
ALTER TABLE `Report` DROP FOREIGN KEY `Report_ownerId_fkey`;
ALTER TABLE `Report` ADD CONSTRAINT `Report_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Token-hash lookup index + revocation timestamp (reuse detection)
CREATE INDEX `RefreshToken_tokenHash_idx` ON `RefreshToken`(`tokenHash`);
ALTER TABLE `RefreshToken` ADD COLUMN `revokedAt` DATETIME(3) NULL;
