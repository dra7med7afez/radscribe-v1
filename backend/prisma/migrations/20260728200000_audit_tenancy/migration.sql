ALTER TABLE `AuditLog` ADD COLUMN `organizationId` VARCHAR(191) NULL;

UPDATE `AuditLog` a
JOIN `User` u ON u.`id` = a.`userId`
SET a.`organizationId` = u.`organizationId`
WHERE a.`organizationId` IS NULL;

CREATE INDEX `AuditLog_organizationId_createdAt_idx`
  ON `AuditLog`(`organizationId`, `createdAt`);

ALTER TABLE `AuditLog`
  DROP FOREIGN KEY `AuditLog_userId_fkey`;

ALTER TABLE `AuditLog`
  ADD CONSTRAINT `AuditLog_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AuditLog_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
