import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtUser, RequirePermissions } from "../common/decorators";
import { AdminBillingService } from "./admin-billing.service";
import { UpdatePlanDto, UpdateSubscriptionDto, UsageAdjustmentDto } from "./dto";

@ApiTags("admin-billing")
@ApiBearerAuth()
@RequirePermissions("manage:billing")
@Controller("admin")
export class AdminBillingController {
  constructor(private billing: AdminBillingService) {}

  @Get("billing/users")
  users(@CurrentUser() actor: JwtUser, @Query("query") query = "") {
    return this.billing.searchUsers(actor, query);
  }

  @Get("users/:id/subscription")
  subscription(@CurrentUser() actor: JwtUser, @Param("id") id: string) {
    return this.billing.getUserSubscription(actor, id);
  }

  @Patch("users/:id/subscription")
  updateSubscription(@CurrentUser() actor: JwtUser, @Param("id") id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.billing.updateUserSubscription(actor, id, dto);
  }

  @Post("users/:id/usage-adjustments")
  adjust(@CurrentUser() actor: JwtUser, @Param("id") id: string, @Body() dto: UsageAdjustmentDto) {
    return this.billing.adjustUsage(actor, id, dto);
  }

  @Get("users/:id/usage-events")
  events(@CurrentUser() actor: JwtUser, @Param("id") id: string) {
    return this.billing.events(actor, id);
  }

  @Get("users/:id/usage-history")
  history(@CurrentUser() actor: JwtUser, @Param("id") id: string) {
    return this.billing.history(actor, id);
  }

  @Patch("plans/:code")
  @RequirePermissions("manage:plans")
  updatePlan(@CurrentUser() actor: JwtUser, @Param("code") code: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(code, dto, actor.id);
  }
}
