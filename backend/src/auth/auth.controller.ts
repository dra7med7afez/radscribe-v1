import { Body, Controller, ForbiddenException, Get, Post, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import {
  ChangePasswordDto,
  GoogleAuthDto,
  LoginDto,
  RegisterDto,
  MfaCodeDto,
} from "./dto";
import { AllowPasswordChange, Public, CurrentUser, JwtUser } from "../common/decorators";
import type { Request, Response } from "express";

const REFRESH_COOKIE = "rs_refresh";

function cookieValue(req: Request, name: string): string | undefined {
  const prefix = `${name}=`;
  return req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService) {}

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  private assertTrustedOrigin(req: Request) {
    if (process.env.NODE_ENV !== "production") return;
    const origin = req.headers.origin;
    const allowed = (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!origin || !allowed.includes(origin)) {
      throw new ForbiddenException("Untrusted request origin");
    }
  }

  private setSession(res: Response, data: any) {
    res.cookie(REFRESH_COOKIE, data.refreshToken, this.refreshCookieOptions());
    return { accessToken: data.accessToken, user: data.user };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // brute-force guard
  @Post("login")
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: LoginDto) {
    this.assertTrustedOrigin(req);
    return this.setSession(res, await this.auth.login(dto.email, dto.password, dto.mfaCode));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // signup abuse guard
  @Post("register")
  async register(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: RegisterDto) {
    this.assertTrustedOrigin(req);
    return this.setSession(res, await this.auth.register(dto));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("google")
  async google(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() dto: GoogleAuthDto) {
    this.assertTrustedOrigin(req);
    return this.setSession(res, await this.auth.loginWithGoogle(dto));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertTrustedOrigin(req);
    const refreshToken = cookieValue(req, REFRESH_COOKIE);
    if (!refreshToken) return this.auth.refresh("");
    return this.setSession(res, await this.auth.refresh(refreshToken));
  }

  @Public()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertTrustedOrigin(req);
    const refreshToken = cookieValue(req, REFRESH_COOKIE);
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions());
    return refreshToken ? this.auth.logout(refreshToken) : { ok: true };
  }

  @ApiBearerAuth()
  @AllowPasswordChange()
  @Post("change-password")
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ChangePasswordDto
  ) {
    this.assertTrustedOrigin(req);
    return this.setSession(
      res,
      await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword)
    );
  }

  @ApiBearerAuth()
  @AllowPasswordChange()
  @Get("me")
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Post("mfa/setup")
  setupMfa(@CurrentUser() user: JwtUser) {
    return this.auth.setupMfa(user.id);
  }

  @ApiBearerAuth()
  @Post("mfa/confirm")
  async confirmMfa(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: MfaCodeDto
  ) {
    this.assertTrustedOrigin(req);
    return this.setSession(res, await this.auth.confirmMfa(user.id, dto.code));
  }

  @ApiBearerAuth()
  @Post("mfa/disable")
  async disableMfa(
    @CurrentUser() user: JwtUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: MfaCodeDto
  ) {
    this.assertTrustedOrigin(req);
    return this.setSession(res, await this.auth.disableMfa(user.id, dto.code));
  }
}
