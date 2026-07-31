import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { usagePeriodBounds } from "./subscription-period";

@Injectable()
export class SubscriptionProvisioningService {
  async createFreeForUser(tx: Prisma.TransactionClient, userId: string, now = new Date()) {
    const plan = await tx.plan.findUnique({ where: { code: "FREE" } });
    if (!plan || plan.defaultReportLimit === null) {
      throw new ServiceUnavailableException("Free plan is not configured");
    }
    const bounds = usagePeriodBounds(now, plan.usageInterval, now);
    const subscription = await tx.subscription.create({
      data: {
        ownerUserId: userId,
        planId: plan.id,
        status: "ACTIVE",
        billingCycle: "NONE",
        currentPeriodStart: now,
        currentPeriodEnd: bounds.end,
        usageAnchorAt: now,
      },
    });
    await tx.usagePeriod.create({
      data: {
        subscriptionId: subscription.id,
        periodStart: bounds.start,
        periodEnd: bounds.end,
        baseReportLimit: plan.defaultReportLimit,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { usageSubscriptionId: subscription.id },
    });
    return subscription;
  }
}

