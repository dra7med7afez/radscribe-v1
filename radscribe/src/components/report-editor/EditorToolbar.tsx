"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  ListOrdered,
  AlignVerticalSpaceAround,
  Copy,
  Check,
  Download,
  CircleCheck,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";
import { useEditorRegistry } from "./editor-context";
import ListStylePicker from "./ListStylePicker";
import InsertBulletButton from "./InsertBulletButton";
import { flushProjection } from "./projection-bridge";
import { useReportStore } from "@/store/reportStore";
import { useUiStore } from "@/store/uiStore";
import { usePatientStore } from "@/store/patientStore";
import { exportService } from "@/services/exportService";
import { reportsApi } from "@/services/reports.api";
import { buildPatientLine } from "@/lib/report-format";
import { cn } from "@/lib/utils";
import { flushReportSave } from "@/hooks/useReportSync";
import type { ReportSettings } from "@/types";

const FONTS = ["Georgia", "Times New Roman", "Calibri", "Arial", "Helvetica", "System"];
const SIZES = [12, 13, 14, 15, 16, 18, 20];
// same value set as Settings → Line spacing, so the two controls stay in sync
const LINE_SPACINGS = [1.15, 1.3, 1.4, 1.5, 1.6, 1.8, 2];

function Sep() {
  return <span className="mx-1 h-5 w-px self-center" style={{ background: "var(--ring)" }} />;
}

