import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { CreateUserDto, UpdateSettingsDto, UpdateUserDto } from "./dto";
import { CurrentUser, JwtUser, RequirePermissions } from "../common/decorators";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private users: UsersService) {}

  // ---- per-user settings (any authenticated user) — declared before :id routes
  @Get("me/settings")
  getSettings(@CurrentUser() user: JwtUser) {
    return this.users.getSettings(user.id);
  }

  @Patch("me/settings")
  updateSettings(@CurrentUser() user: JwtUser, @Body() dto: UpdateSettingsDto) {
    return this.users.updateSettings(user.id, dto.settings);
  }

  // ---- admin-only user management
  @Get()
  @RequirePermissions("manage:users")
  list(@CurrentUser() user: JwtUser) {
    return this.users.list(user);
  }

  @Post()
  @RequirePermissions("manage:users")
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateUserDto) {
    return this.users.create(dto, user);
  }

  @Patch(":id")
  @RequirePermissions("manage:users")
  update(@CurrentUser() user: JwtUser, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto, user);
  }

  @Delete(":id")
  @RequirePermissions("manage:users")
  remove(@CurrentUser() user: JwtUser, @Param("id") id: string) {
    return this.users.remove(id, user);
  }
}
