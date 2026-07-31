import type { ReportSection, Finding, Patient, ReportSettings, ListStyle } from "@/types";
import { htmlToText } from "@/lib/utils";
import { bulletGlyph, bulletScale, listMarker, clampLevel, subpointShapeAtLevel } from "@/lib/bullets";
import type { BulletShape } from "@/lib/bullets";
import { unwrapTextBox, wrapTextBox } from "@/lib/text-box";

// ============================================================
// report-format (§10, §18) — renders the dynamic section list to HTML (for .doc
// export / clipboard rich) and plain text. The structure MIRRORS the report
// editor (FindingsSection) so the extracted report matches what's on screen:
//   • organ headline:  <organGlyph> Organ: finding   (single finding)
//                       <organGlyph> Organ:          + one <findingGlyph> per
//                       finding when the organ has more than one finding
//   • parameters:       <subpointGlyph> … (indented under the finding)
// Bullet glyphs come from the user's per-level settings. A finding's attached
// images float to the RIGHT of that finding (mirroring the editor's side rail),
// so in the extracted report the image sits beside its abnormal finding.
// ============================================================

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 3 spaces between the bullet glyph and the finding text (non-breaking so Word /
// the clipboard keep all three instead of collapsing them to one).
const GAP = "&nbsp;&nbsp;&nbsp;";
// hanging indent = glyph (~1em) + the 3-space gap (~0.75em), so wrapped lines
// align under the text, matching the editor.
const HANG = "margin-left:1.75em;text-indent:-1.75em";
const HANG_NESTED = "margin-left:3.15em;text-indent:-1.75em"; // findings/params under an organ

// Render a bullet glyph at its per-shape scale (small geometric glyphs are bumped
// up slightly so they read at text size in Word / the clipboard).
function glyphHtml(shape: BulletShape): string {
  const g = bulletGlyph(shape);
  const sc = bulletScale(shape);
  return sc !== 1 ? `<span style="font-size:${sc}em">${g}</span>` : g;
}

// Marker for a per-section list style (numbered/lettered/checkbox/glyph) at the
// finding's index — mirrors the editor's listMarker, scaled for small glyphs.
function styleMarkerHtml(style: ListStyle, index: number): string {
  const m = listMarker(style, index);
  const sc = bulletScale(style as BulletShape); // 1 for ordered/checkbox
  return sc !== 1 ? `<span style="font-size:${sc}em">${m}</span>` : m;
}

// A finding's attached images as a stacked column. Rendered in the RIGHT cell
// of a two-column table beside the finding text (Word ignores CSS floats on
// divs, so a table is the only layout it honors reliably — matching the
// conventional report look with the key image alongside the findings).
function findingImagesHtml(f: Finding): string {
  const imgs = (f.images || []).filter((im) => im.src);
  if (imgs.length === 0) return "";
  return imgs
    .map(
      (im) =>
        `<img src="${im.src}" width="170" alt="finding image" style="display:block;width:170px;height:auto;border:2px solid #111;margin:0 0 8px" />`
    )
    .join("");
}

function findingToHtml(
  f: Finding,
  grouped: boolean,
  s: ReportSettings,
  style: ListStyle | undefined,
  index: number
): string {
  // Per-section style overrides the PRIMARY marker (organ when grouped, finding
  // bullet when flat); organ sub-bullets + subpoints keep the global glyphs.
  const organG = grouped && style ? styleMarkerHtml(style, index) : glyphHtml(s.organBullet);
  const findG = glyphHtml(s.findingBullet);
  const flatG = !grouped && style ? styleMarkerHtml(style, index) : findG;
  const subG = glyphHtml(s.subpointBullet);

  const headScore = f.score ? ` <em>[${f.score}]</em>` : "";
  const itemHtml = (text: string, score?: string) =>
    `${text}${score ? ` <em>[${score}]</em>` : ""}`;

  // A boxed finding stores the text-box INSIDE the item text; hoist it so the
  // border wraps the whole line (bullet + organ + text) — same as the editor.
  const boxLine = (lineHtml: string, boxedInner: string | null) =>
    boxedInner !== null ? wrapTextBox(lineHtml) : lineHtml;

  // Subpoints carry a multilevel-list depth: each level indents one more step
  // and takes the next rung of the repeating organ → finding → parameter bullet
  // cycle, so the exported report nests exactly like the editor.
  const subHierarchy = [s.organBullet, s.findingBullet, s.subpointBullet] as const;
  const subs = (f.subpoints || []).filter((sp) => sp.text);
  const subHtml = subs
    .map((sp) => {
      const level = clampLevel(sp.level);
      const glyph = level === 0 ? subG : glyphHtml(subpointShapeAtLevel(subHierarchy, level));
      const indent = 3.15 + level * 1.4; // depth 0 keeps the historical HANG_NESTED
      const style = `margin-left:${indent}em;text-indent:-1.75em`;
      return `<div style="${style}">${glyph}${GAP}${sp.text}</div>`;
    })
    .join("");

  // indent=true → grouped organ sub-bullets (keep global finding glyph);
  // indent=false → flat findings (use the per-section style marker).
  const findingBullets = (indent: boolean) =>
    f.items
      .map((it) => {
        const boxed = unwrapTextBox(it.text);
        return boxLine(
          `<div style="${indent ? HANG_NESTED : HANG}">${indent ? findG : flatG}${GAP}${itemHtml(
            boxed ?? it.text,
            it.score
          )}</div>`,
          boxed
        );
      })
      .join("");

  let body: string;
  if (grouped && f.region) {
    // single finding → organ and finding share one line (glyph outside the
    // <strong> so the bullet isn't bold — matches the editor)
    if (f.items.length === 1) {
      const boxed = unwrapTextBox(f.items[0].text);
      body = `${boxLine(
        `<div style="${HANG}">${organG}${GAP}<strong>${escapeText(f.region)}:</strong> ${itemHtml(
          boxed ?? f.items[0].text,
          f.items[0].score
        )}${headScore}</div>`,
        boxed
      )}${subHtml}`;
    } else {
      // multiple findings → organ headline + one bullet per finding
      body = `<div style="${HANG}">${organG}${GAP}<strong>${escapeText(
        f.region
      )}:</strong>${headScore}</div>${findingBullets(true)}${subHtml}`;
    }
  } else {
    // flat findings (no organ)
    body = `${findingBullets(false)}${subHtml}`;
  }

  // Attach images BESIDE the finding: text in the left cell, image column in
  // the right cell — survives the Word HTML import (floats do not).
  const imgHtml = findingImagesHtml(f);
  if (!imgHtml) return body;
  return (
    `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:2px 0">` +
    `<tr><td valign="top">${body}</td>` +
    `<td valign="top" width="184" style="width:184px;padding-left:14px">${imgHtml}</td></tr></table>`
  );
}

// The exported .doc / clipboard HTML has no app stylesheet, so the "box around
// text" (class="text-box") needs its border inlined to survive in Word — same
// block rectangle the editor shows.
const BOX_INLINE_STYLE =
  "display:block;box-sizing:border-box;border:1px solid #333;border-radius:6px;padding:8px 14px;margin:8px 0;text-indent:0";
const SECTION_HEADING_INLINE_STYLE =
  "font-family:inherit;font-size:1.08em;font-style:inherit;font-weight:600;text-transform:none;letter-spacing:normal;line-height:inherit;color:#000;margin:16px 0 8px";
function inlineTextBoxes(html: string): string {
  return html.replace(/class="text-box"/g, `class="text-box" style="${BOX_INLINE_STYLE}"`);
}

export function sectionsToHtml(sections: ReportSection[], settings: ReportSettings): string {
  const raw = sections
    .map((sec) => {
      // Rendered as a bold <p> — NOT an <h1>-<h6> — so Word does not attach its
      // collapse/expand chevron (that outline control only appears on Heading-
      // styled paragraphs). Bold + black to match the editor's section headings.
      const header = `<p style="${SECTION_HEADING_INLINE_STYLE}">${escapeText(
        sec.name
      )}</p>`;
      if (sec.kind === "prose") return `${header}<div>${sec.html || ""}</div>`;
      const body = (sec.findings || [])
        .map((f, i) => findingToHtml(f, !!sec.grouped, settings, sec.bulletStyle, i))
        .join("");
      return `${header}${body}`;
    })
    .join("");
  return inlineTextBoxes(raw);
}

export function buildPatientLine(patient?: Patient | null): string {
  if (!patient) return "";
  const bits = [
    patient.name,
    patient.mrn ? `MRN ${patient.mrn}` : "",
    patient.dob ? `DOB ${patient.dob}` : "",
    patient.sex,
    patient.accession ? `Acc ${patient.accession}` : "",
  ].filter(Boolean);
  return bits.join("  ·  ");
}

// Labeled, left-aligned patient header for the extracted report (one
// "Label: value" per line) — mirrors a conventional report letterhead. Only
// the fields that are present are shown.
export function buildPatientBlockHtml(patient?: Patient | null): string {
  if (!patient) return "";
  const rows: Array<[string, string | undefined]> = [
    ["Patient name", patient.name],
    ["MRN", patient.mrn],
    ["Date of birth", patient.dob],
    ["Sex", patient.sex],
    ["Study", patient.studyDescription],
    ["Modality", patient.modality],
    ["Accession", patient.accession],
  ];
  const lines = rows
    .filter(([, v]) => v && String(v).trim())
    .map(
      ([label, v]) =>
        `<div style="margin:1px 0"><strong>${label}:</strong> ${escapeText(String(v))}</div>`
    )
    .join("");
  if (!lines) return "";
  return `<div style="margin:0 0 12px">${lines}</div>`;
}

// The radiologist's sign-off (Settings page) — BOLD at the end of the report,
// one line per row of the signature text.
export function buildSignatureHtml(settings: ReportSettings): string {
  const sig = (settings.signature || "").trim();
  if (!sig) return "";
  const lines = sig
    .split(/\r?\n/)
    .map((l) => `<div style="font-weight:bold;margin:1px 0">${escapeText(l)}</div>`)
    .join("");
  return `<div style="margin-top:32px">${lines}</div>`;
}

export function reportToHtml(
  title: string,
  sections: ReportSection[],
  patient: Patient | null | undefined,
  settings: ReportSettings,
  documentHtml?: string
): string {
  const patientBlock = buildPatientBlockHtml(patient);
  const body = documentHtml?.trim()
    ? `<div class="rd-export">${sanitizeEditorDocumentHtml(documentHtml, settings)}</div>`
    : sectionsToHtml(sections, settings);
  const fontFamily =
    settings.fontFamily === "System"
      ? "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
      : `${settings.fontFamily},Georgia,serif`;
  const documentStyles = editorDocumentStyles(settings);
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="RadScribe"><title>${escapeText(
    title
  )}</title><style>@page{margin:1in}${documentStyles}</style></head><body style="font-family:${fontFamily};font-size:${
    settings.fontSize
  }px;line-height:${settings.lineSpacing};max-width:760px;margin:24px auto;color:#1d1d1f${
    settings.defaultItalic ? ";font-style:italic" : ""
  }">
  ${patientBlock}
  <p style="text-align:center;margin:0 0 4px;font-size:1.5em;font-weight:bold">${escapeText(title)}</p>
  <hr/>
  ${body}
  ${buildSignatureHtml(settings)}
  </body></html>`;
}

// The continuous TipTap document is the visual source of truth. Exporting this
// HTML directly preserves the exact block order, nested ul/ol structure,
// headings, alignment, and bold/italic/underline marks authored in the template
// editor. The old sections renderer remains as a fallback for callers without a
// mounted editor (tests, server-side flows, and legacy reports).
function sanitizeEditorDocumentHtml(html: string, settings: ReportSettings): string {
  const cleaned = inlineTextBoxes(html)
    .replace(/\sdata-node-id="[^"]*"/g, "")
    .replace(/\sdata-inserted="true"/g, "")
    .replace(/\sdata-section-key="[^"]*"/g, "");

  if (typeof DOMParser === "undefined") return cleaned;
  const parsed = new DOMParser().parseFromString(`<div>${cleaned}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return cleaned;

  const appendStyle = (element: Element, declaration: string) => {
    const current = element.getAttribute("style")?.trim().replace(/;$/, "") || "";
    element.setAttribute("style", current ? `${current};${declaration}` : declaration);
  };

  // Word attaches collapse/expand chevrons to h1-h6 outline paragraphs. Keep
  // the editor's exact visual heading treatment, but export ordinary paragraphs
  // so section names are never collapsible.
  Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).forEach((heading) => {
    const paragraph = parsed.createElement("p");
    for (const attribute of Array.from(heading.attributes)) {
      if (attribute.name !== "class") paragraph.setAttribute(attribute.name, attribute.value);
    }
    while (heading.firstChild) paragraph.appendChild(heading.firstChild);
    appendStyle(
      paragraph,
      SECTION_HEADING_INLINE_STYLE
    );
    heading.replaceWith(paragraph);
  });

  // Word does not consistently import custom CSS list-style markers, and may
  // silently replace them with its own bullets. Materialize every marker into
  // a borderless two-cell layout instead. The left cell is the exact glyph or
  // number shown in the editor; the right cell retains the original paragraph
  // nodes, alignment, and inline marks. Nested lists are rendered recursively.
  const hierarchy = [settings.organBullet, settings.findingBullet, settings.subpointBullet] as const;
  const bulletSpec = (list: Element, depth: number): { marker: string; scale: number } => {
    const explicit = list.getAttribute("data-list-style");
    if (explicit === "triangle") return { marker: "▲", scale: 1 };
    if (
      explicit === "disc" ||
      explicit === "circle" ||
      explicit === "square" ||
      explicit === "square-hollow" ||
      explicit === "dash" ||
      explicit === "arrow" ||
      explicit === "diamond"
    ) {
      const shape = explicit as BulletShape;
      return { marker: bulletGlyph(shape), scale: bulletScale(shape) };
    }
    const shape = hierarchy[depth % hierarchy.length];
    return { marker: bulletGlyph(shape), scale: bulletScale(shape) };
  };
  const alphaMarker = (value: number, upper: boolean): string => {
    let current = Math.max(1, Math.floor(value));
    let result = "";
    while (current > 0) {
      current -= 1;
      result = String.fromCharCode(97 + (current % 26)) + result;
      current = Math.floor(current / 26);
    }
    return upper ? result.toUpperCase() : result;
  };
  const orderedMarker = (list: Element, value: number): string => {
    switch (list.getAttribute("type")) {
      case "a":
        return `${alphaMarker(value, false)}.`;
      case "A":
        return `${alphaMarker(value, true)}.`;
      case "i":
        return listMarker("lower-roman", value - 1);
      case "I":
        return listMarker("upper-roman", value - 1);
      default:
        return `${value}.`;
    }
  };
  const renderList = (list: Element, depth: number): HTMLElement => {
    const container = parsed.createElement("div");
    container.setAttribute("style", "margin:.25em 0");
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    let orderedValue = Number.parseInt(list.getAttribute("start") || "1", 10);
    if (!Number.isFinite(orderedValue)) orderedValue = 1;

    items.forEach((item) => {
      const explicitValue = Number.parseInt(item.getAttribute("value") || "", 10);
      if (list.tagName === "OL" && Number.isFinite(explicitValue)) orderedValue = explicitValue;
      const spec =
        list.tagName === "OL"
          ? { marker: orderedMarker(list, orderedValue), scale: 1 }
          : bulletSpec(list, depth);
      const nestedLists = Array.from(item.children).filter(
        (child) => child.tagName === "UL" || child.tagName === "OL"
      );

      const table = parsed.createElement("table");
      table.setAttribute("role", "presentation");
      table.setAttribute("cellpadding", "0");
      table.setAttribute("cellspacing", "0");
      table.setAttribute("width", "100%");
      table.setAttribute(
        "style",
        `border-collapse:collapse;border:0;margin:3px 0 3px ${depth * 22}px`
      );
      const row = parsed.createElement("tr");
      const markerCell = parsed.createElement("td");
      markerCell.setAttribute(
        "style",
        "border:0;width:28px;padding:0 8px 0 0;vertical-align:top;text-align:right;white-space:nowrap"
      );
      const markerSpan = parsed.createElement("span");
      if (spec.scale !== 1) markerSpan.setAttribute("style", `font-size:${spec.scale}em`);
      markerSpan.textContent = spec.marker;
      markerCell.appendChild(markerSpan);

      const contentCell = parsed.createElement("td");
      contentCell.setAttribute(
        "style",
        "border:0;width:100%;padding:0;vertical-align:top"
      );
      Array.from(item.childNodes)
        .filter(
          (node) =>
            !(node instanceof Element && (node.tagName === "UL" || node.tagName === "OL"))
        )
        .forEach((node) => contentCell.appendChild(node));

      row.append(markerCell, contentCell);
      table.appendChild(row);
      container.appendChild(table);
      nestedLists.forEach((nested) => container.appendChild(renderList(nested, depth + 1)));
      orderedValue += 1;
    });
    return container;
  };
  Array.from(root.querySelectorAll("ul,ol"))
    .filter((list) => !list.parentElement?.closest("ul,ol"))
    .forEach((list) => list.replaceWith(renderList(list, 0)));

  return root.innerHTML;
}

