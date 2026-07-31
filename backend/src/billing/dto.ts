import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

const PLAN_CODES = ["FREE", "PRO", "ULTRA", "ENTERPRISE"] as const;
const BILLING_CYCLES = ["NONE", "MONTHLY", "YEARLY"] as const;

export class UpdateSubscriptionDto {
  @IsIn(PLAN_CODES)
  planCode: (typeof PLAN_CODES)[number];

  @IsOptional()
  @IsIn(BILLING_CYCLES)
  billingCycle?: (typeof BILLING_CYCLES)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  customReportLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  applyAtPeriodEnd?: boolean;
}

export class UsageAdjustmentDto {
  @IsInt()
  reportsUsedDelta: number;

  @IsInt()
  bonusReportsDelta: number;

  @IsString()
  @MaxLength(500)
  reason: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsInt() @Min(0) monthlyPriceCents?: number | null;
  @IsOptional() @IsInt() @Min(0) yearlyPriceCents?: number | null;
  @IsOptional() @IsInt() @Min(0) defaultReportLimit?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsObject() features?: Record<string, unknown>;
}

