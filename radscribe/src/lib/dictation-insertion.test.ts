import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { REPORT_EXTENSIONS } from "./report-doc";
import { insertDictation } from "./dictation-insertion";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function createEditor(content: string) {
  editor = new Editor({ extensions: REPORT_EXTENSIONS, content });
  return editor;
}

describe("insertDictation", () => {
  it("inserts a transcript at a collapsed caret with natural spacing", () => {
    const instance = createEditor("<p>Normal</p>");

    expect(insertDictation(instance, "heart size.", { from: 7, to: 7 })).toBe(true);
    expect(instance.getText()).toBe("Normal heart size.");
  });

  it("replaces the captured floating-toolbar selection", () => {
    const instance = createEditor("<p>No pleural effusion.</p>");

    expect(insertDictation(instance, "Small left pleural effusion.", { from: 1, to: 21 })).toBe(true);
    expect(instance.getText()).toBe("Small left pleural effusion.");
  });

  it("keeps dictated heading text on one line", () => {
    const instance = createEditor("<h2>Findings</h2>");

    expect(insertDictation(instance, "and impression\nsummary", { from: 9, to: 9 })).toBe(true);
    expect(instance.getJSON().content?.[0]).toMatchObject({
      type: "heading",
      content: [{ type: "text", text: "Findings and impression summary" }],
    });
  });
});
