"use client";

import DictationPanel from "@/components/dictation/DictationPanel";
import ReportEditor from "@/components/report-editor/ReportEditor";

// ReportingWorkspace (§6) — full-bleed: the Scribe panel (fixed 420px) sits flush
// against the sidebar, a thin vertical divider, then the report editor filling the
// rest. No outer gap and no floating card — it fills the whole main area.
export default function ReportingWorkspace() {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-auto lg:flex-row lg:overflow-hidden"
    >
      {/* Thin vertical divider */}
      {/* <div className="w-px shrink-0" style={{ background: "var(--ring)" }} /> */}

      {/* Left: Scribe panel — shares the sidebar's soft-beige / near-black canvas */}
      <div className="w-full shrink-0 overflow-visible border-l p-4 lg:w-[420px] lg:overflow-auto" style={{ background: "var(--canvas)", borderColor: "var(--ring)" }}>
        <DictationPanel />
      </div>

      {/* Thin vertical divider */}
      {/* <div className="w-px shrink-0" style={{ background: "var(--ring)" }} /> */}

      {/* Right: Report editor (fills the remaining area) — white / gray */}
      <div className="min-h-[620px] min-w-0 flex-1 pl-0 lg:pl-2" style={{ background: "var(--page)", borderTopLeftRadius: "25px" }}>
        <ReportEditor />
      </div>
    </div>
  );
}
