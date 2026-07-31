import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtUser } from "../common/decorators";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscription")
@ApiBearerAuth()
@Controller("subscription")
export class SubscriptionsController {
  constructor(private subscriptions: SubscriptionsService) {}

  @Get("me")
  me(@CurrentUser() user: JwtUser) {
    return this.subscriptions.me(user.id);
  }
}

