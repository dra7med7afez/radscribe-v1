import { Module } from "@nestjs/common";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";
import { GeminiService } from "../ai/gemini.service";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, GeminiService],
})
export class TemplatesModule {}
