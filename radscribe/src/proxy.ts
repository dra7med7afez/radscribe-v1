import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  let apiOrigin = "";
  try {
    const configuredApi = process.env.NEXT_PUBLIC_API_URL;
    if (configuredApi) {
      const parsed = new URL(configuredApi);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        apiOrigin = parsed.origin;
      }
    }
  } catch {
    // An invalid API URL will be reported by the API client; do not weaken CSP.
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://accounts.google.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://accounts.google.com${apiOrigin ? ` ${apiOrigin}` : ""}`,
    "frame-src https://accounts.google.com",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
