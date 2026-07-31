-- Personal styles (2026-07-12):
--  1. The ACADEMIC dictation style is removed — replaced by up to two per-user
--     PERSONAL styles, each an AI-distilled profile of the radiologist's own
--     writing (built from their uploaded sample reports + structuring notes).
--     Existing ACADEMIC sessions are folded into CONCISE before the enum change.
--  2. New PersonalStyle table (per-user; the 2-style cap is enforced in code).
--  3. AiUsage.task gains ANALYZE_STYLE for metering style analysis calls.

-- 1. DictationMode: ACADEMIC -> PERSONAL
UPDATE `DictationSession` SET `mode` = 'CONCISE' WHERE `mode` = 'ACADEMIC';
ALTER TABLE `DictationSession`
  MODIFY `mode` ENUM('VERBATIM', 'CONCISE', 'PERSONAL') NOT NULL DEFAULT 'CONCISE';

-- 3. AiUsage.task += ANALYZE_STYLE
ALTER TABLE `AiUsage`
  MODIFY `task` ENUM('REWRITE', 'IMPRESSION', 'STRUCTURE', 'TRANSCRIBE', 'ANALYZE_TEMPLATE', 'ANALYZE_STYLE') NOT NULL;

-- 2. PersonalStyle
CREATE TABLE `PersonalStyle` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `profile` TEXT NOT NULL,
    `structuringNotes` TEXT NULL,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PersonalStyle_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PersonalStyle`
  ADD CONSTRAINT `PersonalStyle_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
