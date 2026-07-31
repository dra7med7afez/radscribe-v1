import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger, LoggerErrorInterceptor } from "nestjs-pino";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/http-exception.filter";

const isProd = process.env.NODE_ENV === "production";

async function bootstrap() {
  // Never run production on the dev-default fallbacks in configuration.ts.
  if (isProd) {
    const missing = [
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "CREDENTIALS_KEY",
      "DATABASE_URL",
      "REDIS_PASSWORD",
      "REDIS_URL",
    ].filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Refusing to start in production without: ${missing.join(", ")}`);
    }
    const access = process.env.JWT_ACCESS_SECRET!;
    const refresh = process.env.JWT_REFRESH_SECRET!;
    const credentialKey = process.env.CREDENTIALS_KEY!;
    const redisPassword = process.env.REDIS_PASSWORD!;
    const unsafeSecrets =
      access.length < 32 ||
      refresh.length < 32 ||
      credentialKey.length < 32 ||
      redisPassword.length < 32 ||
      access === refresh ||
      access === "dev-access-secret-change-me" ||
      refresh === "dev-refresh-secret-change-me" ||
      credentialKey === "dev-credentials-key-32-bytes-long!!";
    if (unsafeSecrets) {
      throw new Error("Refusing to start in production with weak, duplicate, or development secrets");
    }
    let redisUrl: URL;
    try {
      redisUrl = new URL(process.env.REDIS_URL!);
    } catch {
      throw new Error("REDIS_URL must be a valid Redis URL");
    }
    if (
      !["redis:", "rediss:"].includes(redisUrl.protocol) ||
      decodeURIComponent(redisUrl.password) !== redisPassword
    ) {
      throw new Error("REDIS_URL must use Redis and contain REDIS_PASSWORD");
    }
    const origins = (process.env.CORS_ORIGIN || "").split(",").map((origin) => origin.trim());
    if (!origins.length || origins.some((origin) => !origin.startsWith("https://"))) {
      throw new Error("Production CORS_ORIGIN must contain explicit HTTPS origins");
    }
    if (process.env.GEMINI_API_KEY && process.env.AI_PHI_APPROVED !== "true") {
      throw new Error("Set AI_PHI_APPROVED=true only after approving the AI provider for PHI");
    }
    if (!/^[1-9]\d*$/.test(process.env.TRUST_PROXY_HOPS || "1")) {
      throw new Error("TRUST_PROXY_HOPS must be a positive integer");
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: false,
    bufferLogs: true,
    bodyParser: false,
  });

  // Caddy is the single trusted hop in front of the API. Without this, every
  // request appears to come from the proxy's IP — the per-IP rate limiter
  // degrades into one shared bucket for the whole site and logs record the
  // wrong client address.
  app.set("trust proxy", parseInt(process.env.TRUST_PROXY_HOPS || "1", 10));

  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix("api");
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // Audio/docx base64 payloads are large — but only on the AI + template-extract
  // routes. Everything else keeps a tight limit.
  app.use("/api/ai", json({ limit: "24mb" }));
  app.use("/api/templates/extract", json({ limit: "21mb" }));
  app.use("/api/templates/analyze", json({ limit: "5mb" }));
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));

  app.enableCors({
    // comma-separated list, e.g. "http://localhost:5173,http://localhost:5175"
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })
  );

  // API docs are a dev/staging tool — never exposed in production.
  if (!isProd) {
    const swagger = new DocumentBuilder()
      .setTitle("RadScribe API")
      .setDescription("Voice-driven, template-aware radiology reporting backend.")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));
  }

  const port = parseInt(process.env.PORT || "4000", 10);
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`RadScribe API on http://localhost:${port}/api${isProd ? "" : "  (docs: /docs)"}`);
}

bootstrap();
