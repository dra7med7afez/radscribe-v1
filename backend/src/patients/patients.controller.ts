import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PatientsService } from "./patients.service";
import { CreatePatientDto, UpdatePatientStatusDto } from "./dto";
import { CurrentUser, JwtUser } from "../common/decorators";

@ApiTags("patients")
@ApiBearerAuth()
@Controller("patients")
export class PatientsController {
  constructor(private patients: PatientsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser, @Query("source") source?: string) {
    return this.patients.list(u, source);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() dto: CreatePatientDto) {
    return this.patients.create(u, dto);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() u: JwtUser,
    @Param("id") id: string,
    @Body() dto: UpdatePatientStatusDto
  ) {
    return this.patients.updateStatus(u, id, dto.status);
  }
}
