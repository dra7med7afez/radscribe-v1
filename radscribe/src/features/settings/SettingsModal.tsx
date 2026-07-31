"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Type,
  List,
  PenLine,
  Mic,
  Palette,
  CircleUserRound,
  CreditCard,
  Search,
  Moon,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { useReportStore } from "@/store/reportStore";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { BULLET_SHAPES } from "@/lib/bullets";
import { cn } from "@/lib/utils";
import type { DictationMode, BulletShape } from "@/types";
import UsageCard from "@/components/billing/UsageCard";

const FONTS = ["Georgia", "Times New Roman", "Calibri", "Arial", "Helvetica", "System"];
const SIZES = [12, 13, 14, 15, 16, 18, 20];
const MODES: DictationMode[] = ["verbatim", "concise"];
const STRUCTURING_INSTRUCTIONS_MAX = 2_000;

// ---- settings categories (the left sidebar) --------------------------------
type CatId = "formatting" | "bullets" | "signature" | "dictation" | "appearance" | "billing" | "account";

interface Cat {
  id: CatId;
  label: string;
  icon: LucideIcon;
  group: string;
  desc: string;
}

const CATEGORIES: Cat[] = [
  { id: "formatting", label: "Formatting", icon: Type, group: "Report", desc: "Typography and layout of the report body." },
  { id: "bullets", label: "Bullets & lists", icon: List, group: "Report", desc: "Markers used for organs, findings and parameters." },
  { id: "signature", label: "Signature", icon: PenLine, group: "Report", desc: "Your sign-off at the end of the extracted report." },
  { id: "dictation", label: "Dictation", icon: Mic, group: "Preferences", desc: "How dictated speech is structured into the report." },
  { id: "appearance", label: "Appearance", icon: Palette, group: "Preferences", desc: "Theme and visual preferences for the app." },
  { id: "billing", label: "Billing & usage", icon: CreditCard, group: "Account", desc: "Your plan, report allowance and reset date." },
  { id: "account", label: "Account", icon: CircleUserRound, group: "Preferences", desc: "Your profile, security and team." },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[14px] font-medium" style={{ color: "var(--text)" }}>{label}</div>
        {hint && <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{hint}</div>}
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative h-6 w-11 rounded-full transition" style={{ background: on ? "var(--accent)" : "var(--ring)" }} aria-pressed={on}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} />
    </button>
  );
}

const selectCls = "h-9 rounded-lg px-2 text-[13px] outline-none cursor-pointer";
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border divide-y" style={{ borderColor: "var(--ring)", background: "var(--panel)" }}>
      {children}
    </div>
  );
}

// Friendly label for a KeyboardEvent.key stored as a push-to-talk trigger.
function keyLabel(k: string): string {
  if (k === " ") return "Space";
  if (k === "Control") return "Ctrl";
  if (k === "Meta") return "⌘ / Win";
  if (k === "Escape") return "Esc";
  if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") return k.replace("Arrow", "");
  return k.length === 1 ? k.toUpperCase() : k;
}

