// ============================================================
// pm-content — the single home of the rich-content schema and the
// JSON ⇄ HTML ⇄ text converters. ProseMirror JSON (JSONContent) is
// the canonical in-memory format for report content; HTML exists
// only at the boundaries (legacy stored reports, export, clipboard).
// Every editor instance and every converter MUST use the same
// extension list so content round-trips losslessly.
// ============================================================

import { generateHTML, generateJSON, generateText, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import TextAlign from "@tiptap/extension-text-align";
import { TextBox, ReportBulletList, ReportParagraph } from "@/components/editor/tiptap-extensions";

// The shared schema for report content. Placeholder is per-editor UI (it takes
// a per-instance message), so it is NOT part of the schema set — schema-bearing
// extensions only. bulletList is swapped for ReportBulletList (per-list marker
// style) — the swap must match REPORT_EXTENSIONS or content stops
// round-tripping at the store's HTML boundary.
export const CONTENT_EXTENSIONS = [
  StarterKit.configure({ bulletList: false, paragraph: false }),
  ReportBulletList,
  ReportParagraph,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  CharacterCount,
  TextBox,
];

export function jsonToHtml(doc: JSONContent): string {
  if (!doc || !doc.content?.length) return "";
  return generateHTML(doc, CONTENT_EXTENSIONS);
}

export function htmlToJson(html: string): JSONContent {
  if (!html || !html.trim()) return emptyDoc();
  return generateJSON(html, CONTENT_EXTENSIONS);
}

export function jsonToText(doc: JSONContent): string {
  if (!doc || !doc.content?.length) return "";
  return generateText(doc, CONTENT_EXTENSIONS, {
    blockSeparator: "\n",
  }).trim();
}

// Plain dictated/AI text → a document (one paragraph per line). This replaces
// the `<p>${escapeHtml(text)}</p>` string-building path: text becomes text
// nodes directly, so there is nothing to escape and nothing to parse.
export function textToDoc(text: string): JSONContent {
  const lines = (text || "").split(/\n/);
  const content: JSONContent[] = lines.map((line) =>
    line.trim() ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }
  );
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function emptyDoc(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

// Inline content (the children of a single textblock) from an HTML fragment —
// used where the report doc stores one-line rich text (finding items,
// subpoints). Multi-paragraph fragments collapse to one line joined by spaces.
export function htmlToInline(html: string): JSONContent[] {
  const doc = htmlToJson(html);
  const out: JSONContent[] = [];
  for (const block of doc.content || []) {
    const inline = blockInline(block);
    if (!inline.length) continue;
    if (out.length) out.push({ type: "text", text: " " });
    out.push(...inline);
  }
  return out;
}

// Recursively collect the inline content of a block node (unwraps textBox and
// list structures the legacy HTML may carry).
function blockInline(node: JSONContent): JSONContent[] {
  if (!node) return [];
  if (node.type === "text" || node.type === "hardBreak") return [node];
  const out: JSONContent[] = [];
  for (const child of node.content || []) {
    const inline = blockInline(child);
    if (!inline.length) continue;
    if (out.length && child.type !== "text" && child.type !== "hardBreak") {
      out.push({ type: "text", text: " " });
    }
    out.push(...inline);
  }
  return out;
}

// Inline JSON → HTML fragment (no wrapping <p>) — the inverse of htmlToInline,
// for boundaries that still expect an HTML string (store projection, export).
export function inlineToHtml(inline: JSONContent[]): string {
  if (!inline?.length) return "";
  const html = jsonToHtml({ type: "doc", content: [{ type: "paragraph", content: inline }] });
  const m = /^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/.exec(html);
  return m ? m[1] : html;
}

export function inlineToText(inline: JSONContent[]): string {
  if (!inline?.length) return "";
  return jsonToText({ type: "doc", content: [{ type: "paragraph", content: inline }] });
}

export type { JSONContent };
