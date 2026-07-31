import { apiFetch } from "@/lib/api/client";
import type { Template, TemplateSection, TemplateFindingSeed, ListStyle } from "@/types";

export interface RawAiFinding {
  region: string;
  normalText: string;
  subpoints?: string[];
  children?: RawAiFinding[];
}

export interface RawAiSection {
  name: string;
  kind: "prose" | "findings";
  grouped?: boolean;
  defaultProse?: string;
  normalImpression?: string;
  isConclusion?: boolean;
  bulletStyle?: string;
  findings?: RawAiFinding[];
}

// The wire shape the backend accepts for create/update (section model without
// client-only fields). Section ids are assigned server-side.
function toWire(t: Template) {
  return {
    name: t.name,
    modality: t.modality,
    bodyPart: t.bodyPart,
    description: t.description,
    version: t.version ?? 1,
    document: t.document,
    editorSettings: t.editorSettings,
    sections: t.sections.map((s) => ({
      name: s.name,
      kind: s.kind,
      grouped: !!s.grouped,
      defaultProse: s.defaultProse,
      normalImpression: s.normalImpression,
      isConclusion: s.isConclusion,
      bulletStyle: s.bulletStyle,
      findings: s.findings?.map((f) => ({
        region: f.region,
        normalText: f.normalText,
        subpoints: f.subpoints,
        children: f.children,
      })),
    })),
  };
}

export const templatesApi = {
  list: () => apiFetch<Template[]>("/templates"),
  create: (t: Template) =>
    apiFetch<Template>("/templates", { method: "POST", body: toWire(t) }),
  update: (id: string, t: Template) =>
    apiFetch<Template>(`/templates/${id}`, { method: "PUT", body: toWire(t) }),
  remove: (id: string) =>
    apiFetch<{ ok: boolean }>(`/templates/${id}`, { method: "DELETE" }),
  extract: (fileBase64: string, filename?: string) =>
    apiFetch<{ text: string }>("/templates/extract", {
      method: "POST",
      body: { fileBase64, filename },
    }),
  analyze: (text: string) =>
    apiFetch<{ sections: RawAiSection[]; ai: boolean }>("/templates/analyze", {
      method: "POST",
      body: { text },
    }),
};

const VALID_LIST_STYLES: ListStyle[] = [
  "disc", "circle", "square", "square-hollow", "dash", "arrow", "diamond",
  "checkbox", "decimal", "lower-alpha", "upper-roman", "lower-roman",
];

function normalizeBulletStyle(raw?: string): ListStyle | undefined {
  if (!raw) return undefined;
  return VALID_LIST_STYLES.includes(raw as ListStyle) ? (raw as ListStyle) : undefined;
}

function toFindingSeed(f: RawAiFinding): TemplateFindingSeed {
  return {
    region: f.region ?? "",
    normalText: f.normalText ?? "",
    subpoints: Array.isArray(f.subpoints) ? f.subpoints.filter(Boolean) : undefined,
    children: Array.isArray(f.children) && f.children.length ? f.children.map(toFindingSeed) : undefined,
  };
}

// Assign stable ids + normalize an AI/raw section into a TemplateSection.
export function toTemplateSection(s: RawAiSection, index: number): TemplateSection {
  const slug =
    s.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "section";
  const id = `${slug}-${index}`;
  if (s.kind === "findings") {
    return {
      id,
      name: s.name,
      kind: "findings",
      grouped: !!s.grouped,
      bulletStyle: normalizeBulletStyle(s.bulletStyle),
      findings: (s.findings || []).map(toFindingSeed),
    };
  }
  return {
    id,
    name: s.name,
    kind: "prose",
    grouped: false,
    defaultProse: s.defaultProse || "<p></p>",
    normalImpression: s.normalImpression || undefined,
    isConclusion: !!s.isConclusion,
  };
}