// Push-to-talk trigger manager. The keyboard (Ctrl) and an external physical
// button that emulates a keyboard key are both just keys here — press one while
// capturing to bind it. HOLD any bound trigger to dictate.
function PttBindings() {
  const bindings = useUiStore((s) => s.pttBindings);
  const addPttBinding = useUiStore((s) => s.addPttBinding);
  const removePttBinding = useUiStore((s) => s.removePttBinding);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    // Capture phase + stopPropagation so Escape cancels the bind here instead of
    // closing the whole Settings modal.
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCapturing(false);
      if (e.key === "Escape") return;
      addPttBinding(e.key);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true } as EventListenerOptions);
  }, [capturing, addPttBinding]);

  return (
    <div className="px-4 py-4">
      <div className="text-[14px] font-medium" style={{ color: "var(--text)" }}>Push-to-talk triggers</div>
      <div className="mb-3 mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Hold any trigger to dictate; release to transcribe. Add your foot pedal or clicker by pressing it while binding.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bindings.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 rounded-lg py-1 pl-2.5 pr-1.5 text-[12.5px] font-medium"
            style={{ background: "var(--canvas)", color: "var(--text)" }}
          >
            {keyLabel(k)}
            <button
              onClick={() => removePttBinding(k)}
              aria-label={`Remove ${keyLabel(k)} trigger`}
              className="grid h-5 w-5 place-items-center rounded-md transition hover:bg-[var(--hover)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        {bindings.length === 0 && (
          <span className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>No triggers — add one to dictate by hold.</span>
        )}
        <button
          onClick={() => setCapturing((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1 text-[12.5px] font-medium transition"
          style={
            capturing
              ? { borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" }
              : { borderColor: "var(--ring)", color: "var(--text-muted)" }
          }
        >
          {capturing ? "Press a key or your button…" : "+ Add trigger"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const settings = useReportStore((s) => s.settings);
  const patchSettings = useReportStore((s) => s.patchSettings);
  const hydrateSettings = useReportStore((s) => s.hydrateSettings);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const user = useAuthStore((s) => s.user);

  const [active, setActive] = useState<CatId>("formatting");
  const [q, setQ] = useState("");

  // load settings once the modal opens, and close on Escape
  useEffect(() => {
    if (!open) return;
    hydrateSettings();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hydrateSettings, close]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query ? CATEGORIES.filter((c) => c.label.toLowerCase().includes(query)) : CATEGORIES;
    const byGroup = new Map<string, Cat[]>();
    for (const c of list) {
      if (!byGroup.has(c.group)) byGroup.set(c.group, []);
      byGroup.get(c.group)!.push(c);
    }
    return Array.from(byGroup.entries());
  }, [q]);

  if (!open) return null;

  const activeCat = CATEGORIES.find((c) => c.id === active)!;
  const selBg = { background: "var(--canvas)", color: "var(--text)" } as const;

  const sel = (v: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) => (
    <select value={v} onChange={(e) => onChange(e.target.value)} className={selectCls} style={selBg}>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    // backdrop — click outside the window closes it
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,.45)" }} onClick={close}>
      <div
        className="animate-in flex w-full max-w-4xl overflow-hidden rounded-2xl border"
        style={{ height: "min(660px, 86vh)", background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ---- sidebar (separated from content by the border-r line) ---- */}
        <aside className="flex w-60 shrink-0 flex-col border-r" style={{ borderColor: "var(--ring)", background: "var(--panel-2)" }}>
          <div className="px-4 pt-5 pb-3">
            <h1 className="mb-3 text-[15px] font-semibold" style={{ color: "var(--text)" }}>Settings</h1>
            <div className="flex h-9 items-center gap-2 rounded-lg px-2.5" style={{ background: "var(--panel)", boxShadow: "var(--shadow-float)" }}>
              <Search size={14} style={{ color: "var(--text-subtle)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-[12.5px] outline-none" style={{ color: "var(--text)" }} />
            </div>
          </div>

          <nav className="flex-1 overflow-auto px-2 pb-4">
            {groups.map(([group, items]) => (
              <div key={group} className="mb-1">
                <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{group}</div>
                {items.map((c) => {
                  const Icon = c.icon;
                  const isActive = c.id === active;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActive(c.id)}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition", !isActive && "hover:bg-[var(--hover)]")}
                      style={isActive ? { background: "var(--active)", color: "var(--text)", fontWeight: 600 } : { color: "var(--text-muted)" }}
                    >
                      <Icon size={16} className="shrink-0" style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--text-subtle)" }}>No matches</div>
            )}
          </nav>
        </aside>

        {/* ---- content ---- */}
        <div className="relative flex-1 overflow-auto">
          <button
            onClick={close}
            aria-label="Close settings"
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg transition hover:bg-[var(--hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={18} />
          </button>

          <div className="px-8 py-7">
            <div className="text-[12px]" style={{ color: "var(--text-subtle)" }}>{activeCat.group}</div>
            <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>{activeCat.label}</h2>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>{activeCat.desc}</p>

            <div className="mt-6">
              {active === "formatting" && (
                <Card>
                  <Row label="Font family" hint="Applies to the whole report body">
                    {sel(settings.fontFamily, (v) => patchSettings({ fontFamily: v }), FONTS.map((f) => ({ value: f, label: f })))}
                  </Row>
                  <Row label="Font size">
                    {sel(String(settings.fontSize), (v) => patchSettings({ fontSize: Number(v) }), SIZES.map((s) => ({ value: String(s), label: `${s}px` })))}
                  </Row>
                  <Row label="Line spacing">
                    {sel(String(settings.lineSpacing), (v) => patchSettings({ lineSpacing: Number(v) }), [1.3, 1.4, 1.5, 1.6, 1.8, 2].map((s) => ({ value: String(s), label: String(s) })))}
                  </Row>
                  <Row label="Section separators" hint="Show the thin divider under the report header">
                    <Toggle on={settings.showSeparators} onClick={() => patchSettings({ showSeparators: !settings.showSeparators })} />
                  </Row>
                  <Row label="Italic by default" hint="Report body renders italic; new/dictated text starts italic">
                    <Toggle on={settings.defaultItalic} onClick={() => patchSettings({ defaultItalic: !settings.defaultItalic })} />
                  </Row>
                </Card>
              )}

              {active === "bullets" && (
                <Card>
                  <Row label="Organ bullet" hint="Marker before each organ heading">
                    {sel(settings.organBullet, (v) => patchSettings({ organBullet: v as BulletShape, listPreset: undefined }), BULLET_SHAPES.map((b) => ({ value: b.key, label: `${b.glyph}  ${b.label}` })))}
                  </Row>
                  <Row label="Finding bullet" hint="Marker before each finding">
                    {sel(settings.findingBullet, (v) => patchSettings({ findingBullet: v as BulletShape, listPreset: undefined }), BULLET_SHAPES.map((b) => ({ value: b.key, label: `${b.glyph}  ${b.label}` })))}
                  </Row>
                  <Row label="Parameter bullet" hint="Marker before each subpoint / parameter">
                    {sel(settings.subpointBullet, (v) => patchSettings({ subpointBullet: v as BulletShape, listPreset: undefined }), BULLET_SHAPES.map((b) => ({ value: b.key, label: `${b.glyph}  ${b.label}` })))}
                  </Row>
                </Card>
              )}

              {active === "signature" && (
                <Card>
                  <div className="px-4 py-4">
                    <div className="text-[14px] font-medium" style={{ color: "var(--text)" }}>Signature</div>
                    <div className="mb-3 mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>Appears bold at the end of the extracted report.</div>
                    <textarea
                      value={settings.signature || ""}
                      onChange={(e) => patchSettings({ signature: e.target.value })}
                      placeholder={"Dr. Name Surname, MD\nConsultant Radiologist"}
                      rows={3}
                      className="w-full resize-none rounded-lg px-3 py-2.5 text-[13px] font-semibold outline-none"
                      style={{ background: "var(--canvas)", color: "var(--text)" }}
                    />
                  </div>
                </Card>
              )}

              {active === "dictation" && (
                <Card>
                  <Row label="Default structuring mode" hint="Verbatim keeps your words; Concise uses standard phrasing">
                    {sel(settings.defaultMode, (v) => patchSettings({ defaultMode: v as DictationMode }), MODES.map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) })))}
                  </Row>
                  <div className="px-4 py-4">
                    <label
                      htmlFor="text-structuring-instructions"
                      className="text-[14px] font-medium"
                      style={{ color: "var(--text)" }}
                    >
                      Text structuring instructions
                    </label>
                    <div className="mb-3 mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Describe how generated report text should look. This affects structuring only, not transcription or other AI tools.
                    </div>
                    <textarea
                      id="text-structuring-instructions"
                      value={settings.structuringInstructions || ""}
                      onChange={(e) => patchSettings({ structuringInstructions: e.target.value })}
                      placeholder="Example: Use short complete sentences. Put measurements after the finding and avoid unnecessary adjectives."
                      maxLength={STRUCTURING_INSTRUCTIONS_MAX}
                      rows={5}
                      className="w-full resize-y rounded-lg px-3 py-2.5 text-[13px] leading-relaxed outline-none"
                      style={{ background: "var(--canvas)", color: "var(--text)" }}
                    />
                    <div className="mt-1 text-right text-[11px]" style={{ color: "var(--text-subtle)" }}>
                      {(settings.structuringInstructions || "").length}/{STRUCTURING_INSTRUCTIONS_MAX}
                    </div>
                  </div>
                  <PttBindings />
                </Card>
              )}

              {active === "appearance" && (
                <Card>
                  <Row label="Theme" hint="Light or dark appearance">
                    <div className="flex rounded-lg p-0.5" style={{ background: "var(--canvas)" }}>
                      {(["light", "dark"] as const).map((t) => {
                        const on = theme === t;
                        return (
                          <button
                            key={t}
                            onClick={() => { if (!on) toggleTheme(); }}
                            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition"
                            style={on ? { background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-float)" } : { color: "var(--text-muted)" }}
                          >
                            {t === "light" ? <Sun size={14} /> : <Moon size={14} />}
                            {t[0].toUpperCase() + t.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  </Row>
                </Card>
              )}

              {active === "billing" && (
                <div className="space-y-3">
                  <UsageCard />
                  <Link href="/pricing" onClick={close} className="inline-flex rounded-lg px-3 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--accent)" }}>
                    View plans
                  </Link>
                </div>
              )}

              {active === "account" && (
                <Card>
                  <Row label={user?.name || "Account"} hint={user?.email || undefined}>
                    {user?.role && (
                      <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{user.role}</span>
                    )}
                  </Row>
                  <Row label="Manage account" hint="Profile, password and team management">
                    <Link href="/users" onClick={close} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition hover:bg-[var(--hover)]" style={{ color: "var(--accent)" }}>
                      <CircleUserRound size={15} /> Open
                    </Link>
                  </Row>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
