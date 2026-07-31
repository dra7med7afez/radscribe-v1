import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { JwtUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "./subscriptions.service";
import { UpdatePlanDto, UpdateSubscriptionDto, UsageAdjustmentDto } from "./dto";

@Injectable()
export class AdminBillingService {
  constructor(private prisma: PrismaService, private subscriptions: SubscriptionsService) {}

  private isPlatformAdmin(actor: JwtUser) {
    return actor.roles.includes("PLATFORM_ADMIN") || actor.permissions.includes("manage:*");
  }

  private async assertCanManageUser(actor: JwtUser, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true },
    });
    if (!user) throw new NotFoundException("User not found");
    if (
      !this.isPlatformAdmin(actor) &&
      (!actor.organizationId || user.organizationId !== actor.organizationId)
    ) {
      throw new ForbiddenException("Cannot manage users outside your organization");
    }
    return user;
  }

  async searchUsers(actor: JwtUser, query = "") {
    const q = query.trim().slice(0, 100);
    const tenantWhere = this.isPlatformAdmin(actor)
      ? {}
      : { organizationId: actor.organizationId || "__no-organization__" };
    return this.prisma.user.findMany({
      where: {
        ...tenantWhere,
        ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {}),
      },
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        active: true,
        organizationId: true,
        usageSubscription: {
          select: { status: true, plan: { select: { code: true, name: true } } },
        },
      },
    });
  }

  async getUserSubscription(actor: JwtUser, userId: string) {
    await this.assertCanManageUser(actor, userId);
    return this.subscriptions.me(userId);
  }

  async updateUserSubscription(actor: JwtUser, userId: string, dto: UpdateSubscriptionDto) {
    await this.assertCanManageUser(actor, userId);
    const { subscription, period } = await this.subscriptions.currentPeriodForUser(userId);
    const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw new NotFoundException("Plan not found");
    const customLimit = dto.customReportLimit ?? null;
    const nextLimit = customLimit ?? plan.defaultReportLimit;
    if (nextLimit === null) throw new BadRequestException("Enterprise requires a custom report limit");
    const billingCycle = dto.billingCycle ?? (plan.code === "FREE" ? "NONE" : subscription.billingCycle);

    const scheduleChange = !!dto.applyAtPeriodEnd || nextLimit < period.baseReportLimit;
    if (scheduleChange) {
      const changeAt = period.periodEnd ?? subscription.currentPeriodEnd;
      if (!changeAt) throw new BadRequestException("A lifetime period has no automatic change date");
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            pendingPlanId: plan.id,
            pendingBillingCycle: billingCycle,
            pendingCustomReportLimit: customLimit,
            pendingChangeAt: changeAt,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "schedule-plan-change",
            resource: "subscription",
            meta: { targetUserId: userId, from: subscription.plan.code, to: plan.code, changeAt } as any,
          },
        });
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: plan.id,
            billingCycle,
            customReportLimit: customLimit,
            pendingPlanId: null,
            pendingBillingCycle: null,
            pendingCustomReportLimit: null,
            pendingChangeAt: null,
          },
        });
        await tx.usagePeriod.update({
          where: { id: period.id },
          data: { baseReportLimit: nextLimit },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.id,
            action: "change-plan",
            resource: "subscription",
            meta: { targetUserId: userId, from: subscription.plan.code, to: plan.code, limit: nextLimit } as any,
          },
        });
      });
    }
    return this.subscriptions.me(userId);
  }

  async adjustUsage(actor: JwtUser, userId: string, dto: UsageAdjustmentDto) {
    await this.assertCanManageUser(actor, userId);
    if (!dto.reason.trim()) throw new BadRequestException("Adjustment reason is required");
    if (!dto.reportsUsedDelta && !dto.bonusReportsDelta) {
      throw new BadRequestException("At least one adjustment delta is required");
    }
    const { period } = await this.subscriptions.currentPeriodForUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM UsagePeriod WHERE id = ${period.id} FOR UPDATE`);
      const current = await tx.usagePeriod.findUniqueOrThrow({ where: { id: period.id } });
      const reportsUsed = current.reportsUsed + dto.reportsUsedDelta;
      const bonusReports = current.bonusReports + dto.bonusReportsDelta;
      if (reportsUsed < 0 || bonusReports < 0) {
        throw new BadRequestException("Adjustment cannot make usage or bonus credits negative");
      }
      await tx.usagePeriod.update({ where: { id: period.id }, data: { reportsUsed, bonusReports } });
      await tx.usageAdjustment.create({
        data: {
          usagePeriodId: period.id,
          actorUserId: actor.id,
          reportsUsedDelta: dto.reportsUsedDelta,
          bonusReportsDelta: dto.bonusReportsDelta,
          reason: dto.reason.trim(),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "adjust-usage",
          resource: "subscription",
          meta: { targetUserId: userId, ...dto } as any,
        },
      });
    });
    return this.subscriptions.me(userId);
  }

  async events(actor: JwtUser, userId: string) {
    await this.assertCanManageUser(actor, userId);
    return this.prisma.reportUsageEvent.findMany({
      where: { userId, status: "CONSUMED" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, reportId: true, usagePeriodId: true, eventType: true, consumedAt: true },
    });
  }

  async history(actor: JwtUser, userId: string) {
    await this.assertCanManageUser(actor, userId);
    const subscription = await this.subscriptions.resolveForUser(userId);
    return this.prisma.usagePeriod.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { periodStart: "desc" },
      include: { adjustments: { orderBy: { createdAt: "desc" } } },
    });
  }

  async updatePlan(code: string, dto: UpdatePlanDto, actorId: string) {
    if (!["FREE", "PRO", "ULTRA", "ENTERPRISE"].includes(code)) {
      throw new NotFoundException("Plan not found");
    }
    if (code === "ENTERPRISE" && dto.defaultReportLimit !== undefined && dto.defaultReportLimit !== null) {
      throw new BadRequestException("Enterprise uses per-subscription custom limits");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({ where: { code: code as any }, data: dto as any });
      await tx.auditLog.create({
        data: { userId: actorId, action: "update-plan", resource: "plan", meta: { code, ...dto } as any },
      });
      return plan;
    });
    return updated;
  }
}
