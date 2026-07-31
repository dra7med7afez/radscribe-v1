import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  encryptJson,
  decryptJson,
  splitSecrets,
  maskSecrets,
  SECRET_MASK,
} from "../common/crypto";
import { hasPermission } from "../common/guards";
import { JwtUser } from "../common/decorators";
import { AuditService } from "../common/audit.service";
import { CreateIntegrationDto, UpdateIntegrationDto } from "./dto";

const CONFIG_MAX_KEYS = 50;
const CONFIG_MAX_VALUE_LEN = 4096;

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService
  ) {}

  private get key() {
    return this.config.get<string>("credentialsKey") || "dev-credentials-key";
  }

  // Admins manage every integration in their organization; other users can
  // only see integrations they created.
  private ownerFilter(user: JwtUser) {
    return {
      organizationId: user.organizationId,
      ...(hasPermission(user.permissions, "manage:integrations") ? {} : { ownerId: user.id }),
    };
  }

  // Config values arrive as unknown JSON — coerce to bounded strings so nothing
  // odd rides into splitSecrets or the adapters.
  private cleanConfig(raw?: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw || {}).slice(0, CONFIG_MAX_KEYS)) {
      if (v === null || v === undefined) continue;
      out[k] = String(v).slice(0, CONFIG_MAX_VALUE_LEN);
    }
    return out;
  }

  // Never return plaintext credentials to the client.
  private redact(integration: any) {
    const secretKeys: string[] = integration._secretKeys || [];
    const { credentialsEnc, ...rest } = integration;
    return {
      id: rest.id,
      type: String(rest.type).toLowerCase(),
      name: rest.name,
      status: String(rest.status).toLowerCase(),
      enabled: rest.enabled,
      lastSyncAt: rest.lastSyncAt,
      config: maskSecrets(rest.config || {}, secretKeys),
    };
  }

  private async findOwned(id: string, user: JwtUser) {
    const row = await this.prisma.integration.findFirst({
      where: { id, ...this.ownerFilter(user) },
    });
    if (!row) throw new NotFoundException("Integration not found");
    return row;
  }

  async list(user: JwtUser) {
    const rows = await this.prisma.integration.findMany({
      where: this.ownerFilter(user),
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.redact(this.withSecretKeys(r)));
  }

  private withSecretKeys(row: any) {
    const secrets = row.credentialsEnc
      ? decryptJson<Record<string, string>>(row.credentialsEnc, this.key)
      : null;
    return { ...row, _secretKeys: secrets ? Object.keys(secrets) : [] };
  }

  async create(user: JwtUser, dto: CreateIntegrationDto) {
    const { publicCfg, secrets } = splitSecrets(this.cleanConfig(dto.config));
    const row = await this.prisma.integration.create({
      data: {
        ownerId: user.id,
        organizationId: user.organizationId,
        type: dto.type,
        name: dto.name,
        status: "DISCONNECTED",
        config: publicCfg,
        credentialsEnc: Object.keys(secrets).length ? encryptJson(secrets, this.key) : null,
        enabled: dto.enabled ?? true,
      },
    });
    this.audit.log(user.id, "create", "integration", { integrationId: row.id, type: row.type });
    return this.redact(this.withSecretKeys(row));
  }

  async update(user: JwtUser, id: string, dto: UpdateIntegrationDto) {
    const existing = await this.findOwned(id, user);
    const merged = { ...(existing.config as any), ...this.cleanConfig(dto.config) };
    const { publicCfg, secrets: incoming } = splitSecrets(merged);

    // Merge into the PRIOR secrets instead of replacing the blob wholesale:
    //  - the mask sentinel means "unchanged" (the client echoes it back when the
    //    user didn't retype the secret) — keep the stored value
    //  - an empty string is an explicit clear
    //  - updating one secret must never drop its siblings
    const prior = existing.credentialsEnc
      ? decryptJson<Record<string, string>>(existing.credentialsEnc, this.key) ?? {}
      : {};
    const secrets: Record<string, string> = { ...prior };
    for (const [k, v] of Object.entries(incoming)) {
      if (v === SECRET_MASK) continue;
      if (v === "") delete secrets[k];
      else secrets[k] = v;
    }

    const row = await this.prisma.integration.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        enabled: dto.enabled ?? existing.enabled,
        config: publicCfg,
        credentialsEnc: Object.keys(secrets).length ? encryptJson(secrets, this.key) : null,
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    this.audit.log(user.id, "update", "integration", { integrationId: id });
    return this.redact(this.withSecretKeys(row));
  }

  async remove(user: JwtUser, id: string) {
    await this.findOwned(id, user);
    await this.prisma.integration.delete({ where: { id } });
    this.audit.log(user.id, "delete", "integration", { integrationId: id });
    return { ok: true };
  }

  async test(user: JwtUser, id: string) {
    await this.findOwned(id, user);
    await this.prisma.integration.update({
      where: { id },
      data: { status: "ERROR", lastSyncAt: new Date() },
    });
    throw new ServiceUnavailableException(
      "No validated integration adapter is configured for this deployment"
    );
  }
}
