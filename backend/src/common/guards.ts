import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, JwtUser } from "./decorators";
import { ALLOW_PASSWORD_CHANGE_KEY } from "./decorators";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private reflector: Reflector) {
    super();
  }
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

// RBAC: roles flatten to action:resource permissions. `manage:*` grants all.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user: JwtUser = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException("No user");
    if (
      process.env.NODE_ENV === "production" &&
      process.env.REQUIRE_PRIVILEGED_MFA !== "false" &&
      user.roles.some((role) => role === "ADMIN" || role === "PLATFORM_ADMIN") &&
      !user.mfaEnabled
    ) {
      throw new ForbiddenException("Multi-factor authentication is required for administrator actions");
    }
    const perms = user.permissions || [];
    const ok = required.every((req) => hasPermission(perms, req));
    if (!ok) throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}

// Must run after JwtAuthGuard.  A user who has been issued a temporary
// password cannot bypass the UI by calling reporting or admin APIs directly.
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user: JwtUser | undefined = context.switchToHttp().getRequest().user;
    if (user?.mustChangePassword && !allowed) {
      throw new ForbiddenException("Password change required before using this account");
    }
    return true;
  }
}

export function hasPermission(perms: string[], required: string[] | string): boolean {
  const req = String(required);
  const [reqAction, reqResource] = req.split(":");
  return perms.some((p) => {
    const [action, resource] = p.split(":");
    const actionOk = action === "manage" || action === reqAction;
    const resourceOk = resource === "*" || resource === reqResource;
    return actionOk && resourceOk;
  });
}
