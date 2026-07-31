import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REPORT_EXTENSIONS } from "./report-doc";
import { aiApi } from "@/services/ai.api";
import { applySelectedTextEdit } from "./selected-text-edit-service";
import { useReportStore } from "@/store/reportStore";

let editor: Editor | null = null;

afterEach(() => {
  vi.restoreAllMocks();
  editor?.destroy();
  editor = null;
  useReportStore.getState().setPersistence(null, 0, "DRAFT");
});

describe("applySelectedTextEdit", () => {
  it("applies to the captured range after toolbar focus changes the live selection", async () => {
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: "<p>No pleural effusion</p>",
    });
    const range = { from: 1, to: 20, text: "No pleural effusion" };
    editor.commands.setTextSelection(1);
    vi.spyOn(aiApi, "editSelection").mockResolvedValue({ text: "No pleural effusion." });
    useReportStore.getState().setPersistence("report-1", 0, "DRAFT");

    await applySelectedTextEdit({
      editor,
      range,
      instruction: "Improve grammar without changing clinical facts.",
      action: "grammar",
    });

    expect(editor.getText()).toBe("No pleural effusion.");
  });

  it("rejects a captured range when its document text changed", async () => {
    editor = new Editor({
      extensions: REPORT_EXTENSIONS,
      content: "<p>No pleural effusion</p>",
    });
    const editSpy = vi.spyOn(aiApi, "editSelection");

    await expect(
      applySelectedTextEdit({
        editor,
        range: { from: 1, to: 20, text: "Different selected text" },
        instruction: "Improve grammar without changing clinical facts.",
        action: "grammar",
      })
    ).rejects.toThrow("selected text changed");
    expect(editSpy).not.toHaveBeenCalled();
  });
});
