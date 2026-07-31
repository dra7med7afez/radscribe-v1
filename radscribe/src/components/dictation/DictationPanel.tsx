"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, CornerDownRight, Plus, RefreshCw } from "lucide-react";
import MicrophoneButton, { type MicPhase } from "./MicrophoneButton";
import AudioWave from "./AudioWave";
import TemplateSelector from "@/components/templates/TemplateSelector";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { startRecording, type Recording } from "@/utils/audio";
import { aiApi } from "@/services/ai.api";
import { useReportStore } from "@/store/reportStore";
import { useUiStore } from "@/store/uiStore";
import { ApiError, NetworkError } from "@/lib/api/client";
import { htmlToText } from "@/lib/utils";
import type { DictationMode, DocumentEditResult, DocumentTreeNode } from "@/types";
import UsageCard from "@/components/billing/UsageCard";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import {
  applyLiveDocumentEditsWithTargets,
  getLiveDocumentTree,
} from "@/components/report-editor/document-ai-bridge";
import { flushReportSave } from "@/hooks/useReportSync";

const STYLE_MODES: { id: DictationMode; label: string; desc: string }[] = [
  { id: "verbatim", label: "Verbatim", desc: "Keep my words — fix grammar & punctuation only" },
  { id: "concise", label: "Concise", desc: "Short phrasing that keeps your clinical words" },
];

interface PreparedStructure {
  text: string;
  documentKey: string;
  reportId: string;
  mode: DictationMode;
  instructions: string;
  promise: Promise<DocumentEditResult[]>;
}

function documentKey(document: DocumentTreeNode): string {
  return JSON.stringify(document);
}

function triggerLabel(key: string): string {
  if (key === "Control") return "Ctrl";
  if (key === "Meta") return "⌘ / Win";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}

