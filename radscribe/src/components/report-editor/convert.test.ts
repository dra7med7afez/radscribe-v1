import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { sectionsToDoc, docToStoreSections, PREAMBLE_ID } from "./convert";
import type { ReportSection } from "@/types";

// The store ⇄ doc boundary: templates and structuring results become one
// continuous document, and the live document projects back into the store
// shape that persistence, export and the AI flows read. The round trip must
// be STABLE — same ids, kinds and flags — or external targeting breaks.

function makeSections(): ReportSection[] {
  return [
    {
      id: "sec-technique",
      name: "Technique",
      kind: "prose",
      html: "<p>CT of the chest was performed.</p>",
    },
    {
      id: "sec-findings",
      name: "Findings",
      kind: "findings",
      grouped: true,
      findings: [
        {
          id: "fnd-liver",
          region: "Liver",
          items: [{ id: "itm-liver", text: "The liver is normal." }],
          normalText: "The liver is normal.",
          abnormal: false,
          subpoints: [
            { id: "sp-size", text: "Size: normal" },
            { id: "sp-echo", text: "Echotexture: uniform", level: 1 },
          ],
        },
        {
          id: "fnd-flat",
          region: "",
          items: [
            { id: "itm-flat", text: "Cardiomegaly is noted.", impression: "Cardiomegaly." },
          ],
          normalText: "",
          abnormal: true,
        },
      ],
    },
    {
      id: "sec-impression",
      name: "Impression",
      kind: "prose",
      isConclusion: true,
      normalImpression: "No acute abnormality.",
      html: "<p>No acute abnormality.</p>",
    },
  ];
}

describe("sectionsToDoc", () => {
  it("renders one continuous document: headings, prose, findings as a real list", () => {
    const doc = sectionsToDoc(makeSections());
    const types = (doc.content || []).map((n) => n.type);
    expect(types).toEqual(["heading", "paragraph", "heading", "bulletList", "heading", "paragraph"]);
  });

  it("stamps sectionKey metadata on known headings", () => {
    const doc = sectionsToDoc(makeSections());
    const headings = (doc.content || []).filter((n) => n.type === "heading");
    expect(headings.map((h) => h.attrs?.sectionKey)).toEqual([
      "technique",
      "findings",
      "impression",
    ]);
    expect(headings.every((h) => h.attrs?.level === 2)).toBe(true);
  });

  it("writes the organ label as bold text ending in a colon", () => {
    const doc = sectionsToDoc(makeSections());
    const list = (doc.content || []).find((n) => n.type === "bulletList")!;
    const firstPara = list.content![0].content![0];
    const label = firstPara.content![0];
    expect(label.text).toBe("Liver:");
    expect(label.marks?.some((m) => m.type === "bold")).toBe(true);
  });

  it("nests subpoints as a real list inside the finding, one level per depth", () => {
    const doc = sectionsToDoc(makeSections());
    const list = (doc.content || []).find((n) => n.type === "bulletList")!;
    const liver = list.content![0];
    const sub = liver.content!.find((n) => n.type === "bulletList")!;
    // level-0 subpoint, with the level-1 subpoint nested one list deeper
    expect(sub.content).toHaveLength(1);
    const deeper = sub.content![0].content!.find((n) => n.type === "bulletList")!;
    expect(deeper.content).toHaveLength(1);
  });
});

