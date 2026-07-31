import { Controller, Get, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";
import { AuditService } from "./audit.service";
import { CurrentUser, JwtUser, RequirePermissions } from "./decorators";

class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

@ApiTags("audit")
@ApiBearerAuth()
@Controller("admin/audit-logs")
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @RequirePermissions("manage:users")
  list(@CurrentUser() user: JwtUser, @Query() query: AuditQueryDto) {
    return this.audit.list(user, query.take);
  }
}
