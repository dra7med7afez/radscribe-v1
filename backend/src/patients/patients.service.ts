import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtUser } from "../common/decorators";
import { AuditService } from "../common/audit.service";
import { CreatePatientDto } from "./dto";

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // Patients are PHI: every query is scoped to the calling organization. There
  // is no cross-tenant patient visibility.
  async list(user: JwtUser, source?: string) {
    if (source === "integration") {
      // No adapter is certified in this distribution. Returning sample worklist
      // data or silently succeeding would be unsafe in a clinical workflow.
      throw new ServiceUnavailableException(
        "External worklists are unavailable until a validated adapter is deployed"
      );
    }
    return this.prisma.patient.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(user: JwtUser, dto: CreatePatientDto) {
    const existing = await this.prisma.patient.findFirst({
      where: { organizationId: user.organizationId, mrn: dto.mrn },
      select: { id: true },
    });
    if (existing) throw new ConflictException("A patient with this MRN already exists in this organization");
    let patient;
    try {
      patient = await this.prisma.patient.create({
        data: {
          ownerId: user.id,
          organizationId: user.organizationId,
          name: dto.name,
          mrn: dto.mrn,
          dob: dto.dob || null,
          sex: dto.sex || null,
          accession: dto.accession || null,
          studyDescription: dto.studyDescription || null,
          modality: dto.modality || null,
          status: dto.status || "Scheduled",
          source: "LOCAL",
        },
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new ConflictException("A patient with this MRN already exists in this organization");
      }
      throw error;
    }
    this.audit.log(user.id, "create", "patient", { patientId: patient.id });
    return patient;
  }

  async updateStatus(
    user: JwtUser,
    id: string,
    status: "Scheduled" | "In Progress" | "Completed"
  ) {
    const updated = await this.prisma.patient.updateMany({
      where: { id, organizationId: user.organizationId },
      data: { status },
    });
    if (updated.count !== 1) throw new NotFoundException("Patient not found");
    await this.audit.log(user.id, "update-status", "patient", { patientId: id, status });
    return { id, status };
  }
}
