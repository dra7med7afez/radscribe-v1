"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  Globe,
  Star,
  ChevronLeft,
  ChevronRight,
  Brain,
  Bone,
  Activity,
  ScanLine,
  HeartPulse,
  Zap,
  LayoutTemplate,
  type LucideIcon,
} from "lucide-react";
import { useReportStore } from "@/store/reportStore";
import { useUiStore } from "@/store/uiStore";
import { timeAgo, cn } from "@/lib/utils";
import type { Template } from "@/types";
import PageContainer from "@/components/layout/PageContainer";

const PER_PAGE = 10;

// ---- modality identity (colored icon badge) --------------------------------
function modalityColor(m: string): string {
  const key = m.toUpperCase();
  const explicit: Record<string, string> = {
    CT: "#3b82f6",
    MRI: "#8b5cf6",
    MR: "#8b5cf6",
    US: "#10b981",
    PET: "#f97316",
    "PET/CT": "#f97316",
    MG: "#ec4899",
    NM: "#14b8a6",
    DEXA: "#6366f1",
    XR: "#0ea5e9",
    "X-RAY": "#0ea5e9",
    FLUOROSCOPY: "#84cc16",
  };
  if (explicit[key]) return explicit[key];
  const palette = ["#3b82f6", "#8b5cf6", "#10b981", "#f97316", "#ec4899", "#14b8a6", "#6366f1", "#0ea5e9", "#84cc16", "#f59e0b"];
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function modalityIcon(m: string): LucideIcon {
  const s = m.toLowerCase();
  if (s.includes("mr")) return Brain;
  if (s.includes("us") || s.includes("ultra") || s.includes("doppler")) return Activity;
  if (s.includes("mg") || s.includes("mammo")) return HeartPulse;
  if (s.includes("dexa") || s.includes("bone")) return Bone;
  if (s.includes("fluoro")) return Zap;
  if (s.includes("ct") || s.includes("pet") || s.includes("x")) return ScanLine;
  return LayoutTemplate;
}

// ---- counts ----------------------------------------------------------------
function countFindings(t: Template): number {
  return t.sections
    .filter((s) => s.kind === "findings")
    .reduce((n, s) => n + (s.findings?.length || 0), 0);
}
function countImpressions(t: Template): number {
  return t.sections.filter(
    (s) => s.isConclusion || /impression|conclusion|opinion/i.test(s.name)
  ).length;
}

const FAV_KEY = "radscribe-fav-templates";
function loadFavs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(FAV_KEY) || "[]");
  } catch {
    return [];
  }
}

// ---- stat chip ---------------------------------------------------------------
function StatChip({ label }: { label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
      style={{ background: "var(--panel-2)", color: "var(--text-muted)" }}
    >
      {label}
    </span>
  );
}

// ---- footer action button ------------------------------------------------------
function ActionBtn({
  onClick,
  label,
  icon: Icon,
  tone = "default",
}: {
  onClick: () => void;
  label: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition",
        tone === "primary" ? "text-white" : "border hover:bg-[var(--hover)]"
      )}
      style={
        tone === "primary"
          ? { background: "var(--accent-2)", color: "var(--page)" }
          : {
              borderColor: "var(--ring)",
              color: tone === "danger" ? "var(--abnormal)" : "var(--text)",
            }
      }
    >
      <Icon size={13} /> {label}
    </button>
  );
}

