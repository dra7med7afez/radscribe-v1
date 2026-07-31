import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateReportDto {
  @IsString() @MaxLength(191) studyDescription: string;
  @IsString() @MaxLength(64) modality: string;
  @IsString() @MaxLength(64) bodyPart: string;
  @IsString() @MaxLength(20_000) clinicalInfo: string;
  @IsOptional() @IsString() @MaxLength(64) patientId?: string;
  @IsOptional() @IsString() @MaxLength(64) templateId?: string;
}

export class UpdateReportDto {
  @IsOptional() @IsString() @MaxLength(20_000) clinicalInfo?: string;
  @IsOptional() @IsString() @MaxLength(64) patientId?: string;
}

export class SectionInput {
  @IsString() @MaxLength(191) sectionId: string;
  @IsString() @MaxLength(191) name: string;
  @IsEnum(["PROSE", "FINDINGS"]) kind: "PROSE" | "FINDINGS";
  @IsBoolean() grouped: boolean;
  @IsInt() @Min(0) orderIndex: number;
  @IsOptional() @IsString() @MaxLength(100_000) html?: string;
}

export class SetSectionsDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SectionInput)
  sections: SectionInput[];
}

export class ItemInput {
  @IsString() @MaxLength(191) sectionId: string;
  @IsString() @MaxLength(191) region: string;
  @IsString() @MaxLength(20_000) text: string;
  @IsString() @MaxLength(20_000) impressionLine: string;
  @IsBoolean() abnormal: boolean;
  @IsOptional() @IsString() @MaxLength(64) score?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReportImageInput)
  images?: ReportImageInput[];
  // `level` is the 0-based multilevel-list depth; absent = depth 0, which is
  // every report written before nesting existed. Stored verbatim in the
  // subpoints Json column — no migration, and old rows keep loading.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReportSubpointInput)
  subpoints?: ReportSubpointInput[];
  @IsInt() @Min(0) orderIndex: number;
}

export class ReportImageInput {
  @IsString() @MaxLength(64) id: string;
  @IsString() @MaxLength(3_000_000) src: string;
}

export class ReportSubpointInput {
  @IsString() @MaxLength(64) id: string;
  @IsString() @MaxLength(20_000) text: string;
  @IsOptional() @IsInt() @Min(0) level?: number;
}

export class SetItemsDto {
  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ItemInput)
  items: ItemInput[];
}

// One-shot autosave payload: clinicalInfo + sections + items land in a single
// transaction, so a slow save can never interleave half-applied with another.
export class SetContentDto {
  @IsOptional() @IsString() @MaxLength(20_000) clinicalInfo?: string;

  // Optimistic concurrency control: saves from an old browser tab cannot
  // silently overwrite a newer report revision.
  @IsInt() @Min(0) expectedRevision: number;

  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SectionInput)
  sections: SectionInput[];

  @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => ItemInput)
  items: ItemInput[];
}

export class SignReportDto {
  @IsInt() @Min(0) expectedRevision: number;
  @IsString() @MaxLength(191) patientId: string;
  @IsBoolean() attested: boolean;
}

export class AddendumDto {
  @IsInt() @Min(0) expectedRevision: number;
  @IsString() @MaxLength(191) patientId: string;
  @IsString() @MaxLength(20_000) text: string;
  @IsBoolean() attested: boolean;
}

export class ListReportsQueryDto {
  // page size: 1..50, default 20
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
  // cursor = last report id from the previous page
  @IsOptional() @IsString() @MaxLength(64) cursor?: string;
}
