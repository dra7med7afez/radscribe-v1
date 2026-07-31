import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyDocumentEdits,
  applyDocumentEditsWithTargets,
  getDocumentTree,
} from "./document-ai";
import { REPORT_EXTENSIONS } from "./report-doc";

const text = (value: string, bold = false): JSONContent => ({
  type: "text",
  text: value,
  ...(bold ? { marks: [{ type: "bold" }] } : {}),
});

function makeEditor() {
  return new Editor({
    extensions: REPORT_EXTENSIONS,
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("FINDINGS")] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [text("Lungs:", true), text(" Clear bilaterally.")],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [text("Pleura:", true), text(" No pleural effusion.")],
                },
              ],
            },
          ],
        },
        { type: "heading", attrs: { level: 2 }, content: [text("IMPRESSION")] },
        { type: "paragraph", content: [text("No acute abnormality.")] },
      ],
    },
  });
}

function nodesOfType(node: ReturnType<typeof getDocumentTree>, type: string): typeof node[] {
  const result: typeof node[] = [];
  if (node.type === type) result.push(node);
  node.children?.forEach((child) => result.push(...nodesOfType(child, type)));
  return result;
}

describe("document-native AI mapping and insertion", () => {
  let editor: Editor | null = null;
  afterEach(() => editor?.destroy());

  it("maps the complete ordered tree with stable ids, text, marks, and list hierarchy", () => {
    editor = makeEditor();
    const first = getDocumentTree(editor);
    const second = getDocumentTree(editor);

    expect(second).toEqual(first);
    expect(nodesOfType(first, "heading").map((node) => node.children?.[0].text)).toEqual([
      "FINDINGS",
      "IMPRESSION",
    ]);
    expect(nodesOfType(first, "paragraph")).toHaveLength(3);
    expect(nodesOfType(first, "paragraph").every((node) => !!node.id)).toBe(true);
    expect(nodesOfType(first, "bulletList")[0].children).toHaveLength(2);
    expect(nodesOfType(first, "paragraph")[0].children?.[0]).toMatchObject({
      text: "Lungs:",
      marks: ["bold"],
    });
  });

  it("repairs duplicate saved AI ids before sending the document tree", () => {
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2, aiId: "duplicate-id" },
            content: [text("Technique")],
          },
          {
            type: "heading",
            attrs: { level: 2, aiId: "duplicate-id" },
            content: [text("Findings")],
          },
          {
            type: "heading",
            attrs: { level: 2, aiId: "duplicate-id" },
            content: [text("Conclusion")],
          },
        ],
      },
    });

    const headings = nodesOfType(getDocumentTree(editor), "heading");
    const ids = headings.map((node) => node.id);
    expect(ids[0]).toBe("duplicate-id");
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(Boolean)).toBe(true);
  });

  it("replaces only the exact paragraph id and preserves its bold label and neighbors", () => {
    editor = makeEditor();
    const tree = getDocumentTree(editor);
    const paragraphs = nodesOfType(tree, "paragraph");
    const beforePleura = paragraphs[1];
    const beforeImpression = paragraphs[2];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: paragraphs[0].id!,
          operation: "replace",
          text: "A 7 mm right upper lobe pulmonary nodule is present.",
        },
      ])
    ).toBe(1);

    const after = getDocumentTree(editor);
    const afterParagraphs = nodesOfType(after, "paragraph");
    expect(afterParagraphs[0].children?.map((node) => node.text).join(""))
      .toBe("Lungs: A 7 mm right upper lobe pulmonary nodule is present.");
    expect(afterParagraphs[1]).toEqual(beforePleura);
    expect(afterParagraphs[2]).toEqual(beforeImpression);
  });

  it("inserts a genuinely new list finding as a sibling after the targeted item", () => {
    editor = makeEditor();
    const tree = getDocumentTree(editor);
    const paragraphs = nodesOfType(tree, "paragraph");

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: paragraphs[0].id!,
          operation: "insertAfter",
          text: "Mediastinum: No lymphadenopathy.",
        },
      ])
    ).toBe(1);

    const after = getDocumentTree(editor);
    const list = nodesOfType(after, "bulletList")[0];
    expect(list.children).toHaveLength(3);
    expect(nodesOfType(list.children![1], "paragraph")[0].children?.[0].text).toBe(
      "Mediastinum: No lymphadenopathy."
    );
  });

  it("inserts unmatched text immediately beneath its correct section heading", () => {
    editor = makeEditor();
    const findingsHeading = nodesOfType(getDocumentTree(editor), "heading")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: findingsHeading.id!,
          operation: "insertAfter",
          text: "No free intraperitoneal gas.",
        },
      ])
    ).toBe(1);

    const document = getDocumentTree(editor);
    expect(document.children?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "heading",
      "paragraph",
    ]);
    expect(document.children?.[1].children?.[0].text).toBe(
      "No free intraperitoneal gas."
    );
  });

  it("fills heading-only Technique, Findings, and Conclusion sections without creating organs", () => {
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [text("Technique")] },
          { type: "heading", attrs: { level: 2 }, content: [text("Findings")] },
          { type: "heading", attrs: { level: 2 }, content: [text("Conclusion")] },
        ],
      },
    });
    const before = getDocumentTree(editor);
    const headings = nodesOfType(before, "heading");

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: headings[0].id!,
          operation: "insertAfter",
          text: "CT chest without intravenous contrast.",
        },
        {
          targetNodeId: headings[1].id!,
          operation: "insertAfter",
          text: "Right upper lobe 7 mm solid nodule.",
        },
        {
          targetNodeId: headings[2].id!,
          operation: "insertAfter",
          text: "Indeterminate right upper lobe pulmonary nodule.",
        },
      ])
    ).toBe(3);

    const after = getDocumentTree(editor);
    expect(after.children?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ]);
    expect(nodesOfType(after, "heading").map((node) => node.children?.[0].text)).toEqual([
      "Technique",
      "Findings",
      "Conclusion",
    ]);
    expect(nodesOfType(after, "paragraph").map((node) => node.children?.[0].text)).toEqual([
      "CT chest without intravenous contrast.",
      "Right upper lobe 7 mm solid nodule.",
      "Indeterminate right upper lobe pulmonary nodule.",
    ]);
    expect(nodesOfType(after, "bulletList")).toHaveLength(0);
  });

  it("fills an empty Comparison paragraph instead of adding another section or line", () => {
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [text("COMPARISON")] },
          { type: "paragraph" },
          { type: "heading", attrs: { level: 2 }, content: [text("FINDINGS")] },
          { type: "paragraph", content: [text("No acute abnormality.")] },
        ],
      },
    });
    const before = getDocumentTree(editor);
    const comparisonParagraph = nodesOfType(before, "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: comparisonParagraph.id!,
          operation: "replace",
          text: "Compared with CT dated 15 July 2026.",
        },
      ])
    ).toBe(1);

    const after = getDocumentTree(editor);
    expect(after.children?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ]);
    expect(after.children?.[1].children?.[0].text).toBe(
      "Compared with CT dated 15 July 2026."
    );
  });

  it("places separate lesions before the retained organ normal line in final order", () => {
    editor = makeEditor();
    const normalLung = nodesOfType(getDocumentTree(editor), "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: normalLung.id!,
          operation: "insertBefore",
          text: "A well-defined right upper lobe pulmonary nodule is seen.",
        },
        {
          targetNodeId: normalLung.id!,
          operation: "insertBefore",
          text: "A second right lower lobe pulmonary nodule is seen.",
        },
        {
          targetNodeId: normalLung.id!,
          operation: "replace",
          text: "The remaining lungs are clear.",
        },
      ])
    ).toBe(3);

    const list = nodesOfType(getDocumentTree(editor), "bulletList")[0];
    expect(nodesOfType(list, "paragraph").map((node) =>
      node.children?.map((child) => child.text).join("")
    )).toEqual([
      "A well-defined right upper lobe pulmonary nodule is seen.",
      "A second right lower lobe pulmonary nodule is seen.",
      "Lungs: The remaining lungs are clear.",
      "Pleura: No pleural effusion.",
    ]);
  });

  it("keeps one organ parent and places two findings in separate child bullets", () => {
    editor = makeEditor();
    const lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "setOrganChildren",
          text: "Lungs",
          children: [
            "Lungs, Right upper lobe: Single 8 mm rounded well-defined solid nodule.",
            "Lungs: Left lower lobe: Single 5 mm spiculated ground-glass nodule.",
            "Remaining lungs are clear.",
          ],
        },
      ])
    ).toBe(3);

    const tree = getDocumentTree(editor);
    const topLevelList = nodesOfType(tree, "bulletList")[0];
    expect(topLevelList.children).toHaveLength(2);
    const lungsItem = topLevelList.children![0];
    expect(lungsItem.children?.[0].children?.map((node) => node.text).join("")).toBe(
      "Lungs:"
    );
    expect(lungsItem.children?.[0].children?.[0].marks).toEqual(["bold"]);
    const lungChildren = nodesOfType(lungsItem, "bulletList")[0];
    expect(nodesOfType(lungChildren, "paragraph").map((node) =>
      node.children?.map((child) => child.text).join("")
    )).toEqual([
      "Right upper lobe: Single 8 mm rounded well-defined solid nodule.",
      "Left lower lobe: Single 5 mm spiculated ground-glass nodule.",
      "Remaining lungs are clear.",
    ]);
  });

  it("keeps one finding beside its organ on the same line", () => {
    editor = makeEditor();
    const lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "setOrganChildren",
          text: "Lungs",
          children: [
            "Lungs, Right upper lobe: Single 8 mm well-defined nodule. Remaining lungs are clear.",
          ],
        },
      ])
    ).toBe(1);

    const topLevelList = nodesOfType(getDocumentTree(editor), "bulletList")[0];
    const lungsItem = topLevelList.children![0];
    expect(nodesOfType(lungsItem, "bulletList")).toHaveLength(0);
    expect(nodesOfType(lungsItem, "paragraph")[0].children).toEqual([
      expect.objectContaining({ text: "Lungs:", marks: ["bold"] }),
      expect.objectContaining({
        text: " Right upper lobe: Single 8 mm well-defined nodule. Remaining lungs are clear.",
      }),
    ]);
  });

  it("removes a repeated copular organ prefix without leaving broken grammar", () => {
    editor = makeEditor();
    const lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "setOrganChildren",
          text: "Lungs",
          children: ["Lungs are hyperinflated."],
        },
      ])
    ).toBe(1);

    const paragraph = nodesOfType(getDocumentTree(editor), "paragraph")[0];
    expect(paragraph.children?.map((node) => node.text).join("")).toBe(
      "Lungs: Hyperinflated."
    );
  });

  it("updates the existing organ children without creating the organ again", () => {
    editor = makeEditor();
    let lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];
    applyDocumentEdits(editor, [
      {
        targetNodeId: lungs.id!,
        operation: "setOrganChildren",
        text: "Lungs",
        children: [
          "Right upper lobe: Single 8 mm well-defined nodule.",
          "Remaining lungs are clear.",
        ],
      },
    ]);

    lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];
    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "setOrganChildren",
          text: "Lungs",
          children: [
            "Right upper lobe: Single 8 mm well-defined nodule.",
            "Left lower lobe: Single 5 mm spiculated nodule.",
            "Remaining lungs are clear.",
          ],
        },
      ])
    ).toBe(3);

    const topLevelList = nodesOfType(getDocumentTree(editor), "bulletList")[0];
    expect(topLevelList.children).toHaveLength(2);
    expect(nodesOfType(topLevelList, "paragraph").filter((node) =>
      node.children?.map((child) => child.text).join("") === "Lungs:"
    )).toHaveLength(1);
  });

  it("inserts a missing organ once with organ-only heading and child findings", () => {
    editor = makeEditor();
    const lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "insertOrganAfter",
          text: "Liver",
          children: [
            "Segment VII: Single 2 cm well-defined cyst.",
            "Segment II: Single 1 cm hypodense lesion.",
          ],
        },
      ])
    ).toBe(2);

    const topLevelList = nodesOfType(getDocumentTree(editor), "bulletList")[0];
    expect(topLevelList.children).toHaveLength(3);
    const liverItem = topLevelList.children![1];
    expect(liverItem.children?.[0].children?.map((node) => node.text).join("")).toBe(
      "Liver:"
    );
    expect(nodesOfType(liverItem, "paragraph").map((node) =>
      node.children?.map((child) => child.text).join("")
    )).toEqual([
      "Liver:",
      "Segment VII: Single 2 cm well-defined cyst.",
      "Segment II: Single 1 cm hypodense lesion.",
    ]);
  });

  it("rejects a subsegment or organ part as a generated heading", () => {
    editor = makeEditor();
    const lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];
    const before = editor.getJSON();

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "insertOrganAfter",
          text: "Right upper lobe",
          children: ["Single 8 mm nodule."],
        },
      ])
    ).toBe(0);
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps repeated insert-after edits in the model's requested order", () => {
    editor = makeEditor();
    const lungs = nodesOfType(getDocumentTree(editor), "paragraph")[0];

    expect(
      applyDocumentEdits(editor, [
        {
          targetNodeId: lungs.id!,
          operation: "insertAfter",
          text: "Mediastinum: No lymphadenopathy.",
        },
        {
          targetNodeId: lungs.id!,
          operation: "insertAfter",
          text: "Heart: Normal size.",
        },
      ])
    ).toBe(2);

    const list = nodesOfType(getDocumentTree(editor), "bulletList")[0];
    expect(nodesOfType(list, "paragraph").map((node) =>
      node.children?.map((child) => child.text).join("")
    )).toEqual([
      "Lungs: Clear bilaterally.",
      "Mediastinum: No lymphadenopathy.",
      "Heart: Normal size.",
      "Pleura: No pleural effusion.",
    ]);
  });

  it("returns the stable id of a newly inserted finding for safe follow-up edits", () => {
    editor = makeEditor();
    const paragraph = nodesOfType(getDocumentTree(editor), "paragraph")[0];
    const applied = applyDocumentEditsWithTargets(editor, [
      {
        targetNodeId: paragraph.id!,
        operation: "insertAfter",
        text: "Mediastinum: No lymphadenopathy.",
      },
    ]);

    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      operation: "replace",
      text: "Mediastinum: No lymphadenopathy.",
    });
    expect(applied[0].targetNodeId).not.toBe(paragraph.id);
    expect(nodesOfType(getDocumentTree(editor), "paragraph").some(
      (node) => node.id === applied[0].targetNodeId
    )).toBe(true);
  });

  it("fails closed for stale ids", () => {
    editor = makeEditor();
    getDocumentTree(editor);
    const before = editor.getJSON();
    expect(
      applyDocumentEdits(editor, [
        { targetNodeId: "missing", operation: "replace", text: "Unsafe." },
      ])
    ).toBe(0);
    expect(editor.getJSON()).toEqual(before);
  });
});