export default function TemplatesPage() {
  const router = useRouter();
  const templates = useReportStore((s) => s.templates);
  const selectedId = useReportStore((s) => s.selectedTemplateId);
  const removeTemplate = useReportStore((s) => s.removeTemplate);
  const loadTemplate = useReportStore((s) => s.loadTemplate);
  const hydrateTemplates = useReportStore((s) => s.hydrateTemplates);
  const notify = useUiStore((s) => s.notify);

  useEffect(() => {
    void hydrateTemplates();
  }, [hydrateTemplates]);

  const [favs, setFavs] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  useEffect(() => setFavs(loadFavs()), []);
  const toggleFav = (id: string) =>
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });

  // favorites float to the top, then newest first
  const sorted = [...templates].sort((a, b) => {
    const fa = favs.includes(a.id) ? 1 : 0;
    const fb = favs.includes(b.id) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return tb - ta;
  });

  // ---- pagination (10 per page, clamped when the list shrinks) ----
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const pageItems = sorted.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const from = sorted.length === 0 ? 0 : (current - 1) * PER_PAGE + 1;
  const to = Math.min(current * PER_PAGE, sorted.length);

  const onLoad = (t: Template) => {
    loadTemplate(t.id);
    notify(`Loaded “${t.name}”`);
    router.push("/");
  };

  const onDelete = (t: Template) => {
    const loaded = t.id === selectedId;
    const msg = loaded
      ? `“${t.name}” is loaded in the active report. Delete anyway?`
      : `Delete “${t.name}”?`;
    if (window.confirm(msg)) {
      void removeTemplate(t.id);
      notify("Template deleted");
    }
  };

  const pageBtn =
    "grid h-8 w-8 place-items-center rounded-lg text-[12.5px] font-medium transition disabled:opacity-35";

  return (
    <PageContainer>
      <div className="flex h-screen flex-col">
        {/* ---- header ----    */}
        <div className="shrink-0 pt-4 pb-4 px-6">
          <div className="mx-auto flex max-w-6xlzzz items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--text)" }}>
                Templates
              </h1>
              <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                Your reporting templates drive the report&apos;s sections, names, and layout.
              </p>
            </div>
            <button
              onClick={() => router.push("/templates/new")}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-white"
              style={{ background: "var(--accent)" }}
            >
              <Plus size={16} /> Create New Template
            </button>
          </div>
        </div>

        {/* ---- scrolling card grid ---- */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-6xlzzz">
            {sorted.length === 0 ? (
              <div className="rounded-2xl py-16 text-center text-[13px]" style={{ color: "var(--text-subtle)" }}>
                No templates yet
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {pageItems.map((t) => {
                  const Icon = modalityIcon(t.modality);
                  const color = modalityColor(t.modality);
                  const fav = favs.includes(t.id);
                  const canDelete = !t.global;
                  return (
                    <div
                      key={t.id}
                      className="flex flex-col rounded-2xl p-4 transition hover:-translate-y-0.5"
                      style={{
                        background: "var(--canvas)",
                        boxShadow: "var(--shadow-card)",
                      }}
                    >
                      {/* header: icon + name + badges + star */}
                      <div className="flex items-start gap-3">
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                          style={{ background: `${color}1f`, color }}
                        >
                          <Icon size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                              {t.name}
                            </h3>
                            {t.global && (
                              <span
                                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: "var(--accent-soft)", color: "var(--accent)", display: "none" }}
                              >
                                <Globe size={10} /> Starter
                              </span>
                            )}
                            {t.id === selectedId && (
                              <span
                                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                              >
                                Loaded
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                            {t.modality} · {t.bodyPart}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleFav(t.id)}
                          aria-label={fav ? "Unfavorite" : "Favorite"}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-[var(--hover)]"
                          style={{ color: fav ? "#f5b301" : "var(--text-subtle)" }}
                        >
                          <Star size={16} fill={fav ? "#f5b301" : "none"} />
                        </button>
                      </div>

                      {/* stats */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        <StatChip label={`${t.sections.length} Sections`} />
                        <StatChip label={`${countFindings(t)} Findings`} />
                        <StatChip
                          label={`${countImpressions(t)} Impression${countImpressions(t) === 1 ? "" : "s"}`}
                        />
                        {(t.version ?? 1) > 1 && <StatChip label={`Version ${t.version}`} />}
                      </div>

                      {/* footer: updated + Edit / Delete / Open */}
                      <div
                        className="mt-4 flex items-center gap-2 border-t pt-3"
                        style={{ borderColor: "var(--ring)" }}
                      >
                        <span className="min-w-0 flex-1 truncate text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          Updated {timeAgo(t.updatedAt)}
                        </span>
                        <ActionBtn onClick={() => router.push(`/templates/${encodeURIComponent(t.id)}`)} label="Edit" icon={Pencil} />
                        {canDelete && (
                          <ActionBtn onClick={() => onDelete(t)} label="Delete" icon={Trash2} tone="danger" />
                        )}
                        <ActionBtn onClick={() => onLoad(t)} label="Open" icon={ArrowRight} tone="primary" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ---- pagination ---- */}
            {sorted.length > PER_PAGE && (
              <div className="mt-6 flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                  Showing {from}–{to} of {sorted.length} templates
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(current - 1)}
                    disabled={current === 1}
                    aria-label="Previous page"
                    className={cn(pageBtn, "border hover:bg-[var(--hover)]")}
                    style={{ borderColor: "var(--ring)", color: "var(--text)" }}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPage(n)}
                      aria-current={n === current ? "page" : undefined}
                      className={cn(pageBtn, n !== current && "hover:bg-[var(--hover)]")}
                      style={
                        n === current
                          ? { background: "var(--accent)", color: "#fff" }
                          : { color: "var(--text)" }
                      }
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage(current + 1)}
                    disabled={current === totalPages}
                    aria-label="Next page"
                    className={cn(pageBtn, "border hover:bg-[var(--hover)]")}
                    style={{ borderColor: "var(--ring)", color: "var(--text)" }}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </PageContainer>
  );
}