function cssListStyle(shape: BulletShape): string {
  if (shape === "disc" || shape === "circle" || shape === "square") return shape;
  return `"${bulletGlyph(shape).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}  "`;
}

function editorDocumentStyles(settings: ReportSettings): string {
  const level0 = cssListStyle(settings.organBullet);
  const level1 = cssListStyle(settings.findingBullet);
  const level2 = cssListStyle(settings.subpointBullet);
  return `
    .rd-export{margin-top:14px}
    .rd-export p{margin:.25em 0}
    .rd-export .rd-section-heading{${SECTION_HEADING_INLINE_STYLE}}
    .rd-export ul,.rd-export ol{margin:.25em 0;padding-left:1.6em}
    .rd-export ul{list-style-type:disc}
    .rd-export ol{list-style-type:decimal}
    .rd-export ul ul{list-style-type:circle}
    .rd-export ul ul ul{list-style-type:square}
    .rd-export>ul:not([data-list-style]){list-style-type:${level0}}
    .rd-export>ul li>ul:not([data-list-style]){list-style-type:${level1}}
    .rd-export>ul li>ul:not([data-list-style]) li>ul:not([data-list-style]){list-style-type:${level2}}
    .rd-export ul[data-list-style="disc"]{list-style-type:disc}
    .rd-export ul[data-list-style="circle"]{list-style-type:circle}
    .rd-export ul[data-list-style="square"]{list-style-type:square}
    .rd-export ul[data-list-style="square-hollow"]{list-style-type:"▫  "}
    .rd-export ul[data-list-style="triangle"]{list-style-type:"▲  "}
    .rd-export ul[data-list-style="dash"]{list-style-type:"–  "}
    .rd-export ul[data-list-style="arrow"]{list-style-type:"→  "}
    .rd-export ul[data-list-style="diamond"]{list-style-type:"◆  "}
    .rd-export .text-box{${BOX_INLINE_STYLE}}
    .rd-export .text-box>*{text-indent:0;margin-left:0;margin-right:0}
    .rd-export img{max-width:100%;height:auto}
  `;
}

