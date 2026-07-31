// ============================================================
// API client — short-lived access token in memory plus an HttpOnly refresh
// cookie. Never persist credentials in browser storage.
// ============================================================

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const LEGACY_ACCESS_KEY = "rs_access";
const LEGACY_REFRESH_KEY = "rs_refresh";
let accessToken: string | null = null;

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = typeof details?.code === "string" ? details.code : undefined;
    this.details = details;
  }
}

// Distinguishes "backend not running" from a real HTTP error so callers
// can decide whether to fall back to local behaviour.
export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}
export function setTokens(access: string) {
  accessToken = access;
}
export function clearTokens() {
  accessToken = null;
  if (typeof window !== "undefined") {
    // Clean up credentials written by previous releases; do not write them.
    window.localStorage.removeItem(LEGACY_ACCESS_KEY);
    window.localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
}

interface FetchOpts extends Omit<RequestInit, "body"> {
  auth?: boolean;
  body?: unknown;
}

async function rawFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { auth = true, body, headers, ...rest } = opts;
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };
  if (auth) {
    const t = getAccessToken();
    if (t) h["Authorization"] = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError(`Cannot reach API at ${API_URL}`);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    const details =
      data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : undefined;
    const rawMessage = details?.message ?? details?.error;
    const msg = rawMessage || res.statusText || "Request failed";
    throw new ApiError(
      Array.isArray(msg) ? msg.join(", ") : String(msg),
      res.status,
      details
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

let refreshing: Promise<boolean> | null = null;

export async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await rawFetch<{ accessToken: string }>(
        "/auth/refresh",
        { method: "POST", auth: false, body: {} }
      );
      setTokens(data.accessToken);
      return true;
    } catch (err) {
      if (err instanceof NetworkError) return false;
      clearTokens();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Notified when an authenticated request hits an unrecoverable 401 (no token or
// refresh failed) — the auth store uses this to drop a stale session and show
// the login screen instead of leaving the user stuck on "unauthorized".
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(fn: (() => void) | null) {
  onAuthFailure = fn;
}

// Is the backend reachable at all? (any HTTP response = reachable; only a
// NetworkError means it's down). Used to decide whether a local demo session is
// still valid.
export async function backendReachable(): Promise<boolean> {
  try {
    await rawFetch("/auth/me", { auth: false });
    return true;
  } catch (err) {
    return !(err instanceof NetworkError);
  }
}

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  try {
    return await rawFetch<T>(path, opts);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && opts.auth !== false) {
      const ok = await tryRefresh();
      if (ok) return rawFetch<T>(path, opts);
      onAuthFailure?.(); // unrecoverable → drop session, force re-login
    }
    throw err;
  }
}
