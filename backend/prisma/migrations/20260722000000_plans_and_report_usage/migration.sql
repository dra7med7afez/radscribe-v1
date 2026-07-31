-- Database-backed plans, subscriptions, and exactly-once report credits.

CREATE TABLE `Plan` (
    `id` VARCHAR(191) NOT NULL,
    `code` ENUM('FREE', 'PRO', 'ULTRA', 'ENTERPRISE') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `monthlyPriceCents` INTEGER NULL,
    `yearlyPriceCents` INTEGER NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `defaultReportLimit` INTEGER NULL,
    `usageInterval` ENUM('MONTHLY', 'LIFETIME') NOT NULL DEFAULT 'MONTHLY',
    `isEnterprise` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `features` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Plan_code_key`(`code`),
    CONSTRAINT `Plan_prices_nonnegative` CHECK (
      (`monthlyPriceCents` IS NULL OR `monthlyPriceCents` >= 0) AND
      (`yearlyPriceCents` IS NULL OR `yearlyPriceCents` >= 0) AND
      (`defaultReportLimit` IS NULL OR `defaultReportLimit` >= 0)
    ),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Plan`
  (`id`, `code`, `name`, `description`, `monthlyPriceCents`, `yearlyPriceCents`, `currency`, `defaultReportLimit`, `usageInterval`, `isEnterprise`, `isActive`, `createdAt`, `updatedAt`)
VALUES
  ('plan-free', 'FREE', 'Free', 'For users trying RadScribe', 0, 0, 'USD', 20, 'MONTHLY', false, true, NOW(3), NOW(3)),
  ('plan-pro', 'PRO', 'Pro', 'For regular reporting workflows', NULL, NULL, 'USD', 500, 'MONTHLY', false, true, NOW(3), NOW(3)),
  ('plan-ultra', 'ULTRA', 'Ultra', 'For higher-volume reporting workflows', NULL, NULL, 'USD', 1000, 'MONTHLY', false, true, NOW(3), NOW(3)),
  ('plan-enterprise', 'ENTERPRISE', 'Enterprise', 'Custom usage and pricing', NULL, NULL, 'USD', NULL, 'MONTHLY', true, true, NOW(3), NOW(3));

CREATE TABLE `Subscription` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NULL,
    `ownerOrganizationId` VARCHAR(191) NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'PAST_DUE', 'CANCELED') NOT NULL DEFAULT 'ACTIVE',
    `billingCycle` ENUM('NONE', 'MONTHLY', 'YEARLY') NOT NULL DEFAULT 'NONE',
    `currentPeriodStart` DATETIME(3) NOT NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `usageAnchorAt` DATETIME(3) NOT NULL,
    `customReportLimit` INTEGER NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `pendingPlanId` VARCHAR(191) NULL,
    `pendingBillingCycle` ENUM('NONE', 'MONTHLY', 'YEARLY') NULL,
    `pendingCustomReportLimit` INTEGER NULL,
    `pendingChangeAt` DATETIME(3) NULL,
    `provider` VARCHAR(191) NULL,
    `providerCustomerId` VARCHAR(191) NULL,
    `providerSubscriptionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Subscription_ownerUserId_key`(`ownerUserId`),
    UNIQUE INDEX `Subscription_ownerOrganizationId_key`(`ownerOrganizationId`),
    UNIQUE INDEX `Subscription_providerCustomerId_key`(`providerCustomerId`),
    UNIQUE INDEX `Subscription_providerSubscriptionId_key`(`providerSubscriptionId`),
    INDEX `Subscription_planId_status_idx`(`planId`, `status`),
    -- Ownership exclusivity is enforced by the subscription provisioning
    -- service. MySQL does not allow these columns in a CHECK constraint and
    -- in the foreign keys with referential actions declared below.
    CONSTRAINT `Subscription_custom_limit_nonnegative` CHECK (`customReportLimit` IS NULL OR `customReportLimit` >= 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `User` ADD COLUMN `usageSubscriptionId` VARCHAR(191) NULL;
ALTER TABLE `Report` ADD COLUMN `usageCountedAt` DATETIME(3) NULL;
ALTER TABLE `AiUsage`
    ADD COLUMN `reportId` VARCHAR(191) NULL,
    ADD COLUMN `provider` VARCHAR(191) NULL,
    ADD COLUMN `audioDurationMs` INTEGER NULL,
    ADD COLUMN `estimatedCostMicros` BIGINT NULL,
    ADD COLUMN `currency` VARCHAR(191) NULL DEFAULT 'USD';

-- Existing reports are grandfathered so reopening one after launch never
-- consumes a credit. Existing accounts start with a fresh Free allowance.
UPDATE `Report` SET `usageCountedAt` = NOW(3) WHERE `usageCountedAt` IS NULL;

INSERT INTO `Subscription`
  (`id`, `ownerUserId`, `planId`, `status`, `billingCycle`, `currentPeriodStart`, `currentPeriodEnd`, `usageAnchorAt`, `createdAt`, `updatedAt`)
SELECT
  u.`id`, u.`id`, 'plan-free', 'ACTIVE', 'NONE', NOW(3), DATE_ADD(NOW(3), INTERVAL 1 MONTH), NOW(3), NOW(3), NOW(3)
FROM `User` u;

UPDATE `User` SET `usageSubscriptionId` = `id` WHERE `usageSubscriptionId` IS NULL;

CREATE TABLE `UsagePeriod` (
    `id` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `periodStart` DATETIME(3) NOT NULL,
    `periodEnd` DATETIME(3) NULL,
    `baseReportLimit` INTEGER NOT NULL,
    `reportsUsed` INTEGER NOT NULL DEFAULT 0,
    `bonusReports` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `UsagePeriod_subscriptionId_periodStart_key`(`subscriptionId`, `periodStart`),
    INDEX `UsagePeriod_subscriptionId_periodEnd_idx`(`subscriptionId`, `periodEnd`),
    CONSTRAINT `UsagePeriod_values_nonnegative` CHECK (`baseReportLimit` >= 0 AND `reportsUsed` >= 0 AND `bonusReports` >= 0),
    CONSTRAINT `UsagePeriod_dates_valid` CHECK (`periodEnd` IS NULL OR `periodEnd` > `periodStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `UsagePeriod`
  (`id`, `subscriptionId`, `periodStart`, `periodEnd`, `baseReportLimit`, `reportsUsed`, `bonusReports`, `createdAt`, `updatedAt`)
SELECT
  MD5(CONCAT(s.`id`, ':initial-usage')), s.`id`, s.`currentPeriodStart`, s.`currentPeriodEnd`, 20, 0, 0, NOW(3), NOW(3)
FROM `Subscription` s;

CREATE TABLE `ReportUsageEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `usagePeriodId` VARCHAR(191) NOT NULL,
    `eventType` ENUM('REPORT_CREDIT') NOT NULL DEFAULT 'REPORT_CREDIT',
    `status` ENUM('RESERVED', 'CONSUMED') NOT NULL DEFAULT 'RESERVED',
    `reservationExpiresAt` DATETIME(3) NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ReportUsageEvent_reportId_eventType_key`(`reportId`, `eventType`),
    INDEX `ReportUsageEvent_usagePeriodId_status_idx`(`usagePeriodId`, `status`),
    INDEX `ReportUsageEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    CONSTRAINT `ReportUsageEvent_status_dates` CHECK (
      (`status` = 'RESERVED' AND `reservationExpiresAt` IS NOT NULL AND `consumedAt` IS NULL) OR
      (`status` = 'CONSUMED' AND `consumedAt` IS NOT NULL)
    ),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UsageAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `usagePeriodId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `reportsUsedDelta` INTEGER NOT NULL DEFAULT 0,
    `bonusReportsDelta` INTEGER NOT NULL DEFAULT 0,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `UsageAdjustment_usagePeriodId_createdAt_idx`(`usagePeriodId`, `createdAt`),
    CONSTRAINT `UsageAdjustment_nonempty` CHECK (`reportsUsedDelta` <> 0 OR `bonusReportsDelta` <> 0),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `User_usageSubscriptionId_idx` ON `User`(`usageSubscriptionId`);
CREATE INDEX `AiUsage_reportId_idx` ON `AiUsage`(`reportId`);

ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_ownerOrganizationId_fkey` FOREIGN KEY (`ownerOrganizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Subscription` ADD CONSTRAINT `Subscription_pendingPlanId_fkey` FOREIGN KEY (`pendingPlanId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `User` ADD CONSTRAINT `User_usageSubscriptionId_fkey` FOREIGN KEY (`usageSubscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `UsagePeriod` ADD CONSTRAINT `UsagePeriod_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReportUsageEvent` ADD CONSTRAINT `ReportUsageEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReportUsageEvent` ADD CONSTRAINT `ReportUsageEvent_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `Report`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReportUsageEvent` ADD CONSTRAINT `ReportUsageEvent_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `Subscription`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReportUsageEvent` ADD CONSTRAINT `ReportUsageEvent_usagePeriodId_fkey` FOREIGN KEY (`usagePeriodId`) REFERENCES `UsagePeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UsageAdjustment` ADD CONSTRAINT `UsageAdjustment_usagePeriodId_fkey` FOREIGN KEY (`usagePeriodId`) REFERENCES `UsagePeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UsageAdjustment` ADD CONSTRAINT `UsageAdjustment_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
