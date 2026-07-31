import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { JwtUser } from "../common/decorators";
import {
  CreateReportDto,
  UpdateReportDto,
  SetContentDto,
  SignReportDto,
  AddendumDto,
} from "./dto";

const LIST_PAGE_DEFAULT = 20;
const LIST_PAGE_MAX = 50;

// List payloads stay slim: item `images` hold base64 data URLs and are only
// returned by the single-report GET.
const LIST_ITEM_SELECT = {
  id: true,
  sectionId: true,
  region: true,
  text: true,
  impressionLine: true,
  abnormal: true,
  score: true,
  subpoints: true,
  orderIndex: true,
} as const;

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // A report may only link to a patient in the caller's tenant.
  private async assertPatientAccessible(user: JwtUser, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!patient) throw new BadRequestException("Unknown patient");
  }

  private async assertTemplateVisible(user: JwtUser, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        id: templateId,
        OR: [
          { ownerId: null, organizationId: null },
          { ownerId: user.id, organizationId: user.organizationId },
        ],
      },
      select: { id: true },
    });
    if (!template) throw new BadRequestException("Unknown template");
  }

  async create(user: JwtUser, dto: CreateReportDto) {
    if (dto.patientId) await this.assertPatientAccessible(user, dto.patientId);
    if (dto.templateId) await this.assertTemplateVisible(user, dto.templateId);
    const report = await this.prisma.report.create({
      data: {
        ownerId: user.id,
        organizationId: user.organizationId,
        studyDescription: dto.studyDescription,
        modality: dto.modality,
        bodyPart: dto.bodyPart,
        clinicalInfo: dto.clinicalInfo ?? "", // set in code (no literal default)
        patientId: dto.patientId || null,
        templateId: dto.templateId || null,
      },
    });
    this.audit.log(user.id, "create", "report", { reportId: report.id });
    return { id: report.id, revision: report.revision };
  }

  async update(user: JwtUser, id: string, dto: UpdateReportDto) {
    await this.ensureEditable(user, id);
    if (dto.patientId) await this.assertPatientAccessible(user, dto.patientId);
    await this.prisma.report.update({
      where: { id },
      data: {
        ...(dto.clinicalInfo !== undefined ? { clinicalInfo: dto.clinicalInfo } : {}),
        ...(dto.patientId !== undefined ? { patientId: dto.patientId || null } : {}),
      },
    });
    return { id };
  }

  // Autosave path: clinicalInfo + sections + items replaced atomically. A save
  // either fully lands or doesn't — no interleaving of two in-flight saves.
  async setContent(user: JwtUser, id: string, dto: SetContentDto) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.updateMany({
        where: {
          id,
          ownerId: user.id,
          organizationId: user.organizationId,
          status: { not: "FINAL" },
          revision: dto.expectedRevision,
        },
        data: {
          ...(dto.clinicalInfo !== undefined ? { clinicalInfo: dto.clinicalInfo } : {}),
          revision: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        const current = await tx.report.findFirst({
          where: { id, ownerId: user.id, organizationId: user.organizationId },
          select: { status: true, revision: true },
        });
        if (!current) throw new NotFoundException("Report not found");
        if (current.status === "FINAL")
          throw new ConflictException("Report is signed and can no longer be edited");
        throw new ConflictException(`Report has changed; reload revision ${current.revision}`);
      }
      await tx.reportSection.deleteMany({ where: { reportId: id } });
      if (dto.sections.length) {
        await tx.reportSection.createMany({
          data: dto.sections.map((s) => ({
            reportId: id,
            sectionId: s.sectionId,
            name: s.name,
            kind: s.kind,
            grouped: !!s.grouped,
            orderIndex: s.orderIndex,
            html: s.html ?? "",
          })),
        });
      }
      await tx.reportItem.deleteMany({ where: { reportId: id } });
      if (dto.items.length) {
        await tx.reportItem.createMany({
          data: dto.items.map((it) => ({
            reportId: id,
            sectionId: it.sectionId,
            region: it.region,
            text: it.text,
            impressionLine: it.impressionLine ?? "",
            abnormal: !!it.abnormal,
            score: it.score || null,
            images: (it.images as any) ?? undefined,
            subpoints: (it.subpoints as any) ?? undefined,
            orderIndex: it.orderIndex,
          })),
        });
      }
      return { ok: true, revision: dto.expectedRevision + 1 };
    });
  }

  async sign(user: JwtUser, id: string, dto: SignReportDto) {
    const current = await this.ensureOwned(user, id);
    // A FINAL report is immutable — re-signing must not spawn duplicate FINAL
    // versions. Corrections go through a new report / explicit addendum flow.
    if (current.status === "FINAL")
      throw new ConflictException("Report is already signed");
    if (!current.patientId)
      throw new BadRequestException("Select a patient before signing a report");
    if (!dto.attested)
      throw new BadRequestException("Signing requires explicit clinical attestation");
    if (dto.patientId !== current.patientId)
      throw new ConflictException("The selected patient changed; review the report before signing");
    const report = await this.prisma.report.findFirst({
      where: { id, ownerId: user.id, organizationId: user.organizationId },
      include: { sections: true, items: true },
    });
    const hasContent =
      !!report &&
      (report.items.some((item) => item.text.replace(/<[^>]*>/g, "").trim()) ||
        report.sections.some((section) => section.html?.replace(/<[^>]*>/g, "").trim()));
    if (!hasContent) throw new BadRequestException("A report must contain findings before signing");
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.updateMany({
        where: {
          id,
          ownerId: user.id,
          organizationId: user.organizationId,
          status: { not: "FINAL" },
          revision: dto.expectedRevision,
        },
        data: { status: "FINAL", revision: { increment: 1 } },
      });
      if (updated.count === 0) throw new ConflictException("Report changed before signing; reload it first");
      await tx.reportVersion.create({
        data: {
          reportId: id,
          status: "FINAL",
          signedById: user.id,
          snapshot: { ...report, status: "FINAL", revision: dto.expectedRevision + 1 } as any,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          action: "sign",
          resource: "report",
          meta: { reportId: id, revision: dto.expectedRevision + 1 },
        },
      });
      return { ok: true, revision: dto.expectedRevision + 1 };
    });
    return result;
  }

  async get(user: JwtUser, id: string) {
    const report = await this.prisma.report.findFirst({
      where: { id, ownerId: user.id, organizationId: user.organizationId },
      include: {
        sections: { orderBy: { orderIndex: "asc" } },
        items: { orderBy: { orderIndex: "asc" } },
        patient: true,
      },
    });
    if (!report) throw new NotFoundException("Report not found");
    return report;
  }

  async versions(user: JwtUser, id: string) {
    await this.ensureOwned(user, id);
    return this.prisma.reportVersion.findMany({
      where: { reportId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        snapshot: true,
        createdAt: true,
        signedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async addendum(user: JwtUser, id: string, dto: AddendumDto) {
    const text = dto.text.trim();
    if (!dto.attested) throw new BadRequestException("Addendum requires explicit clinical attestation");
    if (!text) throw new BadRequestException("Addendum text is required");
    const report = await this.ensureOwned(user, id);
    if (report.status !== "FINAL") {
      throw new ConflictException("Only a signed report can receive an addendum");
    }
    if (!report.patientId || report.patientId !== dto.patientId) {
      throw new ConflictException("The selected patient does not match the signed report");
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.updateMany({
        where: {
          id,
          ownerId: user.id,
          organizationId: user.organizationId,
          status: "FINAL",
          revision: dto.expectedRevision,
        },
        data: { revision: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ConflictException("Report changed before the addendum was saved; reload it first");
      }
      const version = await tx.reportVersion.create({
        data: {
          reportId: id,
          status: "ADDENDUM",
          signedById: user.id,
          snapshot: {
            reportId: id,
            patientId: report.patientId,
            baseRevision: dto.expectedRevision,
            revision: dto.expectedRevision + 1,
            addendum: text,
          },
        },
        select: { id: true, status: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          action: "addendum",
          resource: "report",
          meta: { reportId: id, versionId: version.id, revision: dto.expectedRevision + 1 },
        },
      });
      return { ...version, revision: dto.expectedRevision + 1 };
    });
  }

  // Cursor-paginated, slim (no base64 images). Fetch a single report for the
  // full payload.
  async list(user: JwtUser, opts: { take?: number; cursor?: string } = {}) {
    const take = Math.min(Math.max(opts.take ?? LIST_PAGE_DEFAULT, 1), LIST_PAGE_MAX);
    const reports = await this.prisma.report.findMany({
      where: { ownerId: user.id, organizationId: user.organizationId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1, // one extra row tells us whether a next page exists
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: {
        sections: { orderBy: { orderIndex: "asc" } },
        items: { select: LIST_ITEM_SELECT, orderBy: { orderIndex: "asc" } },
        patient: true,
      },
    });
    const hasMore = reports.length > take;
    const page = hasMore ? reports.slice(0, take) : reports;
    return { reports: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  private async ensureOwned(user: JwtUser, id: string) {
    const r = await this.prisma.report.findFirst({
      where: { id, ownerId: user.id, organizationId: user.organizationId },
    });
    if (!r) throw new NotFoundException("Report not found");
    return r;
  }

  // A signed (FINAL) report is immutable — content changes need an addendum /
  // a new report, so autosave can never silently rewrite the legal record.
  private async ensureEditable(user: JwtUser, id: string) {
    const r = await this.ensureOwned(user, id);
    if (r.status === "FINAL")
      throw new ConflictException("Report is signed and can no longer be edited");
    return r;
  }
}
