import type { ReportSection, Patient, ReportSettings } from "@/types";
import { reportToHtml, reportToPlainText } from "@/lib/report-format";

// exportService (§10). Copy → clipboard (rich + plain); Extract → .doc download.
// Rich copy and .doc export receive the live TipTap HTML so block order, nested
// lists, headings, alignment and inline formatting match the editor exactly.
export const exportService = {
  async copyToClipboard(
    title: string,
    sections: ReportSection[],
    patient: Patient | null | undefined,
    settings: ReportSettings,
    documentHtml?: string
  ): Promise<void> {
    const html = reportToHtml(title, sections, patient, settings, documentHtml);
    const text = reportToPlainText(title, sections, patient, settings, documentHtml);
    try {
      if (navigator.clipboard && "write" in navigator.clipboard) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        return;
      }
    } catch {
      // fall through to plain text
    }
    await navigator.clipboard.writeText(text);
  },

  exportDoc(
    title: string,
    sections: ReportSection[],
    patient: Patient | null | undefined,
    settings: ReportSettings,
    documentHtml?: string
  ): void {
    const html = reportToHtml(title, sections, patient, settings, documentHtml);
    // UTF-8 BOM prevents desktop Word from corrupting geometric bullet glyphs.
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "_")}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};
