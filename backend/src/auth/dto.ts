import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export const ACCOUNT_TYPES = ["INDIVIDUAL", "ORGANIZATION"] as const;
export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @Matches(/^\d{6}$/)
  mfaCode?: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

// Production password policy: >=10 chars with at least one letter and one digit.
export const PASSWORD_POLICY = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;
export const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 10 characters and contain a letter and a digit";

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @Matches(PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE })
  newPassword: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE })
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsIn(ACCOUNT_TYPES)
  accountType: AccountTypeValue;

  // required for ORGANIZATION accounts, rejected otherwise (forbidNonWhitelisted
  // is off for undefined optionals, so gate it with ValidateIf)
  @ValidateIf((o) => o.accountType === "ORGANIZATION")
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  organizationName?: string;
}

export class GoogleAuthDto {
  // Google Identity Services ID token (JWT credential from the GIS button)
  @IsString()
  @MinLength(1)
  idToken: string;

  @IsOptional()
  @Matches(/^\d{6}$/)
  mfaCode?: string;

  // used only when this Google identity signs in for the first time
  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  accountType?: AccountTypeValue;

  @ValidateIf((o) => o.accountType === "ORGANIZATION")
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  organizationName?: string;
}

export class MfaCodeDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
