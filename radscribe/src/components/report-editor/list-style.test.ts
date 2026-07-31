import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { REPORT_EXTENSIONS } from "@/lib/report-doc";
import { LIST_PRESETS } from "@/lib/bullets";
import { applyListPresetToEditor } from "./list-style";

const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const item = (text: string, nested?: JSONContent): JSONContent => ({
  type: "listItem",
  content: [paragraph(text), ...(nested ? [nested] : [])],
});

const list = (items: JSONContent[]): JSONContent => ({
  type: "bulletList",
  content: items,
});

describe("applyListPresetToEditor", () => {
  let editor: Editor | undefined;

  afterEach(() => editor?.destroy());

  it("restyles all bullet lists using their nesting depth", () => {
    const thirdLevel = list([item("Parameter")]);
    const secondLevel = list([item("Finding", thirdLevel)]);
    const firstList = list([item("Organ", secondLevel)]);
    const secondList = list([item("Another organ")]);
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: { type: "doc", content: [firstList, secondList] },
    });

    const preset = LIST_PRESETS.find((candidate) => candidate.id === "square-hollowsq-circle")!;
    expect(applyListPresetToEditor(editor, preset)).toBe(true);

    const styles: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "bulletList") styles.push(node.attrs.listStyle);
      return true;
    });
    expect(styles).toEqual(["square", "square-hollow", "circle", "square"]);
    expect(editor.getHTML()).toContain('data-list-style="square-hollow"');
  });

  it("does not create a document change when the preset is already applied", () => {
    const preset = LIST_PRESETS[0];
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: {
        type: "doc",
        content: [{ ...list([item("Already styled")]), attrs: { listStyle: preset.levels[0] } }],
      },
    });

    expect(applyListPresetToEditor(editor, preset)).toBe(false);
  });
});
