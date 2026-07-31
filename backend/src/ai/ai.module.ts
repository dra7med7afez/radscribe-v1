import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";
import { GeminiService } from "./gemini.service";
import { UsageModule } from "../usage/usage.module";

@Module({
  imports: [UsageModule],
  controllers: [AiController],
  providers: [AiService, GeminiService],
  exports: [AiService],
})
export class AiModule {}
