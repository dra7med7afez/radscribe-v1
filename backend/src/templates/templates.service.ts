import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import * as mammoth from "mammoth";
import { PrismaService } from "../prisma/prisma.service";
import { GeminiService, RawTemplateSection } from "../ai/gemini.service";
import { AuditService } from "../common/audit.service";
import { JwtUser } from "../common/decorators";
import { SaveTemplateDto, TemplateSectionInput } from "./dto";

// Map a DB template (+sections +findings) to the frontend's Template shape.
function toClient(t: any) {
  return {
    id: t.id,
    slug: t.slug ?? undefined,
    name: t.name,
    modality: t.modality,
    bodyPart: t.bodyPart,
    description: t.description ?? undefined,
    version: t.version ?? 1,
    document: t.document ?? undefined,
    editorSettings: t.editorSettings ?? undefined,
    global: !t.ownerId && !t.organizationId,
    updatedAt: t.updatedAt,
    sections: (t.sections ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      kind: s.kind === "FINDINGS" ? "findings" : "prose",
      grouped: s.grouped,
      defaultProse: s.defaultProse ?? undefined,
      normalImpression: s.normalImpression ?? undefined,
      isConclusion: s.isConclusion || undefined,
      bulletStyle: s.bulletStyle ?? undefined,
      findings:
        s.kind === "FINDINGS"
          ? (s.findings ?? []).map((f: any) => ({
              region: f.region,
              normalText: f.normalText,
              subpoints: (f.subpoints as string[] | null) ?? undefined,
              children: (f.children as unknown[] | null) ?? undefined,
            }))
          : undefined,
    })),
  };
}

function sectionCreateData(sections: TemplateSectionInput[]) {
  return sections.map((s, i) => ({
    name: s.name,
    kind: s.kind === "findings" ? ("FINDINGS" as const) : ("PROSE" as const),
    grouped: !!s.grouped,
    orderIndex: i,
    defaultProse: s.defaultProse ?? null,
    normalImpression: s.normalImpression ?? null,
    isConclusion: !!s.isConclusion,
    bulletStyle: s.bulletStyle ?? null,
    findings: {
      create: (s.findings || []).map((f, fi) => ({
        region: f.region ?? "",
        normalText: f.normalText ?? "",
        subpoints: f.subpoints && f.subpoints.length ? (f.subpoints as any) : undefined,
        children: f.children && f.children.length ? (f.children as any) : undefined,
        orderIndex: fi,
      })),
    },
  }));
}

const INCLUDE_SECTIONS = {
  sections: {
    include: { findings: { orderBy: { orderIndex: "asc" as const } } },
    orderBy: { orderIndex: "asc" as const },
  },
};

