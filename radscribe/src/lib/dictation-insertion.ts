import type { Editor } from "@tiptap/react";

export interface DictationRange {
  from: number;
  to: number;
}

// Inserts a transcript exactly where dictation started. A captured range keeps
// floating-toolbar dictation deterministic even if the DOM selection changes
// while the microphone or transcription request is active.
export function insertDictation(
  editor: Editor,
  text: string,
  range: DictationRange = {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  }
): boolean {
  const transcript = text.trim();
  if (!transcript || editor.isDestroyed) return false;

  const max = editor.state.doc.content.size;
  if (range.from < 0 || range.to < range.from || range.to > max) return false;

  const $from = editor.state.doc.resolve(range.from);
  const prev = ($from.nodeBefore?.text || "").slice(-1);
  const lead =
    $from.parentOffset > 0 && prev && !/\s/.test(prev) && !/[([{“"']/.test(prev)
      ? " "
      : "";

  // Headings are one-line textblocks. Inserting a string there would be parsed
  // as block HTML and could split the heading, so use an explicit text node.
  const oneLine = $from.parent.type.name === "heading";
  const content = oneLine
    ? { type: "text" as const, text: (lead + transcript).replace(/\s*\n+\s*/g, " ") }
    : lead + transcript;

  return editor
    .chain()
    .focus()
    .setTextSelection(range)
    .insertContent(content)
    .run();
}
