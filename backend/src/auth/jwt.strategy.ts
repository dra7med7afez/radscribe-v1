import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { JwtUser } from "../common/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { UnauthorizedException } from "@nestjs/common";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("jwt.accessSecret") || "dev-access-secret-change-me",
      issuer: config.get<string>("jwt.issuer"),
      audience: config.get<string>("jwt.audience"),
    });
  }

  async validate(payload: any): Promise<JwtUser> {
    if (payload?.type !== "access") throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        active: true,
        mustChangePassword: true,
        authVersion: true,
        organizationId: true,
        mfaEnabled: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: { permission: { select: { action: true, resource: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (
      !user ||
      !user.active ||
      user.authVersion !== payload.ver ||
      !user.organizationId
    ) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((item) => item.role.name),
      permissions: Array.from(
        new Set(
          user.roles.flatMap((item) =>
            item.role.permissions.map(
              ({ permission }) => `${permission.action}:${permission.resource}`
            )
          )
        )
      ),
      organizationId: user.organizationId,
      mustChangePassword: user.mustChangePassword,
      authVersion: user.authVersion,
      mfaEnabled: user.mfaEnabled,
    };
  }
}
