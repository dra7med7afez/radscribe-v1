// Shared bullet-shape registry. Used by BOTH the report editor (FindingsSection)
// and the export/extract (report-format) so the extracted report matches the
// editor exactly. Bullets render as a glyph (text) — not a CSS-only dot — so the
// same character appears in the editor, the clipboard, and the downloaded file.

export type BulletShape =
  | "disc"
  | "circle"
  | "square"
  | "square-hollow"
  | "dash"
  | "arrow"
  | "diamond";

export interface BulletOption {
  key: BulletShape;
  label: string;
  glyph: string;
  // Per-glyph font-size multiplier (relative to the text). The small geometric
  // glyphs (disc/circle/square/hollow-square) render visually smaller than the
  // text at 1em, so they're bumped up slightly; dash/arrow/diamond already match.
  scale: number;
}

// Exactly 7 options the radiologist can choose between (per level) in Settings.
export const BULLET_SHAPES: BulletOption[] = [
  { key: "disc", label: "Disc", glyph: "•", scale: 1.35 },
  { key: "circle", label: "Circle", glyph: "◦", scale: 1.35 },
  { key: "square", label: "Square", glyph: "▪", scale: 1.3 },
  { key: "square-hollow", label: "Hollow square", glyph: "▫", scale: 1.3 },
  { key: "dash", label: "Dash", glyph: "–", scale: 1 },
  { key: "arrow", label: "Arrow", glyph: "→", scale: 1 },
  { key: "diamond", label: "Diamond", glyph: "◆", scale: 1 },
];

export function bulletGlyph(shape: BulletShape | undefined): string {
  return BULLET_SHAPES.find((b) => b.key === shape)?.glyph ?? "•";
}

// ============================================================
// Toolbar bullet library — the five markers the Bullets split button offers
// for PROSE lists. `glyph` is what the picker shows; `style` is the value
// written to the bulletList node's listStyle attribute (rendered as
// data-list-style, which globals.css maps to list-style-type / ::marker).
// ============================================================
export const BULLET_LIST_OPTIONS = [
  { glyph: "•", style: "disc" },
  { glyph: "◦", style: "circle" },
  { glyph: "▪", style: "square" },
  { glyph: "▲", style: "triangle" },
  { glyph: "–", style: "dash" },
] as const;
export type BulletListStyle = BulletShape | "triangle";
export const BULLET_LIST_STYLE_VALUES: readonly string[] = [
  ...BULLET_LIST_OPTIONS.map((o) => o.style),
  "square-hollow",
  "arrow",
  "diamond",
];

// ============================================================
// List-style presets — a Word-style "list gallery" of bullet HIERARCHIES.
// Each preset is one bullet shape per indentation level (organ → finding →
// parameter). Applying a preset patches the three per-level bullet settings at
// once. Built as plain data so the picker UI is generated from it, not
// hardcoded. Only the five shapes below are used in presets.
// ============================================================

// The five shapes presets are allowed to combine (shown in the gallery key).
export const PRESET_SHAPES: BulletShape[] = ["disc", "circle", "square", "square-hollow", "dash"];

export interface ListPreset {
  id: string;
  levels: [BulletShape, BulletShape, BulletShape]; // [organ, finding, parameter]
}

// 10 distinct hierarchies. The first matches DEFAULT_SETTINGS so it reads as the
// active preset out of the box.
export const LIST_PRESETS: ListPreset[] = [
  { id: "disc-dash-circle", levels: ["disc", "dash", "circle"] },
  { id: "disc-circle-square", levels: ["disc", "circle", "square"] },
  { id: "square-hollowsq-circle", levels: ["square", "square-hollow", "circle"] },
  { id: "dash-circle-square", levels: ["dash", "circle", "square"] },
  { id: "disc-square-circle", levels: ["disc", "square", "circle"] },
  { id: "circle-hollowsq-dash", levels: ["circle", "square-hollow", "dash"] },
  { id: "square-dash-hollowsq", levels: ["square", "dash", "square-hollow"] },
  { id: "dash-disc-circle", levels: ["dash", "disc", "circle"] },
  { id: "hollowsq-circle-square", levels: ["square-hollow", "circle", "square"] },
];

