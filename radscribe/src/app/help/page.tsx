"use client";

import { Mic, LayoutTemplate, ClipboardCheck, ImagePlus, Workflow, AudioWaveform } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";

const TOPICS = [
  { icon: LayoutTemplate, title: "Templates drive everything", body: "Upload a .docx or paste your template — AI analyzes it into ordered sections with your section names verbatim, inferring prose vs findings and pulling out each region's normal text. Review and edit everything (names, normal sentences) before saving. Two sections or five, grouped findings or a flat list: the report renders exactly what your template defines." },
  { icon: Mic, title: "Dictate by voice", body: "Pick a structuring style (Verbatim or Concise), tap the mic, and dictate. Speech is transcribed and structured beneath the correct existing template heading. When no matching sentence, organ, or paragraph exists, the new statement is added directly below that heading without changing the template’s section names." },
  { icon: AudioWaveform, title: "Dictate at the cursor", body: "Click anywhere in the report to place your cursor — a small wavy-audio icon appears just above it. Click the icon, speak a phrase, and it's transcribed (grammar & punctuation corrected only, no re-structuring) and inserted right where the cursor is. Click again to stop." },
  { icon: ClipboardCheck, title: "Review workflow", body: "Switch the Scribe panel to Review to check the transcript before it touches the report. Each dictated take collects in an editable box — fix any mis-heard words, dictate more, then click Apply to structure and insert it." },
  { icon: ImagePlus, title: "Attach images to findings", body: "Select a finding and attach an image — it appears in the side rail beside that finding, never inline in the report text." },
  { icon: Workflow, title: "External systems", body: "This distribution does not send reports or fetch worklists from external systems. A separately validated FHIR, HL7, DICOM, or webhook adapter is required before that workflow can be enabled." },
];

export default function HelpPage() {
  return (
    <PageContainer>
      <Header title="Help Center" subtitle="Everything you need to report faster with RadScribe." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 px-6">
        {TOPICS.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.title} className="rounded-2xl p-4" style={{ background: "var(--canvas)", boxShadow: "var(--shadow-card)" }}>
              <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Icon size={17} />
              </span>
              <h3 className="mt-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>{t.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{t.body}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-2xl p-6" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
        <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Keyboard & login</h3>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Your deployment administrator provisions the initial account through the one-time database initialization job. An authenticated API connection is required to create, restore, and save reports; the app does not keep report content in browser storage.
        </p>
      </div>
    </PageContainer>
  );
}
