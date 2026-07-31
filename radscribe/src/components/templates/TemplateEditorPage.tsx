"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, GitBranch, FileText } from "lucide-react";
import type { JSONContent } from "@tiptap/core";
import DocumentEditor from "@/components/report-editor/DocumentEditor";
import TemplateDocumentEditor from "./TemplateDocumentEditor";
import PageContainer from "@/components/layout/PageContainer";
import { useReportStore } from "@/store/reportStore";
import { useUiStore } from "@/store/uiStore";
import {
  documentToTemplateSections,
  normalizeTemplateDocument,
  templateInitialDocument,
} from "@/lib/template-document";
import { slug, uid } from "@/lib/utils";
import type { ReportSettings, Template } from "@/types";

export default function TemplateEditorPage({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const templates = useReportStore((s) => s.templates);
  const hydrateTemplates = useReportStore((s) => s.hydrateTemplates);
  const importTemplate = useReportStore((s) => s.importTemplate);
  const reportSettings = useReportStore((s) => s.settings);
  const notify = useUiStore((s) => s.notify);
  const initial = useMemo(
    () => (templateId ? templates.find((template) => template.id === templateId) : undefined),
    [templateId, templates]
  );

  const [ready, setReady] = useState(!templateId);
  const [initializedFor, setInitializedFor] = useState<string | null>(templateId ? null : "new");
  const [name, setName] = useState("");
  const [modality, setModality] = useState("CT");
  const [bodyPart, setBodyPart] = useState("");
  const [description, setDescription] = useState("");
  const [settings, setSettings] = useState<ReportSettings>(reportSettings);
  const [documentKey, setDocumentKey] = useState("new");
  const [saving, setSaving] = useState(false);
  const documentRef = useRef<JSONContent>(templateInitialDocument());

  useEffect(() => {
    let cancelled = false;
    void hydrateTemplates().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrateTemplates]);

  useEffect(() => {
    if (!initial || initializedFor === initial.id) return;
    const document = templateInitialDocument(initial);
    setName(initial.name);
    setModality(initial.modality);
    setBodyPart(initial.bodyPart);
    setDescription(initial.description || "");
    setSettings({ ...reportSettings, ...initial.editorSettings });
    documentRef.current = document;
    setDocumentKey(initial.id);
    setInitializedFor(initial.id);
  }, [initial, initializedFor, reportSettings]);

  const buildTemplate = (asVersion: boolean): Template | null => {
    if (!name.trim()) {
      notify("Give the template a name");
      return null;
    }
    if (!bodyPart.trim()) {
      notify("Add a body region");
      return null;
    }
    const document = normalizeTemplateDocument(documentRef.current);
    const sections = documentToTemplateSections(document, initial?.sections);
    const now = new Date().toISOString();
    const version = asVersion ? (initial?.version ?? 1) + 1 : initial?.version ?? 1;
    return {
      ...(initial || {}),
      id:
        !initial || asVersion
          ? `${slug(name) || "template"}-${uid(asVersion ? "v" : "t")}`
          : initial.id,
      name: name.trim(),
      modality: modality.trim() || "Other",
      bodyPart: bodyPart.trim(),
      description: description.trim() || undefined,
      version,
      document,
      editorSettings: {
        fontFamily: settings.fontFamily,
        fontSize: settings.fontSize,
        lineSpacing: settings.lineSpacing,
        defaultItalic: settings.defaultItalic,
        organBullet: settings.organBullet,
        findingBullet: settings.findingBullet,
        subpointBullet: settings.subpointBullet,
        listPreset: settings.listPreset,
      },
      sections,
      updatedAt: now,
      ...(asVersion ? { global: false, slug: undefined } : {}),
    };
  };

  const save = async (asVersion = false) => {
    const template = buildTemplate(asVersion);
    if (!template) return;
    setSaving(true);
    try {
      await importTemplate(template);
      notify(asVersion ? `Saved version ${template.version}` : initial ? "Template updated" : "Template saved");
      router.push("/templates");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  if (templateId && ready && !initial) {
    return (
      <PageContainer>
        <div className="grid h-screen place-items-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          Template not found
        </div>
      </PageContainer>
    );
  }

  if (templateId && (!ready || !initial || initializedFor !== initial.id)) {
    return (
      <PageContainer>
        <div className="grid h-screen place-items-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading template…
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex h-screen min-h-0 flex-col p-4">
        <header
          className="mb-3 shrink-0 rounded-2xl border p-4"
          style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/templates")}
              className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-[var(--hover)]"
              aria-label="Back to templates"
              style={{ color: "var(--text)" }}
            >
              <ArrowLeft size={17} />
            </button>
            <FileText size={18} style={{ color: "var(--accent)" }} />
            <div>
              <h1 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
                {initial ? "Edit template" : "Create new template"}
              </h1>
              {initial && (
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Version {initial.version ?? 1}
                </p>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/templates")}
                className="h-9 rounded-lg px-3 text-[12px] transition hover:bg-[var(--hover)]"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              {initial && (
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium disabled:opacity-50"
                  style={{ borderColor: "var(--ring)", color: "var(--text)" }}
                >
                  <GitBranch size={14} /> Save as new version
                </button>
              )}
              <button
                type="button"
                onClick={() => void save(false)}
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[12px] font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                <Save size={14} /> {saving ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
            <Field label="Template name" value={name} onChange={setName} className="md:col-span-4" />
            <Field label="Modality" value={modality} onChange={setModality} className="md:col-span-2" />
            <Field label="Body region" value={bodyPart} onChange={setBodyPart} className="md:col-span-2" />
            <Field label="Description (optional)" value={description} onChange={setDescription} className="md:col-span-4" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--ring)", boxShadow: "var(--shadow-card)" }}>
          <DocumentEditor
            mode="template"
            settings={settings}
            onSettingsChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          >
            <TemplateDocumentEditor
              key={documentKey}
              initialDocument={documentRef.current}
              onChange={(document) => {
                documentRef.current = document;
              }}
            />
          </DocumentEditor>
        </div>
      </div>
    </PageContainer>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border px-2.5 text-[12px] outline-none focus:border-[var(--accent)]"
        style={{ background: "var(--canvas)", borderColor: "var(--ring)", color: "var(--text)" }}
      />
    </label>
  );
}