function assertSafeDocxArchive(buffer: Buffer) {
  const CENTRAL_DIRECTORY = 0x02014b50;
  const MAX_ENTRIES = 1_000;
  const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
  const MAX_RATIO = 100;
  let entries = 0;
  let totalCompressed = 0;
  let totalUncompressed = 0;

  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY) continue;
    const flags = buffer.readUInt16LE(offset + 8);
    const compressed = buffer.readUInt32LE(offset + 20);
    const uncompressed = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if (flags & 0x1) throw new UnsupportedMediaTypeException("Encrypted documents are not supported");
    entries += 1;
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    if (
      entries > MAX_ENTRIES ||
      totalUncompressed > MAX_UNCOMPRESSED_BYTES ||
      (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_RATIO)
    ) {
      throw new PayloadTooLargeException("Document archive expands beyond the safe processing limit");
    }
    offset += 45 + nameLength + extraLength + commentLength;
  }
  if (entries === 0) throw new UnsupportedMediaTypeException("Document archive is malformed");
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);
  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    private audit: AuditService
  ) {}

  // Failures are REAL errors (413/415/400) — an oversized or corrupt docx must
  // be distinguishable from a legitimately empty one, so the client can tell
  // the user what actually happened.
  async extract(fileBase64: string): Promise<{ text: string }> {
    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > 15 * 1024 * 1024) {
      this.logger.warn(`docx extract rejected: ${buffer.length} bytes`);
      throw new PayloadTooLargeException("Document is too large (max 15 MB)");
    }
    // docx is a zip container (magic = PK)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new UnsupportedMediaTypeException("Not a .docx document");
    }
    assertSafeDocxArchive(buffer);
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value || "";
      if (text.length > 1_000_000) {
        throw new PayloadTooLargeException("Extracted document text is too large (max 1 MB)");
      }
      return { text };
    } catch (err) {
      this.logger.error(`docx extract failed: ${(err as Error).message}`);
      throw new BadRequestException("Could not read the document — is it a valid .docx?");
    }
  }

  // AI-analyze raw template text into the dynamic section model. Returns an
  // empty array when no key / on error, so the client falls back to its parser.
  async analyze(text: string): Promise<{ sections: RawTemplateSection[]; ai: boolean }> {
    if (!text?.trim() || !this.gemini.hasKey()) return { sections: [], ai: false };
    try {
      const sections = await this.gemini.analyzeTemplate(text);
      return { sections, ai: sections.length > 0 };
    } catch (err) {
      this.logger.error(`template analyze failed: ${(err as Error).message}`);
      return { sections: [], ai: false };
    }
  }

  // Global starter templates plus templates owned by this user. Personal
  // templates are intentionally not shared merely because users have the same
  // organization; sharing requires a separate, reviewed workflow.
  async list(user: JwtUser) {
    const rows = await this.prisma.template.findMany({
      where: {
        OR: [
          { ownerId: null, organizationId: null },
          { ownerId: user.id, organizationId: user.organizationId },
        ],
      },
      include: INCLUDE_SECTIONS,
      orderBy: [{ ownerId: "asc" }, { updatedAt: "desc" }],
    });
    return rows.map(toClient);
  }

  async get(id: string, user: JwtUser) {
    const t = await this.findVisible(id, user);
    return toClient(t);
  }

  async create(user: JwtUser, dto: SaveTemplateDto) {
    const template = await this.prisma.template.create({
      data: {
        name: dto.name,
        modality: dto.modality,
        bodyPart: dto.bodyPart,
        description: dto.description ?? null,
        version: dto.version ?? 1,
        document: dto.document as any,
        editorSettings: dto.editorSettings as any,
        ownerId: user.id,
        organizationId: user.organizationId,
        sections: { create: sectionCreateData(dto.sections) },
      },
      include: INCLUDE_SECTIONS,
    });
    this.audit.log(user.id, "create", "template", { templateId: template.id, name: dto.name });
    return toClient(template);
  }

  // Wholesale section replacement — matches the template editor's save flow.
  async update(id: string, user: JwtUser, dto: SaveTemplateDto) {
    await this.assertEditable(id, user);
    const [, template] = await this.prisma.$transaction([
      this.prisma.templateSection.deleteMany({ where: { templateId: id } }),
      this.prisma.template.update({
        where: { id },
        data: {
          name: dto.name,
          modality: dto.modality,
          bodyPart: dto.bodyPart,
          description: dto.description ?? null,
          version: dto.version ?? 1,
          document: dto.document as any,
          editorSettings: dto.editorSettings as any,
          sections: { create: sectionCreateData(dto.sections) },
        },
        include: INCLUDE_SECTIONS,
      }),
    ]);
    this.audit.log(user.id, "update", "template", { templateId: id, name: dto.name });
    return toClient(template);
  }

  async remove(id: string, user: JwtUser) {
    await this.assertEditable(id, user);
    await this.prisma.template.delete({ where: { id } });
    this.audit.log(user.id, "delete", "template", { templateId: id });
    return { ok: true };
  }

  private async findVisible(id: string, user: JwtUser) {
    const t = await this.prisma.template.findFirst({
      where: {
        id,
        OR: [
          { ownerId: null, organizationId: null },
          { ownerId: user.id, organizationId: user.organizationId },
        ],
      },
      include: INCLUDE_SECTIONS,
    });
    if (!t)
      throw new NotFoundException("Template not found");
    return t;
  }

  private async assertEditable(id: string, user: JwtUser) {
    const t = await this.prisma.template.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!t) throw new NotFoundException("Template not found");
    // Personal templates are only editable by their owner. Global starter
    // templates live outside an organization and cannot be modified here.
    if (t.ownerId !== user.id)
      throw new ForbiddenException("You cannot modify this template");
  }
}
