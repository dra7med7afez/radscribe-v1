import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("content security policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the configured API origin for local cross-origin development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000/api");

    const response = proxy(new NextRequest("http://localhost:5173/"));
    const policy = response.headers.get("Content-Security-Policy");

    expect(policy).toContain(
      "connect-src 'self' https://accounts.google.com http://localhost:4000"
    );
  });

  it("does not add non-HTTP API schemes to the policy", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "javascript:alert(1)");

    const response = proxy(new NextRequest("http://localhost:5173/"));
    const policy = response.headers.get("Content-Security-Policy");

    expect(policy).not.toContain("javascript:");
  });
});
