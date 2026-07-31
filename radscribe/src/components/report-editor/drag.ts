// ============================================================
// drag — moving nodes of the continuous report document.
//
// A drop is applied as ONE ProseMirror transaction: the node (or the
// heading plus its whole section) is deleted at its old position and
// inserted at the target boundary. The caret lands on the moved content
// and the move sits in the editor's history, so Ctrl+Z undoes a drag
// exactly like any other edit. The store catches up through the normal
// projection.
//
// Units:
//   listItem — the hovered list row (moves between rows of any list, or
//              to a top-level boundary, where it wraps in a new list)
//   section  — a heading moves together with everything after it up to
//              the next heading of equal or higher level
//   block    — any other top-level node (paragraph, list)
// ============================================================

import type { Editor } from "@tiptap/core";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

export interface DragUnit {
  kind: "block" | "section" | "listItem";
  from: number;
  to: number;
  // the list the item came from — used to wrap it on a top-level drop
  listTypeName?: string;
  listAttrs?: Record<string, unknown> | null;
}

// End of the section that starts at the heading at `headingPos`: content
// runs until the next top-level heading of equal or higher level.
export function sectionEnd(doc: PMNode, headingPos: number): number {
  const heading = doc.nodeAt(headingPos);
  if (!heading) return headingPos;
  const level = (heading.attrs.level as number) ?? 1;
  const after = headingPos + heading.nodeSize;
  let end = doc.content.size;
  doc.forEach((child, offset) => {
    if (offset < after || end !== doc.content.size) return;
    if (child.type.name === "heading" && ((child.attrs.level as number) ?? 1) <= level) {
      end = offset;
    }
  });
  return end;
}

// The draggable unit for the node starting at `pos` (a top-level offset
// or a listItem position).
export function dragUnitAt(doc: PMNode, pos: number): DragUnit | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;
  if (node.type.name === "listItem") {
    const $pos = doc.resolve(pos);
    return {
      kind: "listItem",
      from: pos,
      to: pos + node.nodeSize,
      listTypeName: $pos.parent.type.name,
      listAttrs: $pos.parent.attrs,
    };
  }
  if (node.type.name === "heading") {
    return { kind: "section", from: pos, to: sectionEnd(doc, pos) };
  }
  return { kind: "block", from: pos, to: pos + node.nodeSize };
}

// boundaries between top-level nodes (including doc start and end)
export function topLevelBoundaries(doc: PMNode): number[] {
  const out: number[] = [];
  doc.forEach((_node, offset) => out.push(offset));
  out.push(doc.content.size);
  return out;
}

// boundaries between the items of every list in the document
export function listItemBoundaries(doc: PMNode): number[] {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "bulletList" && node.type.name !== "orderedList") return true;
    node.forEach((_child, childOffset) => out.push(pos + 1 + childOffset));
    out.push(pos + 1 + node.content.size);
    return true;
  });
  return out;
}

// Every position the unit may be dropped at. Positions inside (or equal
// to the edges of) the dragged range are excluded — they are no-ops.
export function validSlots(doc: PMNode, unit: DragUnit): number[] {
  const slots =
    unit.kind === "listItem"
      ? [...topLevelBoundaries(doc), ...listItemBoundaries(doc)]
      : topLevelBoundaries(doc);
  return slots.filter((p) => p < unit.from || p > unit.to);
}

// Delete the unit and re-insert it at `slotPos` (a position in the
// pre-move document). Returns false when the drop is not possible.
export function performMove(editor: Editor, unit: DragUnit, slotPos: number): boolean {
  if (slotPos >= unit.from && slotPos <= unit.to) return false;
  const { state, view } = editor;
  const slice = state.doc.slice(unit.from, unit.to);
  const tr = state.tr;
  tr.delete(unit.from, unit.to);

  const pos = tr.mapping.map(slotPos);
  const $pos = tr.doc.resolve(pos);
  let content: Fragment = slice.content;
  if (unit.kind === "listItem" && $pos.depth === 0) {
    // a list row dropped between top-level blocks becomes its own list
    const listType = state.schema.nodes[unit.listTypeName || "bulletList"];
    if (!listType) return false;
    content = Fragment.from(listType.create(unit.listAttrs || null, content));
  }
  const index = $pos.index();
  if (!$pos.parent.canReplace(index, index, content)) return false;

  tr.insert(pos, content);
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size)))
  );
  view.dispatch(tr.scrollIntoView());
  return true;
}
