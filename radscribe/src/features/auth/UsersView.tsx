"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CircleUserRound,
  LogOut,
  ShieldCheck,
  UserPlus,
  RotateCcw,
  Trash2,
  Ban,
  CheckCircle2,
  CreditCard,
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";
import UpgradePlansModal from "@/components/billing/UpgradePlansModal";
import { useAuthStore } from "@/store/authStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { useUiStore } from "@/store/uiStore";
import { usersApi, type ManagedUser } from "@/services/users.api";
import { ApiError } from "@/lib/api/client";

export default function UsersView() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = user?.role === "ADMIN" || user?.role === "PLATFORM_ADMIN";
  const [plansOpen, setPlansOpen] = useState(false);
  const closePlans = useCallback(() => setPlansOpen(false), []);
  const initials = (user?.name || user?.email || "R")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-6xl">
        <Header title="Profile" subtitle="Manage your account, subscription, and security." />

        <div className="space-y-5 px-5 pb-10 sm:px-6">
          <section
            className="relative overflow-hidden rounded-3xl border p-5 sm:p-6"
            style={{
              background: "var(--panel)",
              borderColor: "var(--ring)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div
              className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full"
              style={{ background: "var(--accent-soft)", filter: "blur(8px)", opacity: 0.65 }}
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <span
                className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[20px] font-bold"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  boxShadow: "0 12px 30px var(--accent-soft)",
                }}
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[20px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                    {user?.name || "Radiologist"}
                  </h2>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em]"
                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  >
                    {(user?.role || "RADIOLOGIST").replace("_", " ")}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  <Mail size={14} />
                  <span className="truncate">{user?.email}</span>
                </div>
              </div>
              <button
                onClick={() => void logout()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-semibold transition hover:bg-[var(--hover)]"
                style={{ borderColor: "var(--ring)", color: "var(--text-muted)" }}
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1.55fr_.8fr]">
            <SubscriptionCard onUpgrade={() => setPlansOpen(true)} />

            <section
              className="rounded-2xl border p-5"
              style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="mb-4 flex items-center gap-2">
                <CircleUserRound size={17} style={{ color: "var(--accent)" }} />
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Account details</h2>
              </div>
              <DetailRow label="Email" value={user?.email || "—"} />
              <DetailRow label="Role" value={(user?.role || "RADIOLOGIST").replace("_", " ")} />
              <DetailRow
                label="Two-factor authentication"
                value={user?.mfaEnabled ? "Enabled" : "Not enabled"}
                positive={!!user?.mfaEnabled}
              />
              {isAdmin && (
                <Link
                  href="/admin/billing"
                  className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5 transition hover:bg-[var(--hover)]"
                  style={{ background: "var(--canvas)", color: "var(--text)" }}
                >
                  <span className="flex items-center gap-2 text-[12px] font-semibold">
                    <CreditCard size={15} style={{ color: "var(--accent)" }} />
                    Billing administration
                  </span>
                  <ArrowUpRight size={14} style={{ color: "var(--text-muted)" }} />
                </Link>
              )}
            </section>
          </div>

          <div>
            <div className="mb-3">
              <h2 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>Security</h2>
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Protect access to reports and patient information.
              </p>
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <MfaCard />
              <ChangePasswordCard />
            </div>
          </div>

          {isAdmin && (
            <div>
              <div className="mb-3">
                <h2 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>Team management</h2>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Add, secure, or deactivate organization accounts.
                </p>
              </div>
              <TeamCard selfId={user?.id} />
            </div>
          )}
        </div>
      </div>
      <UpgradePlansModal open={plansOpen} onClose={closePlans} />
    </PageContainer>
  );
}

