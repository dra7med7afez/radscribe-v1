import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TemplatesService } from "./templates.service";
import { AnalyzeDto, ExtractDto, SaveTemplateDto } from "./dto";
import { CurrentUser, JwtUser } from "../common/decorators";

@ApiTags("templates")
@ApiBearerAuth()
@Controller("templates")
export class TemplatesController {
  constructor(private templates: TemplatesService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.templates.list(u);
  }

  // Extract raw text from an uploaded .docx (mammoth) for §8a ingestion.
  @Post("extract")
  extract(@Body() dto: ExtractDto) {
    return this.templates.extract(dto.fileBase64);
  }

  // AI-analyze raw template text (from docx or paste) into the section model.
  @Post("analyze")
  analyze(@Body() dto: AnalyzeDto) {
    return this.templates.analyze(dto.text);
  }

  @Get(":id")
  get(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.templates.get(id, u);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() dto: SaveTemplateDto) {
    return this.templates.create(u, dto);
  }

  @Put(":id")
  update(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() dto: SaveTemplateDto) {
    return this.templates.update(id, u, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.templates.remove(id, u);
  }
}
