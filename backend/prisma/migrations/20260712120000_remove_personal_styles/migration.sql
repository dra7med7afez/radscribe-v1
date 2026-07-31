-- Remove the personal-styles feature (2026-07-12, same-day rollback of
-- 20260712000000_personal_styles): the PersonalStyle table is dropped and the
-- enums revert. Any PERSONAL dictation sessions fold into CONCISE; metering
-- rows for the removed ANALYZE_STYLE task are deleted.

DROP TABLE IF EXISTS `PersonalStyle`;

UPDATE `DictationSession` SET `mode` = 'CONCISE' WHERE `mode` = 'PERSONAL';
ALTER TABLE `DictationSession`
  MODIFY `mode` ENUM('VERBATIM', 'CONCISE') NOT NULL DEFAULT 'CONCISE';

DELETE FROM `AiUsage` WHERE `task` = 'ANALYZE_STYLE';
ALTER TABLE `AiUsage`
  MODIFY `task` ENUM('REWRITE', 'IMPRESSION', 'STRUCTURE', 'TRANSCRIBE', 'ANALYZE_TEMPLATE') NOT NULL;
