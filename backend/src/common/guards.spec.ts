import { hasPermission } from "./guards";

describe("hasPermission", () => {
  it("grants everything to manage:*", () => {
    const perms = ["manage:*"];
    expect(hasPermission(perms, "manage:users")).toBe(true);
    expect(hasPermission(perms, "read:reports")).toBe(true);
    expect(hasPermission(perms, "manage:templates")).toBe(true);
  });

  it("matches exact action:resource", () => {
    expect(hasPermission(["read:reports"], "read:reports")).toBe(true);
    expect(hasPermission(["read:reports"], "read:users")).toBe(false);
  });

  it("manage on a resource implies other actions on that resource", () => {
    expect(hasPermission(["manage:reports"], "read:reports")).toBe(true);
    expect(hasPermission(["manage:reports"], "read:users")).toBe(false);
  });

  it("wildcard resource covers any resource for that action", () => {
    expect(hasPermission(["read:*"], "read:users")).toBe(true);
    expect(hasPermission(["read:*"], "manage:users")).toBe(false);
  });

  it("denies with an empty permission set", () => {
    expect(hasPermission([], "read:reports")).toBe(false);
  });
});
