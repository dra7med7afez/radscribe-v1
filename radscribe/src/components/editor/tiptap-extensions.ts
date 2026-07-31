import { Node, mergeAttributes } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import { BulletList } from "@tiptap/extension-list";
import { BULLET_LIST_STYLE_VALUES } from "@/lib/bullets";

// ============================================================
// Custom TipTap extensions (§10). TextBox draws Word's paragraph
// border; ReportBulletList is the stock bullet list plus a per-list
// marker style. Images remain outside the document body.
// ============================================================

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textBox: {
      toggleTextBox: () => ReturnType;
    };
  }
}

// ============================================================
// ReportParagraph — the standard paragraph plus an `inserted` flag set on
// content the dictation pipeline wrote (insertStructured). Rendered as
// data-inserted, which globals.css turns into the soft highlight box, so
// dictated content is visually distinct from typed text. The attribute
// round-trips through the store's HTML boundary like any other content.
// ============================================================

export const ReportParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      inserted: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-inserted") === "true",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.inserted ? { "data-inserted": "true" } : {},
      },
    };
  },
});

// ============================================================
// ReportBulletList — the standard TipTap bulletList carrying a `listStyle`
// attribute (the glyph picked in the toolbar's bullet library). Rendered as
// data-list-style, which globals.css maps to list-style-type / ::marker, so
// the same value styles the editor, the clipboard HTML, and the export.
// ============================================================

export const ReportBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyle: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v =
            el.getAttribute("data-list-style") ||
            el.style.listStyleType ||
            el.style.listStyle;
          return BULLET_LIST_STYLE_VALUES.includes(v || "") ? v : null;
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.listStyle ? { "data-list-style": String(attrs.listStyle) } : {},
      },
    };
  },
});

// TextBox — draws ONE rectangle around the whole selected block(s), like Word's
// "border" on a paragraph (see the boxed impression in the sample). It's a
// block-level WRAPPER node (same mechanism as a blockquote), not an inline mark,
// so a multi-line selection gets a single continuous border instead of a broken
// per-line box. Toggling again removes the box (unwraps).
export const TextBox = Node.create({
  name: "textBox",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    // Parse both the new block wrapper and any legacy inline span boxes.
    return [{ tag: "div.text-box" }, { tag: "span.text-box" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "text-box" }), 0];
  },

  addCommands() {
    return {
      toggleTextBox:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});
