import { Module } from "@nestjs/common";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionProvisioningService } from "./subscription-provisioning.service";
import { AdminBillingController } from "./admin-billing.controller";
import { AdminBillingService } from "./admin-billing.service";

@Module({
  controllers: [PlansController, SubscriptionsController, AdminBillingController],
  providers: [PlansService, SubscriptionsService, SubscriptionProvisioningService, AdminBillingService],
  exports: [PlansService, SubscriptionsService, SubscriptionProvisioningService],
})
export class BillingModule {}
