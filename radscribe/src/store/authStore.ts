import { create } from "zustand";
import {
  apiFetch,
  setTokens,
  clearTokens,
  getAccessToken,
  setAuthFailureHandler,
  tryRefresh,
} from "@/lib/api/client";
import type { AccountType, User } from "@/types";

type Status = "loading" | "unauthenticated" | "authenticated";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  accountType: AccountType;
  organizationName?: string;
}

interface AuthState {
  status: Status;
  user: User | null;
  offline: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  loginWithGoogle: (
    idToken: string,
    opts?: { accountType?: AccountType; organizationName?: string; mfaCode?: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  setupMfa: () => Promise<{ secret: string; otpauthUri: string }>;
  confirmMfa: (code: string) => Promise<void>;
  disableMfa: (code: string) => Promise<void>;
  hydrate: () => Promise<void>;
}

interface TokenUserResponse {
  accessToken: string;
  user: User;
}

function clearLocalSessionData() {
  if (typeof window === "undefined") return;
  try {
    [
      "rs_user",
      "radscribe-local-patients",
      "radscribe-integrations",
      "rs_draft_report_id",
    ].forEach((key) => window.localStorage.removeItem(key));
    // Earlier releases cached templates, settings and activity by email. Clear
    // all RadScribe browser data at sign-out so a shared workstation cannot
    // expose one user's clinical context to the next user.
    Object.keys(window.localStorage)
      .filter((key) => /^(radscribe-|rs_draft_report_id)/.test(key))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable; credentials were still cleared from memory.
  }
}

function removeLegacySensitiveCache() {
  if (typeof window === "undefined") return;
  try {
    ["rs_user", "radscribe-local-patients", "radscribe-integrations"].forEach((key) =>
      window.localStorage.removeItem(key)
    );
  } catch {
    /* storage unavailable */
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  offline: false,

  login: async (email, password, mfaCode) => {
    // No offline/demo login: production auth requires the backend.
    const data = await apiFetch<TokenUserResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password, ...(mfaCode ? { mfaCode } : {}) },
    });
    setTokens(data.accessToken);
    removeLegacySensitiveCache();
    set({ status: "authenticated", user: data.user, offline: false });
  },

  register: async (input) => {
    const data = await apiFetch<TokenUserResponse>("/auth/register", {
      method: "POST",
      auth: false,
      body: input,
    });
    setTokens(data.accessToken);
    removeLegacySensitiveCache();
    set({ status: "authenticated", user: data.user, offline: false });
  },

  loginWithGoogle: async (idToken, opts) => {
    const data = await apiFetch<TokenUserResponse>("/auth/google", {
      method: "POST",
      auth: false,
      body: { idToken, ...opts },
    });
    setTokens(data.accessToken);
    removeLegacySensitiveCache();
    set({ status: "authenticated", user: data.user, offline: false });
  },

  logout: async () => {
    // Revoke the HttpOnly refresh cookie server-side; still clear local state
    // when the network is unavailable.
    try {
      await apiFetch("/auth/logout", { method: "POST", auth: false, body: {} });
    } catch {
      /* ignore */
    }
    clearTokens();
    clearLocalSessionData();
    set({ status: "unauthenticated", user: null, offline: false });
  },

  changePassword: async (currentPassword, newPassword) => {
    const data = await apiFetch<TokenUserResponse>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    });
    setTokens(data.accessToken);
    removeLegacySensitiveCache();
    set({ user: data.user });
  },

  setupMfa: () =>
    apiFetch<{ secret: string; otpauthUri: string }>("/auth/mfa/setup", {
      method: "POST",
      body: {},
    }),

  confirmMfa: async (code) => {
    const data = await apiFetch<TokenUserResponse>("/auth/mfa/confirm", {
      method: "POST",
      body: { code },
    });
    setTokens(data.accessToken);
    set({ user: data.user });
  },

  disableMfa: async (code) => {
    const data = await apiFetch<TokenUserResponse>("/auth/mfa/disable", {
      method: "POST",
      body: { code },
    });
    setTokens(data.accessToken);
    set({ user: data.user });
  },

  hydrate: async () => {
    // Drop a stale session and bounce to login if a request ever 401s with no
    // way to recover.
    setAuthFailureHandler(() => {
      clearTokens();
      clearLocalSessionData();
      set({ status: "unauthenticated", user: null, offline: false });
    });

    if (!getAccessToken() && !(await tryRefresh())) {
      set({ status: "unauthenticated", user: null });
      return;
    }
    try {
      const user = await apiFetch<User>("/auth/me");
      removeLegacySensitiveCache();
      set({ status: "authenticated", user, offline: false });
    } catch {
      clearTokens();
      clearLocalSessionData();
      set({ status: "unauthenticated", user: null });
    }
  },
}));
