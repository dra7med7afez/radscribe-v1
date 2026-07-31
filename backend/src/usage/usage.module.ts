import { Module } from "@nestjs/common";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";
import { BillingModule } from "../billing/billing.module";
import { ReportUsageService } from "./report-usage.service";

@Module({
  imports: [BillingModule],
  controllers: [UsageController],
  providers: [UsageService, ReportUsageService],
  exports: [ReportUsageService],
})
export class UsageModule {}
