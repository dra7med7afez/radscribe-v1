import { create } from "zustand";
import type {
  Template,
  TemplateSection,
  TemplateFindingSeed,
  ReportSection,
  Finding,
  FindingItem,
  ReportSettings,
  DictationMode,
  StructureResult,
} from "@/types";
import { SEED_TEMPLATES } from "@/data/templates";
import { uid, slug, escapeHtml, htmlToText } from "@/lib/utils";
import { aiApi } from "@/services/ai.api";
import { templatesApi } from "@/services/templates.api";
import { usersApi } from "@/services/users.api";
import { useAuthStore } from "@/store/authStore";
// imports nothing itself — no cycle back into the component layer
import { flushProjection } from "@/components/report-editor/projection-bridge";
import { templateInitialDocument, templateToReportSections } from "@/lib/template-document";
import { ApiError } from "@/lib/api/client";

// localStorage keys are per-user so an account switch on a shared workstation
// never leaks one radiologist's data into another's session.
function userKey(base: string): string {
  const email = useAuthStore.getState().user?.email || "anon";
  return `${base}:${email}`;
}

const SETTINGS_KEY = "radscribe-settings";
const TEMPLATE_CACHE_KEY = "radscribe-templates-cache";
const TEMPLATE_RECENTS_KEY = "radscribe-template-recents";
const STRUCTURING_INSTRUCTIONS_MAX = 2_000;

// Ids of templates that exist on the backend (from the last successful
// hydrate/save) — decides between POST (new) and PUT (update) when persisting.
const serverIds = new Set<string>();

// Seed templates are usable immediately while server templates hydrate, but
// their local ids are not valid foreign keys for report creation.
export function persistedTemplateId(id: string): string | undefined {
  return serverIds.has(id) ? id : undefined;
}

function loadTemplateCache(): Template[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(userKey(TEMPLATE_CACHE_KEY));
    return raw ? (JSON.parse(raw) as Template[]) : null;
  } catch {
    return null;
  }
}

function saveTemplateCache(templates: Template[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userKey(TEMPLATE_CACHE_KEY), JSON.stringify(templates));
  } catch {
    /* quota — cache is best-effort */
  }
}

function loadRecentTemplateIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(userKey(TEMPLATE_RECENTS_KEY));
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string").slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function saveRecentTemplateIds(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(userKey(TEMPLATE_RECENTS_KEY), JSON.stringify(ids));
  } catch {
    /* best-effort preference */
  }
}

const DEFAULT_SETTINGS: ReportSettings = {
  fontFamily: "Georgia",
  fontSize: 15,
  lineSpacing: 1.6,
  showSeparators: true,
  defaultMode: "concise",
  structuringInstructions: "",
  defaultItalic: false,
  organBullet: "disc",
  findingBullet: "dash",
  subpointBullet: "circle",
  listPreset: "disc-dash-circle",
  signature: "",
};

