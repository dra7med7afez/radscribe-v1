// ============================================================
// convert — store ReportSection[] ⇄ the continuous report document.
//
// The editor is ONE free-flowing TipTap doc (headings, paragraphs,
// lists — see lib/report-doc). The store keeps its existing
// sections/findings shape, so persistence, export and the AI flows are
// untouched. These two functions are the only boundary between the
// shapes:
//
//   sectionsToDoc     — store → doc JSON. Used when a template is
//                       selected and when structuring completes: the
//                       pipeline's output becomes document JSON that is
//                       loaded with editor.commands.setContent.
//   docToStoreSections — doc → store (the projection). Sections are
//                       derived from the text: a level-2 heading starts
//                       a section; ids/kinds are inherited from the
//                       previous store sections by name so external
//                       targeting (dictation, persistence) stays stable.
// ============================================================

import type { JSONContent } from "@tiptap/core";
import { htmlToJson, jsonToHtml, htmlToInline, inlineToHtml } from "@/lib/pm-content";
import { sectionKeyFor } from "@/lib/report-doc";
import { clampLevel, BULLET_LIST_STYLE_VALUES, type ListStyle } from "@/lib/bullets";
import { uid } from "@/lib/utils";
import type { ReportSection, Finding, FindingItem } from "@/types";

// content before the first heading projects into this pseudo-section
export const PREAMBLE_ID = "sec-preamble";

const ORDERED_STYLES = ["decimal", "lower-alpha", "upper-roman", "lower-roman"];
const ALLOWED_MARKS = new Set(["bold", "italic", "underline"]);

// ---- schema normalization ----------------------------------------------

// Legacy store HTML can carry nodes the tight report schema excludes
// (textBox wrappers, hard breaks, stray marks). Everything is folded into
// the allowed set: heading / paragraph / lists / text with b·i·u.
function cleanInline(nodes: JSONContent[] | undefined): JSONContent[] {
  const out: JSONContent[] = [];
  for (const n of nodes || []) {
    if (n.type === "text") {
      if (!n.text) continue;
      const marks = (n.marks || []).filter((m) => ALLOWED_MARKS.has(m.type));
      out.push(marks.length ? { type: "text", text: n.text, marks } : { type: "text", text: n.text });
    } else if (n.type === "hardBreak") {
      out.push({ type: "text", text: " " });
    }
    // anything else (images, embeds) is dropped
  }
  return out;
}

function cleanBlocks(blocks: JSONContent[] | undefined): JSONContent[] {
  const out: JSONContent[] = [];
  for (const b of blocks || []) {
    switch (b.type) {
      case "paragraph":
        out.push({
          type: "paragraph",
          ...((b.attrs?.inserted || b.attrs?.textAlign)
            ? {
                attrs: {
                  ...(b.attrs?.inserted ? { inserted: true } : {}),
                  ...(b.attrs?.textAlign ? { textAlign: b.attrs.textAlign } : {}),
                },
              }
            : {}),
          content: cleanInline(b.content),
        });
        break;
      case "bulletList":
      case "orderedList": {
        const items = (b.content || [])
          .filter((li) => li.type === "listItem")
          .map((li) => ({ type: "listItem", content: ensureItemContent(cleanBlocks(li.content)) }));
        if (items.length) out.push({ type: b.type, ...(b.attrs ? { attrs: b.attrs } : {}), content: items });
        break;
      }
      case "heading":
        // headings inside a section body are demoted to plain paragraphs —
        // sections are delimited only by the document's own headings
        out.push({
          type: "paragraph",
          ...(b.attrs?.textAlign ? { attrs: { textAlign: b.attrs.textAlign } } : {}),
          content: cleanInline(b.content),
        });
        break;
      case "textBox":
      case "blockquote":
        out.push(...cleanBlocks(b.content));
        break;
      default: {
        // unknown block: keep its text so nothing silently disappears
        const inline = cleanInline(b.content);
        if (inline.length) out.push({ type: "paragraph", content: inline });
      }
    }
  }
  return out;
}

