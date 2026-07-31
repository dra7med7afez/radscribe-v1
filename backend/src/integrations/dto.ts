import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

export const INTEGRATION_TYPES = ["FHIR", "HL7", "DICOM", "GENERIC"] as const;
export type IntegrationTypeValue = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_STATUSES = ["DISCONNECTED", "CONNECTED", "ERROR"] as const;
export type IntegrationStatusValue = (typeof INTEGRATION_STATUSES)[number];

const upper = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.toUpperCase() : value;

export class CreateIntegrationDto {
  // client sends lowercase ("fhir") — normalized before the enum check so an
  // invalid type is a 400, never an unhandled Prisma enum error
  @Transform(upper)
  @IsIn(INTEGRATION_TYPES)
  type: IntegrationTypeValue;

  @IsString() @MinLength(1) @MaxLength(120)
  name: string;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

export class UpdateIntegrationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120)
  name?: string;

  @IsOptional() @IsObject()
  config?: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Transform(upper)
  @IsIn(INTEGRATION_STATUSES)
  status?: IntegrationStatusValue;
}