// Minimal text-only segmented control for the dictation style row.
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex rounded-full p-0.5" style={{ background: "var(--panel-2)" }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className="flex-1 rounded-full py-1.5 text-[12px] font-medium transition"
            style={
              active
                ? { background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-float)" }
                : { color: "var(--text-muted)" }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default function DictationPanel() {
  const mode = useReportStore((s) => s.mode);
  const setMode = useReportStore((s) => s.setMode);
  const newReport = useReportStore((s) => s.newReport);
  const activeReportId = useReportStore((s) => s.activeReportId);
  const reportStatus = useReportStore((s) => s.activeReportStatus);
  const structuringInstructions = useReportStore(
    (s) => s.settings.structuringInstructions || ""
  );

  const notify = useUiStore((s) => s.notify);
  const acquireMicrophone = useUiStore((s) => s.acquireMicrophone);
  const releaseMicrophone = useUiStore((s) => s.releaseMicrophone);
  const pttBindings = useUiStore((s) => s.pttBindings);

  const [phase, setPhase] = useState<MicPhase>("idle");
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [result, setResult] = useState("");
  const [lastEdits, setLastEdits] = useState<DocumentEditResult[]>([]);
  const [lastRegion, setLastRegion] = useState("report");
  // Every dictated take collects in Preview and is only inserted on Apply.
  const [previewText, setPreviewText] = useState("");
  const [applying, setApplying] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const usage = useSubscriptionStore((s) => s.subscription?.usage);
  const recRef = useRef<Recording | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  // Latest phase, readable synchronously from the push-to-talk callbacks.
  const phaseRef = useRef<MicPhase>(phase);
  phaseRef.current = phase;
  const previewTextRef = useRef(previewText);
  previewTextRef.current = previewText;
  const preparedRef = useRef<PreparedStructure | null>(null);
  const prepareTimerRef = useRef<number | null>(null);
  // Bumped on every stop/cancel/reset so an in-flight startRecording() (mic
  // permission still resolving) knows it was superseded and discards itself —
  // prevents a fast key tap from leaving the mic stuck open.
  const sessionRef = useRef(0);

  const updatePhase = (next: MicPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const clearPreparedStructure = () => {
    if (prepareTimerRef.current !== null) {
      window.clearTimeout(prepareTimerRef.current);
      prepareTimerRef.current = null;
    }
    preparedRef.current = null;
  };

  const updatePreviewText = (next: string) => {
    clearPreparedStructure();
    previewTextRef.current = next;
    setPreviewText(next);
  };

  const prepareStructure = (text: string) => {
    if (!activeReportId || !text.trim()) return null;
    const document = getLiveDocumentTree();
    if (!document) return null;
    const entry: PreparedStructure = {
      text,
      documentKey: documentKey(document),
      reportId: activeReportId,
      mode,
      instructions: structuringInstructions,
      promise: aiApi.structureDocument(
        text,
        mode,
        document,
        activeReportId,
        structuringInstructions
      ),
    };
    preparedRef.current = entry;
    // Speculative placement must never create an unhandled rejection. If the
    // user clicks Apply, runStructure still awaits the original promise and
    // surfaces its real error.
    void entry.promise.catch(() => undefined);
    return entry;
  };

  const scheduleStructurePreparation = (text: string) => {
    if (!activeReportId) return;
    if (prepareTimerRef.current !== null) window.clearTimeout(prepareTimerRef.current);
    prepareTimerRef.current = window.setTimeout(() => {
      prepareTimerRef.current = null;
      if (previewTextRef.current.trim() === text) prepareStructure(text);
    }, 450);
  };

  const stopMeter = () => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    setVoiceLevel(0);
  };

  const startMeter = (recording: Recording) => {
    stopMeter();
    const update = () => {
      setVoiceLevel(recording.getLevel());
      meterFrameRef.current = requestAnimationFrame(update);
    };
    meterFrameRef.current = requestAnimationFrame(update);
  };

  useEffect(
    () => () => {
      sessionRef.current += 1;
      if (prepareTimerRef.current !== null) window.clearTimeout(prepareTimerRef.current);
      if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
      recRef.current?.cancel();
      releaseMicrophone("report");
    },
    [releaseMicrophone]
  );

  useEffect(() => {
    setLastEdits([]);
    setResult("");
  }, [activeReportId]);

  const runStructure = async (text: string) => {
    if (!activeReportId) {
      return false;
    }
    if (prepareTimerRef.current !== null) {
      window.clearTimeout(prepareTimerRef.current);
      prepareTimerRef.current = null;
    }
    updatePhase("processing");
    try {
      // Snapshot the canonical editor tree immediately before the call. This is
      // the full report, in order, with stable block-node ids.
      const document = getLiveDocumentTree();
      if (!document) {
        notify("Report editor is not ready");
        updatePhase("idle");
        return false;
      }
      const key = documentKey(document);
      const prepared = preparedRef.current;
      let results =
        prepared &&
        prepared.text === text &&
        prepared.documentKey === key &&
        prepared.reportId === activeReportId &&
        prepared.mode === mode &&
        prepared.instructions === structuringInstructions
          ? await prepared.promise
          : await aiApi.structureDocument(
              text,
              mode,
              document,
              activeReportId,
              structuringInstructions
            );

      // Never apply a placement planned against a document that changed while
      // the AI request was in flight. Re-route once against the latest tree.
      const latestDocument = getLiveDocumentTree();
      if (!latestDocument) {
        notify("Report editor is not ready");
        updatePhase("idle");
        return false;
      }
      if (documentKey(latestDocument) !== key) {
        results = await aiApi.structureDocument(
          text,
          mode,
          latestDocument,
          activeReportId,
          structuringInstructions
        );
      }
      preparedRef.current = null;
      if (!results.length) {
        notify("Nothing to structure");
        updatePhase("idle");
        return false;
      }
      // Resolve the returned ids against the live transaction document. Missing
      // or stale ids fail closed and can never fall back to a neighboring node.
      const appliedEdits = applyLiveDocumentEditsWithTargets(results);
      if (!appliedEdits.length) {
        notify("Could not place the dictation safely");
        updatePhase("idle");
        return false;
      }
      setLastRegion("report");
      setLastEdits(appliedEdits);
      setResult(appliedEdits.map((r) => `• ${htmlToText(r.text)}`).join("\n"));
      updatePhase("done");
      notify(
        appliedEdits.length === 1
          ? "Inserted into report"
          : `Inserted ${appliedEdits.length} updates into report`
      );
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "REPORT_LIMIT_REACHED") {
        setLimitReached(true);
        notify(err.message);
        updatePhase("idle");
        return false;
      }
      notify(err instanceof Error ? `Structuring failed: ${err.message}` : "Structuring failed");
      updatePhase("idle");
      return false;
    }
  };

  // Begin recording. Async (mic permission) so it may be superseded by a stop/
  // cancel before it resolves — the session token guards that race. Startable
  // from "idle" AND "done" (a previous take's result still on screen); only an
  // in-flight "connecting"/"listening"/"processing" take blocks a new one.
  const startDictation = async () => {
    if (!activeReportId) return;
    if (reportStatus === "FINAL") {
      notify("Signed reports are locked. Start a new report to dictate.");
      return;
    }
    if (
      phaseRef.current === "connecting" ||
      phaseRef.current === "listening" ||
      phaseRef.current === "processing"
    ) return;
    if (!acquireMicrophone("report")) {
      notify("Microphone is in use for selected text editing");
      return;
    }
    clearPreparedStructure();
    updatePhase("connecting");
    const session = ++sessionRef.current;
    let rec: Recording;
    try {
      rec = await startRecording();
    } catch {
      releaseMicrophone("report");
      notify("Microphone access denied");
      updatePhase("idle");
      return;
    }
    if (sessionRef.current !== session) {
      // stopped/cancelled while getUserMedia was resolving — throw the take away
      rec.cancel();
      releaseMicrophone("report");
      updatePhase("idle");
      return;
    }
    recRef.current = rec;
    startMeter(rec);
    setResult("");
    setLastEdits([]);
    updatePhase("listening");
  };

  // Stop recording and run the transcription → (structure | review) pipeline.
  const stopDictation = async () => {
    stopMeter();
    if (phaseRef.current !== "listening") {
      // released before the recording spun up → discard the in-flight start
      sessionRef.current++;
      releaseMicrophone("report");
      updatePhase("idle");
      return;
    }
    const rec = recRef.current;
    recRef.current = null;
    updatePhase("processing");
    try {
      const out = await rec?.stop();
      releaseMicrophone("report");
      if (!out) {
        notify("No speech detected");
        updatePhase("idle");
        return;
      }
      if (!activeReportId) throw new Error("The active report changed during dictation");
      const text = await aiApi.transcribe(out.base64, out.mimeType, activeReportId);
      if (!text.trim()) {
        notify("No speech detected");
        updatePhase("idle");
        return;
      }
      const nextPreview = previewTextRef.current
        ? `${previewTextRef.current.trim()} ${text.trim()}`
        : text.trim();
      updatePreviewText(nextPreview);
      updatePhase("idle");
      scheduleStructurePreparation(nextPreview);
      notify("Added to preview — edit or dictate more, then Apply");
      return;
    } catch (err) {
      if (err instanceof NetworkError) {
        notify("AI backend offline — type directly in Preview below");
      } else {
        const msg = err instanceof Error ? err.message : "";
        notify(msg ? `Transcription failed: ${msg.slice(0, 60)}` : "Transcription failed");
      }
      updatePhase("idle");
    } finally {
      releaseMicrophone("report");
    }
  };

  // Abandon the current take without transcribing (chord/shortcut or lost focus).
  const cancelDictation = () => {
    sessionRef.current++;
    stopMeter();
    recRef.current?.cancel();
    recRef.current = null;
    releaseMicrophone("report");
    if (phaseRef.current === "connecting" || phaseRef.current === "listening") {
      updatePhase("idle");
    }
  };

  // On-screen button stays a tap-to-toggle; the physical triggers below hold.
  const onMic = () => {
    if (phaseRef.current === "listening") void stopDictation();
    else if (phaseRef.current === "connecting") cancelDictation();
    else if (phaseRef.current !== "processing") void startDictation();
  };

  // Push-to-talk: HOLD Ctrl (keyboard) or the bound external button to dictate.
  // Both are keyboard events to the browser, so they drive the same mic state.
  // Disabled while Settings is open so key-capture there can't trip the mic.
  // Store state is read transiently (getState) per key event so this panel
  // doesn't re-render when settings open/close or bindings change.
  usePushToTalk({
    getBindings: () => useUiStore.getState().pttBindings,
    isEnabled: () => !useUiStore.getState().settingsOpen,
    onStart: startDictation,
    onStop: stopDictation,
    onCancel: cancelDictation,
  });

  const onApplyPreview = async () => {
    const text = previewText.trim();
    if (!text || applying) return;
    setApplying(true);
    const ok = await runStructure(text);
    if (ok) updatePreviewText("");
    setApplying(false);
  };

  const onRestructureInserted = async () => {
    if (!activeReportId || !lastEdits.length || applying) return;
    const before = getLiveDocumentTree();
    if (!before) {
      notify("Report editor is not ready");
      return;
    }
    const beforeKey = documentKey(before);
    const instruction =
      mode === "concise"
        ? "Reorder this finding using the configured lesion order, remove filler, and preserve every dictated clinical word and fact exactly."
        : "Reorder this finding using the configured lesion order while preserving every dictated clinical word and fact exactly.";
    setApplying(true);
    updatePhase("processing");
    try {
      const rewritten = await Promise.all(
        lastEdits.map(async (edit) => {
          const response = await aiApi.editSelection(
            edit.text,
            instruction,
            "restructure",
            activeReportId
          );
          const text = response.text.trim();
          if (!text) throw new Error("AI returned an empty finding");
          return { targetNodeId: edit.targetNodeId, operation: "replace" as const, text };
        })
      );
      const latest = getLiveDocumentTree();
      if (!latest || documentKey(latest) !== beforeKey) {
        throw new Error("The report changed while restructuring; nothing was replaced");
      }
      const appliedEdits = applyLiveDocumentEditsWithTargets(rewritten);
      if (appliedEdits.length !== rewritten.length) {
        throw new Error("The inserted finding is no longer available");
      }
      setLastEdits(appliedEdits);
      setResult(appliedEdits.map((edit) => `• ${htmlToText(edit.text)}`).join("\n"));
      updatePhase("done");
      notify(appliedEdits.length === 1 ? "Finding restructured" : "Findings restructured");
    } catch (error) {
      updatePhase("done");
      notify(error instanceof Error ? error.message : "Could not restructure the finding");
    } finally {
      setApplying(false);
    }
  };

  const activeStyle = STYLE_MODES.find((m) => m.id === mode) ?? STYLE_MODES[1];
  const shortcut = pttBindings.length
    ? pttBindings.slice(0, 2).map(triggerLabel).join(" / ")
    : "your trigger";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Template label + New (reset the editor for a fresh template pick) */}
      <div className="mb-2 flex items-center justify-between px-1">
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
          style={{ color: "var(--text-subtle)" }}
        >
          Template
        </div>
        <button
          type="button"
          onClick={async () => {
            if (reportStatus !== "FINAL" && !(await flushReportSave())) {
              notify("The current draft could not be saved. A new report was not opened.");
              return;
            }
            clearPreparedStructure();
            updatePreviewText("");
            setLastEdits([]);
            setResult("");
            newReport();
            notify("New report opened");
          }}
          title="Reset the editor and start a new report"
          className="inline-flex h-6 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition hover:bg-[var(--hover)]"
          style={{ color: "var(--accent)" }}
        >
          <Plus size={12} /> New
        </button>
      </div>
      <TemplateSelector />

      {(limitReached || (usage && usage.limit > 0 && usage.used / usage.limit >= 0.9)) && (
        <div className="mt-3">
          <UsageCard compact />
          {limitReached && (
            <Link href="/pricing" className="mt-2 block text-center text-[12px] font-semibold" style={{ color: "var(--abnormal)" }}>
              Report limit reached · View upgrade options
            </Link>
          )}
        </div>
      )}

      {/* Compact microphone control. The waveform reflects live input energy. */}
      <div
        className="mt-5 rounded-2xl border px-3 py-2.5"
        style={{
          background: "var(--panel)",
          borderColor: phase === "listening" ? "rgba(229,72,77,.38)" : "var(--ring)",
          boxShadow:
            phase === "listening"
              ? "0 10px 30px rgba(229,72,77,.08)"
              : "var(--shadow-float)",
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <MicrophoneButton
            phase={phase}
            onClick={onMic}
            level={voiceLevel}
            disabled={!activeReportId}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              {phase === "idle" && (activeReportId ? "Ready to dictate" : "Opening workspace")}
              {phase === "connecting" && "Starting microphone…"}
              {phase === "listening" && (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e5484d]" />
                  Listening
                </>
              )}
              {phase === "processing" &&
                (!applying ? "Transcribing…" : `Structuring · ${activeStyle.label}`)}
              {phase === "done" && (
                <>
                  <Check size={14} style={{ color: "var(--accent)" }} />
                  Inserted into {lastRegion}
                </>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-subtle)" }}>
              {phase === "idle" &&
                (activeReportId
                  ? `Tap the mic or hold ${shortcut} · adds speech to Preview`
                  : "Dictation activates automatically")}
              {phase === "connecting" && "Connecting to your selected microphone"}
              {phase === "listening" && "Speak naturally · tap the mic or release the trigger to stop"}
              {phase === "processing" && "Keeping your report available while the audio is processed"}
              {phase === "done" && "Ready for another dictation"}
            </div>
          </div>
          <AudioWave level={voiceLevel} active={phase === "listening"} />
        </div>
      </div>

      {/* Style toggle: Verbatim · Concise */}
      <div className="mt-4">
        <Segmented
          options={STYLE_MODES}
          value={mode}
          onChange={(next) => {
            clearPreparedStructure();
            setMode(next);
          }}
        />
      </div>

      {/* Preview: dictated or typed text remains editable until Apply. */}
      <div
        className="animate-in mt-4 rounded-[22px] border p-4 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]"
        style={{
          background: "var(--panel)",
          borderColor: "var(--ring)",
          boxShadow: "var(--shadow-card)",
        }}
      >
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-subtle)" }}>
            Preview
          </div>
          <textarea
            value={previewText}
            onChange={(e) => updatePreviewText(e.target.value)}
            placeholder="Dictate or type — the transcript appears here for preview before it goes into the report…"
            rows={4}
            className="block min-h-[150px] w-full resize-none overflow-hidden bg-transparent text-[16px] leading-7 outline-none [field-sizing:content]"
            style={{ color: "var(--text)" }}
          />
          <div className="mt-2 flex items-center justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--ring)" }}>
            {previewText.trim() && (
              <button
                onClick={() => updatePreviewText("")}
                disabled={applying}
                className="rounded-xl px-3.5 py-2 text-[13px] font-medium transition hover:bg-[var(--hover)] disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </button>
            )}
            <button
              onClick={onApplyPreview}
              disabled={!activeReportId || !previewText.trim() || applying}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--accent)" }}
            >
              <CornerDownRight size={14} /> Apply
            </button>
          </div>
      </div>

      {/* Last inserted finding, with a direct safe rewrite action. */}
      {!!result && !!lastEdits.length && (
        <div
          className="animate-in mt-4 rounded-2xl border p-3"
          style={{ background: "var(--panel)", boxShadow: "var(--shadow-float)", color: "var(--text-muted)" }}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--text-subtle)" }}>
            Inserted finding
          </div>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-6">
              {result}
            </div>
            <button
              type="button"
              onClick={onRestructureInserted}
              disabled={applying || phase === "processing"}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition hover:bg-[var(--hover)] disabled:opacity-50"
              style={{ borderColor: "var(--ring)", color: "var(--accent)" }}
            >
              <RefreshCw size={13} className={applying ? "animate-spin" : ""} />
              {applying ? "Restructuring" : "Restructure"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
