import { generateTotpSecret, totpCode, verifyTotp } from "./totp";

describe("TOTP", () => {
  it("generates a base32 secret and verifies the current code", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const now = Date.UTC(2026, 6, 28, 12, 0, 0);
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
  });

  it("accepts one clock step of skew and rejects malformed codes", () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const now = Date.UTC(2026, 6, 28, 12, 0, 0);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
  });
});
