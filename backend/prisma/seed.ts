import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function seedPlans() {
  const plans = [
    { id: "plan-free", code: "FREE" as const, name: "Free", description: "For users trying RadScribe", monthlyPriceCents: 0, yearlyPriceCents: 0, defaultReportLimit: 20, isEnterprise: false },
    { id: "plan-pro", code: "PRO" as const, name: "Pro", description: "For regular reporting workflows", monthlyPriceCents: null, yearlyPriceCents: null, defaultReportLimit: 500, isEnterprise: false },
    { id: "plan-ultra", code: "ULTRA" as const, name: "Ultra", description: "For higher-volume reporting workflows", monthlyPriceCents: null, yearlyPriceCents: null, defaultReportLimit: 1000, isEnterprise: false },
    { id: "plan-enterprise", code: "ENTERPRISE" as const, name: "Enterprise", description: "Custom usage and pricing", monthlyPriceCents: null, yearlyPriceCents: null, defaultReportLimit: null, isEnterprise: true },
  ];
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        defaultReportLimit: plan.defaultReportLimit,
        isEnterprise: plan.isEnterprise,
      },
      create: { ...plan, currency: "USD", usageInterval: "MONTHLY", isActive: true },
    });
  }
}

// Shape of prisma/seed-templates.json. Only the five standard starters below
// are published; older catalog entries remain readable for migration history.
interface SeedFinding {
  region: string;
  normalText: string;
  subpoints?: string[];
}
interface SeedSection {
  id?: string;
  name: string;
  kind: "prose" | "findings";
  grouped?: boolean;
  defaultProse?: string;
  normalImpression?: string;
  isConclusion?: boolean;
  bulletStyle?: string;
  findings?: SeedFinding[];
}
interface SeedTemplate {
  id: string; // becomes the slug
  name: string;
  modality: string;
  bodyPart: string;
  sections: SeedSection[];
}

const STANDARD_TEMPLATE_SLUGS = new Set([
  "xr-chest",
  "ct-head",
  "ct-chest",
  "ct-abdomen",
  "mri-brain",
]);

function loadSeedTemplates(): SeedTemplate[] {
  // works both compiled (dist/prisma/seed.js) and via ts-node (prisma/seed.ts)
  const candidates = [
    path.join(__dirname, "seed-templates.json"),
    path.join(__dirname, "..", "..", "prisma", "seed-templates.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const catalog = JSON.parse(fs.readFileSync(p, "utf8")) as SeedTemplate[];
      return catalog.filter((template) => STANDARD_TEMPLATE_SLUGS.has(template.id));
    }
  }
  throw new Error("seed-templates.json not found next to seed script or in prisma/");
}

async function seedRolesAndAdmin() {
  const permissions = await Promise.all(
    [
      ["manage", "*"],
      ["manage", "users"],
      ["manage", "billing"],
      ["manage", "plans"],
      ["sign", "reports"],
    ].map(([action, resource]) =>
      prisma.permission.upsert({
        where: { action_resource: { action, resource } },
        update: {},
        create: { action, resource },
      })
    )
  );
  const permission = (action: string, resource: string) =>
    permissions.find((item) => item.action === action && item.resource === resource)!;

  const platformAdminRole = await prisma.role.upsert({
    where: { name: "PLATFORM_ADMIN" },
    update: { description: "Platform-wide operations" },
    create: { name: "PLATFORM_ADMIN", description: "Platform-wide operations" },
  });
  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    update: { description: "Organization administrator" },
    create: { name: "ADMIN", description: "Organization administrator" },
  });
  const radiologistRole = await prisma.role.upsert({
    where: { name: "RADIOLOGIST" },
    update: { description: "Reporting radiologist" },
    create: { name: "RADIOLOGIST", description: "Reporting radiologist" },
  });

  for (const [roleId, granted] of [
    [platformAdminRole.id, [permission("manage", "*")]],
    [adminRole.id, [permission("manage", "users"), permission("manage", "billing"), permission("sign", "reports")]],
    [radiologistRole.id, [permission("sign", "reports")]],
  ] as const) {
    for (const item of granted) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: item.id } },
        update: {},
        create: { roleId, permissionId: item.id },
      });
    }
  }

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: adminRole.id,
      permissionId: permission("manage", "*").id,
    },
  });

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required to initialize an administrator");
  }
  if (adminPassword.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters long");
  }
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const organizationId = `org-${adminEmail}`.replace(/[^a-z0-9-]/g, "-").slice(0, 191);
  await prisma.organization.upsert({
    where: { id: organizationId },
    update: {},
    create: { id: organizationId, name: "System administration" },
  });
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { organizationId },
    create: {
      email: adminEmail,
      name: "Dr. Admin",
      passwordHash,
      organizationId,
      mustChangePassword: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: platformAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: platformAdminRole.id },
  });
  if (!user.usageSubscriptionId) {
    const free = await prisma.plan.findUniqueOrThrow({ where: { code: "FREE" } });
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          ownerUserId: user.id,
          planId: free.id,
          billingCycle: "NONE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          usageAnchorAt: now,
        },
      });
      await tx.usagePeriod.create({
        data: {
          subscriptionId: subscription.id,
          periodStart: now,
          periodEnd,
          baseReportLimit: free.defaultReportLimit ?? 20,
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { usageSubscriptionId: subscription.id },
      });
    });
  }
  console.log(`Seeded administrator: ${adminEmail} (password change required on first login)`);
}

async function seedTemplates() {
  const templates = loadSeedTemplates();
  const slugs = templates.map((template) => template.id);
  // Keep the global starter catalog exact when the product changes its
  // defaults, while leaving any templates users create after launch alone.
  const removed = await prisma.template.deleteMany({
    where: {
      ownerId: null,
      organizationId: null,
      slug: { notIn: slugs },
    },
  });
  let created = 0;
  for (const t of templates) {
    // Non-destructive: seed templates are created once and never overwritten,
    // so operator/user edits to them survive redeploys.
    const existing = await prisma.template.findUnique({ where: { slug: t.id } });
    if (existing) continue;
    await prisma.template.create({
      data: {
        slug: t.id,
        name: t.name,
        modality: t.modality,
        bodyPart: t.bodyPart,
        ownerId: null, // global starter template, visible to every user
        sections: {
          create: t.sections.map((s, i) => ({
            // keep the seed's stable section ids (e.g. "ct-chest-findings-1")
            ...(s.id ? { id: s.id } : {}),
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
                region: f.region,
                normalText: f.normalText,
                subpoints: f.subpoints && f.subpoints.length ? f.subpoints : undefined,
                orderIndex: fi,
              })),
            },
          })),
        },
      },
    });
    created++;
  }
  console.log(
    `Seeded templates: ${created} created, ${templates.length - created} already present, ${removed.count} retired globals removed`
  );
}

async function main() {
  await seedPlans();
  await seedRolesAndAdmin();
  await seedTemplates();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
