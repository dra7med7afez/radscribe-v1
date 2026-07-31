import { Extension, type JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { uid } from "./utils";
import type { DocumentEditResult, DocumentTreeNode } from "@/types";

const ADDRESSABLE_TYPES = ["heading", "paragraph", "bulletList", "orderedList", "listItem"];

function nextNodeId() {
  return uid("node");
}

function nextUniqueNodeId(seen: Set<string>) {
  let id = nextNodeId();
  while (seen.has(id)) id = nextNodeId();
  seen.add(id);
  return id;
}

// Every addressable block in the live document carries an immutable AI id.
// The id is document metadata, not radiology semantics: section names, organ
// labels, list depth, and wording can all change without changing the target.
export const DocumentAiIds = Extension.create({
  name: "documentAiIds",

  addGlobalAttributes() {
    return [
      {
        types: ADDRESSABLE_TYPES,
        attributes: {
          aiId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-ai-id"),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.aiId ? { "data-ai-id": String(attributes.aiId) } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("documentAiIds"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          let transaction = newState.tr;
          let changed = false;
          const seen = new Set<string>();
          newState.doc.descendants((node, position) => {
            if (!ADDRESSABLE_TYPES.includes(node.type.name)) return true;
            const currentId =
              typeof node.attrs.aiId === "string" ? node.attrs.aiId.trim() : "";
            if (currentId && !seen.has(currentId)) {
              seen.add(currentId);
              return true;
            }
            transaction = transaction
              .setNodeMarkup(position, undefined, {
                ...node.attrs,
                aiId: nextUniqueNodeId(seen),
              })
              .setMeta("addToHistory", false);
            changed = true;
            return true;
          });
          return changed ? transaction : null;
        },
      }),
    ];
  },
});

// Initial content exists before appendTransaction has seen a document change.
export function ensureDocumentNodeIds(editor: Editor) {
  let transaction = editor.state.tr;
  let changed = false;
  const seen = new Set<string>();
  editor.state.doc.descendants((node, position) => {
    if (!ADDRESSABLE_TYPES.includes(node.type.name)) return true;
    const currentId =
      typeof node.attrs.aiId === "string" ? node.attrs.aiId.trim() : "";
    if (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      return true;
    }
    transaction = transaction
      .setNodeMarkup(position, undefined, {
        ...node.attrs,
        aiId: nextUniqueNodeId(seen),
      })
      .setMeta("addToHistory", false);
    changed = true;
    return true;
  });
  if (changed) editor.view.dispatch(transaction);
}