describe("docToStoreSections", () => {
  it("round-trips losslessly: ids, kinds, regions, flags and levels survive", () => {
    const before = makeSections();
    const after = docToStoreSections(sectionsToDoc(before), before);

    expect(after.map((s) => s.id)).toEqual(["sec-technique", "sec-findings", "sec-impression"]);
    expect(after.map((s) => s.kind)).toEqual(["prose", "findings", "prose"]);
    expect(after[0].html).toBe("<p>CT of the chest was performed.</p>");
    expect(after[2].isConclusion).toBe(true);

    const [liver, flat] = after[1].findings!;
    expect(liver.id).toBe("fnd-liver");
    expect(liver.region).toBe("Liver");
    expect(liver.items[0]).toMatchObject({ id: "itm-liver", text: "The liver is normal." });
    expect(liver.subpoints).toEqual([
      { id: "sp-size", text: "Size: normal" },
      { id: "sp-echo", text: "Echotexture: uniform", level: 1 },
    ]);
    expect(flat.id).toBe("fnd-flat");
    expect(flat.abnormal).toBe(true);
    expect(flat.items[0].impression).toBe("Cardiomegaly.");
  });

  it("is stable across repeated projections (no id churn)", () => {
    const before = makeSections();
    const once = docToStoreSections(sectionsToDoc(before), before);
    const twice = docToStoreSections(sectionsToDoc(once), once);
    expect(twice).toEqual(once);
  });

  it("persists a list style changed in the live document", () => {
    const before = makeSections();
    before[1].bulletStyle = "disc";
    const doc = sectionsToDoc(before);
    const findingsList = doc.content!.find((node) => node.type === "bulletList")!;
    findingsList.attrs = { ...findingsList.attrs, listStyle: "square" };

    const after = docToStoreSections(doc, before);

    expect(after[1].bulletStyle).toBe("square");
    expect(sectionsToDoc(after).content!.find((node) => node.type === "bulletList")?.attrs?.listStyle)
      .toBe("square");
  });

  it("merges a deleted heading's content into the previous section without loss", () => {
    const before = makeSections();
    const doc = sectionsToDoc(before);
    // the radiologist deletes the IMPRESSION heading
    doc.content = doc.content!.filter(
      (n) => !(n.type === "heading" && n.content?.[0]?.text === "Impression")
    );
    const after = docToStoreSections(doc, before);
    expect(after).toHaveLength(2);
    // the findings section now carries prose too, so it projects as prose —
    // with every line of both sections still present
    expect(after[1].kind).toBe("prose");
    expect(after[1].html).toContain("The liver is normal.");
    expect(after[1].html).toContain("No acute abnormality.");
  });

  it("projects content typed before the first heading into a preamble section", () => {
    const before = makeSections();
    const doc = sectionsToDoc(before);
    doc.content = [
      { type: "paragraph", content: [{ type: "text", text: "CT CHEST WITHOUT CONTRAST" }] },
      ...doc.content!,
    ];
    const after = docToStoreSections(doc, before);
    expect(after[0]).toMatchObject({
      id: PREAMBLE_ID,
      name: "",
      kind: "prose",
      html: "<p>CT CHEST WITHOUT CONTRAST</p>",
    });
    // and the preamble round-trips without growing a heading
    const again = docToStoreSections(sectionsToDoc(after), after);
    expect(again).toEqual(after);
  });

  it("keeps a brand-new user-typed heading as a new prose section", () => {
    const before = makeSections();
    const doc = sectionsToDoc(before);
    const extra: JSONContent[] = [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "COMPARISON" }] },
      { type: "paragraph", content: [{ type: "text", text: "None available." }] },
    ];
    doc.content = [...doc.content!.slice(0, 2), ...extra, ...doc.content!.slice(2)];
    const after = docToStoreSections(doc, before);
    expect(after).toHaveLength(4);
    expect(after[1]).toMatchObject({ name: "COMPARISON", kind: "prose", html: "<p>None available.</p>" });
    // existing sections still inherit their ids
    expect(after[2].id).toBe("sec-findings");
  });

  it("maps plain paragraphs under a newly authored Findings heading to stable finding rows", () => {
    const newDocument: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "FINDINGS" }],
        },
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
      ],
    };

    const once = docToStoreSections(newDocument, []);
    expect(once[0]).toMatchObject({ kind: "findings", grouped: true });
    expect(once[0].findings?.map((finding) => finding.region)).toEqual(["Liver", "Lungs"]);
    expect(once[0].findings?.map((finding) => finding.items[0].text)).toEqual([
      "The liver is normal.",
      "The lungs are clear.",
    ]);

    const twice = docToStoreSections(newDocument, once);
    expect(twice[0].id).toBe(once[0].id);
    expect(twice[0].findings?.map((finding) => finding.items[0].id)).toEqual(
      once[0].findings?.map((finding) => finding.items[0].id)
    );
  });

  it("keeps paragraph-based findings addressable when another row is added", () => {
    const document: JSONContent = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Findings" }] },
        { type: "paragraph", content: [{ type: "text", text: "Clear lungs." }] },
      ],
    };
    const before = docToStoreSections(document, []);
    document.content!.push({
      type: "paragraph",
      content: [{ type: "text", text: "Additional observation." }],
    });

    const after = docToStoreSections(document, before);
    expect(after[0].kind).toBe("findings");
    expect(after[0].findings?.at(-1)?.items[0].text).toBe("Additional observation.");
    expect(after[0].findings?.[0].items[0].id).toBe(before[0].findings?.[0].items[0].id);
  });
});