// Custom dropdown replacing the native <select>: same floating-panel look as
// the template selector (rounded card, hover rows, check on the active value).
function ToolbarSelect<T extends string | number>({
  value,
  options,
  onChange,
  title,
  className,
  optionStyle,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  title: string;
  className?: string;
  optionStyle?: (v: T) => CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // keep editor selection
        onClick={() => setOpen((v) => !v)}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center justify-between gap-1 rounded-lg px-2 text-[13px] transition",
          open ? "bg-[var(--active)]" : "bg-[var(--panel-2)] hover:bg-[var(--hover)]",
          className
        )}
        style={{ color: "var(--text)" }}
      >
        <span className="truncate">{value}</span>
        <ChevronDown
          size={12}
          style={{ color: "var(--text-muted)" }}
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="animate-in absolute left-0 z-20 mt-1.5 max-h-72 min-w-full overflow-auto rounded-2xl p-1.5"
            style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
          >
            {options.map((opt) => (
              <button
                key={String(opt)}
                type="button"
                role="option"
                aria-selected={opt === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-[var(--hover)]"
                style={{ color: "var(--text)", ...optionStyle?.(opt) }}
              >
                <span className="flex-1">{opt}</span>
                {opt === value && <Check size={14} style={{ color: "var(--accent)" }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Line spacing: icon-triggered dropdown driving settings.lineSpacing (the
// report-wide line-height — the same value Settings → Line spacing edits).
function LineSpacingPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // keep editor selection
        onClick={() => setOpen((v) => !v)}
        title="Line spacing"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-0.5 rounded-lg px-1.5 transition",
          open ? "bg-[var(--active)]" : "hover:bg-[var(--hover)]"
        )}
        style={{ color: "var(--text)" }}
      >
        <AlignVerticalSpaceAround size={16} />
        <ChevronDown
          size={11}
          style={{ color: "var(--text-muted)" }}
          className={cn("shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="animate-in absolute left-0 z-20 mt-1.5 max-h-72 min-w-[110px] overflow-auto rounded-2xl p-1.5"
            style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
          >
            {LINE_SPACINGS.map((opt) => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={opt === value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] transition hover:bg-[var(--hover)]"
                style={{ color: "var(--text)" }}
              >
                <span className="flex-1">{opt}</span>
                {opt === value && <Check size={14} style={{ color: "var(--accent)" }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FinishOption({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled = false,
}: {
  icon: typeof Copy;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl px-2 py-4 text-center transition",
        disabled ? "cursor-not-allowed opacity-40" : "hover:bg-[var(--hover)]"
      )}
      style={{ background: "var(--canvas)" }}
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-xl"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
      >
        <Icon size={18} />
      </span>
      <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
        {label}
      </span>
      <span className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
        {hint}
      </span>
    </button>
  );
}

function ToolBtn({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg transition",
        disabled ? "opacity-35" : "hover:bg-[var(--hover)]"
      )}
      style={{ color: "var(--text)" }}
    >
      {children}
    </button>
  );
}

export default function EditorToolbar({
  mode = "report",
  settings: settingsOverride,
  onSettingsChange,
}: {
  mode?: "report" | "template";
  settings?: ReportSettings;
  onSettingsChange?: (patch: Partial<ReportSettings>) => void;
}) {
  const registry = useEditorRegistry();
  // Narrow selectors: the toolbar must NOT subscribe to `sections` (that would
  // re-render it on every keystroke) — sections are read at click time instead.
  const reportSettings = useReportStore((s) => s.settings);
  const patchSettings = useReportStore((s) => s.patchSettings);
  const settings = settingsOverride ?? reportSettings;
  const updateSettings = onSettingsChange ?? patchSettings;
  const template = useReportStore((s) => s.templates.find((t) => t.id === s.selectedTemplateId));
  const notify = useUiStore((s) => s.notify);
  const patient = usePatientStore((s) =>
    s.activePatientId ? s.patients.find((p) => p.id === s.activePatientId) || null : null
  );
  const patients = usePatientStore((s) => s.patients);
  const completedPatientIds = usePatientStore((s) => s.completedPatientIds);
  const queuePatients = patients.filter(
    (candidate) => !completedPatientIds.includes(candidate.id)
  );
  const patientsLoading = usePatientStore((s) => s.loading);
  const selectPatient = usePatientStore((s) => s.selectPatient);
  const completePatient = usePatientStore((s) => s.completePatient);
  const activeReportId = useReportStore((s) => s.activeReportId);
  const reportStatus = useReportStore((s) => s.activeReportStatus);

  const [copied, setCopied] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showPatients, setShowPatients] = useState(false);
  const [deliveredPatientId, setDeliveredPatientId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  // ---- undo / redo ----
  // The whole report body is one TipTap document, so its history covers every
  // edit — typing, formatting, structural moves, dictation inserts.
  const doUndo = () => registry.active?.chain().focus().undo().run();
  const doRedo = () => registry.active?.chain().focus().redo().run();

  // ---- formatting dispatchers ----
  const fmt = (cmd: string) =>
    registry.format((e) => {
      const c = e.chain().focus();
      switch (cmd) {
        case "bold": c.toggleBold().run(); break;
        case "italic": c.toggleItalic().run(); break;
        case "underline": c.toggleUnderline().run(); break;
        case "bullet": c.toggleBulletList().run(); break;
        case "ordered": c.toggleOrderedList().run(); break;
        // headings: level 1 = report title (rare), level 2 = section heading
        case "h1": c.toggleHeading({ level: 1 }).run(); break;
        case "h2": c.toggleHeading({ level: 2 }).run(); break;
        case "align-left": c.setTextAlign("left").run(); break;
        case "align-center": c.setTextAlign("center").run(); break;
        case "align-right": c.setTextAlign("right").run(); break;
        case "align-justify": c.setTextAlign("justify").run(); break;
      }
    });

  const title = template?.name || "Report";

  // The editor projects into the store on a debounce — pull anything pending
  // in before reading, so Finish never misses the last few keystrokes.
  const currentSections = () => {
    flushProjection();
    return useReportStore.getState().sections;
  };

  // TipTap is the canonical document while editing. Passing its HTML to export
  // avoids rebuilding (and flattening) the template's authored list structure.
  const currentDocumentHtml = () => registry.active?.getHTML();

  const onCopy = async () => {
    try {
      await exportService.copyToClipboard(
        title,
        currentSections(),
        patient,
        settings,
        currentDocumentHtml()
      );
      // Only delivery of a signed clinical record completes a worklist item.
      // Draft exports are allowed without a patient and remain drafts.
      if (patient && reportStatus === "FINAL") setDeliveredPatientId(patient.id);
      setCopied(true);
      setShowFinish(false);
      notify(reportStatus === "FINAL" ? "Final report copied to the clipboard" : "Draft copied to the clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify("The report could not be copied");
    }
  };

  const onExtract = () => {
    exportService.exportDoc(title, currentSections(), patient, settings, currentDocumentHtml());
    if (patient && reportStatus === "FINAL") setDeliveredPatientId(patient.id);
    setShowFinish(false);
    notify(reportStatus === "FINAL" ? "Final report document downloaded" : "Draft document downloaded");
  };

  const onSelectPatient = async (nextPatientId: string) => {
    if (patient?.id === nextPatientId) {
      setShowPatients(false);
      return;
    }

    const previousPatient = patient;
    if (reportStatus !== "FINAL" && !(await flushReportSave())) {
      notify("The current draft could not be saved. Patient switching was cancelled.");
      return;
    }
    if (previousPatient && deliveredPatientId === previousPatient.id) {
      try {
        await completePatient(previousPatient.id);
      } catch {
        notify("The signed report was delivered, but the worklist could not be marked completed.");
        return;
      }
    }

    try {
      await selectPatient(nextPatientId);
    } catch {
      notify("The selected patient could not be opened.");
      return;
    }
    setDeliveredPatientId(null);
    setShowPatients(false);
    useReportStore.getState().newReport();

    const nextPatient = queuePatients.find((candidate) => candidate.id === nextPatientId);
    notify(
      previousPatient && deliveredPatientId === previousPatient.id
        ? `${previousPatient.name} moved to Completed. ${nextPatient?.name || "Patient"} selected.`
        : `${nextPatient?.name || "Patient"} selected. A new draft has been opened.`
    );
  };

  const onSign = async () => {
    if (!activeReportId) return;
    if (!patient) {
      notify("Select a patient before signing the report");
      return;
    }
    setSigning(true);
    try {
      if (!(await flushReportSave())) {
        notify("The latest report changes could not be saved; signing was not performed");
        return;
      }
      const latestRevision = useReportStore.getState().revision;
      await reportsApi.update(activeReportId, { patientId: patient.id });
      const result = await reportsApi.sign(activeReportId, latestRevision, patient.id);
      useReportStore.getState().setPersistence(activeReportId, result.revision, "FINAL");
      notify("Report signed and locked. You can now copy or download the final record.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not sign the report");
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="border-b" style={{ borderColor: "var(--ring)" }}>
      {/* ---- Report-only action bar. Template metadata/actions live above the shared editor. ---- */}
      {mode === "report" && <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div className="relative min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </div>
          <button
            type="button"
            onClick={() => setShowPatients((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={showPatients}
            className="flex max-w-full items-center gap-1 rounded-md py-0.5 pr-1 text-left text-[12px] transition hover:bg-[var(--hover)]"
            style={{ color: "var(--text-muted)" }}
            title="Select patient"
          >
            <span className="truncate">
              {patient
                ? buildPatientLine(patient)
                : `Draft · ${template?.modality ?? ""} ${template?.bodyPart ?? ""}`.trim()}
            </span>
            <ChevronDown
              size={13}
              className={cn("shrink-0 transition-transform", showPatients && "rotate-180")}
            />
          </button>
          {showPatients && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowPatients(false)} />
              <div
                role="listbox"
                aria-label="Registered patients"
                className="animate-in absolute left-0 z-30 mt-1.5 max-h-80 w-[min(420px,calc(100vw-2rem))] overflow-auto rounded-2xl p-1.5"
                style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
              >
                <div
                  className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-subtle)" }}
                >
                  Patient queue
                </div>
                {patientsLoading ? (
                  <div className="px-3 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Loading patients…
                  </div>
                ) : queuePatients.length === 0 ? (
                  <div className="px-3 py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    No registered patients in the queue.
                  </div>
                ) : (
                  queuePatients.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      role="option"
                      aria-selected={candidate.id === patient?.id}
                      onClick={() => void onSelectPatient(candidate.id)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--hover)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                          {candidate.name}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                          MRN {candidate.mrn}
                          {candidate.studyDescription ? ` · ${candidate.studyDescription}` : ""}
                        </span>
                      </span>
                      {candidate.id === patient?.id && <Check size={15} style={{ color: "var(--accent)" }} />}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFinish(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-medium text-white transition"
            style={{ background: "var(--accent)" }}
          >
            <CircleCheck size={16} /> Finish
          </button>
        </div>
      </div>}

      {/* ---- Finish modal: export actions plus the irreversible signing action. ---- */}
      {mode === "report" && showFinish && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={() => setShowFinish(false)}
        >
          <div
            className="animate-in w-full max-w-md rounded-2xl p-5"
            style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
              Finish report
            </div>
            <p className="mb-4 mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              {reportStatus === "FINAL"
                ? "This signed report is locked. Copy or download this final version for delivery."
                : "Copy or download this draft without patient details, or select a patient and sign to lock a final clinical record."}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <FinishOption
                icon={copied ? Check : Copy}
                label="Copy"
                hint={reportStatus === "FINAL" ? "Final clipboard" : "Draft clipboard"}
                onClick={onCopy}
              />
              <FinishOption
                icon={Download}
                label="Download"
                hint={reportStatus === "FINAL" ? "Final .doc" : "Draft .doc"}
                onClick={onExtract}
              />
              <FinishOption
                icon={CircleCheck}
                label={reportStatus === "FINAL" ? "Signed" : signing ? "Signing…" : "Sign"}
                hint={reportStatus === "FINAL" ? "Record locked" : patient ? "Attest & finalize" : "Patient required"}
                onClick={() => void onSign()}
                disabled={reportStatus === "FINAL" || signing || !patient || !activeReportId}
              />
            </div>
            <button
              onClick={() => setShowFinish(false)}
              className="mt-4 w-full rounded-lg py-2 text-[12px] transition hover:bg-[var(--hover)]"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ---- Formatting toolbar ---- */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-0.5 px-3 pb-2",
          mode === "report" && reportStatus === "FINAL" && "pointer-events-none opacity-45"
        )}
        aria-disabled={mode === "report" && reportStatus === "FINAL"}
      >
        <ToolBtn onClick={doUndo} title="Undo">
          <Undo2 size={16} />
        </ToolBtn>
        <ToolBtn onClick={doRedo} title="Redo">
          <Redo2 size={16} />
        </ToolBtn>
        <Sep />
        <ToolbarSelect
          value={settings.fontFamily}
          options={FONTS}
          onChange={(f) => updateSettings({ fontFamily: f })}
          title="Font"
          className="w-[130px]"
          optionStyle={(f) => ({ fontFamily: f === "System" ? "system-ui" : f })}
        />
        <ToolbarSelect
          value={settings.fontSize}
          options={SIZES}
          onChange={(s) => updateSettings({ fontSize: s })}
          title="Size"
          className="w-[56px]"
        />
        <LineSpacingPicker
          value={settings.lineSpacing}
          onChange={(lineSpacing) => updateSettings({ lineSpacing })}
        />
        <Sep />
        <ToolBtn onClick={() => fmt("bold")} title="Bold">
          <Bold size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => fmt("italic")} title="Italic">
          <Italic size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => fmt("underline")} title="Underline">
          <Underline size={16} />
        </ToolBtn>
        <Sep />
        {/* Headings: title (rare) + section heading — structure comes from the text */}
        <ToolBtn onClick={() => fmt("h1")} title="Report title">
          <Heading1 size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => fmt("h2")} title="Section heading">
          <Heading2 size={16} />
        </ToolBtn>
        <Sep />
        {/* Bullets → Word-style toggle + bullet library */}
        <InsertBulletButton preferredStyle={settings.organBullet} />
        {/* List style → the gallery of bullet hierarchies */}
        <ListStylePicker settings={settings} onSettingsChange={updateSettings} />
        <ToolBtn onClick={() => fmt("ordered")} title="Numbered list">
          <ListOrdered size={16} />
        </ToolBtn>
        <Sep />
        <ToolBtn onClick={() => fmt("align-left")} title="Align left">
          <AlignLeft size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => fmt("align-center")} title="Align center">
          <AlignCenter size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => fmt("align-right")} title="Align right">
          <AlignRight size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => fmt("align-justify")} title="Justify">
          <AlignJustify size={16} />
        </ToolBtn>
      </div>
    </div>
  );
}
