import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Periodic housekeeping so tables that grow with traffic stay bounded:
//  - expired refresh tokens (7-day TTL rows otherwise accumulate forever)
//  - abandoned empty DRAFT reports (provisioned rows that never received
//    content). Drafts WITH content are never touched — an unsigned report may
//    still be the only server copy of a radiologist's work.
// Plain setInterval (no scheduler dependency); single-node semantics are fine —
// on multiple nodes the sweeps are idempotent, they just run more often.

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const EMPTY_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // first sweep shortly after boot (not immediately — let migrations settle)
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.sweep(), 30_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep() {
    try {
      const tokens = await this.prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      const reservations = await this.prisma.reportUsageEvent.deleteMany({
        where: { status: "RESERVED", reservationExpiresAt: { lt: new Date() } },
      });
      const drafts = await this.prisma.report.deleteMany({
        where: {
          status: "DRAFT",
          updatedAt: { lt: new Date(Date.now() - EMPTY_DRAFT_MAX_AGE_MS) },
          items: { none: {} },
          sections: { none: {} },
          versions: { none: {} },
          usageEvents: { none: {} },
        },
      });
      if (tokens.count || reservations.count || drafts.count) {
        this.logger.log(
          `cleanup: removed ${tokens.count} expired tokens, ${reservations.count} usage reservations, ${drafts.count} empty stale drafts`
        );
      }
    } catch (err) {
      this.logger.warn(`cleanup sweep failed: ${(err as Error).message}`);
    }
  }
}
