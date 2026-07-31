import { ForbiddenException } from "@nestjs/common";
import { AdminBillingService } from "./admin-billing.service";
import { JwtUser } from "../common/decorators";

const tenantAdmin: JwtUser = {
  id: "admin-1",
  email: "admin@example.com",
  roles: ["ADMIN"],
  permissions: ["manage:billing"],
  organizationId: "org-1",
  mustChangePassword: false,
  authVersion: 0,
  mfaEnabled: true,
};

describe("AdminBillingService tenancy", () => {
  it("scopes user search to the actor organization", async () => {
    const prisma: any = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminBillingService(prisma, {} as any);
    await service.searchUsers(tenantAdmin, "doctor");
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1" }),
      })
    );
  });

  it("rejects a billing target from another organization", async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "user-2", organizationId: "org-2" }),
      },
    };
    const service = new AdminBillingService(prisma, { me: jest.fn() } as any);
    await expect(service.getUserSubscription(tenantAdmin, "user-2")).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("allows a platform administrator to manage another organization", async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "user-2", organizationId: "org-2" }),
      },
    };
    const subscriptions = { me: jest.fn().mockResolvedValue({ subscriptionId: "sub-2" }) };
    const service = new AdminBillingService(prisma, subscriptions as any);
    await expect(
      service.getUserSubscription(
        { ...tenantAdmin, roles: ["PLATFORM_ADMIN"], permissions: ["manage:*"] },
        "user-2"
      )
    ).resolves.toEqual({ subscriptionId: "sub-2" });
  });
});
