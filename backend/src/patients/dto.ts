import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreatePatientDto {
  @IsString() @MinLength(1) @MaxLength(191) name: string;
  @IsString() @MinLength(1) @MaxLength(64) mrn: string;
  @IsOptional() @IsString() @MaxLength(32) dob?: string;
  @IsOptional() @IsString() @MaxLength(16) sex?: string;
  @IsOptional() @IsString() @MaxLength(64) accession?: string;
  @IsOptional() @IsString() @MaxLength(191) studyDescription?: string;
  @IsOptional() @IsString() @MaxLength(32) modality?: string;
  @IsOptional()
  @IsIn(["Scheduled", "In Progress", "Completed"])
  status?: "Scheduled" | "In Progress" | "Completed";
}

export class UpdatePatientStatusDto {
  @IsIn(["Scheduled", "In Progress", "Completed"])
  status: "Scheduled" | "In Progress" | "Completed";
}
