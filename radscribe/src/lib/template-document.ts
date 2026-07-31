import type { JSONContent } from "@tiptap/core";
import { docToStoreSections, sectionsToDoc, PREAMBLE_ID } from "@/components/report-editor/convert";
import { sectionKeyFor } from "@/lib/report-doc";
import { uid } from "./utils";
import type { ReportSection, Template, TemplateSection } from "@/types";

export function cloneDocument(document: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(document)) as JSONContent;
}

export function emptyTemplateDocument(): JSONContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function nodeText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  return (node.content || []).map(nodeText).join("");
}

// Older or manually authored templates may contain section names as ordinary
// top-level paragraphs. Promote exact known names so the report has real,
// addressable section headings and AI can insert beneath them.
export function normalizeTemplateDocument(document: JSONContent): JSONContent {
  const normalized = cloneDocument(document);
  normalized.content = (normalized.content || []).map((node) => {
    if (node.type !== "paragraph") return node;
    const key = sectionKeyFor(nodeText(node));
    if (!key) return node;
    const attrs = node.attrs || {};
    return {
      ...node,
      type: "heading",
      attrs: {
        level: 2,
        sectionKey: key,
        ...(attrs.textAlign ? { textAlign: attrs.textAlign } : {}),
        ...(attrs.aiId ? { aiId: attrs.aiId } : {}),
      },
    };
  });
  return normalized;
}

export function templateInitialDocument(template?: Template | null): JSONContent {
  if (template?.document) return normalizeTemplateDocument(template.document);
  if (!template?.sections?.length) return emptyTemplateDocument();
  return sectionsToDoc(templateSectionsToReportSections(template.sections));
}

export function templateSectionsToReportSections(sections: TemplateSection[]): ReportSection[] {
  return sections.map((section) =>
    section.kind === "findings"
      ? {
          id: section.id,
          name: section.name,
          kind: "findings" as const,
          grouped: section.grouped,
          bulletStyle: section.bulletStyle,
          findings: (section.findings || []).map((finding) => ({
            id: uid("fnd"),
            region: finding.region,
            normalText: finding.normalText,
            abnormal: false,
            items: [{ id: uid("itm"), text: finding.normalText }],
            subpoints: (finding.subpoints || []).map((text) => ({ id: uid("sp"), text })),
            images: [],
          })),
        }
      : {
          id: section.id,
          name: section.name,
          kind: "prose" as const,
          isConclusion: section.isConclusion,
          normalImpression: section.normalImpression,
          html: section.defaultProse || "<p></p>",
        }
  );
}

export function templateToReportSections(template: Template): ReportSection[] {
  const legacy = templateSectionsToReportSections(template.sections);
  return template.document
    ? docToStoreSections(normalizeTemplateDocument(template.document), legacy)
    : legacy;
}

// Template sections remain available for AI routing and legacy clients, but
// are derived from the canonical document rather than constraining the editor.
export function documentToTemplateSections(
  document: JSONContent,
  previous: TemplateSection[] = []
): TemplateSection[] {
  const reportSections = docToStoreSections(
    normalizeTemplateDocument(document),
    templateSectionsToReportSections(previous)
  );

  const converted = reportSections.map((section, index): TemplateSection => {
    const id = section.id === PREAMBLE_ID ? `content-${index}` : section.id || uid("sec");
    const name = section.name.trim() || "Report Content";
    if (section.kind === "findings") {
      return {
        id,
        name,
        kind: "findings",
        grouped: !!section.grouped,
        bulletStyle: section.bulletStyle,
        findings: (section.findings || []).map((finding) => ({
          region: finding.region,
          normalText: finding.items.map((item) => item.text).filter(Boolean).join(" "),
          subpoints: finding.subpoints?.map((item) => item.text).filter(Boolean),
        })),
      };
    }
    return {
      id,
      name,
      kind: "prose",
      grouped: false,
      defaultProse: section.html || "<p></p>",
      isConclusion: section.isConclusion,
      normalImpression: section.normalImpression,
    };
  });

  return converted.length
    ? converted
    : [{ id: uid("sec"), name: "Report Content", kind: "prose", grouped: false, defaultProse: "<p></p>" }];
}
