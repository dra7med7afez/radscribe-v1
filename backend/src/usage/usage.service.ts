import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtUser } from "../common/decorators";
import { SubscriptionsService } from "../billing/subscriptions.service";

const RECENT_LIMIT = 50;

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService, private subscriptions: SubscriptionsService) {}

  async me(user: JwtUser) {
    return (await this.subscriptions.me(user.id)).usage;
  }

  async history(user: JwtUser) {
    const subscription = await this.subscriptions.resolveForUser(user.id);
    return this.prisma.usagePeriod.findMany({
      where: { subscriptionId: subscription.id },
      orderBy: { periodStart: "desc" },
      take: 24,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        baseReportLimit: true,
        reportsUsed: true,
        bonusReports: true,
        adjustments: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            reportsUsedDelta: true,
            bonusReportsDelta: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async summary(user: JwtUser) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const where = { ownerId: user.id, organizationId: user.organizationId, status: "FINAL" as const };
    const [total, today, recent] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.count({ where: { ...where, updatedAt: { gte: startOfDay } } }),
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: RECENT_LIMIT,
        select: { id: true, studyDescription: true, updatedAt: true },
      }),
    ]);
    return { total, today, recent };
  }
}
