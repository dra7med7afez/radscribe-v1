import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistedTemplateId, useReportStore } from "@/store/reportStore";
import { setPendingProjection } from "@/components/report-editor/projection-bridge";
import { aiApi } from "@/services/ai.api";
import { templatesApi } from "@/services/templates.api";
import { documentToTemplateSections } from "@/lib/template-document";
import type { JSONContent } from "@tiptap/core";
import type { StructureResult, Template } from "@/types";

// The whole-report impression call is mocked: tests prime it per case (AI
// success vs offline fallback) — no network in unit tests.
vi.mock("@/services/ai.api", () => ({ aiApi: { impression: vi.fn() } }));
vi.mock("@/services/templates.api", () => ({
  templatesApi: {
    create: vi.fn(async (template: Template) => template),
    update: vi.fn(async (_id: string, template: Template) => template),
    remove: vi.fn(async () => ({ ok: true })),
    list: vi.fn(async () => []),
  },
}));

// Behavior locked in across builds (see RADSCRIBE-REBUILD-PROMPT-v2 §11/§12):
// region routing, abnormal-replaces-normal, one consolidated paragraph per
// region, subpoint-id in-place updates, combined findings+conclusion, and
// idempotent replace mode.

const TPL: Template = {
  id: "tpl-test",
  name: "CT Test",
  modality: "CT",
  bodyPart: "Chest",
  sections: [
    {
      id: "sec-technique",
      name: "Technique",
      kind: "prose",
      grouped: false,
      defaultProse: "<p>Default technique.</p>",
    },
    {
      id: "sec-findings",
      name: "Findings",
      kind: "findings",
      grouped: true,
      findings: [
        { region: "Liver", normalText: "The liver is normal." },
        { region: "Heart and Vessels", normalText: "Heart size is normal." },
        {
          region: "Cardiac Function",
          normalText: "Normal function.",
          subpoints: ["EF:", "LV size:"],
        },
      ],
    },
    {
      id: "sec-impression",
      name: "Impression",
      kind: "prose",
      grouped: false,
      isConclusion: true,
      normalImpression: "No acute abnormality.",
      defaultProse: "<p>No acute abnormality.</p>",
    },
  ],
};

// Same template but WITHOUT any conclusion-like section → "combined" mode
const TPL_NO_CONCLUSION: Template = {
  ...TPL,
  id: "tpl-combined",
  sections: TPL.sections.filter((s) => s.id !== "sec-impression"),
};

function loadFresh(tpl: Template) {
  useReportStore.setState({ templates: [TPL, TPL_NO_CONCLUSION] });
  useReportStore.getState().loadTemplate(tpl.id);
}

function findings() {
  const sec = useReportStore.getState().sections.find((s) => s.id === "sec-findings")!;
  return sec.findings!;
}

function byRegion(region: string) {
  return findings().find((f) => f.region === region)!;
}

const R = (over: Partial<StructureResult>): StructureResult => ({
  sectionId: "sec-findings",
  sectionName: "Findings",
  kind: "findings",
  region: "",
  findingId: "",
  subpointId: "",
  text: "",
  impression: "",
  abnormal: false,
  ...over,
});

