import DOMPurify from "dompurify";

// ============================================================
// sanitize — the single trust boundary for report/template HTML.
//
// Finding text and section prose travel as HTML fragments and are rendered
// with innerHTML (EditableText rich mode, EditableFinding). Template content
// originates from AI analysis of uploaded documents and from server-stored
// templates (including admin-managed global ones), so it must be treated as
// untrusted: a script/onerror payload in a template's normalText would
// otherwise execute for every user who loads that template.
//
// Every innerHTML assignment of report/template content goes through
// sanitizeHtml(). Keep the allowlist in sync with what the editor toolbar can
// legitimately produce (inline formatting, lists, images for attached
// finding snapshots).
// ============================================================

const ALLOWED_TAGS = [
  "a", "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup",
  "p", "br", "div", "span", "ul", "ol", "li", "blockquote",
  "h1", "h2", "h3", "h4", "table", "thead", "tbody", "tr", "td", "th",
  "img", "font",
];

const ALLOWED_ATTR = [
  // styling the editor legitimately produces (font-size on bullets, text boxes)
  "style", "class",
  // finding images are data: URLs
  "src", "alt", "width", "height",
  "href", "target", "rel",
  "color", "face", "size",
];

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  // SSR-safe: DOMPurify needs a DOM; on the server just strip tags outright
  // (server rendering never needs the rich markup).
  if (typeof window === "undefined") return html.replace(/<[^>]+>/g, " ");
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // data: URLs are required for attached finding images; DOMPurify still
    // blocks dangerous URI schemes (javascript:, etc.)
    ALLOW_DATA_ATTR: false,
  });
}
