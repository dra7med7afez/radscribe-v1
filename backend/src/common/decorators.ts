import { SetMetadata, createParamDecorator, ExecutionContext } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// A credential that was issued for a temporary / reset password may only call
// the small set of endpoints needed to complete the reset.  This is enforced
// on the API, not merely by the React shell.
export const ALLOW_PASSWORD_CHANGE_KEY = "allowPasswordChange";
export const AllowPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);

export const PERMISSIONS_KEY = "permissions";
export const RequirePermissions = (...perms: string[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);

export interface JwtUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  organizationId: string;
  mustChangePassword: boolean;
  authVersion: number;
  mfaEnabled: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  }
);