// a listItem must contain at least one paragraph
function ensureItemContent(blocks: JSONContent[]): JSONContent[] {
  return blocks.length ? blocks : [{ type: "paragraph", content: [] }];
}

function inlineFromHtml(html: string): JSONContent[] {
  return cleanInline(htmlToInline(html));
}

// ---- sections → doc ----------------------------------------------------

// Subpoints (parameters) become a real nested list under the finding —
// the store's flat array (with 0-based `level`) turns into list nesting.
function buildSubpointList(subpoints: FindingItem[]): JSONContent {
  const root: JSONContent = { type: "bulletList", content: [] };
  const stack: JSONContent[] = [root];
  for (const sp of subpoints) {
    let lvl = clampLevel(sp.level);
    while (lvl >= stack.length) {
      const rows = stack[stack.length - 1].content!;
      if (!rows.length) {
        lvl = stack.length - 1;
        break;
      }
      const last = rows[rows.length - 1];
      const sub: JSONContent = { type: "bulletList", content: [] };
      last.content = [...(last.content || []), sub];
      stack.push(sub);
    }
    stack.length = lvl + 1;
    stack[lvl].content!.push({
      type: "listItem",
      content: [{ type: "paragraph", content: inlineFromHtml(sp.text) }],
    });
  }
  return root;
}

// A finding is one list item. The organ label becomes bold text ending in
// a colon — real document text, so renaming it is just typing.
function findingToListItem(f: Finding, grouped: boolean): JSONContent {
  const blocks: JSONContent[] = [];
  const items = f.items.length ? f.items : [{ id: uid("itm"), text: "" }];
  items.forEach((it, i) => {
    const inline = inlineFromHtml(it.text);
    const content: JSONContent[] = [];
    if (i === 0 && grouped && f.region) {
      content.push({ type: "text", text: `${f.region}:`, marks: [{ type: "bold" }] });
      if (inline.length) content.push({ type: "text", text: " " });
    }
    content.push(...inline);
    blocks.push({
      type: "paragraph",
      ...(it.inserted ? { attrs: { inserted: true } } : {}),
      content,
    });
  });
  if (f.subpoints?.length) blocks.push(buildSubpointList(f.subpoints));
  return { type: "listItem", content: blocks };
}

function findingsListNode(sec: ReportSection): JSONContent {
  const items = (sec.findings || []).map((f) => findingToListItem(f, !!sec.grouped));
  if (ORDERED_STYLES.includes(sec.bulletStyle || "")) {
    return { type: "orderedList", content: items };
  }
  const listStyle = BULLET_LIST_STYLE_VALUES.includes(sec.bulletStyle || "")
    ? sec.bulletStyle
    : null;
  return {
    type: "bulletList",
    ...(listStyle ? { attrs: { listStyle } } : {}),
    content: items,
  };
}

export function sectionsToDoc(sections: ReportSection[]): JSONContent {
  const content: JSONContent[] = [];
  for (const sec of sections) {
    if (sec.id !== PREAMBLE_ID) {
      content.push({
        type: "heading",
        attrs: { level: 2, sectionKey: sectionKeyFor(sec.name) },
        content: sec.name ? [{ type: "text", text: sec.name }] : [],
      });
    }
    if (sec.kind === "findings") {
      if (sec.findings?.length) content.push(findingsListNode(sec));
      else content.push({ type: "paragraph", content: [] });
      continue;
    }
    const body = cleanBlocks(htmlToJson(sec.html || "<p></p>").content);
    content.push(...(body.length ? body : [{ type: "paragraph", content: [] }]));
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph", content: [] }] };
}

// ---- doc → sections (the projection) -----------------------------------

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  return (node.content || []).map(textOf).join("");
}