describe("insertStructured", () => {
  beforeEach(() => loadFresh(TPL));

  it("routes prose narration to the named prose section", () => {
    useReportStore.getState().insertStructured([
      R({ kind: "prose", sectionId: "sec-technique", sectionName: "Technique", text: "CT with contrast was performed." }),
    ]);
    const sec = useReportStore.getState().sections.find((s) => s.id === "sec-technique")!;
    expect(sec.html).toContain("CT with contrast was performed.");
    // pristine default is replaced, not appended
    expect(sec.html).not.toContain("Default technique.");
  });

  it("abnormal finding replaces the region's normal default (exact region)", () => {
    useReportStore.getState().insertStructured([
      R({ region: "Liver", text: "A 2.1 cm hypodense lesion in segment VII.", abnormal: true }),
    ]);
    const liver = byRegion("Liver");
    expect(liver.abnormal).toBe(true);
    expect(liver.items).toHaveLength(1); // replaced, not appended
    expect(liver.items[0].text).toContain("2.1 cm hypodense lesion");
  });

  it("matches multi-word regions by containment (Heart -> Heart and Vessels)", () => {
    useReportStore.getState().insertStructured([
      R({ region: "Heart", text: "Cardiomegaly is noted.", abnormal: true }),
    ]);
    const heart = byRegion("Heart and Vessels");
    expect(heart.abnormal).toBe(true);
    expect(heart.items[0].text).toContain("Cardiomegaly");
    expect(findings()).toHaveLength(3); // no duplicate region created
  });

  it("never chooses between ambiguous fuzzy regions", () => {
    const section = useReportStore.getState().sections.find((s) => s.id === "sec-findings")!;
    const seed = byRegion("Liver");
    useReportStore.setState({
      sections: useReportStore.getState().sections.map((s) =>
        s.id === section.id
          ? {
              ...s,
              findings: [
                ...s.findings!,
                { ...seed, id: "left-kidney", region: "Left Kidney", items: [{ id: "left-item", text: "Normal left kidney." }] },
                { ...seed, id: "right-kidney", region: "Right Kidney", items: [{ id: "right-item", text: "Normal right kidney." }] },
              ],
            }
          : s
      ),
    });

    useReportStore.getState().insertStructured([
      R({ region: "Kidney", text: "A renal lesion is noted.", abnormal: true }),
    ]);

    expect(byRegion("Left Kidney").items[0].text).toBe("Normal left kidney.");
    expect(byRegion("Right Kidney").items[0].text).toBe("Normal right kidney.");
    expect(byRegion("Kidney").items[0].text).toContain("renal lesion");
  });

  it("re-dictation with findingId updates the finding in place (one consolidated paragraph)", () => {
    const store = useReportStore.getState();
    store.insertStructured([R({ region: "Liver", text: "A lesion in the liver.", abnormal: true })]);
    const itemId = byRegion("Liver").items[0].id;
    store.insertStructured([
      R({ findingId: itemId, region: "Liver", text: "A lesion in the liver measuring 2.4 cm with rim enhancement.", abnormal: true }),
    ]);
    const liver = byRegion("Liver");
    expect(liver.items).toHaveLength(1);
    expect(liver.items[0].text).toContain("rim enhancement");
  });

  it("subpointId updates the parameter in place and never touches items", () => {
    const cardiac = byRegion("Cardiac Function");
    const ef = cardiac.subpoints!.find((sp) => sp.text.startsWith("EF"))!;
    useReportStore.getState().insertStructured([
      R({ subpointId: ef.id, region: "Cardiac Function", text: "EF: 55%" }),
    ]);
    const after = byRegion("Cardiac Function");
    expect(after.subpoints!.find((sp) => sp.id === ef.id)!.text).toBe("EF: 55%");
    expect(after.items[0].text).toBe("Normal function."); // untouched
    expect(after.abnormal).toBe(false);
  });

  it("unmatched region creates a new finding instead of dropping it", () => {
    useReportStore.getState().insertStructured([
      R({ region: "Adrenals", text: "Left adrenal nodule.", abnormal: true }),
    ]);
    expect(findings()).toHaveLength(4);
    const created = findings()[3];
    expect(created.region).toBe("Adrenals");
    expect(created.abnormal).toBe(true);
  });

  it("drops a stale findingId instead of inserting it elsewhere", () => {
    const before = JSON.parse(JSON.stringify(findings()));
    useReportStore.getState().insertStructured([
      R({
        findingId: "stale-item-id",
        region: "Liver",
        text: "This must not be inserted.",
        abnormal: true,
      }),
    ]);
    expect(findings()).toEqual(before);
  });

  it("drops a stale subpointId without changing any finding", () => {
    const before = JSON.parse(JSON.stringify(findings()));
    useReportStore.getState().insertStructured([
      R({
        subpointId: "stale-parameter-id",
        region: "Cardiac Function",
        text: "EF: 10%",
        abnormal: true,
      }),
    ]);
    expect(findings()).toEqual(before);
  });

  it("does not fall back to the first section when routing is unresolved", () => {
    const before = JSON.parse(JSON.stringify(useReportStore.getState().sections));
    useReportStore.getState().insertStructured([
      R({
        sectionId: "missing-section",
        sectionName: "Missing Section",
        region: "Liver",
        text: "This must not be routed heuristically.",
        abnormal: true,
      }),
      R({
        kind: "prose",
        sectionId: "missing-prose",
        sectionName: "Missing Prose",
        text: "This must not enter Technique.",
      }),
    ]);
    expect(useReportStore.getState().sections).toEqual(before);
  });

  it("keeps a separate impression line when a conclusion section exists", () => {
    useReportStore.getState().insertStructured([
      R({ region: "Liver", text: "Liver lesion.", impression: "Suspicious for metastasis.", abnormal: true }),
    ]);
    const item = byRegion("Liver").items[0];
    expect(item.text).not.toContain("Suspicious for metastasis.");
    expect(item.impression).toBe("Suspicious for metastasis.");
  });

  it("folds impression into the bullet after an ellipsis when there is no conclusion section (combined)", () => {
    loadFresh(TPL_NO_CONCLUSION);
    useReportStore.getState().insertStructured([
      R({ region: "Liver", text: "Liver lesion.", impression: "Suspicious for metastasis.", abnormal: true }),
    ]);
    const item = byRegion("Liver").items[0];
    expect(item.text).toContain("Liver lesion … Suspicious for metastasis.");
    expect(item.impression).toBeUndefined();
  });

  it("combined mode: a finding without an interpretation stays as-is (no ellipsis)", () => {
    loadFresh(TPL_NO_CONCLUSION);
    useReportStore.getState().insertStructured([
      R({ region: "Liver", text: "Mild hepatomegaly.", impression: "", abnormal: true }),
    ]);
    const item = byRegion("Liver").items[0];
    expect(item.text).toBe("Mild hepatomegaly.");
  });

  it("combined mode: drops an impression that merely restates the finding", () => {
    loadFresh(TPL_NO_CONCLUSION);
    useReportStore.getState().insertStructured([
      R({
        region: "Liver",
        text: "A 12 mm hypodense lesion in the right hepatic lobe is noted.",
        impression: "12 mm hypodense lesion in the right hepatic lobe.",
        abnormal: true,
      }),
    ]);
    const item = byRegion("Liver").items[0];
    expect(item.text).toBe("A 12 mm hypodense lesion in the right hepatic lobe is noted.");
  });

  it("replace mode is idempotent: re-applying a transcript yields one paragraph per region", () => {
    const store = useReportStore.getState();
    const results = [
      R({ region: "Liver", text: "A hepatic lesion.", abnormal: true }),
      R({ region: "Heart", text: "Cardiomegaly.", abnormal: true }),
    ];
    store.insertStructured(results, { replace: true });
    store.insertStructured(results, { replace: true });
    expect(findings()).toHaveLength(3);
    expect(byRegion("Liver").items).toHaveLength(1);
    expect(byRegion("Heart and Vessels").items).toHaveLength(1);
  });

  it("dictation does NOT rebuild the conclusion; Generate sends the whole report to the AI", async () => {
    useReportStore.getState().setPersistence("report-123", 0);
    useReportStore.getState().insertStructured([
      R({ region: "Liver", text: "Liver lesion.", impression: "Suspicious lesion.", abnormal: true }),
    ]);
    let impression = useReportStore.getState().sections.find((s) => s.id === "sec-impression")!;
    // untouched by the dictation take — generated once, after all findings
    expect(impression.html).toBe("<p>No acute abnormality.</p>");

    vi.mocked(aiApi.impression).mockResolvedValueOnce([
      "Suspicious hepatic lesion — further work-up recommended.",
    ]);
    await useReportStore.getState().regenerateImpression();
    expect(aiApi.impression).toHaveBeenCalledWith(
      expect.stringContaining("Liver lesion."),
      "report-123"
    );
    impression = useReportStore.getState().sections.find((s) => s.id === "sec-impression")!;
    expect(impression.html).toContain("Suspicious hepatic lesion");
  });

  it("falls back to local bullet-list derivation when the AI is unreachable — never a numbered list", async () => {
    useReportStore.getState().setPersistence("report-456", 0);
    useReportStore.getState().insertStructured([
      R({ region: "Liver", text: "Liver lesion.", impression: "Suspicious lesion.", abnormal: true }),
      R({ region: "Heart", text: "Cardiomegaly.", impression: "Cardiomegaly.", abnormal: true }),
    ]);
    vi.mocked(aiApi.impression).mockRejectedValueOnce(new Error("offline"));
    await useReportStore.getState().regenerateImpression();
    const impression = useReportStore.getState().sections.find((s) => s.id === "sec-impression")!;
    expect(impression.html).not.toContain("<ol>");
    // one bullet-list item per impression line — a real <ul>, which the prose
    // editor continues on Enter (same list behavior as the toolbar's Bullets)
    expect(impression.html).toMatch(
      /<ul><li><p>Suspicious lesion\.<\/p><\/li><li><p>Cardiomegaly\.<\/p><\/li><\/ul>/
    );
  });
});