function SubscriptionCard({ onUpgrade }: { onUpgrade: () => void }) {
  const subscription = useSubscriptionStore((state) => state.subscription);
  const loading = useSubscriptionStore((state) => state.loading);
  const load = useSubscriptionStore((state) => state.load);

  useEffect(() => {
    if (!subscription && !loading) void load();
  }, [subscription, loading, load]);

  if (!subscription) {
    return (
      <section
        className="flex min-h-[260px] items-center justify-center rounded-2xl border"
        style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}
      >
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {loading ? "Loading subscription…" : "Subscription information is unavailable"}
        </span>
      </section>
    );
  }

  const { plan, usage } = subscription;
  const percentage = usage.limit
    ? Math.min(100, Math.round((usage.used / usage.limit) * 100))
    : 0;
  const resetDate = usage.periodEnd
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
        new Date(usage.periodEnd)
      )
    : "No reset date";
  const cycle =
    subscription.billingCycle === "NONE"
      ? "Included"
      : subscription.billingCycle === "YEARLY"
        ? "Yearly"
        : "Monthly";

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="grid h-8 w-8 place-items-center rounded-xl"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <Sparkles size={16} />
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[.08em]" style={{ color: "var(--text-subtle)" }}>
                Subscription & billing
              </div>
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>{plan.name}</h2>
                <span
                  className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.08em]"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {subscription.status}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 max-w-lg text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Your plan controls the monthly number of reports that can use AI dictation and structuring.
          </p>
        </div>
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white transition hover:brightness-110"
          style={{ background: "var(--accent)", boxShadow: "0 8px 24px var(--accent-soft)" }}
        >
          <Sparkles size={14} />
          {plan.code === "FREE" ? "Upgrade" : "View plans"}
        </button>
      </div>

      <div className="border-t px-5 py-4" style={{ background: "var(--canvas)", borderColor: "var(--ring)" }}>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Monthly report usage</div>
            <div className="mt-0.5 text-[20px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {usage.remaining.toLocaleString()} remaining
            </div>
          </div>
          <div className="text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
            {usage.used.toLocaleString()} of {usage.limit.toLocaleString()} used
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--ring)" }}>
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${percentage}%`,
              background: percentage >= 90 ? "var(--abnormal)" : "var(--accent)",
            }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat icon={BadgeCheck} label="Plan status" value={subscription.status.toLowerCase()} />
          <MiniStat icon={CreditCard} label="Billing cycle" value={cycle} />
          <MiniStat icon={CalendarDays} label="Allowance resets" value={resetDate} wide />
        </div>
        {subscription.pendingPlan && (
          <div className="mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            Change to {subscription.pendingPlan} scheduled for the end of this period.
          </div>
        )}
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0" style={{ borderColor: "var(--ring)" }}>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className="truncate text-right text-[12px] font-semibold"
        style={{ color: positive ? "var(--accent)" : "var(--text)" }}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  wide = false,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 rounded-xl p-3 sm:col-span-1" : "rounded-xl p-3"} style={{ background: "var(--panel)" }}>
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-subtle)" }}>
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 truncate text-[12px] font-semibold capitalize" style={{ color: "var(--text)" }}>{value}</div>
    </div>
  );
}

// ---- self-service password change --------------------------------------------

function MfaCard() {
  const enabled = useAuthStore((state) => !!state.user?.mfaEnabled);
  const setupMfa = useAuthStore((state) => state.setupMfa);
  const confirmMfa = useAuthStore((state) => state.confirmMfa);
  const disableMfa = useAuthStore((state) => state.disableMfa);
  const notify = useUiStore((state) => state.notify);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const result = await setupMfa();
      setSecret(result.secret);
      notify("Add the key to your authenticator, then confirm a code");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not start MFA setup");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await disableMfa(code);
        notify("Multi-factor authentication disabled");
      } else {
        await confirmMfa(code);
        setSecret("");
        notify("Multi-factor authentication enabled");
      }
      setCode("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update MFA");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: enabled ? "var(--accent-soft)" : "var(--canvas)", color: enabled ? "var(--accent)" : "var(--text-muted)" }}
          >
            <ShieldCheck size={17} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                Two-factor authentication
              </h2>
              {enabled && (
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  On
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {enabled
              ? "Enabled. A six-digit code is required at sign-in."
              : "Add an authenticator code to protect clinical access."}
            </p>
          </div>
        </div>
        {!enabled && !secret && (
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            className="shrink-0 rounded-xl px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Enable
          </button>
        )}
      </div>
      {(enabled || secret) && (
        <div className="mt-4 space-y-3">
          {secret && (
            <div className="rounded-xl p-3" style={{ background: "var(--canvas)" }}>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Enter this key in Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app:
              </div>
              <code className="mt-1 block break-all text-[13px]" style={{ color: "var(--text)" }}>
                {secret}
              </code>
            </div>
          )}
          <div className="flex gap-2">
            <input
              aria-label="Six-digit authentication code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-10 min-w-0 flex-1 rounded-xl px-3 text-[13px] outline-none"
              style={{ background: "var(--canvas)", color: "var(--text)" }}
              placeholder="000000"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || code.length !== 6}
              className="rounded-xl px-4 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: enabled ? "var(--abnormal)" : "var(--accent)" }}
            >
              {enabled ? "Disable" : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ChangePasswordCard() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const notify = useUiStore((s) => s.notify);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setExpanded(false);
      notify("Password changed — other devices were signed out");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border p-5"
      style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: "var(--canvas)", color: "var(--text-muted)" }}
        >
          <LockKeyhole size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Password</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Use at least 10 characters with a letter and a number.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setExpanded((value) => !value);
            setError(null);
          }}
          className="shrink-0 rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition hover:bg-[var(--hover)]"
          style={{ borderColor: "var(--ring)", color: "var(--text)" }}
        >
          {expanded ? "Cancel" : "Change"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--ring)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                className={`${inputCls} w-full`}
                style={inputStyle}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                className={`${inputCls} w-full`}
                style={inputStyle}
              />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
              Other signed-in devices will be logged out.
            </span>
            <button
              type="submit"
              disabled={busy || !current || !next}
              className="h-9 shrink-0 rounded-xl px-4 text-[12px] font-semibold text-white transition disabled:opacity-60"
              style={{ background: "var(--accent)" }}
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
          {error && (
            <div className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}>
              {error}
            </div>
          )}
        </div>
      )}
    </form>
  );
}

// ---- admin: team management ---------------------------------------------------

function TeamCard({ selfId }: { selfId?: string }) {
  const notify = useUiStore((s) => s.notify);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUsers(await usersApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load users (backend offline?)");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : "Action failed");
    }
  };

  return (
    <div className="rounded-2xl border p-5" style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}>
      <div className="flex items-center">
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Team</h3>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Radiologist accounts. New users must change their temporary password on first login.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-white"
          style={{ background: "var(--accent)" }}
        >
          <UserPlus size={15} /> Add user
        </button>
      </div>

      {showCreate && (
        <CreateUserForm
          onDone={() => {
            setShowCreate(false);
            void refresh();
          }}
        />
      )}

      {error && (
        <div className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}>
          {error}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {users?.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--canvas)" }}>
            <CircleUserRound size={18} style={{ color: "var(--text-muted)" }} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                {u.name || u.email}
                {u.id === selfId && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>(you)</span>}
              </div>
              <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{u.email}</div>
            </div>
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {u.role}
            </span>
            {!u.active && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}>
                Deactivated
              </span>
            )}
            {u.mustChangePassword && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--canvas)", color: "var(--text-subtle)", border: "1px solid var(--ring)" }}>
                Pending first login
              </span>
            )}

            {u.id !== selfId && (
              <div className="ml-auto flex items-center gap-1">
                <IconBtn
                  title={u.active ? "Deactivate" : "Reactivate"}
                  onClick={() =>
                    act(() => usersApi.update(u.id, { active: !u.active }), u.active ? "User deactivated" : "User reactivated")
                  }
                >
                  {u.active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                </IconBtn>
                <IconBtn
                  title="Reset password"
                  onClick={() => {
                    const pw = window.prompt(`Temporary password for ${u.email} (min 10 chars, letter + digit):`);
                    if (pw) void act(() => usersApi.update(u.id, { password: pw }), "Password reset — user must change it on next login");
                  }}
                >
                  <RotateCcw size={14} />
                </IconBtn>
                <IconBtn
                  title="Delete"
                  danger
                  onClick={() => {
                    if (window.confirm(`Delete ${u.email}? Their reports and templates are removed.`))
                      void act(() => usersApi.remove(u.id), "User deleted");
                  }}
                >
                  <Trash2 size={14} />
                </IconBtn>
              </div>
            )}
          </div>
        ))}
        {users && users.length === 0 && (
          <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>No users yet.</p>
        )}
      </div>
    </div>
  );
}

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const notify = useUiStore((s) => s.notify);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"RADIOLOGIST" | "ADMIN">("RADIOLOGIST");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await usersApi.create({ email, name, role, password });
      notify(`Created ${email}`);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 rounded-xl p-4" style={{ background: "var(--canvas)" }}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Email">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} style={{ ...inputStyle, background: "var(--panel)" }} />
        </Field>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={{ ...inputStyle, background: "var(--panel)" }} />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as "RADIOLOGIST" | "ADMIN")} className={inputCls} style={{ ...inputStyle, background: "var(--panel)" }}>
            <option value="RADIOLOGIST">Radiologist</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label="Temporary password">
          <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} style={{ ...inputStyle, background: "var(--panel)" }} />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-xl px-4 text-[13px] font-semibold text-white transition disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}>
          {error}
        </div>
      )}
    </form>
  );
}

// ---- shared bits ---------------------------------------------------------------

const inputCls = "h-10 min-w-[180px] rounded-xl px-3 text-[13px] outline-none";
const inputStyle = { background: "var(--canvas)", color: "var(--text)" } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function IconBtn({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg transition hover:bg-[var(--hover)]"
      style={{ color: danger ? "var(--abnormal)" : "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}
