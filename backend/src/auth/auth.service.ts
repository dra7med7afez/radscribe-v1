import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AccountTypeValue } from "./dto";
import { SubscriptionProvisioningService } from "../billing/subscription-provisioning.service";
import { decryptJson, encryptJson } from "../common/crypto";
import { generateTotpSecret, verifyTotp } from "../common/totp";

const BCRYPT_ROUNDS = 12;

// Compared against when the email doesn't exist, so a login miss costs the
// same as a hit — no user-enumeration via response timing.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", BCRYPT_ROUNDS);

// A refresh-token replay this soon after rotation is two tabs racing, not
// theft — reject it without nuking the user's whole session family.
const ROTATION_GRACE_MS = 30_000;

// Self-service signups always land in the regular reporting role; ADMIN stays
// operator-granted only.
const SIGNUP_ROLE = "RADIOLOGIST";

// Claims of a verified Google ID token we care about.
interface GoogleTokenInfo {
  sub: string;
  email: string;
  email_verified: string; // tokeninfo returns strings
  name?: string;
  aud: string;
  iss: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private audit: AuditService,
    private subscriptions: SubscriptionProvisioningService
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async userClaims(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user || !user.active) throw new UnauthorizedException();
    const rolePriority = ["PLATFORM_ADMIN", "ADMIN", "RADIOLOGIST"];
    const roles = user.roles
      .map((ur) => ur.role.name)
      .sort((a, b) => {
        const rank = (role: string) => {
          const index = rolePriority.indexOf(role);
          return index < 0 ? rolePriority.length : index;
        };
        return rank(a) - rank(b);
      });
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`)
        )
      )
    );
    return { user, roles, permissions };
  }

  private publicUser(
    user: {
      id: string;
      email: string;
      name: string | null;
      mustChangePassword: boolean;
      accountType: AccountTypeValue;
      organizationName: string | null;
      mfaEnabled: boolean;
    },
    roles: string[]
  ) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: roles[0] || "USER",
      mustChangePassword: user.mustChangePassword,
      accountType: user.accountType,
      organizationName: user.organizationName,
      mfaEnabled: user.mfaEnabled,
    };
  }

  private verifyMfa(user: { mfaEnabled: boolean; mfaSecretEnc: string | null }, code?: string) {
    if (!user.mfaEnabled) return;
    const secret = user.mfaSecretEnc
      ? decryptJson<{ secret: string }>(
          user.mfaSecretEnc,
          this.config.get<string>("credentialsKey") || ""
        )?.secret
      : null;
    if (!secret || !code || !verifyTotp(secret, code)) {
      throw new UnauthorizedException("A valid six-digit authentication code is required");
    }
  }

  async issueTokens(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
    mustChangePassword: boolean,
    authVersion: number
  ) {
    const accessSecret = this.config.get<string>("jwt.accessSecret");
    const refreshSecret = this.config.get<string>("jwt.refreshSecret");
    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        email,
        roles,
        permissions,
        type: "access",
        mustChangePassword,
        ver: authVersion,
      },
      {
        secret: accessSecret,
        expiresIn: this.config.get<string>("jwt.accessTtl"),
        issuer: this.config.get<string>("jwt.issuer"),
        audience: this.config.get<string>("jwt.audience"),
      } as any
    );
    // jti makes every refresh token unique: two tokens minted for the same user
    // within the same second would otherwise be byte-identical (same sub/iat/exp),
    // hash-collide in the store, and trip rotation/reuse detection falsely.
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, type: "refresh", jti: randomUUID(), ver: authVersion },
      {
        secret: refreshSecret,
        expiresIn: this.config.get<string>("jwt.refreshTtl"),
        issuer: this.config.get<string>("jwt.issuer"),
        audience: this.config.get<string>("jwt.audience"),
      } as any
    );

    // store hashed refresh token (rotation)
    const decoded: any = this.jwt.decode(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date((decoded?.exp || 0) * 1000),
      },
    });

    // opportunistic pruning: drop this user's long-expired rows so the table
    // doesn't grow without bound (a global sweep also runs periodically)
    this.prisma.refreshToken
      .deleteMany({ where: { userId, expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string, mfaCode?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    // always run the compare — a miss must cost the same as a hit (timing)
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user) throw new UnauthorizedException("Invalid credentials");
    if (!user.passwordHash)
      throw new UnauthorizedException(
        "This account uses Google sign-in — use the Google button"
      );
    if (!ok) throw new UnauthorizedException("Invalid credentials");
    if (!user.active) throw new UnauthorizedException("Account is deactivated");

    const { user: current, roles, permissions } = await this.userClaims(user.id);
    this.verifyMfa(current, mfaCode);
    const tokens = await this.issueTokens(
      current.id,
      current.email,
      roles,
      permissions,
      current.mustChangePassword,
      current.authVersion
    );
    this.audit.log(user.id, "login", "auth");
    return { ...tokens, user: this.publicUser(user, roles) };
  }

  private async signupRoleId(): Promise<string> {
    const role = await this.prisma.role.findUnique({ where: { name: SIGNUP_ROLE } });
    if (!role) throw new ServiceUnavailableException("Signup role is not seeded");
    return role.id;
  }

  async register(input: {
    email: string;
    password: string;
    name: string;
    accountType: AccountTypeValue;
    organizationName?: string;
  }) {
    if (!this.config.get<boolean>("auth.allowRegistration"))
      throw new ForbiddenException(
        "Self-registration is disabled on this server — ask your administrator for an account"
      );

    const email = input.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const roleId = await this.signupRoleId();
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const userId = randomUUID();
    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const organizationName =
          input.accountType === "ORGANIZATION"
            ? input.organizationName ?? input.name
            : `${input.name} personal workspace`;
        await tx.organization.create({ data: { id: userId, name: organizationName } });
        const created = await tx.user.create({
          data: {
            id: userId,
            organizationId: userId,
            email,
            name: input.name,
            passwordHash,
            accountType: input.accountType,
            organizationName: input.accountType === "ORGANIZATION" ? organizationName : null,
            roles: { create: { roleId } },
          },
        });
        await this.subscriptions.createFreeForUser(tx, created.id);
        return created;
      });
    } catch (err: any) {
      // two concurrent registrations with the same email — the unique index wins
      if (err?.code === "P2002")
        throw new ConflictException("An account with this email already exists");
      throw err;
    }

    const { user: current, roles, permissions } = await this.userClaims(user.id);
    const tokens = await this.issueTokens(
      current.id,
      current.email,
      roles,
      permissions,
      current.mustChangePassword,
      current.authVersion
    );
    this.audit.log(user.id, "register", "auth", { accountType: input.accountType });
    return { ...tokens, user: this.publicUser(user, roles) };
  }

  // Verifies a Google Identity Services ID token against Google's tokeninfo
  // endpoint (recommended for server-side validation without a JWKS cache).
  private async verifyGoogleToken(idToken: string): Promise<GoogleTokenInfo> {
    const clientId = this.config.get<string>("google.clientId");
    if (!clientId)
      throw new BadRequestException("Google sign-in is not configured on this server");

    let payload: GoogleTokenInfo & { [k: string]: unknown };
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) throw new Error(`tokeninfo ${res.status}`);
      payload = (await res.json()) as any;
    } catch (err) {
      if ((err as Error).message?.startsWith("tokeninfo"))
        throw new UnauthorizedException("Invalid Google credential");
      throw new ServiceUnavailableException("Could not reach Google to verify the credential");
    }

    if (payload.aud !== clientId)
      throw new UnauthorizedException("Google credential was issued for a different app");
    if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss))
      throw new UnauthorizedException("Invalid Google credential");
    if (payload.email_verified !== "true" || !payload.email)
      throw new UnauthorizedException("Google account email is not verified");
    return payload;
  }

  async loginWithGoogle(input: {
    idToken: string;
    accountType?: AccountTypeValue;
    organizationName?: string;
    mfaCode?: string;
  }) {
    const info = await this.verifyGoogleToken(input.idToken);
    const email = info.email.toLowerCase();

    let user = await this.prisma.user.findUnique({ where: { googleId: info.sub } });
    let firstLogin = false;

    if (!user) {
      // Never link a federated credential to an existing account merely because
      // the email matches.  That is an account-takeover primitive; linking must
      // be an authenticated, explicit workflow.
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        throw new ConflictException(
          "An account with this email already exists. Sign in with its existing method to link Google."
        );
      } else {
        if (!this.config.get<boolean>("auth.allowRegistration")) {
          throw new ForbiddenException("Self-registration is disabled on this server");
        }
        const roleId = await this.signupRoleId();
        const accountType = input.accountType ?? "INDIVIDUAL";
        const userId = randomUUID();
        const name = info.name || email.split("@")[0];
        const organizationName =
          accountType === "ORGANIZATION"
            ? input.organizationName ?? name
            : `${name} personal workspace`;
        user = await this.prisma.$transaction(async (tx) => {
          await tx.organization.create({ data: { id: userId, name: organizationName } });
          const created = await tx.user.create({
            data: {
              id: userId,
              organizationId: userId,
              email,
              name,
              googleId: info.sub,
              passwordHash: null,
              accountType,
              organizationName: accountType === "ORGANIZATION" ? organizationName : null,
              roles: { create: { roleId } },
            },
          });
          await this.subscriptions.createFreeForUser(tx, created.id);
          return created;
        });
        firstLogin = true;
      }
    }

    if (!user.active) throw new UnauthorizedException("Account is deactivated");

    const { user: current, roles, permissions } = await this.userClaims(user.id);
    this.verifyMfa(current, input.mfaCode);
    const tokens = await this.issueTokens(
      current.id,
      current.email,
      roles,
      permissions,
      current.mustChangePassword,
      current.authVersion
    );
    this.audit.log(user.id, firstLogin ? "register-google" : "login-google", "auth");
    return { ...tokens, user: this.publicUser(user, roles) };
  }

  async refresh(refreshToken: string) {
    const refreshSecret = this.config.get<string>("jwt.refreshSecret");
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: refreshSecret,
        issuer: this.config.get<string>("jwt.issuer"),
        audience: this.config.get<string>("jwt.audience"),
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (payload?.type !== "refresh") throw new UnauthorizedException("Invalid refresh token");
    // Reject stale credentials before mutating their refresh-token row. A
    // password reset / deactivation must not cause an old token to rotate.
    const { user, roles, permissions } = await this.userClaims(payload.sub);
    if (payload.ver !== user.authVersion) throw new UnauthorizedException("Refresh token revoked");
    const tokenHash = this.hashToken(refreshToken);
    // prefer an active row if legacy (pre-jti) duplicates share this hash
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash },
      orderBy: [{ revoked: "asc" }, { createdAt: "desc" }],
    });
    if (!stored || stored.expiresAt < new Date())
      throw new UnauthorizedException("Refresh token revoked");

    // Atomic rotation: of N concurrent calls presenting the same token, exactly
    // one flips revoked=false→true and wins; the rest fall through to the
    // reuse-detection branch below.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (rotated.count === 0) {
      const revokedAgoMs = stored.revokedAt
        ? Date.now() - stored.revokedAt.getTime()
        : Number.POSITIVE_INFINITY;
      if (revokedAgoMs > ROTATION_GRACE_MS) {
        // Replay of a long-revoked token = stolen token (OWASP): revoke the
        // user's entire session family so the thief's pair dies too.
        await this.prisma.refreshToken.updateMany({
          where: { userId: payload.sub, revoked: false },
          data: { revoked: true, revokedAt: new Date() },
        });
        this.audit.log(payload.sub, "refresh-reuse-detected", "auth");
      }
      throw new UnauthorizedException("Refresh token revoked");
    }

    return this.issueTokens(
      user.id,
      user.email,
      roles,
      permissions,
      user.mustChangePassword,
      user.authVersion
    );
  }

  // Revoke the presented refresh token. Idempotent — logging out twice, or with
  // an already-expired token, still succeeds.
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (result.count > 0) {
      const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
      this.audit.log(stored?.userId ?? null, "logout", "auth");
    }
    return { ok: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.passwordHash)
      throw new BadRequestException(
        "This account uses Google sign-in and has no password to change"
      );
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException("Current password is incorrect");
    if (currentPassword === newPassword)
      throw new BadRequestException("New password must differ from the current one");

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false, authVersion: { increment: 1 } },
      }),
      // revoke every session — other devices must log in again
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);
    this.audit.log(userId, "change-password", "auth");

    // issue a fresh pair so the current device stays logged in
    const { user: fresh, roles, permissions } = await this.userClaims(userId);
    const tokens = await this.issueTokens(
      fresh.id,
      fresh.email,
      roles,
      permissions,
      fresh.mustChangePassword,
      fresh.authVersion
    );
    return { ...tokens, user: this.publicUser(fresh, roles) };
  }

  async me(userId: string) {
    const { user, roles } = await this.userClaims(userId);
    return this.publicUser(user, roles);
  }

  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.mfaEnabled) throw new ConflictException("Multi-factor authentication is already enabled");
    const secret = generateTotpSecret();
    const encrypted = encryptJson(
      { secret },
      this.config.get<string>("credentialsKey") || ""
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEnc: encrypted },
    });
    const label = encodeURIComponent(`RadScribe:${user.email}`);
    const issuer = encodeURIComponent("RadScribe");
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirmMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.mfaSecretEnc) throw new BadRequestException("Start MFA setup first");
    const secret = decryptJson<{ secret: string }>(
      user.mfaSecretEnc,
      this.config.get<string>("credentialsKey") || ""
    )?.secret;
    if (!secret || !verifyTotp(secret, code)) {
      throw new BadRequestException("Authentication code is invalid or expired");
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true, authVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);
    await this.audit.log(userId, "enable-mfa", "auth");
    const { user: fresh, roles, permissions } = await this.userClaims(userId);
    const tokens = await this.issueTokens(
      fresh.id,
      fresh.email,
      roles,
      permissions,
      fresh.mustChangePassword,
      fresh.authVersion
    );
    return { ...tokens, user: this.publicUser(fresh, roles) };
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    this.verifyMfa(user, code);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecretEnc: null,
          authVersion: { increment: 1 },
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);
    await this.audit.log(userId, "disable-mfa", "auth");
    const { user: fresh, roles, permissions } = await this.userClaims(userId);
    const tokens = await this.issueTokens(
      fresh.id,
      fresh.email,
      roles,
      permissions,
      fresh.mustChangePassword,
      fresh.authVersion
    );
    return { ...tokens, user: this.publicUser(fresh, roles) };
  }
}
