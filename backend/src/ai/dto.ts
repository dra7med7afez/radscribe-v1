import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// Ten minutes of 16 kHz mono PCM WAV is about 19.2 MB before base64.
const AUDIO_BASE64_MAX = 26_000_000;
const TRANSCRIPT_MAX = 200_000;
const TEXT_MAX = 20_000;
const EDIT_INSTRUCTION_MAX = 2_000;
const STRUCTURING_INSTRUCTIONS_MAX = 2_000;

export class TranscribeDto {
  @IsString()
  @MaxLength(AUDIO_BASE64_MAX)
  audioBase64: string;

  @IsString()
  @Matches(/^audio\/wav(?:;.*)?$/i)
  @MaxLength(100)
  mimeType: string;

  @IsString()
  @MaxLength(64)
  reportId: string;
}

export class SelectedTextEditDto {
  @IsString()
  @MaxLength(TEXT_MAX)
  selectedText: string;

  @IsString()
  @MaxLength(EDIT_INSTRUCTION_MAX)
  instruction: string;

  @IsIn([
    "concise",
    "restructure",
    "grammar",
    "standardize",
    "bullets",
    "paragraph",
    "split",
    "combine",
    "custom",
  ])
  action: string;

  @IsString()
  @MaxLength(64)
  reportId: string;
}

// Mirrors ai.api's CurrentFindingDescriptor — the payload is interpolated into
// the LLM prompt, so every field is typed and bounded.
export class FindingDescriptorDto {
  @IsString() @MaxLength(64) findingId: string;
  @IsString() @MaxLength(191) region: string;
  @IsString() @MaxLength(TEXT_MAX) text: string;
  @IsBoolean() abnormal: boolean;
}

export class SubpointDescriptorDto {
  @IsString() @MaxLength(64) subpointId: string;
  @IsString() @MaxLength(191) region: string;
  @IsString() @MaxLength(TEXT_MAX) text: string;
}

export class SectionDescriptorDto {
  @IsString() @MaxLength(64) id: string;
  @IsString() @MaxLength(191) name: string;
  @IsIn(["prose", "findings"]) kind: "prose" | "findings";
  @IsBoolean() grouped: boolean;

  // Complete current prose for this live document section. Findings sections
  // use the id-addressable findings/subpoints arrays below instead.
  @IsOptional()
  @IsString()
  @MaxLength(TEXT_MAX)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => FindingDescriptorDto)
  findings?: FindingDescriptorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => SubpointDescriptorDto)
  subpoints?: SubpointDescriptorDto[];
}

// The complete report as plain text — the impression is generated from the
// WHOLE report once the radiologist finishes dictating, not per take.
export class ImpressionDto {
  @IsString()
  @MaxLength(TRANSCRIPT_MAX)
  report: string;

  @IsString()
  @MaxLength(64)
  reportId: string;
}

export class StructureDto {
  @IsString()
  @MaxLength(TRANSCRIPT_MAX)
  transcript: string;

  @IsString()
  @MaxLength(32)
  mode: string;

  // dynamic section list {id,name,kind,grouped,regions?,findings?,subpoints?}
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SectionDescriptorDto)
  sections?: SectionDescriptorDto[];

  // legacy back-compat
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  regions?: string[];

  @IsString()
  @MaxLength(64)
  reportId: string;

  @IsOptional()
  @IsString()
  @MaxLength(STRUCTURING_INSTRUCTIONS_MAX)
  structuringInstructions?: string;
}

export class StructureDocumentDto {
  @IsString()
  @MaxLength(TRANSCRIPT_MAX)
  transcript: string;

  @IsString()
  @MaxLength(32)
  mode: string;

  // Recursively validated and bounded by AiService before it is sent to the
  // model. @IsObject rejects arrays/primitives at the HTTP boundary.
  @IsObject()
  document: Record<string, unknown>;

  @IsString()
  @MaxLength(64)
  reportId: string;

  @IsOptional()
  @IsString()
  @MaxLength(STRUCTURING_INSTRUCTIONS_MAX)
  structuringInstructions?: string;
}
