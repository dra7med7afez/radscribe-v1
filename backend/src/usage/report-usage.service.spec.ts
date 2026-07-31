import { ReportUsageService } from "./report-usage.service";
import { ReportLimitReachedException } from "./usage.exceptions";

const user = {
  id: "user-1",
  email: "doctor@example.com",
  roles: ["RADIOLOGIST"],
  permissions: [],
  organizationId: "org-1",
  mustChangePassword: false,
  authVersion: 0,
  mfaEnabled: false,
};

function setup(overrides: { counted?: boolean; used?: number; operationFails?: boolean } = {}) {
  const event = {
    id: "event-1",
    reportId: "report-1",
    usagePeriodId: "period-1",
    status: "RESERVED",
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    report: {
      findFirst: jest.fn().mockResolvedValue({ usageCountedAt: overrides.counted ? new Date() : null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    reportUsageEvent: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValue(event),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(event),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    usagePeriod: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: "period-1",
        reportsUsed: overrides.used ?? 0,
        baseReportLimit: 20,
        bonusReports: 0,
        periodEnd: new Date("2026-08-22T00:00:00.000Z"),
      }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    report: {
      findFirst: jest.fn().mockResolvedValue({
        id: "report-1",
        usageCountedAt: overrides.counted ? new Date() : null,
      }),
    },
    reportUsageEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const summary = {
    usage: { periodStart: new Date(), periodEnd: null, used: 1, bonus: 0, limit: 20, remaining: 19 },
  };
  const subscriptions: any = {
    currentPeriodForUser: jest.fn().mockResolvedValue({
      subscription: { id: "sub-1", status: "ACTIVE", plan: { name: "Free" } },
      period: { id: "period-1" },
    }),
    me: jest.fn().mockResolvedValue(summary),
  };
  return { service: new ReportUsageService(prisma, subscriptions), prisma, tx, subscriptions };
}

describe("ReportUsageService", () => {
  it("consumes exactly one credit after successful first generation", async () => {
    const { service, tx } = setup();
    const result = await service.execute(
      user,
      "report-1",
      async () => ({ results: [{ text: "finding" }] }),
      (value) => value.results.length > 0
    );
    expect(result.results).toHaveLength(1);
    expect(tx.reportUsageEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.reportUsageEvent.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.usagePeriod.update).toHaveBeenCalledWith({
      where: { id: "period-1" },
      data: { reportsUsed: { increment: 1 } },
    });
  });

  it("does not reserve or consume again for a counted report", async () => {
    const { service, prisma, subscriptions } = setup({ counted: true });
    await service.execute(
      user,
      "report-1",
      async () => ({ results: [{ text: "rewrite" }] }),
      () => true
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(subscriptions.currentPeriodForUser).toHaveBeenCalledWith("user-1");
  });

  it("returns the structured limit error before calling the provider", async () => {
    const { service } = setup({ used: 20 });
    const operation = jest.fn();
    await expect(service.execute(user, "report-1", operation, () => true)).rejects.toBeInstanceOf(
      ReportLimitReachedException
    );
    expect(operation).not.toHaveBeenCalled();
  });
});
