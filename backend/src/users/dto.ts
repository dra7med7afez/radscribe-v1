import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { PASSWORD_POLICY, PASSWORD_POLICY_MESSAGE } from "../auth/dto";

export const ASSIGNABLE_ROLES = ["ADMIN", "RADIOLOGIST"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole;

  // temporary password — the user is forced to change it on first login
  @IsString()
  @Matches(PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE })
  password: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: AssignableRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  // admin password reset — sets mustChangePassword and revokes sessions
  @IsOptional()
  @IsString()
  @Matches(PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE })
  password?: string;
}

export class UpdateSettingsDto {
  @IsObject()
  settings: Record<string, unknown>;
}
