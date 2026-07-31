import type { Editor } from "@tiptap/core";
import type { ListPreset } from "@/lib/bullets";

/**
 * Apply a three-level list preset to every unordered list in the document.
 * The hierarchy repeats for deeper nesting, matching the report settings and
 * Word's multilevel-list behavior.
 */
export function applyListPresetToEditor(editor: Editor, preset: ListPreset): boolean {
  const { state, view } = editor;
  let transaction = state.tr;
  let changed = false;

  state.doc.descendants((node, position) => {
    if (node.type.name !== "bulletList") return true;

    // position points immediately before this list, so its resolved parent
    // path contains each ancestor list but not the current one.
    const resolved = state.doc.resolve(position);
    let listDepth = 0;
    for (let depth = 0; depth <= resolved.depth; depth += 1) {
      if (resolved.node(depth).type.name === "bulletList") listDepth += 1;
    }

    const listStyle = preset.levels[listDepth % preset.levels.length];
    if (node.attrs.listStyle !== listStyle) {
      transaction = transaction.setNodeMarkup(position, undefined, {
        ...node.attrs,
        listStyle,
      });
      changed = true;
    }
    return true;
  });

  if (changed) view.dispatch(transaction);
  return changed;
}