// ---------------------------------------------------------------------------
// The editor holds the canonical document and projects it into the store on a
// debounce, so for a short window the store is BEHIND what the radiologist has
// typed. Any mutation that reads `sections` in that window would build on the
// stale copy — and the doc rebuild it triggers would then overwrite the typed
// text with it. The store flushes the pending projection before every mutation
// (see projection-bridge); these tests pin that down, since the failure mode is
// silent data loss.
describe("pending projection flush", () => {
  beforeEach(() => {
    loadFresh(TPL);
    setPendingProjection(null);
  });

  // stand in for the editor: text typed into the doc, not yet projected
  function pendingEdit(text: string) {
    let ran = false;
    setPendingProjection(() => {
      ran = true;
      const sections = useReportStore.getState().sections.map((sec) =>
        sec.id !== "sec-findings"
          ? sec
          : {
              ...sec,
              findings: sec.findings!.map((f) =>
                f.region !== "Liver"
                  ? f
                  : { ...f, items: f.items.map((it) => ({ ...it, text })) }
              ),
            }
      );
      useReportStore.getState().applyDocProjection(sections);
    });
    return () => ran;
  }

  it("a dictation insert cannot clobber text the editor has not projected yet", () => {
    const flushed = pendingEdit("Typed but not yet projected.");

    useReportStore
      .getState()
      .insertStructured([R({ region: "Heart and Vessels", text: "Cardiomegaly.", abnormal: true })]);

    expect(flushed()).toBe(true);
    // the typed line survived the dictation into a DIFFERENT finding
    expect(byRegion("Liver").items[0].text).toBe("Typed but not yet projected.");
    expect(byRegion("Heart and Vessels").items[0].text).toContain("Cardiomegaly.");
  });

  it("a structural action flushes first too", () => {
    const flushed = pendingEdit("Still in the editor.");

    useReportStore.getState().addFinding("sec-findings");

    expect(flushed()).toBe(true);
    expect(byRegion("Liver").items[0].text).toBe("Still in the editor.");
  });

  it("flushing is one-shot — a second mutation does not re-run it", () => {
    let runs = 0;
    setPendingProjection(() => {
      runs += 1;
      useReportStore.getState().applyDocProjection(useReportStore.getState().sections);
    });

    useReportStore.getState().addFinding("sec-findings");
    useReportStore.getState().addFinding("sec-findings");

    expect(runs).toBe(1);
  });
});