const isList = (n: JSONContent) => n.type === "bulletList" || n.type === "orderedList";
const isEmptyBlock = (n: JSONContent) => !isList(n) && textOf(n).trim() === "";
const hasAnyText = (blocks: JSONContent[]) => blocks.some((b) => textOf(b).trim() !== "");

// "Liver: text" → region "Liver" when the leading bold run carries the
// colon (which is exactly how sectionsToDoc writes organ labels).
function splitRegion(inline: JSONContent[]): { region: string; rest: JSONContent[] } {
  const first = inline[0];
  if (
    first?.type === "text" &&
    (first.marks || []).some((m) => m.type === "bold") &&
    first.text
  ) {
    const ci = first.text.indexOf(":");
    const label = ci > 0 ? first.text.slice(0, ci).trim() : "";
    if (label && label.length <= 60 && /[a-zA-ZÀ-ÿ]/.test(label)) {
      const after = first.text.slice(ci + 1).replace(/^\s+/, "");
      const rest = inline.slice(1);
      if (after) return { region: label, rest: [{ ...first, text: after }, ...rest] };
      // drop the separator space between the label and the text
      const [next, ...more] = rest;
      if (next?.type === "text" && !(next.marks || []).length) {
        const trimmed = (next.text || "").replace(/^\s+/, "");
        return { region: label, rest: trimmed ? [{ ...next, text: trimmed }, ...more] : more };
      }
      return { region: label, rest };
    }
  }
  return { region: "", rest: inline };
}

interface RawSubpoint {
  inline: JSONContent[];
  level: number;
}

function collectSubpoints(list: JSONContent, level: number, out: RawSubpoint[]) {
  for (const li of list.content || []) {
    if (li.type !== "listItem") continue;
    for (const child of li.content || []) {
      if (child.type === "paragraph") out.push({ inline: child.content || [], level });
      else if (isList(child)) collectSubpoints(child, level + 1, out);
    }
  }
}

// Parse every meaningful block in a findings section. New templates are often
// authored as plain paragraphs first and styled as lists later; treating those
// paragraphs as finding rows gives them stable item IDs immediately, so AI
// insertion can replace the correct row in a newly made report.
function parseFindings(blocks: JSONContent[], prevSec: ReportSection | undefined): Finding[] {
  const pool = [...(prevSec?.findings || [])];
  const take = (region: string): Finding | undefined => {
    const idx = region
      ? pool.findIndex((f) => f.region.trim().toLowerCase() === region.trim().toLowerCase())
      : pool.findIndex((f) => !f.region);
    return idx >= 0 ? pool.splice(idx, 1)[0] : undefined;
  };

  const out: Finding[] = [];
  for (const block of blocks) {
    const rows = isList(block)
      ? block.content || []
      : block.type === "paragraph"
        ? [{ type: "listItem", content: [block] }]
        : [];
    for (const li of rows) {
      if (li.type !== "listItem") continue;

      const paras: JSONContent[] = [];
      const rawSubs: RawSubpoint[] = [];
      for (const child of li.content || []) {
        if (child.type === "paragraph") paras.push(child);
        else if (isList(child)) collectSubpoints(child, 0, rawSubs);
      }
      if (!paras.length) paras.push({ type: "paragraph" });

      const { region, rest } = splitRegion(paras[0].content || []);
      const prevF = take(region);

      const items: FindingItem[] = paras.map((para, i) => {
        const prevItem = prevF?.items[i];
        return {
          id: prevItem?.id || uid("itm"),
          text: inlineToHtml(i === 0 ? rest : para.content || []),
          impression: prevItem?.impression,
          score: prevItem?.score,
          // the doc is canonical for the dictation-insert highlight
          ...(para.attrs?.inserted ? { inserted: true } : {}),
        };
      });

      const subpoints: FindingItem[] = rawSubs.map((sp, i) => ({
        id: prevF?.subpoints?.[i]?.id || uid("sp"),
        text: inlineToHtml(sp.inline),
        ...(sp.level > 0 ? { level: clampLevel(sp.level) } : {}),
      }));

      out.push({
        id: prevF?.id || uid("fnd"),
        region,
        items,
        normalText: prevF?.normalText ?? "",
        abnormal: prevF?.abnormal ?? false,
        score: prevF?.score,
        images: prevF?.images || [],
        subpoints,
      });
    }
  }
  return out;
}

