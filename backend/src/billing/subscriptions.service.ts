import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { usagePeriodBounds } from "./subscription-period";

const SUBSCRIPTION_INCLUDE = { plan: true, pendingPlan: true } as const;

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async resolveForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        usageSubscription: { include: SUBSCRIPTION_INCLUDE },
      },
    });
    const subscription = user?.usageSubscription;
    if (!subscription) throw new ServiceUnavailableException("Subscription is not configured");
    return subscription;
  }

  effectiveLimit(subscription: {
    customReportLimit: number | null;
    plan: { defaultReportLimit: number | null };
  }): number {
    const limit = subscription.customReportLimit ?? subscription.plan.defaultReportLimit;
    if (limit === null || limit < 0) {
      throw new ServiceUnavailableException("Report allowance is not configured");
    }
    return limit;
  }

  async currentPeriodForUser(userId: string, now = new Date()) {
    let subscription = await this.resolveForUser(userId);
    if (
      subscription.pendingPlanId &&
      subscription.pendingChangeAt &&
      subscription.pendingChangeAt <= now
    ) {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: subscription.pendingPlanId!,
            billingCycle: subscription.pendingBillingCycle ?? subscription.billingCycle,
            customReportLimit: subscription.pendingCustomReportLimit,
            pendingPlanId: null,
            pendingBillingCycle: null,
            pendingCustomReportLimit: null,
            pendingChangeAt: null,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: null,
            action: "apply-scheduled-plan-change",
            resource: "subscription",
            meta: { subscriptionId: subscription.id, memberUserId: userId } as any,
          },
        });
      });
      subscription = await this.resolveForUser(userId);
    }
    const bounds = usagePeriodBounds(subscription.usageAnchorAt, subscription.plan.usageInterval, now);
    let period = await this.prisma.usagePeriod.findUnique({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: subscription.id,
          periodStart: bounds.start,
        },
      },
    });
    if (!period) {
      try {
        period = await this.prisma.usagePeriod.create({
          data: {
            subscriptionId: subscription.id,
            periodStart: bounds.start,
            periodEnd: bounds.end,
            baseReportLimit: this.effectiveLimit(subscription),
          },
        });
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
        period = await this.prisma.usagePeriod.findUnique({
          where: {
            subscriptionId_periodStart: {
              subscriptionId: subscription.id,
              periodStart: bounds.start,
            },
          },
        });
      }
    }
    if (!period) throw new ServiceUnavailableException("Usage period could not be created");
    const periodChanged =
      subscription.currentPeriodStart.getTime() !== bounds.start.getTime() ||
      subscription.currentPeriodEnd?.getTime() !== bounds.end?.getTime();
    const shouldCancel =
      subscription.cancelAtPeriodEnd &&
      !!subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd <= now;
    if (periodChanged || shouldCancel) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: bounds.start,
          currentPeriodEnd: bounds.end,
          ...(shouldCancel ? { status: "CANCELED" } : {}),
        },
      });
      subscription = await this.resolveForUser(userId);
    }
    return { subscription, period };
  }

  async me(userId: string) {
    const { subscription, period } = await this.currentPeriodForUser(userId);
    const limit = period.baseReportLimit + period.bonusReports;
    return {
      subscriptionId: subscription.id,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      pendingChangeAt: subscription.pendingChangeAt,
      pendingPlan: subscription.pendingPlan?.code ?? null,
      plan: {
        id: subscription.plan.id,
        code: subscription.plan.code,
        name: subscription.plan.name,
        isEnterprise: subscription.plan.isEnterprise,
      },
      usage: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        used: period.reportsUsed,
        bonus: period.bonusReports,
        limit,
        remaining: Math.max(0, limit - period.reportsUsed),
      },
    };
  }
}