describe("template and report document independence", () => {
  beforeEach(() => {
    loadFresh(TPL);
    vi.clearAllMocks();
  });

  it("does not rewrite an open report when its source template is updated", async () => {
    const before = JSON.parse(JSON.stringify(useReportStore.getState().sections));
    const changedTemplate: Template = {
      ...TPL,
      sections: TPL.sections.map((section) =>
        section.id === "sec-technique"
          ? { ...section, defaultProse: "<p>A newly edited template technique.</p>" }
          : section
      ),
    };

    await useReportStore.getState().importTemplate(changedTemplate);

    expect(useReportStore.getState().sections).toEqual(before);
    expect(useReportStore.getState().templates.find((item) => item.id === TPL.id)?.sections)
      .toEqual(changedTemplate.sections);
    expect(templatesApi.create).toHaveBeenCalled();
  });

  it("never sends a local seed template id as a backend report foreign key", async () => {
    useReportStore.getState().resetSession();
    expect(persistedTemplateId("ct-chest")).toBeUndefined();

    const serverTemplate = { ...TPL, id: "server-template-id" };
    vi.mocked(templatesApi.list).mockResolvedValueOnce([serverTemplate]);
    await useReportStore.getState().hydrateTemplates();

    expect(persistedTemplateId(serverTemplate.id)).toBe(serverTemplate.id);
    expect(persistedTemplateId("ct-chest")).toBeUndefined();
  });

  it("starts a new independent report whenever a template is loaded", () => {
    useReportStore.setState({ activeReportId: "existing-report", revision: 7 });
    const beforeNonce = useReportStore.getState().reportNonce;

    useReportStore.getState().loadTemplate(TPL_NO_CONCLUSION.id);

    const state = useReportStore.getState();
    expect(state.selectedTemplateId).toBe(TPL_NO_CONCLUSION.id);
    expect(state.reportNonce).toBe(beforeNonce + 1);
    expect(state.activeReportId).toBeNull();
    expect(state.revision).toBe(0);
  });

  it("replaces exactly one mapped row in a report made from a new free-form template", () => {
    const document: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Technique" }] },
        { type: "paragraph", content: [{ type: "text", text: "CT without contrast." }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Findings" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Liver:", marks: [{ type: "bold" }] },
            { type: "text", text: " The liver is normal." },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Lungs:", marks: [{ type: "bold" }] },
            { type: "text", text: " The lungs are clear." },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Impression" }] },
        { type: "paragraph", content: [{ type: "text", text: "No acute abnormality." }] },
      ],
    };
    const custom: Template = {
      id: "new-free-form-template",
      name: "New free-form template",
      modality: "CT",
      bodyPart: "Chest and abdomen",
      document,
      sections: documentToTemplateSections(document),
    };
    useReportStore.setState({ templates: [custom] });
    useReportStore.getState().loadTemplate(custom.id);

    const before = useReportStore.getState().sections;
    const findingSection = before.find((section) => section.kind === "findings")!;
    const liver = findingSection.findings!.find((finding) => finding.region === "Liver")!;
    const lungText = findingSection.findings!.find((finding) => finding.region === "Lungs")!
      .items[0].text;
    const techniqueText = before.find((section) => section.name === "Technique")!.html;
    const impressionText = before.find((section) => section.name === "Impression")!.html;

    useReportStore.getState().insertStructured([
      R({
        sectionId: findingSection.id,
        sectionName: findingSection.name,
        findingId: liver.items[0].id,
        region: "Liver",
        text: "A 2 cm hypodense hepatic lesion is noted.",
        abnormal: true,
      }),
    ]);

    const after = useReportStore.getState().sections;
    const afterFindings = after.find((section) => section.id === findingSection.id)!;
    expect(afterFindings.findings!.find((finding) => finding.region === "Liver")!.items[0].text)
      .toContain("2 cm hypodense hepatic lesion");
    expect(afterFindings.findings!.find((finding) => finding.region === "Lungs")!.items[0].text)
      .toBe(lungText);
    expect(after.find((section) => section.name === "Technique")!.html).toBe(techniqueText);
    expect(after.find((section) => section.name === "Impression")!.html).toBe(impressionText);
  });
});