function editorDocumentToPlainText(html: string, settings: ReportSettings): string[] | null {
  if (typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = parsed.body.firstElementChild;
  if (!root) return null;

  const lines: string[] = [];
  const cleanText = (value: string | null) =>
    (value || "").replace(/\u00a0/g, " ").replace(/[ \t\r\n]+/g, " ").trim();
  const hierarchy = [settings.organBullet, settings.findingBullet, settings.subpointBullet] as const;
  const markerForBulletList = (list: Element, depth: number): string => {
    const explicit = list.getAttribute("data-list-style");
    if (explicit === "triangle") return "▲";
    if (
      explicit === "disc" ||
      explicit === "circle" ||
      explicit === "square" ||
      explicit === "square-hollow" ||
      explicit === "dash" ||
      explicit === "arrow" ||
      explicit === "diamond"
    ) {
      return bulletGlyph(explicit as BulletShape);
    }
    return bulletGlyph(hierarchy[depth % hierarchy.length]);
  };
  const walkList = (list: Element, depth: number) => {
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    let orderedValue = Number.parseInt(list.getAttribute("start") || "1", 10);
    if (!Number.isFinite(orderedValue)) orderedValue = 1;
    items.forEach((item) => {
      const explicitValue = Number.parseInt(item.getAttribute("value") || "", 10);
      if (list.tagName === "OL" && Number.isFinite(explicitValue)) orderedValue = explicitValue;
      const content = item.cloneNode(true) as Element;
      content.querySelectorAll("ul,ol").forEach((nested) => nested.remove());
      const text = cleanText(content.textContent);
      const marker =
        list.tagName === "OL"
          ? `${orderedValue}.`
          : markerForBulletList(list, depth);
      if (text) lines.push(`${"    ".repeat(depth)}${marker}   ${text}`);
      Array.from(item.children)
        .filter((child) => child.tagName === "UL" || child.tagName === "OL")
        .forEach((nested) => walkList(nested, depth + 1));
      orderedValue += 1;
    });
  };
  const walkBlock = (element: Element) => {
    if (element.tagName === "UL" || element.tagName === "OL") {
      walkList(element, 0);
      return;
    }
    if (/^H[1-6]$/.test(element.tagName)) {
      const text = cleanText(element.textContent);
      if (text) lines.push(text);
      return;
    }
    if (element.tagName === "P") {
      const text = cleanText(element.textContent);
      if (text) lines.push(text);
      return;
    }
    const blockChildren = Array.from(element.children).filter((child) =>
      /^(H[1-6]|P|UL|OL|DIV|BLOCKQUOTE|PRE)$/.test(child.tagName)
    );
    if (blockChildren.length) {
      blockChildren.forEach(walkBlock);
      return;
    }
    const text = cleanText(element.textContent);
    if (text) lines.push(text);
  };
  Array.from(root.children).forEach(walkBlock);
  return lines;
}

export function reportToPlainText(
  title: string,
  sections: ReportSection[],
  patient: Patient | null | undefined,
  settings: ReportSettings,
  documentHtml?: string
): string {
  const organG = bulletGlyph(settings.organBullet);
  const findG = bulletGlyph(settings.findingBullet);
  const subG = bulletGlyph(settings.subpointBullet);

  const lines: string[] = [];
  if (patient) {
    const rows: Array<[string, string | undefined]> = [
      ["Patient name", patient.name],
      ["MRN", patient.mrn],
      ["Date of birth", patient.dob],
      ["Sex", patient.sex],
      ["Study", patient.studyDescription],
      ["Modality", patient.modality],
      ["Accession", patient.accession],
    ];
    for (const [label, v] of rows) {
      if (v && String(v).trim()) lines.push(`${label}: ${v}`);
    }
    if (lines.length) lines.push("");
  }
  lines.push(title.toUpperCase());
  lines.push("");
  const editorLines = documentHtml?.trim()
    ? editorDocumentToPlainText(documentHtml, settings)
    : null;
  if (editorLines) {
    lines.push(...editorLines);
    lines.push("");
  } else {
    for (const sec of sections) {
      lines.push(sec.name);
      if (sec.kind === "prose") {
        lines.push(htmlToText(sec.html || ""));
      } else {
        sec.findings?.forEach((f, i) => {
          const score = f.score ? ` [${f.score}]` : "";
          const itemText = (it: { text: string; score?: string }) =>
            `${htmlToText(it.text)}${it.score ? ` [${it.score}]` : ""}`;
          // Per-section style overrides the primary marker (organ when grouped,
          // finding bullet when flat), indexed by the finding's position.
          const primaryG = sec.bulletStyle ? listMarker(sec.bulletStyle, i) : organG;
          const flatG = sec.bulletStyle ? listMarker(sec.bulletStyle, i) : findG;
          if (sec.grouped && f.region) {
            if (f.items.length === 1) {
              lines.push(`${primaryG}   ${f.region}: ${itemText(f.items[0])}${score}`);
            } else {
              lines.push(`${primaryG}   ${f.region}:${score}`);
              for (const it of f.items) lines.push(`    ${findG}   ${itemText(it)}`);
            }
          } else {
            for (const it of f.items) lines.push(`${flatG}   ${itemText(it)}`);
          }
          for (const sp of f.subpoints || []) {
            const t = htmlToText(sp.text);
            if (!t) continue;
            const level = clampLevel(sp.level);
            const glyph =
              level === 0
                ? subG
                : bulletGlyph(
                    subpointShapeAtLevel(
                      [settings.organBullet, settings.findingBullet, settings.subpointBullet],
                      level
                    )
                  );
            lines.push(`${" ".repeat(8 + level * 4)}${glyph}   ${t}`);
          }
        });
      }
      lines.push("");
    }
  }
  const sig = (settings.signature || "").trim();
  if (sig) {
    lines.push("");
    for (const l of sig.split(/\r?\n/)) lines.push(l);
  }
  return lines.join("\n").trim() + "\n";
}
