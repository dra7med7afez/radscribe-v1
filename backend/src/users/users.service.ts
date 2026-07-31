import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AssignableRole, CreateUserDto, UpdateUserDto } from "./dto";
import { SubscriptionProvisioningService } from "../billing/subscription-provisioning.service";

const BCRYPT_ROUNDS = 12;

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  active: true,
  mustChangePassword: true,
  accountType: true,
  organizationName: true,
  createdAt: true,
  roles: { select: { role: { select: { name: true } } } },
} as const;

function toPublic(u: any) {
  const { roles, ...rest } = u;
  const rolePriority = ["PLATFORM_ADMIN", "ADMIN", "RADIOLOGIST"];
  const rank = (name: string) => {
    const index = rolePriority.indexOf(name);
    return index < 0 ? rolePriority.length : index;
  };
  const role =
    roles
      ?.map((item: any) => item.role.name)
      .sort((a: string, b: string) => rank(a) - rank(b))[0] ??
    "RADIOLOGIST";
  return { ...rest, role };
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private subscriptions: SubscriptionProvisioningService
  ) {}

  private async roleId(name: AssignableRole): Promise<string> {
    const role = await this.prisma.role.findUnique({ where: { name } });
    if (!role) throw new BadRequestException(`Role ${name} is not seeded`);
    return role.id;
  }

  private async assertNotLastActiveAdmin(
    userId: string,
    organizationId: string,
    willRemainAdmin: boolean
  ) {
    if (willRemainAdmin) return;
    const targetIsAdmin = await this.prisma.userRole.findFirst({
      where: { userId, role: { name: "ADMIN" }, user: { active: true } },
      select: { userId: true },
    });
    if (!targetIsAdmin) return;
    const activeAdmins = await this.prisma.userRole.count({
      where: {
        role: { name: "ADMIN" },
        user: { organizationId, active: true },
      },
    });
    if (activeAdmins <= 1) {
      throw new BadRequestException(
        "Assign another active organization administrator before removing this administrator"
      );
    }
  }

  async list(actor: { organizationId: string }) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: actor.organizationId },
      select: USER_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return users.map(toPublic);
  }

  async create(dto: CreateUserDto, actor: { id: string; organizationId: string }) {
    const email = dto.email.toLowerCase(); // one canonical form everywhere
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("A user with this email already exists");

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const roleId = await this.roleId(dto.role);
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            name: dto.name,
            passwordHash,
            organizationId: actor.organizationId,
            mustChangePassword: true,
            roles: { create: { roleId } },
          },
          select: USER_SELECT,
        });
        await this.subscriptions.createFreeForUser(tx, created.id);
        return created;
      });
    } catch (err: any) {
      if (err?.code === "P2002")
        throw new ConflictException("A user with this email already exists");
      throw err;
    }
    this.audit.log(actor.id, "create", "user", { targetId: user.id, email, role: dto.role });
    return toPublic(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: { id: string; organizationId: string }) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!user) throw new NotFoundException("User not found");
    if (id === actor.id && dto.active === false)
      throw new BadRequestException("You cannot deactivate your own account");
    await this.assertNotLastActiveAdmin(
      id,
      actor.organizationId,
      dto.active !== false && (dto.role === undefined || dto.role === "ADMIN")
    );

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      data.mustChangePassword = true;
    }
    if (dto.password !== undefined || dto.active === false || dto.role !== undefined) {
      data.authVersion = { increment: 1 };
    }

    const ops: any[] = [
      this.prisma.user.update({ where: { id }, data, select: USER_SELECT }),
    ];
    if (dto.role !== undefined) {
      const roleId = await this.roleId(dto.role);
      ops.push(this.prisma.userRole.deleteMany({ where: { userId: id } }));
      ops.push(this.prisma.userRole.create({ data: { userId: id, roleId } }));
    }
    // password reset or deactivation kills every session for that user
    if (dto.password !== undefined || dto.active === false) {
      ops.push(
        this.prisma.refreshToken.updateMany({
          where: { userId: id, revoked: false },
          data: { revoked: true, revokedAt: new Date() },
        })
      );
    }
    await this.prisma.$transaction(ops);

    this.audit.log(actor.id, "update", "user", {
      targetId: id,
      fields: Object.keys(dto).filter((k) => (dto as any)[k] !== undefined),
    });
    const fresh = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    return toPublic(fresh);
  }

  async remove(id: string, actor: { id: string; organizationId: string }) {
    if (id === actor.id) throw new BadRequestException("You cannot delete your own account");
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!user) throw new NotFoundException("User not found");
    await this.assertNotLastActiveAdmin(id, actor.organizationId, false);

    // Medical reports are a retention obligation — a user with reports (or
    // patients) can only be deactivated, never hard-deleted. The DB FK is
    // RESTRICT as a backstop; this check gives a human-readable error first.
    const [reportCount, patientCount, templateCount, integrationCount, usageEventCount, adjustmentCount] = await Promise.all([
      this.prisma.report.count({ where: { ownerId: id } }),
      this.prisma.patient.count({ where: { ownerId: id } }),
      this.prisma.template.count({ where: { ownerId: id } }),
      this.prisma.integration.count({ where: { ownerId: id } }),
      this.prisma.reportUsageEvent.count({
        where: { OR: [{ userId: id }, { subscription: { ownerUserId: id } }] },
      }),
      this.prisma.usageAdjustment.count({
        where: {
          OR: [{ actorUserId: id }, { usagePeriod: { subscription: { ownerUserId: id } } }],
        },
      }),
    ]);
    if (
      reportCount > 0 ||
      patientCount > 0 ||
      templateCount > 0 ||
      integrationCount > 0 ||
      usageEventCount > 0 ||
      adjustmentCount > 0
    )
      throw new ConflictException(
        "This user owns clinical or billing records and cannot be deleted — deactivate the account instead"
      );

    await this.prisma.$transaction(async (tx) => {
      const owned = await tx.subscription.findUnique({ where: { ownerUserId: id } });
      if (owned) {
        await tx.user.update({ where: { id }, data: { usageSubscriptionId: null } });
        await tx.usagePeriod.deleteMany({ where: { subscriptionId: owned.id } });
        await tx.subscription.delete({ where: { id: owned.id } });
      }
      await tx.user.delete({ where: { id } });
    });
    this.audit.log(actor.id, "delete", "user", { targetId: id, email: user.email });
    return { ok: true };
  }

  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });
    return { settings: user?.settings ?? null };
  }

  async updateSettings(userId: string, settings: Record<string, unknown>) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { settings: settings as any },
    });
    return { ok: true };
  }
}
