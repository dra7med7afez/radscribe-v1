DROP INDEX `Patient_organizationId_mrn_idx` ON `Patient`;
CREATE UNIQUE INDEX `Patient_organizationId_mrn_key`
  ON `Patient`(`organizationId`, `mrn`);

ALTER TABLE `ReportVersion`
  ADD CONSTRAINT `ReportVersion_signedById_fkey`
  FOREIGN KEY (`signedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `AiUsage`
  ADD CONSTRAINT `AiUsage_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `AiUsage_reportId_fkey`
  FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
