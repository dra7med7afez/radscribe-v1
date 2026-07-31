import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IntegrationsService } from "./integrations.service";
import { CreateIntegrationDto, UpdateIntegrationDto } from "./dto";
import { CurrentUser, JwtUser, RequirePermissions } from "../common/decorators";

@ApiTags("integrations")
@ApiBearerAuth()
@RequirePermissions("manage:integrations")
@Controller("integrations")
export class IntegrationsController {
  constructor(private integrations: IntegrationsService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) {
    return this.integrations.list(u);
  }

  @Post()
  create(@CurrentUser() u: JwtUser, @Body() dto: CreateIntegrationDto) {
    return this.integrations.create(u, dto);
  }

  @Patch(":id")
  update(@CurrentUser() u: JwtUser, @Param("id") id: string, @Body() dto: UpdateIntegrationDto) {
    return this.integrations.update(u, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.integrations.remove(u, id);
  }

  @Post(":id/test")
  test(@CurrentUser() u: JwtUser, @Param("id") id: string) {
    return this.integrations.test(u, id);
  }
}
