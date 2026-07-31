"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { ApiError } from "@/lib/api/client";

// Shown when the account is flagged mustChangePassword (first login with a
// temporary password, or after an admin reset). Blocks the app until rotated.
export default function ChangePasswordView() {
  const user = useAuthStore((s) => s.user);
  const changePassword = useAuthStore((s) => s.changePassword);
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mb-3 h-11 w-full rounded-xl px-3 text-[14px] outline-none";
  const fieldStyle = { background: "var(--canvas)", color: "var(--text)" } as const;

  return (
    <div className="grid h-screen w-screen place-items-center" style={{ background: "var(--canvas)" }}>
      <form
        onSubmit={onSubmit}
        className="animate-in w-[400px] rounded-3xl p-7"
        style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <KeyRound size={24} />
          </span>
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
            Set a new password
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {user?.email} — your password must be changed before continuing.
          </p>
        </div>

        <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          Current (temporary) password
        </label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} style={fieldStyle} autoFocus />

        <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          New password
        </label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={field} style={fieldStyle} />

        <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          Confirm new password
        </label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} style={fieldStyle} />

        <p className="mb-3 text-[11px]" style={{ color: "var(--text-subtle)" }}>
          At least 10 characters, with a letter and a digit.
        </p>

        {error && (
          <div className="mb-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="h-11 w-full rounded-xl text-[14px] font-semibold text-white transition disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "Saving…" : "Change password"}
        </button>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 h-9 w-full rounded-xl text-[13px] font-medium transition hover:bg-[var(--hover)]"
          style={{ color: "var(--text-muted)" }}
        >
          Sign out
        </button>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>
          <ShieldCheck size={13} /> Changing your password signs out all other devices
        </div>
      </form>
    </div>
  );
}