// Font-size multiplier for a bullet glyph (1 = same size as the text).
export function bulletScale(shape: BulletShape | undefined): number {
  return BULLET_SHAPES.find((b) => b.key === shape)?.scale ?? 1;
}

// ============================================================
// Multilevel list depth (Word's Tab / Shift-Tab nesting).
//
// The report has ONE repeating three-shape bullet hierarchy — organ →
// finding → parameter — and subpoints continue it instead of stopping at
// the third rung. A subpoint at depth L therefore takes hierarchy rung
// (2 + L) % 3: depth 0 is the parameter bullet (what every existing report
// already renders), depth 1 wraps back to the organ bullet, and so on. That
// reproduces Word's repeating cycle while leaving depth 0 untouched.
// ============================================================

// Word stops at nine levels; so do we. Depth is 0-based, hence 8.
export const MAX_SUBPOINT_LEVEL = 8;

export function clampLevel(level: number | undefined): number {
  if (!Number.isFinite(level as number)) return 0;
  return Math.min(MAX_SUBPOINT_LEVEL, Math.max(0, Math.floor(level as number)));
}

// `hierarchy` is [organ, finding, parameter] — the three configured shapes.
export function subpointShapeAtLevel(
  hierarchy: readonly [BulletShape, BulletShape, BulletShape],
  level: number
): BulletShape {
  return hierarchy[(2 + clampLevel(level)) % 3];
}

// ============================================================
// List styles — a superset of the bullet shapes used to PRESERVE the bullet /
// numbering style detected per findings section (§ template creator). Adds a
// checkbox glyph plus four ORDERED styles (their marker depends on the item's
// index, unlike the fixed bullet glyphs).
// ============================================================

export type ListStyle =
  | BulletShape
  | "checkbox"
  | "decimal" // 1. 2. 3.
  | "lower-alpha" // a. b. c.
  | "upper-roman" // I. II. III.
  | "lower-roman"; // i. ii. iii.

export interface ListStyleOption {
  key: ListStyle;
  label: string;
  sample: string; // shown in the style picker
  ordered: boolean;
}

// Picker options: the 7 bullet shapes + checkbox + the 4 ordered styles.
export const LIST_STYLES: ListStyleOption[] = [
  ...BULLET_SHAPES.map((b) => ({ key: b.key as ListStyle, label: b.label, sample: b.glyph, ordered: false })),
  { key: "checkbox", label: "Checkbox", sample: "☐", ordered: false },
  { key: "decimal", label: "Numbers", sample: "1.", ordered: true },
  { key: "lower-alpha", label: "Letters", sample: "a.", ordered: true },
  { key: "upper-roman", label: "Roman", sample: "I.", ordered: true },
  { key: "lower-roman", label: "Roman (lower)", sample: "i.", ordered: true },
];

function toRoman(n: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let v = Math.max(1, Math.floor(n));
  for (const [val, sym] of map) {
    while (v >= val) {
      out += sym;
      v -= val;
    }
  }
  return out;
}

// The marker string for a list item at 0-based `index`. Unordered styles return
// their fixed glyph (index ignored); ordered styles return the numbered marker.
export function listMarker(style: ListStyle | undefined, index: number): string {
  switch (style) {
    case undefined:
      return "•";
    case "checkbox":
      return "☐";
    case "decimal":
      return `${index + 1}.`;
    case "lower-alpha":
      return `${String.fromCharCode(97 + (index % 26))}.`;
    case "upper-roman":
      return `${toRoman(index + 1)}.`;
    case "lower-roman":
      return `${toRoman(index + 1).toLowerCase()}.`;
    default:
      return bulletGlyph(style as BulletShape);
  }
}
