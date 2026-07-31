-- AlterTable
ALTER TABLE `User` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `settings` JSON NULL;

-- AlterTable
ALTER TABLE `TemplateSection` ADD COLUMN `bulletStyle` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `TemplateFinding` ADD COLUMN `children` JSON NULL,
    ADD COLUMN `subpoints` JSON NULL;

-- AlterTable
ALTER TABLE `ReportItem` ADD COLUMN `subpoints` JSON NULL;

-- AlterTable
ALTER TABLE `AiUsage` ADD COLUMN `userId` VARCHAR(191) NULL,
    MODIFY `task` ENUM('REWRITE', 'IMPRESSION', 'STRUCTURE', 'TRANSCRIBE', 'ANALYZE_TEMPLATE') NOT NULL;

-- AlterTable
ALTER TABLE `Integration` ADD COLUMN `ownerId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ReportEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReportEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `AiUsage_userId_idx` ON `AiUsage`(`userId`);

-- AddForeignKey
ALTER TABLE `ReportEvent` ADD CONSTRAINT `ReportEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

