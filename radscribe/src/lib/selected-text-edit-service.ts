import type { Editor } from "@tiptap/react";
import { aiApi } from "@/services/ai.api";
import { validateMedicalEdit } from "./medical-edit-safety";
import type { SelectedTextEditAction } from "./voice-edit-command-parser";
import { useReportStore } from "@/store/reportStore";

export interface SelectedTextRange {
  from: number;
  to: number;
  text: string;
}

function asBulletList(text: string) {
  const items = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•◦▪▫–—]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  if (items.length < 2) return text;
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
    })),
  };
}

function replacementFor(action: SelectedTextEditAction, text: string) {
  if (action === "bullets" || action === "split") return asBulletList(text);
  if (action === "paragraph" || action === "combine") return text.replace(/\s*\n+\s*/g, " ").trim();
  return text;
}

// Replaces exactly the captured ProseMirror range. TipTap records this as one
// history transaction, so native Undo/Redo works without a separate stack.
export async function applySelectedTextEdit({
  editor,
  range,
  instruction,
  action,
}: {
  editor: Editor;
  range: SelectedTextRange;
  instruction: string;
  action: SelectedTextEditAction;
}): Promise<string> {
  const current = editor.state.doc.textBetween(range.from, range.to, "\n");
  if (current !== range.text) {
    throw new Error("The selected text changed before the edit was applied");
  }

  const reportId = useReportStore.getState().activeReportId;
  if (!reportId) throw new Error("No active report");
  const { text } = await aiApi.editSelection(
    range.text,
    instruction,
    action,
    reportId
  );
  const edited = text.trim();
  const explicitlyRemovingSelection = /\b(?:remove|delete)\s+(?:(?:this|the)\s+)?(?:selected\s+)?(?:sentence|text|selection|finding)\b/i.test(
    instruction
  );
  if (!edited && !explicitlyRemovingSelection) throw new Error("The edit returned no text");

  const safety = validateMedicalEdit(range.text, edited, instruction);
  if (!safety.safe) {
    throw new Error(`Edit blocked: it changed ${safety.unexpectedFields.join(", ")}`);
  }

  const chain = editor.chain().focus().setTextSelection({ from: range.from, to: range.to });
  if (!edited) {
    chain.deleteSelection().run();
  } else {
    chain
      .insertContentAt({ from: range.from, to: range.to }, replacementFor(action, edited), {
        updateSelection: true,
      })
      .run();
  }
  return edited;
}
