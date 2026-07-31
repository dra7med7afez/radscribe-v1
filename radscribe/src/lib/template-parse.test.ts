import { describe, expect, it } from "vitest";
import { parseTemplateText } from "@/lib/template-parse";

// The offline fallback parser (§8a) — also the safety net that recovers
// findings when the AI analyzer returns a findings section with an empty list.

const GROUPED = `TECHNIQUE
Helical CT of the chest without contrast.

FINDINGS
Lungs: Clear without consolidation.
Pleura: No effusion or pneumothorax.
Heart: Normal size.

IMPRESSION
No acute cardiopulmonary process.`;

describe("parseTemplateText", () => {
  it("preserves section names verbatim and in order", () => {
    const sections = parseTemplateText(GROUPED);
    expect(sections.map((s) => s.name)).toEqual(["TECHNIQUE", "FINDINGS", "IMPRESSION"]);
  });

  it("infers kinds: prose for narrative, findings for organ lists", () => {
    const [tech, findings, impression] = parseTemplateText(GROUPED);
    expect(tech.kind).toBe("prose");
    expect(findings.kind).toBe("findings");
    expect(impression.kind).toBe("prose");
  });

  it("detects grouped findings with regions and normal text", () => {
    const findings = parseTemplateText(GROUPED)[1];
    expect(findings.grouped).toBe(true);
    expect(findings.findings).toHaveLength(3);
    expect(findings.findings![0]).toMatchObject({
      region: "Lungs",
      normalText: "Clear without consolidation.",
    });
  });

  it("marks Impression-like sections as conclusions", () => {
    const impression = parseTemplateText(GROUPED)[2];
    expect(impression.isConclusion).toBe(true);
  });

  it("parses a flat bullet list as headingless findings", () => {
    const sections = parseTemplateText(
      "FINDINGS\n- The lungs are clear.\n- No pneumothorax.\n- Normal heart size."
    );
    const f = sections[0];
    expect(f.kind).toBe("findings");
    expect(f.grouped).toBe(false);
    expect(f.findings!.every((x) => x.region === "")).toBe(true);
    expect(f.findings).toHaveLength(3);
  });

  it("wraps header-less text into a single Findings section", () => {
    const sections = parseTemplateText("The study is normal.");
    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe("Findings");
  });
});
