import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { docToSections, normalizeHeadingText, sectionKeyFor } from "./report-doc";

// ---- builders -----------------------------------------------------------

const text = (t: string): JSONContent => ({ type: "text", text: t });
const h = (level: 1 | 2, title: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: title ? [text(title)] : [],
});
const p = (t = ""): JSONContent => ({
  type: "paragraph",
  content: t ? [text(t)] : [],
});
const li = (...blocks: JSONContent[]): JSONContent => ({ type: "listItem", content: blocks });
const ul = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

// ---- sectionKeyFor ------------------------------------------------------

describe("sectionKeyFor", () => {
  it("matches known section names case-insensitively", () => {
    expect(sectionKeyFor("FINDINGS")).toBe("findings");
    expect(sectionKeyFor("Impression")).toBe("impression");
    expect(sectionKeyFor("clinical history")).toBe("clinical_history");
    expect(sectionKeyFor("EXAMINATION")).toBe("examination");
    expect(sectionKeyFor("Technique")).toBe("technique");
    expect(sectionKeyFor("COMPARISON")).toBe("comparison");
  });

  it("normalizes whitespace and trailing punctuation before matching", () => {
    expect(sectionKeyFor("  Clinical   History ")).toBe("clinical_history");
    expect(sectionKeyFor("FINDINGS:")).toBe("findings");
    expect(normalizeHeadingText("  Clinical \n History ")).toBe("Clinical History");
  });

  it("returns null for unrecognized headings", () => {
    expect(sectionKeyFor("Left Kidney")).toBeNull();
    expect(sectionKeyFor("")).toBeNull();
  });
});

// ---- docToSections ------------------------------------------------------

describe("docToSections", () => {
  it("splits the document on level-2 headings, in order", () => {
    const sections = docToSections(
      doc(
        h(2, "TECHNIQUE"),
        p("CT without contrast."),
        h(2, "FINDINGS"),
        p("The liver is normal."),
        h(2, "IMPRESSION"),
        p("No acute abnormality.")
      )
    );
    expect(sections.map((s) => s.key)).toEqual(["technique", "findings", "impression"]);
    expect(sections.map((s) => s.title)).toEqual(["TECHNIQUE", "FINDINGS", "IMPRESSION"]);
    expect(sections[1].plainText).toBe("The liver is normal.");
  });

  it("keeps the heading title exactly as written while matching the key loosely", () => {
    const [sec] = docToSections(doc(h(2, "  clinical   History "), p("Fever.")));
    expect(sec.title).toBe("  clinical   History ");
    expect(sec.key).toBe("clinical_history");
  });

  it("puts content before the first heading into a preamble section", () => {
    const sections = docToSections(
      doc(p("CT CHEST WITHOUT CONTRAST"), h(2, "FINDINGS"), p("Clear lungs."))
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({
      key: "preamble",
      title: "",
      plainText: "CT CHEST WITHOUT CONTRAST",
    });
    expect(sections[1].key).toBe("findings");
  });

  it("emits no preamble when the document starts with a heading", () => {
    const sections = docToSections(doc(h(2, "FINDINGS"), p("Clear.")));
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("findings");
  });

  it("emits no preamble for leading empty paragraphs", () => {
    const sections = docToSections(doc(p(), h(2, "FINDINGS"), p("Clear.")));
    expect(sections).toHaveLength(1);
  });

  it("does not split on level-1 headings (report title flows into the section body)", () => {
    const sections = docToSections(
      doc(h(1, "CT CHEST"), h(2, "FINDINGS"), p("Nodule."), h(1, "Interim title"), p("More."))
    );
    expect(sections.map((s) => s.title)).toEqual(["", "FINDINGS"]);
    expect(sections[0].plainText).toBe("CT CHEST");
    expect(sections[1].plainText).toBe("Nodule.\nInterim title\nMore.");
  });

  it("gives unrecognized headings a null key but keeps the section", () => {
    const sections = docToSections(doc(h(2, "DEVICES AND LINES"), p("ET tube in place.")));
    expect(sections[0].key).toBeNull();
    expect(sections[0].title).toBe("DEVICES AND LINES");
    expect(sections[0].plainText).toBe("ET tube in place.");
  });

  it("flattens lists into one plain-text line per item", () => {
    const sections = docToSections(
      doc(
        h(2, "IMPRESSION"),
        ul(
          li(p("Right upper lobe nodule.")),
          li(p("Liver lesion."), ul(li(p("Follow-up in 6 months."))))
        )
      )
    );
    expect(sections[0].plainText).toBe(
      "Right upper lobe nodule.\nLiver lesion.\nFollow-up in 6 months."
    );
  });

  it("skips empty paragraphs in the body text", () => {
    const sections = docToSections(doc(h(2, "FINDINGS"), p(), p("Clear lungs."), p()));
    expect(sections[0].plainText).toBe("Clear lungs.");
  });

  it("keeps an empty section (heading with no body)", () => {
    const sections = docToSections(doc(h(2, "COMPARISON"), h(2, "FINDINGS"), p("Clear.")));
    expect(sections[0]).toEqual({ key: "comparison", title: "COMPARISON", plainText: "" });
  });

  it("reflects a deleted heading: the content merges into the previous section", () => {
    const before = docToSections(
      doc(h(2, "FINDINGS"), p("Clear lungs."), h(2, "IMPRESSION"), p("Normal."))
    );
    expect(before).toHaveLength(2);

    // the radiologist deletes the IMPRESSION heading
    const after = docToSections(doc(h(2, "FINDINGS"), p("Clear lungs."), p("Normal.")));
    expect(after).toHaveLength(1);
    expect(after[0].key).toBe("findings");
    expect(after[0].plainText).toBe("Clear lungs.\nNormal.");
  });

  it("returns an empty array for an empty document", () => {
    expect(docToSections(doc())).toEqual([]);
    expect(docToSections(doc(p()))).toEqual([]);
  });
});
