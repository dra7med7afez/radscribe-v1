import type { TemplateSection, TemplateFindingSeed, ListStyle } from "@/types";
import { slug, escapeHtml } from "@/lib/utils";

// ============================================================
// template-parse (§8a). Turns pasted/extracted template text into an
// ordered TemplateSection[] — names preserved verbatim, kind inferred,
// grouped vs flat findings detected, bullet/numbering style + one level of
// nesting preserved. Used as the OFFLINE fallback when the AI analyzer is
// unavailable; the radiologist corrects the parse in the review step.
// ============================================================

const KNOWN_HEADERS =
  /^(technique|examination|exam|comparison|indication|clinical (information|history)|history|findings|impression|conclusion|opinion|recommendation|protocol|contrast|measurements|addendum)\b/i;

function isHeader(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const words = t.replace(/:$/, "").split(/\s+/);
  if (KNOWN_HEADERS.test(t) && words.length <= 4) return true;
  // ALL CAPS short line
  if (words.length <= 4 && /^[A-Z][A-Z0-9 /&-]{2,}$/.test(t.replace(/:$/, ""))) return true;
  // Title line ending with a colon and no following text
  if (/:$/.test(t) && words.length <= 4) return true;
  return false;
}

function headerName(line: string): string {
  return line.trim().replace(/:$/, "").trim();
}

interface RawSection {
  name: string;
  body: string[]; // RAW lines (indentation preserved for nesting detection)
}

export function parseTemplateText(text: string): TemplateSection[] {
  const lines = text.split(/\r?\n/);
  const raw: RawSection[] = [];
  let current: RawSection | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;
    if (isHeader(line)) {
      current = { name: headerName(line), body: [] };
      raw.push(current);
    } else {
      if (!current) {
        current = { name: "Findings", body: [] };
        raw.push(current);
      }
      current.body.push(line); // keep raw (indentation) for nesting
    }
  }

  if (raw.length === 0 && text.trim()) {
    raw.push({ name: "Findings", body: text.split(/\r?\n/).filter((l) => l.trim()) });
  }

  return raw.map((s, i) => classify(s, i));
}

// ---- bullet / numbering style detection ------------------------------------

const MARKER =
  /^(?<indent>\s*)(?<marker>[-–—•*▪◦○☐]|\[\s?\]|\d+[.)]|[a-zA-Z][.)]|[ivxlcIVXLC]+[.)])\s+(?<rest>.*)$/;

function styleOfMarker(marker: string): ListStyle | undefined {
  const m = marker.trim();
  if (/^\[\s?\]$/.test(m) || m === "☐") return "checkbox";
  if (/^\d+[.)]$/.test(m)) return "decimal";
  if (/^[IVXLC]+[.)]$/.test(m)) return "upper-roman";
  if (/^[ivxlc]+[.)]$/.test(m)) return "lower-roman";
  if (/^[A-Z][.)]$/.test(m)) return "lower-alpha"; // letters → alpha (case folded on render)
  if (/^[a-z][.)]$/.test(m)) return "lower-alpha";
  if (m === "•") return "disc";
  if (m === "○" || m === "◦") return "circle";
  if (m === "▪") return "square";
  if (m === "–" || m === "—" || m === "-" || m === "*") return "dash";
  return undefined;
}

interface ParsedLine {
  indent: number;
  marker?: string;
  text: string;
}

function parseLine(line: string): ParsedLine {
  const m = line.match(MARKER);
  if (m && m.groups) {
    return {
      indent: m.groups.indent.replace(/\t/g, "    ").length,
      marker: m.groups.marker,
      text: m.groups.rest.trim(),
    };
  }
  const indent = (line.match(/^\s*/)?.[0] || "").replace(/\t/g, "    ").length;
  return { indent, text: line.trim() };
}

// Split "Region: text" into [region, text]; returns undefined when there's no
// leading "Label:" form.
function splitRegion(text: string): { region: string; rest: string } | undefined {
  const m = text.match(/^(.{1,40}?):\s*(.*)$/);
  if (!m) return undefined;
  return { region: m[1].trim(), rest: m[2].trim() };
}

function classify(s: RawSection, index: number): TemplateSection {
  const id = `${slug(s.name) || "section"}-${index}`;
  const lower = s.name.toLowerCase();
  const findingsName = /finding/.test(lower);

  const parsed = s.body.map(parseLine);
  const markered = parsed.filter((p) => p.marker);
  const groupedLines = parsed.filter((p) => !p.marker && splitRegion(p.text));

  const looksFindings =
    findingsName || groupedLines.length >= 2 || markered.length >= 2;

  if (looksFindings) {
    // Detected bullet/numbering style (first marker wins).
    const bulletStyle = markered.length ? styleOfMarker(markered[0].marker!) : undefined;

    // Build a nested tree from indentation: a line deeper than the previous
    // top-level entry becomes its child (one level of nesting kept).
    const baseIndent = Math.min(...parsed.map((p) => p.indent), 0);
    const top: TemplateFindingSeed[] = [];
    let lastTop: TemplateFindingSeed | null = null;
    let grouped = groupedLines.length >= 2;

    for (const p of parsed) {
      const reg = splitRegion(p.text);
      const seed: TemplateFindingSeed = reg
        ? { region: reg.region, normalText: reg.rest }
        : { region: "", normalText: p.text };
      if (reg) grouped = true;
      if (p.indent > baseIndent && lastTop) {
        (lastTop.children ||= []).push(seed);
      } else {
        top.push(seed);
        lastTop = seed;
      }
    }

    return {
      id,
      name: s.name,
      kind: "findings",
      grouped,
      bulletStyle,
      findings: top,
    };
  }

  const isConcl = /impression|conclusion|opinion/.test(lower);
  const joined = parsed.map((p) => p.text).join(" ").trim();
  return {
    id,
    name: s.name,
    kind: "prose",
    grouped: false,
    defaultProse: `<p>${escapeHtml(joined)}</p>`,
    isConclusion: isConcl,
    normalImpression: isConcl ? joined || undefined : undefined,
  };
}