function loadSettings(): ReportSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    // fall back to the legacy shared key so existing installs keep their settings
    const raw =
      window.localStorage.getItem(userKey(SETTINGS_KEY)) ||
      window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    normalizeSettings(merged);
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Guard against unknown persisted structuring modes (the removed "academic"
// and "personal" presets fold into "concise").
function normalizeSettings(s: ReportSettings) {
  if (!["verbatim", "concise"].includes(s.defaultMode)) s.defaultMode = "concise";
  s.structuringInstructions =
    typeof s.structuringInstructions === "string"
      ? s.structuringInstructions.slice(0, STRUCTURING_INSTRUCTIONS_MAX)
      : "";
}

function saveSettings(s: ReportSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(userKey(SETTINGS_KEY), JSON.stringify(s));
}

// Debounced per-user settings sync (cross-device); offline failures are silent.
let settingsPushTimer: ReturnType<typeof setTimeout> | null = null;
function pushSettingsToServer(s: ReportSettings) {
  if (settingsPushTimer) clearTimeout(settingsPushTimer);
  settingsPushTimer = setTimeout(() => {
    usersApi.saveSettings(s as unknown as Record<string, unknown>).catch(() => {});
  }, 800);
}

// ---- Build a live report section list from a template (§11 loadTemplate) ----

// Flatten a template seed's nested children into a flat list of subpoint lines
// (the live report keeps the organ → finding → parameter levels; nested template
// groups collapse into parameters, with deeper labels joined as a path).
function flattenChildren(children: TemplateFindingSeed[], prefix = ""): string[] {
  const out: string[] = [];
  for (const c of children) {
    const label = c.region ? `${prefix}${c.region}: ` : prefix;
    const text = (c.normalText || "").trim();
    if (text) out.push(`${label}${text}`.trim());
    else if (c.region) out.push(`${c.region}:`);
    for (const sp of c.subpoints || []) out.push(`${label}${sp}`.trim());
    if (c.children?.length) out.push(...flattenChildren(c.children, label));
  }
  return out;
}

function buildFinding(seed: TemplateFindingSeed): Finding {
  const subTexts = [...(seed.subpoints || []), ...(seed.children?.length ? flattenChildren(seed.children) : [])];
  return {
    id: uid("fnd"),
    region: seed.region,
    normalText: seed.normalText,
    abnormal: false,
    items: [{ id: uid("itm"), text: seed.normalText }],
    subpoints: subTexts.map((t) => ({ id: uid("sp"), text: t })),
    images: [],
  };
}

function buildSections(template: Template): ReportSection[] {
  return templateToReportSections(template);
}

// ---- Impression derivation (§9, §11) ----------------------------------------

// Impression lines become a real bullet list (<ul>), so in the editor they get
// TipTap's list behavior — Enter continues the list, Tab indents — exactly
// like any list made from the toolbar.
function impressionList(lines: string[]): string {
  return `<ul>${lines.map((l) => `<li><p>${escapeHtml(l)}</p></li>`).join("")}</ul>`;
}

function deriveImpression(sections: ReportSection[], normalImpression?: string): string {
  const lines: string[] = [];
  for (const sec of sections) {
    if (sec.kind !== "findings" || !sec.findings) continue;
    for (const f of sec.findings) {
      if (!f.abnormal) continue;
      for (const it of f.items) {
        const line = (it.impression && it.impression.trim()) || htmlToText(it.text);
        if (line) lines.push(line);
      }
    }
  }
  if (lines.length === 0) {
    return `<p>${escapeHtml(normalImpression || "No acute abnormality.")}</p>`;
  }
  // Bulleted lines (not numbered), same as a toolbar-made bullet list.
  return impressionList(lines);
}

// Local, offline fallback used only when the AI impression call fails — the
// impression is normally generated ONCE from the whole report (see
// regenerateImpression), never rebuilt after each dictation take.
function reDeriveConclusions(sections: ReportSection[]): ReportSection[] {
  return sections.map((s) =>
    s.kind === "prose" && s.isConclusion
      ? { ...s, html: deriveImpression(sections, s.normalImpression) }
      : s
  );
}

// Serialize the live report to plain text for the whole-report impression call.
// The conclusion section itself is excluded so a previous impression is never
// fed back into the next one.
function reportPlainText(sections: ReportSection[], clinicalInfo: string): string {
  const parts: string[] = [];
  if (clinicalInfo.trim()) parts.push(`Clinical information:\n${clinicalInfo.trim()}`);
  for (const sec of sections) {
    if (sec.kind === "prose") {
      if (sec.isConclusion) continue;
      const t = htmlToText(sec.html || "").trim();
      if (t) parts.push(`${sec.name}:\n${t}`);
      continue;
    }
    const lines: string[] = [];
    for (const f of sec.findings || []) {
      for (const it of f.items) {
        const t = htmlToText(it.text).trim();
        if (!t) continue;
        const head = f.region ? `${f.region}: ` : "";
        lines.push(`- ${head}${t}${f.abnormal ? " [abnormal]" : ""}`);
      }
      for (const sp of f.subpoints || []) {
        const t = htmlToText(sp.text).trim();
        if (t) lines.push(`  · ${t}`);
      }
    }
    if (lines.length) parts.push(`${sec.name}:\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

// True when the report has a dedicated conclusion/impression section. When it
// does NOT, findings sections are "combined" — each finding carries its own
// conclusion, so a dictated finding's impression is folded into the same bullet
// (radiologists who keep findings + conclusion in one section).
function hasConclusionSection(sections: ReportSection[]): boolean {
  return sections.some(
    (s) =>
      s.kind === "prose" &&
      (s.isConclusion || /\b(impression|conclusion|opinion)\b/i.test(s.name))
  );
}

// Fold a finding's conclusion (impression line) into its own text so finding +
// conclusion read as one bullet — used only for combined sections (above).
// Convention: description … interpretation (ellipsis separator). Not every
// finding gets an interpretation, and one that merely restates the description
// is dropped (the model is told to send interpretation-only phrases; this is
// the safety net against repetition).
function withConclusion(text: string, impression?: string): string {
  const t = text.trim();
  const imp = (impression || "").trim().replace(/^[.…\s]+/, "");
  if (!imp || t.toLowerCase().includes(imp.toLowerCase())) return t;
  const tWords = new Set(t.toLowerCase().match(/[a-z0-9]+/g) || []);
  const impWords = (imp.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2);
  const repeated = impWords.filter((w) => tWords.has(w)).length;
  if (impWords.length > 0 && repeated / impWords.length > 0.7) return t;
  return `${t.replace(/[.\s]+$/, "")} … ${imp}`;
}

// Match a dictated region to an existing finding's region so an abnormal finding
// reliably REPLACES the right normal default — tolerant of name differences
// (e.g. "Heart" ↔ "Heart and Vessels", "lung" ↔ "Lungs") that can arise with
// AI-created templates or the offline fallback.
function matchFindingByRegion(findings: Finding[], region: string): Finding | undefined {
  const r = region.toLowerCase().trim();
  if (!r) return undefined;
  // 1) exact
  const exact = findings.find((f) => f.region.toLowerCase().trim() === r);
  if (exact) return exact;
  // 2) containment either direction (only against findings that have a region).
  // Apply a fuzzy match only when it is unique: "Kidney" must not silently
  // choose Left Kidney over Right Kidney merely because it appears first.
  const contained = findings.filter((f) => {
    const fr = f.region.toLowerCase().trim();
    return !!fr && (fr.includes(r) || r.includes(fr));
  });
  if (contained.length === 1) return contained[0];
  if (contained.length > 1) return undefined;
  // 3) shared significant first word
  const first = r.split(/\s+/)[0];
  if (first.length > 3) {
    const sameFirstWord = findings.filter((f) =>
      f.region.toLowerCase().split(/\s+/).includes(first)
    );
    if (sameFirstWord.length === 1) return sameFirstWord[0];
  }
  return undefined;
}

// Sections that conventionally sit at the top of a report (before findings)
// when the radiologist dictates them into existence.
const HEADER_SECTION_RE =
  /^(clinical history|history|indication|comparison|technique|examination|protocol|contrast)$/i;

// ---- Store -------------------------------------------------------------------

interface ReportState {
  templates: Template[];
  recentTemplateIds: string[];
  selectedTemplateId: string;
  clinicalInfo: string; // retained for backend (UI section removed)
  sections: ReportSection[];
  mode: DictationMode;
  settings: ReportSettings;
  structured: boolean;
  reportNonce: number;
  // Exact document used for the first render of a newly loaded template.
  // Cleared after the editor projects its independent working copy.
  documentSeed?: Template["document"];
  activeReportId: string | null;
  revision: number;
  activeReportStatus: "DRAFT" | "FINAL";

  // selectors
  getTemplate: (id?: string) => Template | undefined;

  // template -> report
  loadTemplate: (id: string) => void;
  newReport: () => void;
  setPersistence: (id: string | null, revision: number, status?: "DRAFT" | "FINAL") => void;
  restoreReport: (input: {
    id: string;
    revision: number;
    status: "DRAFT" | "FINAL";
    clinicalInfo: string;
    sections: ReportSection[];
    templateId?: string | null;
  }) => void;
  resetSession: () => void;

  // sections
  setSectionName: (sectionId: string, name: string) => void;
  // append a section the template didn't provide (the editor's "Add section")
  // prose
  setSectionHtml: (sectionId: string, html: string) => void;

  // single-document editor (report-doc): the editor's projection of the live
  // ProseMirror doc. The doc is canonical while editing; this is how its
  // content reaches persistence and export.
  applyDocProjection: (sections: ReportSection[]) => void;

  // findings
  setFindingHeading: (sectionId: string, findingId: string, value: string) => void;
  setFindingItemText: (
    sectionId: string,
    findingId: string,
    itemId: string,
    html: string
  ) => void;
  addFindingItem: (sectionId: string, findingId: string) => void;
  addFinding: (sectionId: string) => void;
  deleteFinding: (sectionId: string, findingId: string) => void;
  deleteFindingItem: (sectionId: string, findingId: string, itemId: string) => void;
  revertFinding: (sectionId: string, findingId: string) => void;

  // subpoints (parameters rendered as sub-bullets)
  setSubpointText: (sectionId: string, findingId: string, subId: string, html: string) => void;
  addSubpoint: (sectionId: string, findingId: string) => void;
  deleteSubpoint: (sectionId: string, findingId: string, subId: string) => void;

  // §9a score + image (finding-scoped)
  setFindingScore: (
    sectionId: string,
    findingId: string,
    value: string,
    itemId?: string
  ) => void;
  attachFindingImage: (sectionId: string, findingId: string, dataUrl: string) => void;
  removeFindingImage: (sectionId: string, findingId: string, imageId: string) => void;

  // dictation
  insertStructured: (results: StructureResult[], opts?: { replace?: boolean }) => void;
  // whole-report AI impression (once, after all findings are dictated);
  // resolves true when the AI wrote it, false on local fallback
  regenerateImpression: () => Promise<boolean>;
  regenerateFindings: () => void;

  // settings / mode
  setMode: (m: DictationMode) => void;
  patchSettings: (p: Partial<ReportSettings>) => void;
  toggleStructured: () => void;

  // template CRUD (§11) — persisted to the backend; local state is optimistic
  // and survives offline (backend cache + seeds as fallback).
  addTemplate: (t: Template) => Promise<void>;
  duplicateTemplate: (id: string) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
  importTemplate: (t: Template) => Promise<void>;
  hydrateTemplates: () => Promise<void>;
  hydrateSettings: () => void;
}

// ---- Immutable update helpers ------------------------------------------------
// Every finding/subpoint mutator walks the same path: find the section by id,
// then (usually) the finding by id, and return a new tree with just that node
// replaced. These two helpers capture that traversal once so each action only
// describes the actual change, keeping the updates consistent and immutable.

function updateSection(
  sections: ReportSection[],
  sectionId: string,
  fn: (sec: ReportSection) => ReportSection
): ReportSection[] {
  return sections.map((sec) => (sec.id === sectionId ? fn(sec) : sec));
}

function updateFinding(
  sections: ReportSection[],
  sectionId: string,
  findingId: string,
  fn: (f: Finding) => Finding
): ReportSection[] {
  return updateSection(sections, sectionId, (sec) =>
    sec.findings
      ? { ...sec, findings: sec.findings.map((f) => (f.id === findingId ? fn(f) : f)) }
      : sec
  );
}

// ---- Undo -------------------------------------------------------------------
// There is no store-level history. The report body is ONE TipTap document, so
// its ProseMirror history covers every edit — typing, formatting, add/delete
// finding, dictation inserts (rebuilds are recorded on purpose, see
// ReportDocEditor). A second snapshot stack here could only diverge from it.

export const useReportStore = create<ReportState>((rawSet, get) => {
  // Every mutation reads `sections`, and the editor's projection of the live
  // doc runs on a debounce — so without this the last few hundred ms of typing
  // would be missing from what a mutation reads, and the rebuild it triggers
  // would overwrite that text with the stale copy. Flushing first makes
  // `sections` current at the moment any updater runs.
  //
  // Re-entrant by design: the flush calls applyDocProjection, which lands here
  // again with nothing pending (see projection-bridge) and falls straight through.
  const set: typeof rawSet = (partial, replace) => {
    flushProjection();
    return rawSet(partial as never, replace as never);
  };

  const initialTemplate = SEED_TEMPLATES[0];
  return {
    templates: SEED_TEMPLATES,
    recentTemplateIds: [],
    selectedTemplateId: initialTemplate.id,
    clinicalInfo: "",
    sections: buildSections(initialTemplate),
    mode: DEFAULT_SETTINGS.defaultMode,
    settings: DEFAULT_SETTINGS,
    structured: false,
    reportNonce: 0,
    documentSeed: templateInitialDocument(initialTemplate),
    activeReportId: null,
    revision: 0,
    activeReportStatus: "DRAFT",

    getTemplate: (id) => {
      const tid = id || get().selectedTemplateId;
      return get().templates.find((t) => t.id === tid);
    },

    hydrateSettings: () => {
      const s = loadSettings();
      set({ settings: s, mode: s.defaultMode });
      // then overlay the server copy (cross-device) — best-effort
      usersApi
        .getSettings()
        .then(({ settings }) => {
          if (!settings) return;
          const merged = { ...get().settings, ...(settings as Partial<ReportSettings>) };
          normalizeSettings(merged);
          saveSettings(merged);
          set({ settings: merged, mode: merged.defaultMode });
        })
        .catch(() => {});
    },

    hydrateTemplates: async () => {
      const recentTemplateIds = loadRecentTemplateIds();
      try {
        const list = await templatesApi.list();
        if (!list.length) return; // never blank the UI
        serverIds.clear();
        for (const t of list) serverIds.add(t.id);
        saveTemplateCache(list);
        set((s) => {
          // the current selection may be a seed id ("ct-chest") while server
          // templates use uuids — remap via slug so the open report stays
          // attached to its template (seeded section ids are identical)
          const match = list.find(
            (t) => t.id === s.selectedTemplateId || t.slug === s.selectedTemplateId
          );
          if (match) return { templates: list, recentTemplateIds, selectedTemplateId: match.id };
          // selection no longer exists; keep an in-progress report untouched,
          // otherwise land on the first template
          if (s.reportNonce > 0 || s.structured) return { templates: list, recentTemplateIds };
          const first = list[0];
          return {
            templates: list,
            recentTemplateIds,
            selectedTemplateId: first.id,
            sections: buildSections(first),
          };
        });
      } catch {
        // backend unreachable → last good server copy, else the built-in seeds
        const cached = loadTemplateCache();
        if (cached?.length) {
          for (const t of cached) serverIds.add(t.id);
          set({ templates: cached, recentTemplateIds });
        } else {
          set({ recentTemplateIds });
        }
      }
    },

    loadTemplate: (id) => {
      const tpl = get().templates.find((t) => t.id === id);
      if (!tpl) return;
      const recentTemplateIds = [
        id,
        ...get().recentTemplateIds.filter((templateId) => templateId !== id),
      ].slice(0, 20);
      saveRecentTemplateIds(recentTemplateIds);
      set((s) => ({
        recentTemplateIds,
        selectedTemplateId: id,
        sections: buildSections(tpl),
        documentSeed: templateInitialDocument(tpl),
        ...(tpl.editorSettings ? { settings: { ...s.settings, ...tpl.editorSettings } } : {}),
        clinicalInfo: "",
        structured: false,
        // Choosing a template always starts an independent report. This also
        // tells useReportSync not to restore the previous draft when the
        // workspace route mounts after opening a template from the library.
        reportNonce: s.reportNonce + 1,
        activeReportId: null,
        revision: 0,
        activeReportStatus: "DRAFT",
      }));
    },

    newReport: () => {
      const tpl = get().getTemplate();
      if (!tpl) return;
      set((s) => ({
        sections: buildSections(tpl),
        documentSeed: templateInitialDocument(tpl),
        ...(tpl.editorSettings ? { settings: { ...s.settings, ...tpl.editorSettings } } : {}),
        clinicalInfo: "",
        structured: false,
        reportNonce: s.reportNonce + 1,
        activeReportId: null,
        revision: 0,
        activeReportStatus: "DRAFT",
      }));
    },

    setPersistence: (id, revision, status) =>
      set({
        activeReportId: id,
        revision,
        ...(status ? { activeReportStatus: status } : {}),
      }),

    restoreReport: (input) =>
      set({
        activeReportId: input.id,
        revision: input.revision,
        activeReportStatus: input.status,
        clinicalInfo: input.clinicalInfo,
        sections: input.sections,
        documentSeed: undefined,
        ...(input.templateId ? { selectedTemplateId: input.templateId } : {}),
      }),

    resetSession: () => {
      serverIds.clear();
      const template = SEED_TEMPLATES[0];
      set({
        templates: SEED_TEMPLATES,
        recentTemplateIds: [],
        selectedTemplateId: template.id,
        clinicalInfo: "",
        sections: buildSections(template),
        documentSeed: templateInitialDocument(template),
        mode: DEFAULT_SETTINGS.defaultMode,
        settings: DEFAULT_SETTINGS,
        structured: false,
        reportNonce: 0,
        activeReportId: null,
        revision: 0,
        activeReportStatus: "DRAFT",
      });
    },

    setSectionName: (sectionId, name) =>
      set((s) => ({
        sections: updateSection(s.sections, sectionId, (sec) => ({ ...sec, name })),
      })),

    // Appended at the end of the report. A findings section is seeded with one
    // blank finding so there is a line to dictate or type into straight away —
    // an empty section would render as a heading with nothing under it.
    setSectionHtml: (sectionId, html) =>
      set((s) => ({
        sections: updateSection(s.sections, sectionId, (sec) =>
          sec.kind === "prose" ? { ...sec, html } : sec
        ),
      })),

    applyDocProjection: (sections) => set({ sections, documentSeed: undefined }),

    setFindingHeading: (sectionId, findingId, value) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          region: value,
        })),
      })),

    setFindingItemText: (sectionId, findingId, itemId, html) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          items: f.items.map((it) => (it.id === itemId ? { ...it, text: html } : it)),
        })),
      })),

    addFindingItem: (sectionId, findingId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          items: [...f.items, { id: uid("itm"), text: "" }],
        })),
      })),

    setSubpointText: (sectionId, findingId, subId, html) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          subpoints: (f.subpoints || []).map((sp) =>
            sp.id === subId ? { ...sp, text: html } : sp
          ),
        })),
      })),

    addSubpoint: (sectionId, findingId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          subpoints: [...(f.subpoints || []), { id: uid("sp"), text: "" }],
        })),
      })),

    deleteSubpoint: (sectionId, findingId, subId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          subpoints: (f.subpoints || []).filter((sp) => sp.id !== subId),
        })),
      })),

    // Append a blank finding row to the section (the "+ Add finding" button at
    // the section's end). Starts empty — the radiologist types the organ/text.
    addFinding: (sectionId) =>
      set((s) => ({
        sections: updateSection(s.sections, sectionId, (sec) =>
          sec.kind === "findings"
            ? {
                ...sec,
                findings: [
                  ...(sec.findings || []),
                  {
                    id: uid("fnd"),
                    region: "",
                    items: [{ id: uid("itm"), text: "" }],
                    normalText: "",
                    abnormal: false,
                  },
                ],
              }
            : sec
        ),
      })),

    deleteFinding: (sectionId, findingId) =>
      set((s) => ({
        sections: updateSection(s.sections, sectionId, (sec) =>
          sec.findings
            ? { ...sec, findings: sec.findings.filter((f) => f.id !== findingId) }
            : sec
        ),
      })),

    deleteFindingItem: (sectionId, findingId, itemId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) =>
          f.items.length <= 1
            ? f
            : { ...f, items: f.items.filter((it) => it.id !== itemId) }
        ),
      })),

    revertFinding: (sectionId, findingId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          abnormal: false,
          score: undefined,
          items: [{ id: uid("itm"), text: f.normalText }],
        })),
      })),

    setFindingScore: (sectionId, findingId, value, itemId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) =>
          itemId
            ? {
                ...f,
                items: f.items.map((it) =>
                  it.id === itemId ? { ...it, score: value || undefined } : it
                ),
              }
            : { ...f, score: value || undefined }
        ),
      })),

    attachFindingImage: (sectionId, findingId, dataUrl) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          images: [...(f.images || []), { id: uid("img"), src: dataUrl }],
        })),
      })),

    removeFindingImage: (sectionId, findingId, imageId) =>
      set((s) => ({
        sections: updateFinding(s.sections, sectionId, findingId, (f) => ({
          ...f,
          images: (f.images || []).filter((im) => im.id !== imageId),
        })),
      })),

    insertStructured: (results, opts = {}) =>
      set((s) => {
        const replace = !!opts.replace;
        const tpl = get().getTemplate();
        let sections: ReportSection[] = s.sections.map((sec) => ({
          ...sec,
          findings: sec.findings
            ? sec.findings.map((f) => ({
                ...f,
                items: f.items.map((i) => ({ ...i })),
                subpoints: f.subpoints ? f.subpoints.map((sp) => ({ ...sp })) : f.subpoints,
              }))
            : sec.findings,
        }));

        // `replace` mode (for re-structuring a whole accumulated transcript)
        // resets findings sections to their template normals before applying the
        // full result set, keeping it idempotent (no duplicates) and yielding one
        // updated paragraph per finding. Live & push-to-talk use append mode.
        if (replace) {
          sections = sections.map((sec) => {
            if (sec.kind !== "findings") return sec;
            const tsec = tpl?.sections.find((t) => t.id === sec.id);
            return { ...sec, findings: (tsec?.findings || []).map(buildFinding) };
          });
        }

        // ---- voice-created sections: the radiologist explicitly dictated a
        //      section heading that is not in the template ("Comparison: …",
        //      "Clinical history: …") → create that prose section. Header-type
        //      sections slot in before the first findings section; anything
        //      else goes before the conclusion (or at the end). ----
        for (const r of results) {
          if (r.kind !== "prose" || !r.newSection || !r.text.trim()) continue;
          const name = (r.sectionName || "").trim();
          if (!name) continue;
          const existing = sections.find(
            (x) => x.name.toLowerCase() === name.toLowerCase()
          );
          if (existing) {
            r.sectionId = existing.id; // a previous take already created it
            continue;
          }
          const sec: ReportSection = { id: uid("sec"), name, kind: "prose", html: "" };
          let at = sections.length;
          if (HEADER_SECTION_RE.test(name)) {
            const f = sections.findIndex((x) => x.kind === "findings");
            if (f >= 0) at = f;
          } else {
            const c = sections.findIndex((x) => x.kind === "prose" && x.isConclusion);
            if (c >= 0) at = c;
          }
          sections.splice(at, 0, sec);
          r.sectionId = sec.id;
        }

        const proseSections = sections.filter((x) => x.kind === "prose");
        const findingsSections = sections.filter((x) => x.kind === "findings");

        const resolveFindings = (r: StructureResult) =>
          findingsSections.find((x) => x.id === r.sectionId) ||
          findingsSections.find(
            (x) => x.name.toLowerCase() === (r.sectionName || "").toLowerCase()
          );

        // ---- prose: consolidate per target section into one paragraph ----
        const proseGroups = new Map<string, { target: ReportSection; texts: string[] }>();
        for (const r of results) {
          if (r.kind !== "prose" || !r.text.trim()) continue;
          const target =
            proseSections.find((x) => x.id === r.sectionId) ||
            proseSections.find(
              (x) => x.name.toLowerCase() === (r.sectionName || "").toLowerCase()
            );
          if (!target) continue;
          const g = proseGroups.get(target.id) || { target, texts: [] };
          g.texts.push(r.text.trim());
          proseGroups.set(target.id, g);
        }
        for (const { target, texts } of proseGroups.values()) {
          const para = `<p data-inserted="true">${escapeHtml(texts.join(" "))}</p>`;
          const tplDefault =
            tpl?.sections.find((ts) => ts.id === target.id)?.defaultProse || "";
          const isPristine =
            !target.html || target.html === tplDefault || target.html === "<p></p>";
          target.html = replace || isPristine ? para : `${target.html}${para}`;
        }

        // ---- findings: the model targets an existing finding (bullet) by its
        //      findingId to UPDATE it, or returns findingId:"" to create a NEW
        //      bullet in the correct section/region (§ user request). ----
        // When the report has no separate conclusion section, findings sections
        // carry their own conclusion → fold each result's impression into the
        // bullet text and don't store a separate impression line.
        const combined = !hasConclusionSection(sections);
        const makeItem = (r: StructureResult): FindingItem => ({
          id: uid("itm"),
          text: escapeHtml(combined ? withConclusion(r.text, r.impression) : r.text.trim()),
          impression: combined ? undefined : r.impression || undefined,
          inserted: true,
        });

        for (const r of results) {
          if (r.kind !== "findings" || !r.text.trim()) continue;

          // 0) UPDATE an existing SUBPOINT (parameter) by id, in place. The model
          //    targets a listed parameter when the dictation states its value
          //    (e.g. "ejection fraction 55%"); search every findings section.
          if (r.subpointId) {
            let done = false;
            for (const sec of findingsSections) {
              for (const f of sec.findings!) {
                const sp = (f.subpoints || []).find((x) => x.id === r.subpointId);
                if (sp) {
                  sp.text = escapeHtml(r.text.trim());
                  done = true;
                  break;
                }
              }
              if (done) break;
            }
            // An unknown/stale ID must never fall through and become a new
            // finding. The backend validates this too; this is the final guard
            // at the mutation boundary.
            continue;
          }

          // 1) UPDATE an existing finding by id (search every findings section —
          //    the id is unique). The model returns the COMPLETE updated text.
          if (r.findingId) {
            for (const sec of findingsSections) {
              const f = sec.findings!.find((ff) => ff.items.some((i) => i.id === r.findingId));
              if (!f) continue;
              const it = f.items.find((i) => i.id === r.findingId)!;
              it.text = escapeHtml(combined ? withConclusion(r.text, r.impression) : r.text.trim());
              it.impression = combined ? undefined : r.impression || undefined;
              it.inserted = true;
              if (r.abnormal) f.abnormal = true;
              else if (f.items.length === 1) {
                f.abnormal = false;
                f.normalText = r.text.trim();
              }
              break;
            }
            // As above, never reinterpret an unresolved update as an insert.
            continue;
          }

          // 2) NEW finding → place it in the matching region, else create one.
          const target = resolveFindings(r);
          if (!target || !target.findings) continue;
          const region = r.region ? matchFindingByRegion(target.findings, r.region) : undefined;
          if (region) {
            const onlyNormal = region.items.length === 1 && !region.abnormal;
            if (onlyNormal) {
              // replace the region's lone normal default
              region.items = [makeItem(r)];
              region.abnormal = r.abnormal;
              if (!r.abnormal) region.normalText = r.text.trim();
            } else {
              // region already has dictated findings → add a new bullet
              region.items.push(makeItem(r));
              if (r.abnormal) region.abnormal = true;
            }
          } else {
            target.findings.push({
              id: uid("fnd"),
              region: target.grouped ? r.region || "" : "",
              normalText: r.text.trim(),
              abnormal: r.abnormal,
              items: [makeItem(r)],
              images: [],
            });
          }
        }

        // NOTE: the impression/conclusion section is intentionally NOT rebuilt
        // here — it is generated once from the whole report when the
        // radiologist finishes dictating (regenerateImpression), and a
        // dictated "Impression: …" routed above must not be overwritten.
        return { sections, structured: true };
      }),

    // Generate the impression ONCE from the WHOLE report — standards-based and
    // concise (backend /ai/impression). Called when the radiologist finishes
    // dictating findings, never per dictation take. Falls back to the local
    // per-finding derivation when the AI is unreachable.
    regenerateImpression: async () => {
      const st = get();
      if (!st.sections.some((x) => x.kind === "prose" && x.isConclusion)) return false;
      let html: string | null = null;
      try {
        if (!st.activeReportId) return false;
        const lines = await aiApi.impression(
          reportPlainText(st.sections, st.clinicalInfo),
          st.activeReportId
        );
        if (lines.length) {
          const hasAbnormal = st.sections.some(
            (x) => x.kind === "findings" && (x.findings || []).some((f) => f.abnormal)
          );
          // a lone normal statement stays a plain paragraph; conclusions are
          // bulleted as a real list, same as the local derivation
          html =
            lines.length === 1 && !hasAbnormal
              ? `<p>${escapeHtml(lines[0])}</p>`
              : impressionList(lines);
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "REPORT_LIMIT_REACHED") throw error;
        /* offline / AI down → local fallback below */
      }
      set((s) => ({
        sections: html
          ? s.sections.map((sec) =>
              sec.kind === "prose" && sec.isConclusion ? { ...sec, html } : sec
            )
          : reDeriveConclusions(s.sections),
      }));
      return html !== null;
    },

    regenerateFindings: () => {
      const tpl = get().getTemplate();
      if (!tpl) return;
      set((s) => ({
        sections: s.sections.map((sec) => {
          if (sec.kind !== "findings") return sec;
          const tsec = tpl.sections.find((t) => t.id === sec.id);
          return tsec ? { ...sec, findings: (tsec.findings || []).map(buildFinding) } : sec;
        }),
      }));
    },

    setMode: (m) => set({ mode: m }),

    patchSettings: (p) =>
      set((s) => {
        const next = { ...s.settings, ...p };
        saveSettings(next);
        pushSettingsToServer(next);
        return { settings: next };
      }),

    toggleStructured: () => set((s) => ({ structured: !s.structured })),

    addTemplate: async (t) => {
      set((s) => ({ templates: [...s.templates, t] }));
      await persistTemplate(t, set, get);
    },

    duplicateTemplate: async (id) => {
      const src = get().templates.find((t) => t.id === id);
      if (!src) return;
      const copy: Template = {
        ...src,
        id: `${src.id}-copy-${uid("t")}`,
        name: `${src.name} (copy)`,
        updatedAt: new Date().toISOString(),
        global: false,
        slug: undefined,
        sections: JSON.parse(JSON.stringify(src.sections)) as TemplateSection[],
        document: src.document ? JSON.parse(JSON.stringify(src.document)) : undefined,
        editorSettings: src.editorSettings ? { ...src.editorSettings } : undefined,
      };
      set((s) => ({ templates: [...s.templates, copy] }));
      await persistTemplate(copy, set, get);
    },

    removeTemplate: async (id) => {
      set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
      if (serverIds.has(id)) {
        try {
          await templatesApi.remove(id);
          serverIds.delete(id);
        } catch {
          /* offline / forbidden — local removal stands for this session */
        }
      }
      saveTemplateCache(get().templates);
    },

    importTemplate: async (t) => {
      set((s) => {
        const exists = s.templates.some((x) => x.id === t.id);
        const templates = exists
          ? s.templates.map((x) => (x.id === t.id ? t : x))
          : [...s.templates, t];
        // A template is only a source for NEW reports. Updating it must never
        // rewrite the independent document already open for a patient.
        return { templates };
      });
      await persistTemplate(t, set, get);
    },
  };
});

// Persist a template to the backend and reconcile the local copy with the
// server's canonical version (uuid ids, server section ids). Offline failures
// are silent — the local copy keeps working and the cache holds it.
async function persistTemplate(
  t: Template,
  set: (fn: (s: ReportState) => Partial<ReportState>) => void,
  get: () => ReportState
) {
  try {
    // a global starter template edited by a non-admin becomes a personal copy
    const asUpdate = serverIds.has(t.id) && !t.global;
    const saved = asUpdate
      ? await templatesApi.update(t.id, t)
      : await templatesApi.create(t);
    serverIds.add(saved.id);
    set((s) => {
      const templates = s.templates.map((x) => (x.id === t.id ? saved : x));
      const wasCurrent = s.selectedTemplateId === t.id;
      return {
        templates,
        ...(wasCurrent ? { selectedTemplateId: saved.id } : {}),
      };
    });
  } catch {
    /* offline or rejected — keep the optimistic local copy */
  }
  saveTemplateCache(get().templates);
}

// Helper used by imports to turn parsed sections into a Template
export function makeTemplate(
  name: string,
  modality: string,
  bodyPart: string,
  sections: TemplateSection[]
): Template {
  return {
    id: `${slug(name) || "template"}-${uid("t")}`,
    name,
    modality,
    bodyPart,
    sections,
    updatedAt: new Date().toISOString(),
  };
}
