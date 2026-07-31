// ============================================================
// report-doc — the continuous report document.
//
// The report is ONE free-flowing TipTap document, like Word. There are
// no section containers and no per-section fields: structure comes from
// the text itself. A level-2 heading implies a section — everything
// after it (until the next heading of equal or higher level) belongs to
// that section. The schema is deliberately tight so structuring output
// is predictable:
//
//   doc → heading (levels 1–2) | paragraph | bulletList | orderedList
//   listItem → paragraph+  ·  text marks: bold, italic, underline
//
// No images, tables or embeds. Structured data (the section map) is
// DERIVED on demand by docToSections — never enforced during editing.
// ============================================================

import { Extension, mergeAttributes, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import TextAlign from "@tiptap/extension-text-align";
import { ReportBulletList, ReportParagraph } from "@/components/editor/tiptap-extensions";
import { DocumentAiIds } from "@/lib/document-ai";

// ---- known sections ----------------------------------------------------

// Normalized heading text → section key. Matching is case-insensitive and
// purely metadata: it never restricts what can be typed or where.
export const KNOWN_SECTIONS: Record<string, string> = {
  examination: "examination",
  exam: "examination",
  "clinical history": "clinical_history",
  history: "clinical_history",
  "clinical information": "clinical_history",
  indication: "clinical_history",
  technique: "technique",
  comparison: "comparison",
  findings: "findings",
  finding: "findings",
  impression: "impression",
  conclusion: "impression",
  opinion: "impression",
};

// trim + collapse internal whitespace — how heading text is matched
export function normalizeHeadingText(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

export function sectionKeyFor(title: string): string | null {
  const norm = normalizeHeadingText(title)
    .toLowerCase()
    .replace(/[\s:.]+$/, "");
  return KNOWN_SECTIONS[norm] ?? null;
}

// ---- heading -----------------------------------------------------------

// Levels 1–2 only. Level 1 = report title (rare), level 2 = section
// headings. `sectionKey` is metadata set when the text matches a known
// section name — it never constrains editing. The class keeps the exact
// section-header look the app already ships (globals.css).
export const ReportHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      sectionKey: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-section-key"),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.sectionKey ? { "data-section-key": String(attrs.sectionKey) } : {},
      },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "rd-section-heading",
      }),
      0,
    ];
  },
}).configure({ levels: [1, 2] });

// Keeps `sectionKey` in sync with the heading's text after every edit.
// Metadata only — rides along with the edit (addToHistory false) so undo
// never lands on a doc that differs only by keys.
export const SectionKeySync = Extension.create({
  name: "sectionKeySync",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("sectionKeySync"),
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          let tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== "heading") return true;
            const key = node.attrs.level === 2 ? sectionKeyFor(node.textContent) : null;
            if ((node.attrs.sectionKey ?? null) !== key) {
              tr = tr
                .setNodeMarkup(pos, undefined, { ...node.attrs, sectionKey: key })
                .setMeta("addToHistory", false);
              changed = true;
            }
            return false; // headings have no block children
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

// ---- schema config -----------------------------------------------------

// The COMPLETE schema for the report editor: doc, heading (1–2),
// paragraph, bulletList / orderedList / listItem, text with
// bold / italic / underline. Everything else is switched off.
export const REPORT_EXTENSIONS = [
  StarterKit.configure({
    heading: false, // replaced by ReportHeading
    bulletList: false, // replaced by ReportBulletList (per-list marker style)
    paragraph: false, // replaced by ReportParagraph (dictation-insert flag)
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: false,
    hardBreak: false,
    dropcursor: false, // the drag handle draws its own indicator
  }),
  ReportHeading,
  ReportBulletList,
  ReportParagraph,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  DocumentAiIds,
  SectionKeySync,
];

// ---- document → structure ---------------------------------------------

export interface ReportSection {
  key: string | null; // "findings", "impression", etc., or null if unrecognized
  title: string; // heading text exactly as written
  plainText: string; // section body as plain text
}

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  return (node.content || []).map(textOf).join("");
}

// One line of plain text per textblock; lists flatten in document order.
function blockLines(node: JSONContent): string[] {
  if (!node) return [];
  if (node.type === "paragraph" || node.type === "heading") return [textOf(node)];
  const lines: string[] = [];
  for (const child of node.content || []) lines.push(...blockLines(child));
  return lines;
}

// Traverse a doc (editor.getJSON()) and split its content on level-2
// headings. Content before the first heading goes into a "preamble"
// section. Heading text is normalized (trim, collapse spaces) and matched
// against KNOWN_SECTIONS to populate `key`. Derived on demand — never run
// on keystroke and never used to constrain editing.
export function docToSections(doc: JSONContent): ReportSection[] {
  const out: ReportSection[] = [];
  let current: { key: string | null; title: string; lines: string[]; preamble: boolean } | null =
    null;

  const push = () => {
    if (!current) return;
    // a preamble made only of empty paragraphs is not a section
    if (current.preamble && current.lines.length === 0) {
      current = null;
      return;
    }
    out.push({
      key: current.key,
      title: current.title,
      plainText: current.lines.join("\n"),
    });
    current = null;
  };

  for (const node of doc.content || []) {
    if (node.type === "heading" && (node.attrs?.level ?? 1) === 2) {
      push();
      const title = textOf(node);
      current = { key: sectionKeyFor(title), title, lines: [], preamble: false };
      continue;
    }
    if (!current) current = { key: "preamble", title: "", lines: [], preamble: true };
    current.lines.push(...blockLines(node).filter((l) => l.trim() !== ""));
  }
  push();
  return out;
}
