import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UsageService } from "./usage.service";
import { CurrentUser, JwtUser } from "../common/decorators";

@ApiTags("usage")
@ApiBearerAuth()
@Controller("usage")
export class UsageController {
  constructor(private usage: UsageService) {}

  @Get("me")
  me(@CurrentUser() u: JwtUser) {
    return this.usage.me(u);
  }

  @Get("me/history")
  history(@CurrentUser() u: JwtUser) {
    return this.usage.history(u);
  }

  // Analytics is derived from server-finalized reports, not untrusted browser
  // click events.
  @Get("summary")
  summary(@CurrentUser() u: JwtUser) {
    return this.usage.summary(u);
  }
}
