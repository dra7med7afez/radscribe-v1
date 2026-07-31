import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AiService } from "./ai.service";
import {
  TranscribeDto,
  StructureDto,
  StructureDocumentDto,
  ImpressionDto,
  SelectedTextEditDto,
} from "./dto";
import { CurrentUser, JwtUser } from "../common/decorators";
import { ReportUsageService } from "../usage/report-usage.service";

@ApiTags("ai")
@ApiBearerAuth()
// AI routes are the expensive ones — tighter limit than the global throttle.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller("ai")
export class AiController {
  constructor(private ai: AiService, private reportUsage: ReportUsageService) {}

  @Post("transcribe")
  transcribe(@CurrentUser() u: JwtUser, @Body() dto: TranscribeDto) {
    return this.reportUsage.execute(
      u,
      dto.reportId,
      () => this.ai.transcribe(dto, u.id),
      (value) => value.text.trim().length > 0
    );
  }

  @Post("edit-selection")
  editSelection(@CurrentUser() u: JwtUser, @Body() dto: SelectedTextEditDto) {
    return this.reportUsage.execute(
      u,
      dto.reportId,
      () => this.ai.editSelection(dto, u.id),
      (value) => value.text.trim().length > 0
    );
  }

  @Post("structure")
  structure(@CurrentUser() u: JwtUser, @Body() dto: StructureDto) {
    return this.reportUsage.execute(
      u,
      dto.reportId,
      () => this.ai.structure(dto, u.id),
      (value) => value.results.length > 0
    );
  }

  @Post("structure-document")
  structureDocument(@CurrentUser() u: JwtUser, @Body() dto: StructureDocumentDto) {
    return this.reportUsage.execute(
      u,
      dto.reportId,
      () => this.ai.structureDocument(dto, u.id),
      (value) => value.results.length > 0
    );
  }

  // Whole-report impression — called once, after all findings are dictated.
  @Post("impression")
  impression(@CurrentUser() u: JwtUser, @Body() dto: ImpressionDto) {
    return this.reportUsage.execute(
      u,
      dto.reportId,
      () => this.ai.impression(dto, u.id),
      (value) => value.lines.length > 0
    );
  }
}
