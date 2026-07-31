import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../common/decorators";
import { PlansService } from "./plans.service";

@ApiTags("plans")
@Controller("plans")
export class PlansController {
  constructor(private plans: PlansService) {}

  @Public()
  @Get()
  list() {
    return this.plans.listActive();
  }
}

