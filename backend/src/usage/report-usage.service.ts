import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { JwtUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { SubscriptionsService } from "../billing/subscriptions.service";
import {
  ReportGenerationInProgressException,
  ReportLimitReachedException,
  SubscriptionInactiveException,
} from "./usage.exceptions";

const RESERVATION_TTL_MS = 15 * 60 * 1000;

type Reservation =
  | { alreadyCounted: true }
  | { alreadyCounted: false; eventId: string; reportId: string };

@Injectable()
export class ReportUsageService {
  constructor(
    private prisma: PrismaService,
    private subscriptions: SubscriptionsService
  ) {}

  async assertReportOwned(user: JwtUser, reportId: string) {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, ownerId: user.id, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!report) throw new NotFoundException("Report not found");
  }

  private async reserve(user: JwtUser, reportId: string): Promise<Reservation> {
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, ownerId: user.id, organizationId: user.organizationId },
      select: { id: true, usageCountedAt: true },
    });
    if (!report) throw new NotFoundException("Report not found");
    const { subscription, period } = await this.subscriptions.currentPeriodForUser(user.id);
    if (subscription.status !== "ACTIVE") {
      throw new SubscriptionInactiveException(subscription.status);
    }
    if (report.usageCountedAt) return { alreadyCounted: true };

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM UsagePeriod WHERE id = ${period.id} FOR UPDATE`
      );

      const freshReport = await tx.report.findFirst({
        where: { id: reportId, ownerId: user.id, organizationId: user.organizationId },
        select: { usageCountedAt: true },
      });
      if (!freshReport) throw new NotFoundException("Report not found");
      if (freshReport.usageCountedAt) return { alreadyCounted: true } as const;

      const now = new Date();
      await tx.reportUsageEvent.deleteMany({
        where: {
          reportId,
          eventType: "REPORT_CREDIT",
          status: "RESERVED",
          reservationExpiresAt: { lt: now },
        },
      });

      const existing = await tx.reportUsageEvent.findUnique({
        where: { reportId_eventType: { reportId, eventType: "REPORT_CREDIT" } },
      });
      if (existing?.status === "CONSUMED") {
        await tx.report.updateMany({
          where: { id: reportId, usageCountedAt: null },
          data: { usageCountedAt: existing.consumedAt ?? now },
        });
        return { alreadyCounted: true } as const;
      }
      if (existing) throw new ReportGenerationInProgressException();

      const lockedPeriod = await tx.usagePeriod.findUniqueOrThrow({ where: { id: period.id } });
      const reservations = await tx.reportUsageEvent.count({
        where: {
          usagePeriodId: period.id,
          status: "RESERVED",
          reservationExpiresAt: { gte: now },
        },
      });
      const limit = lockedPeriod.baseReportLimit + lockedPeriod.bonusReports;
      if (lockedPeriod.reportsUsed + reservations >= limit) {
        throw new ReportLimitReachedException({
          plan: subscription.plan.name,
          limit,
          used: lockedPeriod.reportsUsed,
          remaining: Math.max(0, limit - lockedPeriod.reportsUsed),
          periodEnd: lockedPeriod.periodEnd,
        });
      }

      const eventId = randomUUID();
      await tx.reportUsageEvent.create({
        data: {
          id: eventId,
          userId: user.id,
          reportId,
          subscriptionId: subscription.id,
          usagePeriodId: period.id,
          eventType: "REPORT_CREDIT",
          status: "RESERVED",
          reservationExpiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
        },
      });
      return { alreadyCounted: false, eventId, reportId } as const;
    });
  }

  private async finalize(eventId: string) {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.reportUsageEvent.findUnique({ where: { id: eventId } });
      if (!event) throw new ConflictException("Report generation reservation expired; retry safely");
      if (event.status === "CONSUMED") return;

      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM UsagePeriod WHERE id = ${event.usagePeriodId} FOR UPDATE`
      );
      const consumedAt = new Date();
      const consumed = await tx.reportUsageEvent.updateMany({
        where: { id: eventId, status: "RESERVED" },
        data: {
          status: "CONSUMED",
          consumedAt,
          reservationExpiresAt: null,
        },
      });
      if (consumed.count !== 1) return;
      await tx.usagePeriod.update({
        where: { id: event.usagePeriodId },
        data: { reportsUsed: { increment: 1 } },
      });
      await tx.report.updateMany({
        where: { id: event.reportId, usageCountedAt: null },
        data: { usageCountedAt: consumedAt },
      });
    });
  }

  private async release(eventId: string) {
    await this.prisma.reportUsageEvent.deleteMany({
      where: { id: eventId, status: "RESERVED" },
    });
  }

  async execute<T extends Record<string, unknown>>(
    user: JwtUser,
    reportId: string,
    operation: () => Promise<T>,
    isSuccessful: (value: T) => boolean
  ): Promise<T & { usage: Awaited<ReturnType<SubscriptionsService["me"]>>["usage"] }> {
    const reservation = await this.reserve(user, reportId);
    try {
      const value = await operation();
      if (!reservation.alreadyCounted) {
        if (isSuccessful(value)) await this.finalize(reservation.eventId);
        else await this.release(reservation.eventId);
      }
      const summary = await this.subscriptions.me(user.id);
      return { ...value, usage: summary.usage };
    } catch (error) {
      if (!reservation.alreadyCounted) await this.release(reservation.eventId).catch(() => undefined);
      throw error;
    }
  }
}