function toTree(node: JSONContent): DocumentTreeNode {
  const attrs = { ...(node.attrs || {}) };
  const id = typeof attrs.aiId === "string" ? attrs.aiId : undefined;
  delete attrs.aiId;
  return {
    ...(id ? { id } : {}),
    type: node.type || "unknown",
    ...(node.text ? { text: node.text } : {}),
    ...(node.marks?.length ? { marks: node.marks.map((mark) => mark.type) } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(node.content?.length ? { children: node.content.map(toTree) } : {}),
  };
}

export function getDocumentTree(editor: Editor): DocumentTreeNode {
  ensureDocumentNodeIds(editor);
  return toTree(editor.getJSON());
}

interface LocatedNode {
  node: ProseMirrorNode;
  position: number;
}

function findNode(document: ProseMirrorNode, id: string): LocatedNode | null {
  let found: LocatedNode | null = null;
  document.descendants((node, position) => {
    if (node.attrs.aiId === id) {
      found = { node, position };
      return false;
    }
    return !found;
  });
  return found;
}

// Preserve a leading bold "Region:" run. It is document content, not routing
// metadata, and replacing it would unnecessarily alter the surrounding report.
function protectedPrefixSize(node: ProseMirrorNode): number {
  if (!node.isTextblock || !node.childCount) return 0;
  const first = node.child(0);
  const firstText = first.isText ? first.text || "" : "";
  const colon = firstText.indexOf(":");
  const bold = first.marks.some((mark) => mark.type.name === "bold");
  if (!bold || colon < 1) return 0;
  const sameRunWhitespace = firstText.slice(colon + 1).match(/^\s*/)?.[0].length || 0;
  let size = colon + 1 + sameRunWhitespace;
  if (size < firstText.length) return size;
  for (let index = 1; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (!child.isText) break;
    const leading = (child.text || "").match(/^\s+/)?.[0].length || 0;
    size += leading;
    if (leading < (child.text || "").length) break;
  }
  return size;
}

function insertedParagraph(editor: Editor, text: string) {
  const paragraph = editor.schema.nodes.paragraph;
  return paragraph.create(
    { inserted: true, aiId: nextNodeId() },
    text ? editor.schema.text(text) : undefined
  );
}

function insertedListItem(editor: Editor, text: string) {
  const paragraph = insertedParagraph(editor, text);
  return {
    paragraph,
    listItem: editor.schema.nodes.listItem.create({ aiId: nextNodeId() }, paragraph),
  };
}

function isOrganOnlyHeading(text: string) {
  return !/\b(?:segment|subsegment|lobe|lobule|pole|level|quadrant|portion|part)\b/i.test(
    text
  );
}

function stripRepeatedOrganPrefix(organ: string, finding: string) {
  const organName = organ.trim().replace(/:+\s*$/, "");
  const escapedOrgan = organName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const separatedPrefix = new RegExp(
    `^(?:the\\s+)?${escapedOrgan}(?:\\s*[,;:]\\s*|\\s+[–—-]\\s+)`,
    "i"
  );
  const copularPrefix = new RegExp(
    `^(?:the\\s+)?${escapedOrgan}\\s+(?:is|are)\\s+`,
    "i"
  );
  const original = finding.trim();
  const stripped = original
    .replace(separatedPrefix, "")
    .replace(copularPrefix, "")
    .trim();
  if (!stripped || stripped === original) return original;
  return stripped.replace(
    /^([a-z])([a-z]*\b)/,
    (_word, first: string, rest: string) => `${first.toUpperCase()}${rest}`
  );
}

function organListItem(editor: Editor, organ: string, children: string[]) {
  const organName = organ.trim().replace(/:+\s*$/, "");
  const findingChildren = children.map((child) =>
    stripRepeatedOrganPrefix(organName, child)
  );
  const headingId = nextNodeId();
  if (findingChildren.length === 1) {
    const paragraph = editor.schema.nodes.paragraph.create(
      { inserted: true, aiId: headingId },
      [
        editor.schema.text(`${organName}:`, [editor.schema.marks.bold.create()]),
        editor.schema.text(` ${findingChildren[0]}`),
      ]
    );
    return {
      headingId,
      item: editor.schema.nodes.listItem.create(
        { aiId: nextNodeId() },
        paragraph
      ),
      findingRows: [{ paragraph, text: findingChildren[0] }],
    };
  }
  const heading = editor.schema.nodes.paragraph.create(
    { inserted: true, aiId: headingId },
    editor.schema.text(`${organName}:`, [editor.schema.marks.bold.create()])
  );
  const childRows = findingChildren.map((child) => insertedListItem(editor, child));
  const nested = editor.schema.nodes.bulletList.create(
    undefined,
    childRows.map((row) => row.listItem)
  );
  return {
    headingId,
    item: editor.schema.nodes.listItem.create(
      { aiId: nextNodeId() },
      [heading, nested]
    ),
    findingRows: childRows.map(({ paragraph }, index) => ({
      paragraph,
      text: findingChildren[index],
    })),
  };
}

function containingListItem(document: ProseMirrorNode, target: LocatedNode) {
  const resolved = document.resolve(target.position + 1);
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === "listItem") {
      return {
        position: resolved.before(depth),
        node: resolved.node(depth),
      };
    }
  }
  return null;
}

