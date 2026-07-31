"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Building2, ShieldCheck, UserRound } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { ApiError, NetworkError } from "@/lib/api/client";
import type { AccountType } from "@/types";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GSI_SRC = "https://accounts.google.com/gsi/client";

// mirrors the backend PASSWORD_POLICY so users get instant feedback
const PASSWORD_POLICY = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

type Mode = "signin" | "signup";

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (res: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const inputClass = "mb-3 h-11 w-full rounded-xl px-3 text-[14px] outline-none";
const inputStyle = { background: "var(--canvas)", color: "var(--text)" } as const;
const labelClass = "mb-1 block text-[12px] font-medium";
const labelStyle = { color: "var(--text-muted)" } as const;

export default function LoginView() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const [mode, setMode] = useState<Mode>("signin");
  const [accountType, setAccountType] = useState<AccountType>("INDIVIDUAL");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The GIS callback is registered once, so it reads the latest signup
  // selections through a ref instead of stale closure state.
  const signupRef = useRef({ mode, accountType, organizationName });
  signupRef.current = { mode, accountType, organizationName };

  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);

  const onGoogleCredential = useCallback(
    async (res: GoogleCredentialResponse) => {
      setError(null);
      setBusy(true);
      try {
        const { mode, accountType, organizationName } = signupRef.current;
        // account type only matters the first time this Google identity
        // signs in; the backend ignores it for existing accounts
        await loginWithGoogle(
          res.credential,
          mode === "signup"
            ? {
                accountType,
                organizationName:
                  accountType === "ORGANIZATION" ? organizationName.trim() : undefined,
                mfaCode: mfaCode || undefined,
              }
            : { mfaCode: mfaCode || undefined }
        );
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Google sign-in failed");
      } finally {
        setBusy(false);
      }
    },
    [loginWithGoogle, mfaCode]
  );
  const onGoogleCredentialRef = useRef(onGoogleCredential);
  onGoogleCredentialRef.current = onGoogleCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    const init = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (res) => void onGoogleCredentialRef.current(res),
      });
      setGoogleReady(true);
    };
    if (window.google) {
      init();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", init, { once: true });
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    return () => script.removeEventListener("load", init);
  }, []);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current) return;
    googleButtonRef.current.innerHTML = "";
    window.google?.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      width: 324,
      text: mode === "signup" ? "signup_with" : "signin_with",
    });
  }, [googleReady, mode]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (!name.trim()) return setError("Please enter your name");
      if (accountType === "ORGANIZATION" && organizationName.trim().length < 2)
        return setError("Please enter your organization's name");
      if (!PASSWORD_POLICY.test(password))
        return setError("Password must be at least 10 characters and contain a letter and a digit");
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        await login(email, password, mfaCode || undefined);
      } else {
        await register({
          email,
          password,
          name: name.trim(),
          accountType,
          organizationName:
            accountType === "ORGANIZATION" ? organizationName.trim() : undefined,
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof NetworkError
          ? err.message
          : mode === "signin"
            ? "Sign-in failed"
            : "Sign-up failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const accountTypes: { value: AccountType; label: string; hint: string; icon: React.ReactNode }[] = [
    {
      value: "INDIVIDUAL",
      label: "Individual radiologist",
      hint: "Personal reporting workspace",
      icon: <UserRound size={18} />,
    },
    {
      value: "ORGANIZATION",
      label: "Organization",
      hint: "Clinic, hospital or imaging center",
      icon: <Building2 size={18} />,
    },
  ];

  return (
    <div className="grid h-screen w-screen place-items-center overflow-y-auto" style={{ background: "var(--canvas)" }}>
      <form
        onSubmit={onSubmit}
        className="animate-in my-6 w-[380px] rounded-3xl p-7"
        style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="mb-5 flex flex-col items-center gap-2">
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <AudioLines size={24} />
          </span>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            RadScribe
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Voice-driven radiology reporting
          </p>
        </div>

        {/* sign in / create account toggle */}
        <div
          className="mb-5 grid grid-cols-2 gap-1 rounded-xl p-1"
          style={{ background: "var(--canvas)" }}
        >
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="h-9 rounded-lg text-[13px] font-medium transition"
              style={
                mode === m
                  ? { background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-card)" }
                  : { background: "transparent", color: "var(--text-muted)" }
              }
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {mode === "signup" && (
          <>
            <fieldset>
            <legend className={labelClass} style={labelStyle}>
              Account type
            </legend>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {accountTypes.map((t) => {
                const selected = accountType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setAccountType(t.value)}
                    className="flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition"
                    style={{
                      background: selected ? "var(--accent-soft)" : "var(--canvas)",
                      borderColor: selected ? "var(--accent)" : "transparent",
                      color: selected ? "var(--accent)" : "var(--text-muted)",
                    }}
                    aria-pressed={selected}
                  >
                    {t.icon}
                    <span className="text-[12px] font-semibold leading-tight" style={{ color: selected ? "var(--accent)" : "var(--text)" }}>
                      {t.label}
                    </span>
                    <span className="text-[10.5px] leading-tight">{t.hint}</span>
                  </button>
                );
              })}
            </div>
            </fieldset>

            {accountType === "ORGANIZATION" && (
              <>
                <label htmlFor="organization-name" className={labelClass} style={labelStyle}>
                  Organization name
                </label>
                <input
                  id="organization-name"
                  name="organizationName"
                  type="text"
                  autoComplete="organization"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="e.g. Nile Imaging Center"
                  className={inputClass}
                  style={inputStyle}
                />
              </>
            )}

            <label htmlFor="full-name" className={labelClass} style={labelStyle}>
              {accountType === "ORGANIZATION" ? "Contact name" : "Full name"}
            </label>
            <input
              id="full-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </>
        )}

        <label htmlFor="email" className={labelClass} style={labelStyle}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          style={inputStyle}
        />
        {mode === "signin" && (
          <>
            <label htmlFor="mfa-code" className={labelClass} style={labelStyle}>
              Authentication code (if enabled)
            </label>
            <input
              id="mfa-code"
              name="mfaCode"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mb-1 h-11 w-full rounded-xl px-3 text-[14px] outline-none"
              style={inputStyle}
            />
          </>
        )}
        <label htmlFor="password" className={labelClass} style={labelStyle}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-1 h-11 w-full rounded-xl px-3 text-[14px] outline-none"
          style={inputStyle}
        />
        <p className="mb-4 text-[11px]" style={{ color: "var(--text-subtle)" }}>
          {mode === "signup" ? "At least 10 characters with a letter and a digit" : " "}
        </p>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg px-3 py-2 text-[12px]"
            style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl text-[14px] font-semibold text-white transition disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {busy
            ? mode === "signin"
              ? "Signing in…"
              : "Creating account…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>

        {GOOGLE_CLIENT_ID && (
          <>
            <div className="my-4 flex items-center gap-3">
              <span className="h-px flex-1" style={{ background: "var(--canvas)" }} />
              <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
                or
              </span>
              <span className="h-px flex-1" style={{ background: "var(--canvas)" }} />
            </div>
            <div ref={googleButtonRef} className="flex justify-center" />
          </>
        )}

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
          <ShieldCheck size={13} /> HttpOnly session cookie · access token kept in memory
        </div>
      </form>
    </div>
  );
}
