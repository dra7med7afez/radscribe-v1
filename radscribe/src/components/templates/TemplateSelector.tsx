"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, Clock3 } from "lucide-react";
import { useReportStore } from "@/store/reportStore";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

// TemplateSelector (§8) — the box IS the search field. Default shows the
// "Search templates…" placeholder (no pre-filled name); after choosing, the
// selected template's name appears in the box.
export default function TemplateSelector() {
  const templates = useReportStore((s) => s.templates);
  const recentTemplateIds = useReportStore((s) => s.recentTemplateIds);
  const selectedId = useReportStore((s) => s.selectedTemplateId);
  const loadTemplate = useReportStore((s) => s.loadTemplate);
  const notify = useUiStore((s) => s.notify);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(false); // false initially (§8)
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === selectedId);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const recentRank = useMemo(
    () => new Map(recentTemplateIds.map((id, index) => [id, index])),
    [recentTemplateIds]
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates
      .map((template, originalIndex) => ({ template, originalIndex }))
      .filter(({ template }) =>
        !q ||
        template.name.toLowerCase().includes(q) ||
        template.modality.toLowerCase().includes(q) ||
        template.bodyPart.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aRank = recentRank.get(a.template.id);
        const bRank = recentRank.get(b.template.id);
        if (aRank !== undefined || bRank !== undefined) {
          if (aRank === undefined) return 1;
          if (bRank === undefined) return -1;
          return aRank - bRank;
        }
        return a.originalIndex - b.originalIndex;
      })
      .map(({ template }) => template);
  }, [query, recentRank, templates]);

  const choose = (id: string, name: string) => {
    loadTemplate(id);
    setChosen(true);
    setOpen(false);
    setQuery("");
    notify(`Loaded ${name}`);
  };

  const value = open ? query : chosen ? selected?.name || "" : "";

  return (
    <div className="relative" ref={wrapRef}>
      <div
        className="flex h-11 items-center gap-2 rounded-2xl px-3"
        style={{ background: "var(--panel)", boxShadow: "var(--shadow-float)" }}
      >
        <Search size={16} style={{ color: "var(--text-subtle)" }} />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          placeholder="Search templates…"
          className="flex-1 bg-transparent text-[14px] outline-none"
          style={{ color: "var(--text)" }}
        />
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            setQuery("");
            if (next) inputRef.current?.focus();
          }}
          aria-label="Toggle template list"
          className="grid h-7 w-7 place-items-center rounded-lg transition hover:bg-[var(--hover)]"
        >
          <ChevronDown
            size={16}
            style={{ color: "var(--text-subtle)" }}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {open && (
        <div
          className="animate-in absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-auto rounded-2xl p-1.5"
          style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[13px]" style={{ color: "var(--text-subtle)" }}>
              No templates found
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => choose(t.id, t.name)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-[var(--hover)]"
              >
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {t.modality}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                    {t.name}
                  </span>
                  <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {t.bodyPart} · {t.sections.length} sections
                  </span>
                </span>
                {recentRank.has(t.id) && t.id !== selectedId && (
                  <Clock3
                    size={13}
                    aria-label="Recently used"
                    style={{ color: "var(--text-subtle)" }}
                  />
                )}
                {t.id === selectedId && <Check size={15} style={{ color: "var(--accent)" }} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
