import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(userId: string | null, action: string, resource: string, meta?: Record<string, unknown>) {
    try {
      const actor = userId
        ? await this.prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true },
          })
        : null;
      await this.prisma.auditLog.create({
        data: {
          userId,
          organizationId: actor?.organizationId ?? null,
          action,
          resource,
          meta: (meta as any) ?? undefined,
        },
      });
    } catch (error: any) {
      this.logger.error(`audit write failed: ${action} ${resource}`, error?.stack);
    }
  }

  list(user: { organizationId: string; roles: string[] }, take = 100) {
    const platform = user.roles.includes("PLATFORM_ADMIN");
    return this.prisma.auditLog.findMany({
      where: platform ? undefined : { organizationId: user.organizationId },
      take: Math.min(Math.max(take, 1), 200),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        action: true,
        resource: true,
        meta: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
    });
  }
}
