import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { Public, RequirePermissions } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { redisThrottleStorage } from "../common/redis-throttler.storage";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  // Liveness/readiness for compose healthchecks and the reverse proxy.
  @Public()
  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (redisThrottleStorage) await redisThrottleStorage.ping();
    } catch {
      throw new ServiceUnavailableException({ status: "error" });
    }
    return { status: "ok" };
  }

  @Get("details")
  @RequirePermissions("manage:users")
  async details() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (redisThrottleStorage) await redisThrottleStorage.ping();
    } catch {
      throw new ServiceUnavailableException({ status: "error", db: "down" });
    }
    return {
      status: "ok",
      db: "up",
      rateLimiter: redisThrottleStorage ? "up" : "local-development",
      ai: this.config.get<string>("ai.geminiApiKey") ? "configured" : "disabled",
    };
  }
}
