import { Type } from "class-transformer";
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
  ValidateNested,
} from "class-validator";

export class TemplateFindingInput {
  @IsString() @MaxLength(191)
  region: string; // '' = headingless / flat

  @IsString() @MaxLength(20_000)
  normalText: string;

  @IsOptional()
  @IsArray() @ArrayMaxSize(100)
  @IsString({ each: true }) @MaxLength(2_000, { each: true })
  subpoints?: string[];

  // nested finding rows from AI template analysis (builder-only, stored as JSON)
  @IsOptional()
  @IsArray() @ArrayMaxSize(100)
  children?: unknown[];
}

export class TemplateSectionInput {
  @IsOptional()
  @IsString() @MaxLength(120)
  id?: string;

  @IsString() @MaxLength(64)
  @MinLength(1)
  name: string;

  @IsIn(["prose", "findings"])
  kind: "prose" | "findings";

  @IsOptional()
  @IsBoolean()
  grouped?: boolean;

  @IsOptional()
  @IsString() @MaxLength(100_000)
  defaultProse?: string;

  @IsOptional()
  @IsString() @MaxLength(100_000)
  normalImpression?: string;

  @IsOptional()
  @IsBoolean()
  isConclusion?: boolean;

  @IsOptional()
  @IsString() @MaxLength(20_000)
  bulletStyle?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFindingInput)
  findings?: TemplateFindingInput[];
}

export class SaveTemplateDto {
  @IsString() @MaxLength(20_000)
  @MinLength(1)
  name: string;

  @IsString() @MaxLength(64)
  modality: string;

  @IsString()
  bodyPart: string;

  @IsOptional()
  @IsString() @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsInt() @Min(1)
  version?: number;

  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  editorSettings?: Record<string, unknown>;

  @IsArray() @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateSectionInput)
  sections: TemplateSectionInput[];
}

export class ExtractDto {
  @IsString() @MaxLength(21_000_000)
  fileBase64: string;

  @IsOptional()
  @IsString() @MaxLength(191)
  filename?: string;
}

export class AnalyzeDto {
  @IsString() @MaxLength(100_000)
  text: string;
}