// Apply edits against the current transaction document, resolving the id again
// before every edit so earlier inserts cannot shift a later target.
export function applyDocumentEditsWithTargets(
  editor: Editor,
  edits: DocumentEditResult[]
): DocumentEditResult[] {
  ensureDocumentNodeIds(editor);
  let transaction = editor.state.tr;
  const appliedEdits: DocumentEditResult[] = [];
  const insertAfterTails = new Map<string, string>();

  for (const edit of edits) {
    const isAfter =
      edit.operation === "insertAfter" || edit.operation === "insertOrganAfter";
    const effectiveTargetId =
      isAfter
        ? insertAfterTails.get(edit.targetNodeId) || edit.targetNodeId
        : edit.targetNodeId;
    const target = findNode(transaction.doc, effectiveTargetId);
    const text = edit.text.trim();
    const children = (edit.children || []).map((child) => child.trim()).filter(Boolean);
    if (!target || !text) continue;

    // ProseMirror keeps a trailing empty paragraph after a final heading. Treat
    // it as that section's empty body instead of inserting another paragraph
    // and leaving a blank line in the editor/export.
    if (edit.operation === "insertAfter" && target.node.type.name === "heading") {
      const nextPosition = target.position + target.node.nodeSize;
      const nextNode = transaction.doc.nodeAt(nextPosition);
      if (nextNode?.type.name === "paragraph" && nextNode.content.size === 0) {
        transaction = transaction
          .insertText(text, nextPosition + 1)
          .setNodeMarkup(nextPosition, undefined, {
            ...nextNode.attrs,
            inserted: true,
          });
        const paragraphId = String(nextNode.attrs.aiId || edit.targetNodeId);
        insertAfterTails.set(edit.targetNodeId, paragraphId);
        appliedEdits.push({
          targetNodeId: paragraphId,
          operation: "replace",
          text,
        });
        continue;
      }
    }

    if (edit.operation === "replace") {
      if (!target.node.isTextblock || target.node.type.name !== "paragraph") continue;
      const prefix = protectedPrefixSize(target.node);
      const from = target.position + 1 + prefix;
      const to = target.position + 1 + target.node.content.size;
      transaction = transaction.insertText(text, from, to).setNodeMarkup(
        target.position,
        undefined,
        { ...target.node.attrs, inserted: true }
      );
      appliedEdits.push({ targetNodeId: edit.targetNodeId, operation: "replace", text });
      continue;
    }

    if (edit.operation === "setOrganChildren") {
      if (!children.length || !isOrganOnlyHeading(text)) continue;
      const context = containingListItem(transaction.doc, target);
      if (!context) continue;
      const group = organListItem(editor, text, children);
      const replacement = editor.schema.nodes.listItem.create(
        { ...context.node.attrs },
        group.item.content
      );
      transaction = transaction.replaceWith(
        context.position,
        context.position + context.node.nodeSize,
        replacement
      );
      group.findingRows.forEach(({ paragraph, text: findingText }) => {
        appliedEdits.push({
          targetNodeId: String(paragraph.attrs.aiId),
          operation: "replace",
          text: findingText,
        });
      });
      continue;
    }

    if (
      edit.operation === "insertOrganBefore" ||
      edit.operation === "insertOrganAfter"
    ) {
      if (!children.length || !isOrganOnlyHeading(text)) continue;
      const group = organListItem(editor, text, children);
      const context = containingListItem(transaction.doc, target);

      if (context) {
        transaction = transaction.insert(
          edit.operation === "insertOrganBefore"
            ? context.position
            : context.position + context.node.nodeSize,
          group.item
        );
      } else if (
        target.node.type.name === "bulletList" ||
        target.node.type.name === "orderedList"
      ) {
        transaction = transaction.insert(
          edit.operation === "insertOrganBefore"
            ? target.position + 1
            : target.position + target.node.nodeSize - 1,
          group.item
        );
      } else {
        const list = editor.schema.nodes.bulletList.create(undefined, group.item);
        transaction = transaction.insert(
          edit.operation === "insertOrganBefore"
            ? target.position
            : target.position + target.node.nodeSize,
          list
        );
      }

      if (edit.operation === "insertOrganAfter") {
        insertAfterTails.set(edit.targetNodeId, group.headingId);
      }
      group.findingRows.forEach(({ paragraph, text: findingText }) => {
        appliedEdits.push({
          targetNodeId: String(paragraph.attrs.aiId),
          operation: "replace",
          text: findingText,
        });
      });
      continue;
    }

    const paragraph = insertedParagraph(editor, text);
    const insertedNodeId = String(paragraph.attrs.aiId);
    if (
      edit.operation === "insertAfter" &&
      (target.node.type.name === "bulletList" || target.node.type.name === "orderedList")
    ) {
      const listItem = editor.schema.nodes.listItem.create(
        { aiId: nextNodeId() },
        paragraph
      );
      transaction = transaction.insert(target.position + target.node.nodeSize - 1, listItem);
      insertAfterTails.set(edit.targetNodeId, insertedNodeId);
      appliedEdits.push({ targetNodeId: insertedNodeId, operation: "replace", text });
      continue;
    }

    const context = containingListItem(transaction.doc, target);
    if (context) {
      const listItem = editor.schema.nodes.listItem.create(
        { aiId: nextNodeId() },
        paragraph
      );
      transaction = transaction.insert(
        edit.operation === "insertBefore"
          ? context.position
          : context.position + context.node.nodeSize,
        listItem
      );
    } else {
      transaction = transaction.insert(
        edit.operation === "insertBefore"
          ? target.position
          : target.position + target.node.nodeSize,
        paragraph
      );
    }
    if (edit.operation === "insertAfter") {
      insertAfterTails.set(edit.targetNodeId, insertedNodeId);
    }
    appliedEdits.push({ targetNodeId: insertedNodeId, operation: "replace", text });
  }

  if (appliedEdits.length) editor.view.dispatch(transaction.scrollIntoView());
  return appliedEdits;
}

export function applyDocumentEdits(editor: Editor, edits: DocumentEditResult[]): number {
  return applyDocumentEditsWithTargets(editor, edits).length;
}
