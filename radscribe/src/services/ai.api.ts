import { apiFetch } from "@/lib/api/client";
import { htmlToText } from "@/lib/utils";
import type {
  DictationMode,
  DocumentEditResult,
  DocumentTreeNode,
  ReportSection,
  StructureResult,
} from "@/types";
import type { SelectedTextEditAction } from "@/lib/voice-edit-command-parser";
import type { UsageSummary } from "@/services/billing.api";
import { useSubscriptionStore } from "@/store/subscriptionStore";

// ============================================================
// ai.api (§12). Proxies transcription + structuring through the
// backend (Gemini stays server-side). REAL dictation only — there is
// no demo/heuristic fallback: the structured output always comes from
// Gemini processing the actual dictated words.
// ============================================================

const MODE_ENUM: Record<DictationMode, string> = {
  verbatim: "VERBATIM",
  concise: "CONCISE",
};

export interface CurrentFindingDescriptor {
  findingId: string;
  region: string;
  text: string;
  abnormal: boolean;
}

export interface CurrentSubpointDescriptor {
  subpointId: string;
  region: string;
  text: string; // the parameter's current label/value
}

export interface SectionDescriptor {
  id: string;
  name: string;
  kind: "prose" | "findings";
  grouped: boolean;
  text?: string;
  regions?: string[];
  findings?: CurrentFindingDescriptor[];
  subpoints?: CurrentSubpointDescriptor[];
}

// Build a complete, ordered map of the LIVE document. Structuring receives
// every current report part—not just abnormal findings—so Gemini can compare
// the dictation with the whole report before choosing a stable target id.
export function describeSections(sections: ReportSection[]): SectionDescriptor[] {
  return sections.map((s) => {
    const regions =
      s.kind === "findings"
        ? (s.findings || []).map((f) => f.region).filter((r) => r !== "")
        : undefined;
    // Every item carries its stable document id and current text. This includes
    // template normals: seeing their actual wording lets the model distinguish
    // a true replacement from a new finding in a nearby region.
    const findings =
      s.kind === "findings"
        ? (s.findings || []).flatMap((f) =>
            f.items.map((it) => ({
              findingId: it.id,
              region: f.region,
              text: htmlToText(it.text),
              abnormal: f.abnormal,
            }))
          )
        : undefined;
    // Send each finding's subpoints (parameters) with their stable ids so the
    // model can fill/update a parameter value in place when it is dictated.
    const subpoints =
      s.kind === "findings"
        ? (s.findings || []).flatMap((f) =>
            (f.subpoints || []).map((sp) => ({
              subpointId: sp.id,
              region: f.region,
              text: htmlToText(sp.text),
            }))
          )
        : undefined;
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      text: s.kind === "prose" ? htmlToText(s.html || "") : undefined,
      // Treat a findings section as grouped whenever it has regions, so the model
      // returns those region labels and abnormal findings replace the right
      // normal default — even if a new template's grouped flag wasn't set.
      grouped: s.kind === "findings" ? !!s.grouped || (regions?.length ?? 0) > 0 : false,
      regions,
      findings,
      subpoints,
    };
  });
}

export const aiApi = {
  async transcribe(
    audioBase64: string,
    mimeType: string,
    reportId: string
  ): Promise<string> {
    const res = await apiFetch<{ text: string }>("/ai/transcribe", {
      method: "POST",
      body: { audioBase64, mimeType, reportId },
    });
    return res.text || "";
  },

  // Selected-text edits are intentionally isolated from report structuring:
  // only the selected fragment and its instruction leave the browser.
  async editSelection(
    selectedText: string,
    instruction: string,
    action: SelectedTextEditAction,
    reportId: string
  ): Promise<{ text: string }> {
    return apiFetch<{ text: string }>("/ai/edit-selection", {
      method: "POST",
      body: { selectedText, instruction, action, reportId },
    });
  },

  async structure(
    transcript: string,
    mode: DictationMode,
    sections: ReportSection[],
    reportId: string,
    structuringInstructions = ""
  ): Promise<StructureResult[]> {
    const descriptors = describeSections(sections);
    const res = await apiFetch<{ results: StructureResult[]; usage?: UsageSummary }>("/ai/structure", {
      method: "POST",
      body: {
        transcript,
        mode: MODE_ENUM[mode],
        sections: descriptors,
        reportId,
        structuringInstructions,
      },
    });
    if (res.usage) useSubscriptionStore.getState().applyUsage(res.usage);
    return Array.isArray(res?.results) ? res.results : [];
  },

  // Document-native routing. The complete ordered TipTap tree is the only map:
  // no derived section, organ, finding, or parameter model participates in
  // target selection or insertion.
  async structureDocument(
    transcript: string,
    mode: DictationMode,
    document: DocumentTreeNode,
    reportId: string,
    structuringInstructions = ""
  ): Promise<DocumentEditResult[]> {
    const res = await apiFetch<{ results: DocumentEditResult[]; usage?: UsageSummary }>(
      "/ai/structure-document",
      {
        method: "POST",
        body: {
          transcript,
          mode: MODE_ENUM[mode],
          document,
          reportId,
          structuringInstructions,
        },
      }
    );
    if (res.usage) useSubscriptionStore.getState().applyUsage(res.usage);
    return Array.isArray(res?.results) ? res.results : [];
  },

  // Whole-report impression — called once, when the radiologist finishes
  // dictating all findings (never per take). Returns concise statement lines.
  async impression(report: string, reportId: string): Promise<string[]> {
    const res = await apiFetch<{ lines: string[]; usage?: UsageSummary }>("/ai/impression", {
      method: "POST",
      body: { report, reportId },
    });
    if (res.usage) useSubscriptionStore.getState().applyUsage(res.usage);
    return Array.isArray(res?.lines) ? res.lines.filter(Boolean) : [];
  },
};
