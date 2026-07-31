-- AlterTable
ALTER TABLE `User` ADD COLUMN `googleId` VARCHAR(191) NULL,
    ADD COLUMN `accountType` ENUM('INDIVIDUAL', 'ORGANIZATION') NOT NULL DEFAULT 'INDIVIDUAL',
    ADD COLUMN `organizationName` VARCHAR(191) NULL,
    MODIFY `passwordHash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_googleId_key` ON `User`(`googleId`);