function bulletStyleOf(blocks: JSONContent[]): ListStyle | undefined {
  const list = blocks.find(isList);
  if (!list) return undefined;
  if (list.type === "orderedList") return "decimal" as ListStyle;
  const style = list.attrs?.listStyle as string | undefined;
  return style && BULLET_LIST_STYLE_VALUES.includes(style) ? (style as ListStyle) : undefined;
}

// Project the live document into the store's section shape. `prev` (the
// store's current sections) supplies ids, kinds and flags by name so a
// projection never invalidates external targeting; brand-new headings
// become new prose sections (or findings sections when the heading is a
// known findings name and the body is a list).
export function docToStoreSections(doc: JSONContent, prev: ReportSection[]): ReportSection[] {
  interface Chunk {
    name: string;
    body: JSONContent[];
    preamble: boolean;
  }
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  for (const node of doc.content || []) {
    if (node.type === "heading") {
      if (cur) chunks.push(cur);
      cur = { name: textOf(node), body: [], preamble: false };
      continue;
    }
    if (!cur) cur = { name: "", body: [], preamble: true };
    cur.body.push(node);
  }
  if (cur) chunks.push(cur);

  const pool = [...prev];
  const takePrev = (chunk: Chunk): ReportSection | undefined => {
    const idx = chunk.preamble
      ? pool.findIndex((s) => s.id === PREAMBLE_ID)
      : pool.findIndex(
          (s) =>
            s.id !== PREAMBLE_ID &&
            s.name.trim().toLowerCase() === chunk.name.trim().toLowerCase()
        );
    return idx >= 0 ? pool.splice(idx, 1)[0] : undefined;
  };

  const out: ReportSection[] = [];
  for (const chunk of chunks) {
    if (chunk.preamble && !hasAnyText(chunk.body)) continue;
    const prevSec = takePrev(chunk);
    const meaningful = chunk.body.filter((b) => !isEmptyBlock(b));
    const allLists = meaningful.length > 0 && meaningful.every(isList);
    const allParagraphs =
      meaningful.length > 0 && meaningful.every((block) => block.type === "paragraph");
    const namedFindings = sectionKeyFor(chunk.name) === "findings";

    // A Findings heading is semantic, not a formatting guess. Likewise, once a
    // live section is known to contain findings, adding a plain paragraph must
    // not collapse the entire section into prose and invalidate all target IDs.
    const uniformFindingRows = meaningful.length === 0 || allLists || allParagraphs;
    const wantFindings =
      ((namedFindings || prevSec?.kind === "findings") && uniformFindingRows) ||
      (!prevSec && allLists);

    if (wantFindings) {
      const findings = parseFindings(meaningful, prevSec);
      out.push({
        id: prevSec?.id || uid("sec"),
        name: chunk.name,
        kind: "findings",
        grouped: prevSec?.grouped ?? findings.some((f) => !!f.region),
        // The live document is authoritative when the user restyles a list.
        // Fall back to the stored value only for legacy/unstyled list nodes.
        bulletStyle: bulletStyleOf(meaningful) ?? prevSec?.bulletStyle,
        findings,
      });
      continue;
    }

    out.push({
      id: prevSec?.id || (chunk.preamble ? PREAMBLE_ID : uid("sec")),
      name: chunk.name,
      kind: "prose",
      isConclusion: prevSec
        ? prevSec.isConclusion
        : sectionKeyFor(chunk.name) === "impression" || undefined,
      normalImpression: prevSec?.normalImpression,
      html: jsonToHtml({ type: "doc", content: chunk.body }) || "<p></p>",
    });
  }
  return out;
}
