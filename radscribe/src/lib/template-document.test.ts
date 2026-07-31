import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import type { Template } from "@/types";
import {
  documentToTemplateSections,
  normalizeTemplateDocument,
  templateInitialDocument,
  templateToReportSections,
} from "./template-document";

const document: JSONContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2, textAlign: "left" },
      content: [{ type: "text", text: "Technique" }],
    },
    {
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [{ type: "text", text: "CT chest without contrast.", marks: [{ type: "underline" }] }],
    },
    {
      type: "heading",
      attrs: { level: 2, textAlign: "left" },
      content: [{ type: "text", text: "Findings" }],
    },
    {
      type: "bulletList",
      attrs: { listStyle: "dash" },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Pleura:", marks: [{ type: "bold" }] },
                { type: "text", text: " No pleural effusion." },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const template: Template = {
  id: "template-1",
  name: "CT Chest",
  modality: "CT",
  bodyPart: "Chest",
  document,
  sections: [],
};

describe("template document persistence", () => {
  it("reopens the exact canonical document as an independent clone", () => {
    const reopened = templateInitialDocument(template);
    expect(reopened).toEqual(document);
    expect(reopened).not.toBe(document);
  });

  it("derives legacy routing sections without flattening the canonical document", () => {
    const sections = documentToTemplateSections(document);
    expect(sections.map((section) => section.name)).toEqual(["Technique", "Findings"]);
    expect(sections[0].defaultProse).toContain("text-align: center");
    expect(sections[0].defaultProse).toContain("<u>CT chest without contrast.</u>");
    expect(sections[1]).toMatchObject({
      kind: "findings",
      grouped: true,
      bulletStyle: "dash",
      findings: [{ region: "Pleura", normalText: "No pleural effusion." }],
    });
  });

  it("creates independent report sections from the saved document", () => {
    const report = templateToReportSections(template);
    expect(report[0]).toMatchObject({ name: "Technique", kind: "prose" });
    expect(report[1]).toMatchObject({ name: "Findings", kind: "findings" });
    report[0].name = "Changed in report";
    expect(document.content?.[0].content?.[0].text).toBe("Technique");
  });

  it("promotes exact known section-name paragraphs to real headings", () => {
    const legacyDocument: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { aiId: "same-id" },
          content: [{ type: "text", text: "technique" }],
        },
        {
          type: "paragraph",
          attrs: { aiId: "same-id" },
          content: [{ type: "text", text: "findings" }],
        },
        {
          type: "paragraph",
          attrs: { aiId: "same-id" },
          content: [{ type: "text", text: "conclusion" }],
        },
      ],
    };

    const normalized = normalizeTemplateDocument(legacyDocument);
    expect(normalized.content?.map((node) => node.type)).toEqual([
      "heading",
      "heading",
      "heading",
    ]);
    expect(normalized.content?.map((node) => node.attrs?.sectionKey)).toEqual([
      "technique",
      "findings",
      "impression",
    ]);

    const legacyTemplate: Template = {
      ...template,
      document: legacyDocument,
    };
    expect(templateToReportSections(legacyTemplate).map((section) => section.name)).toEqual([
      "technique",
      "findings",
      "conclusion",
    ]);
  });
});
