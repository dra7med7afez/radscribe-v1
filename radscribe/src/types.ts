// ============================================================
// RadScribe core types (§8a, §11)
// The template's section list is the single source of truth.
// There is NO fixed Technique/Findings/Impression skeleton and
// NO SECTION_ORDER / SECTION_TITLES constant anywhere.
// ============================================================

import type { BulletShape, ListStyle } from "@/lib/bullets";
import type { JSONContent } from "@tiptap/core";
export type { BulletShape, ListStyle };

export type SectionKind = "prose" | "findings";

export type DictationMode = "verbatim" | "concise";

// ---- Template model (§8a) ----------------------------------

export interface TemplateFindingSeed {
  region: string; // '' ⇒ headingless / flat entry
  normalText: string;
  subpoints?: string[]; // optional parameters rendered as sub-bullets
  children?: TemplateFindingSeed[]; // nested sub-findings (template builder only)
}

export interface TemplateSection {
  id: string; // stable key (slug of name + index)
  name: string; // the radiologist's OWN label, shown verbatim in the UI
  kind: SectionKind; // 'prose' = free-text block; 'findings' = finding list
  grouped: boolean; // findings only: true = organ headings, false = flat list
  defaultProse?: string; // prose sections: starting HTML
  findings?: TemplateFindingSeed[]; // findings sections
  normalImpression?: string; // optional fallback for a conclusion section
  isConclusion?: boolean; // prose section flagged for optional auto-derive
  bulletStyle?: ListStyle; // findings sections: detected bullet / numbering style
}

export interface Template {
  id: string;
  name: string;
  modality: string;
  bodyPart: string;
  description?: string;
  version?: number;
  // Canonical lossless editor document. `sections` remains a derived routing
  // projection for dictation and backwards compatibility.
  document?: JSONContent;
  editorSettings?: Pick<
    ReportSettings,
    | "fontFamily"
    | "fontSize"
    | "lineSpacing"
    | "defaultItalic"
    | "organBullet"
    | "findingBullet"
    | "subpointBullet"
    | "listPreset"
  >;
  sections: TemplateSection[]; // ORDER = display order; any count ≥ 1
  updatedAt?: string;
  slug?: string; // stable seed identifier for global starter templates
  global?: boolean; // true = shared starter template (admin-managed)
}

// ---- Live report model (§11) -------------------------------

export interface FindingImage {
  id: string;
  src: string; // data URL
}

export interface FindingItem {
  id: string;
  text: string; // RICH html
  impression?: string;
  score?: string;
  // true when this item's text came from a dictation insert (structuring
  // pipeline) — rendered with the "inserted" highlight in the editor
  inserted?: boolean;
  // subpoints only: 0-based indent depth (Word's multilevel list). Absent /
  // 0 = the first sub-level, which is what every pre-existing report has, so
  // old data loads unchanged.
  level?: number;
}

export interface Finding {
  id: string;
  region: string; // '' ⇒ headingless (flat) / grouped:false
  items: FindingItem[];
  normalText: string;
  abnormal: boolean;
  score?: string; // score on the whole finding/heading
  images?: FindingImage[]; // thumbnails for the side rail (NOT body)
  subpoints?: FindingItem[]; // parameters rendered as sub-bullets (different shape)
}

export interface ReportSection {
  id: string; // matches the template section id
  name: string; // verbatim label shown in the UI
  kind: SectionKind;
  grouped?: boolean; // findings sections only
  isConclusion?: boolean; // prose section flagged for optional auto-derive
  normalImpression?: string;
  html?: string; // prose sections: the editable body
  findings?: Finding[]; // findings sections
  bulletStyle?: ListStyle; // findings sections: per-section bullet / numbering style
}

// ---- Settings (§10b, §11) ----------------------------------

export interface ReportSettings {
  fontFamily: string;
  fontSize: number;
  lineSpacing: number;
  showSeparators: boolean;
  defaultMode: DictationMode;
  // Optional per-user guidance applied only when AI structures report text.
  structuringInstructions?: string;
  defaultItalic: boolean;
  // bullet shapes — chosen per level (organ / finding / subpoint) in Settings
  organBullet: BulletShape;
  findingBullet: BulletShape;
  subpointBullet: BulletShape;
  // id of the active List Style gallery preset (the bullet hierarchy applied via
  // the editor's Bullets picker). Undefined = custom / no preset selected.
  listPreset?: string;
  // radiologist's sign-off (e.g. "Dr. A. Hafez, MD\nConsultant Radiologist") —
  // rendered BOLD at the end of the extracted report; empty = no signature
  signature?: string;
}

// ---- AI structuring result (§12) ---------------------------

export interface StructureResult {
  sectionId?: string;
  sectionName?: string;
  kind: SectionKind;
  region: string; // '' for prose & flat findings
  findingId?: string; // id of the existing finding (bullet) to UPDATE; '' = new
  subpointId?: string; // id of an existing subpoint/parameter to UPDATE in place; '' = none
  text: string;
  impression?: string;
  abnormal: boolean;
  // Retained for compatibility with older saved/API payloads. Current
  // structuring inserts only beneath headings already present in the template.
  newSection?: boolean;
}

// Complete TipTap tree sent to the document-native AI router. Only block nodes
// have ids; text/marks remain children so the model sees the document exactly
// as authored without relying on derived sections or organs.
export interface DocumentTreeNode {
  id?: string;
  type: string;
  text?: string;
  marks?: string[];
  attrs?: Record<string, unknown>;
  children?: DocumentTreeNode[];
}

export interface DocumentEditResult {
  targetNodeId: string;
  operation:
    | "replace"
    | "insertBefore"
    | "insertAfter"
    | "setOrganChildren"
    // Legacy document edits can still be rendered, but the current AI contract
    // no longer generates organ wrappers when an organ is absent.
    | "insertOrganBefore"
    | "insertOrganAfter";
  text: string;
  children?: string[];
}

// ---- Auth / patients / integrations ------------------------

export type AccountType = "INDIVIDUAL" | "ORGANIZATION";

export interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
  mustChangePassword?: boolean; // forced password rotation on first login
  accountType?: AccountType; // individual radiologist vs organization account
  organizationName?: string | null;
  mfaEnabled?: boolean;
}

export type PatientSource = "integration" | "local";

export interface Patient {
  id: string;
  mrn: string;
  name: string;
  dob?: string;
  sex?: string;
  accession?: string;
  studyDescription?: string;
  modality?: string;
  status?: string;
  source: PatientSource;
}

export type IntegrationType = "fhir" | "hl7" | "dicom" | "generic";
export type IntegrationStatus = "disconnected" | "connected" | "error";

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  status: IntegrationStatus;
  config: Record<string, string>;
  enabled: boolean;
  lastSyncAt?: string;
}
