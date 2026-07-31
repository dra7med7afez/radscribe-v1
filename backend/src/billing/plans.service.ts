import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async listActive() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        monthlyPriceCents: true,
        yearlyPriceCents: true,
        currency: true,
        defaultReportLimit: true,
        usageInterval: true,
        isEnterprise: true,
        features: true,
      },
    });
  }
}

