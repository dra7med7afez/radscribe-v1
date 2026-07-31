"use client";

import ReportDocEditor from "./ReportDocEditor";
import DocumentEditor from "./DocumentEditor";
import { useReportStore } from "@/store/reportStore";

// ReportEditor — the report body is ONE continuous, free-flowing document:
// every heading, paragraph and list lives in a single ProseMirror doc, so
// selection, the caret, and undo flow across the whole report like Word.
// Structure (the section map) is derived from the text on demand — see
// lib/report-doc — never enforced during editing.
export default function ReportEditor() {
  const reportNonce = useReportStore((s) => s.reportNonce);
  const selectedTemplateId = useReportStore((s) => s.selectedTemplateId);

  return (
    <DocumentEditor mode="report">
      {/* remount on new report / template switch so editor history resets */}
      <ReportDocEditor key={`${selectedTemplateId}:${reportNonce}`} />
    </DocumentEditor>
  );
}
