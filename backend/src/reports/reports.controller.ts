import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ReportsService } from "./reports.service";
import {
  CreateReportDto,
  UpdateReportDto,
  SetContentDto,
  SignReportDto,
  ListReportsQueryDto,
  AddendumDto,
} from "./dto";
import { CurrentUser, JwtUser, RequirePermissions } from "../common/decorators";

@ApiTags("reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() dto: CreateReportDto) {
    return this.reports.create(u, dto);
  }

  @Get()
  list(@CurrentUser() u: JwtUser, @Query() query: ListReportsQueryDto) {
    return this.reports.list(u, query);
  }

  @Get(":id")
  get(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.reports.get(u, id);
  }

  @Patch(":id")
  update(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() dto: UpdateReportDto) {
    return this.reports.update(u, id, dto);
  }

  // Atomic autosave: clinicalInfo + sections + items in one transaction.
  @Put(":id/content")
  setContent(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() dto: SetContentDto) {
    return this.reports.setContent(u, id, dto);
  }

  @Post(":id/sign")
  @RequirePermissions("sign:reports")
  sign(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() dto: SignReportDto) {
    return this.reports.sign(u, id, dto);
  }

  @Get(":id/versions")
  versions(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.reports.versions(u, id);
  }

  @Post(":id/addenda")
  @RequirePermissions("sign:reports")
  addendum(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() dto: AddendumDto) {
    return this.reports.addendum(u, id, dto);
  }
}
