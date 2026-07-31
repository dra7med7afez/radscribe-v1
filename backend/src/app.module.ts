import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "crypto";
import configuration from "./config/configuration";
import { PrismaModule } from "./prisma/prisma.module";
import { CommonModule } from "./common/common.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { AiModule } from "./ai/ai.module";
import { ReportsModule } from "./reports/reports.module";
import { TemplatesModule } from "./templates/templates.module";
import { PatientsModule } from "./patients/patients.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { JwtAuthGuard, PasswordChangeGuard, PermissionsGuard } from "./common/guards";
import { UsageModule } from "./usage/usage.module";
import { HealthController } from "./health/health.controller";
import { BillingModule } from "./billing/billing.module";
import { redisThrottleStorage } from "./common/redis-throttler.storage";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req: any) => req.headers["x-request-id"] || randomUUID(),
        level: process.env.LOG_LEVEL || "info",
        // never log request bodies (PHI: dictation transcripts, patient data)
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['x-csrf-token']",
            "res.headers['set-cookie']",
          ],
          censor: "[redacted]",
        },
        autoLogging: { ignore: (req: any) => req.url === "/api/health" },
      },
    }),
    ThrottlerModule.forRoot({
      storage: redisThrottleStorage ?? undefined,
      throttlers: [{
        ttl: parseInt(process.env.THROTTLE_TTL || "60", 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || "120", 10),
      }],
    }),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    AiModule,
    ReportsModule,
    TemplatesModule,
    PatientsModule,
    IntegrationsModule,
    BillingModule,
    UsageModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
