"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, LoaderCircle, Square } from "lucide-react";
import { startRecording, type Recording } from "@/utils/audio";
import { aiApi } from "@/services/ai.api";
import { useEditorRegistry } from "./editor-context";
import { useUiStore } from "@/store/uiStore";
import { NetworkError } from "@/lib/api/client";
import { insertDictation } from "@/lib/dictation-insertion";
import { useReportStore } from "@/store/reportStore";

type Phase = "idle" | "recording" | "processing";

// Cursor-anchored micro-dictation: when the caret is placed anywhere in the
// report, a small wavy-audio icon floats just above it. Clicking it records a
// short dictation; the transcription (grammar/punctuation corrected, NOT
// re-structured) is inserted at the caret. The report body is one continuous
// TipTap document, so the icon follows the caret across headings, paragraphs
// and list items, and insertion always goes through the editor's selection.
export default function CaretDictation() {
  const registry = useEditorRegistry();
  const notify = useUiStore((s) => s.notify);
  const acquireMicrophone = useUiStore((s) => s.acquireMicrophone);
  const releaseMicrophone = useUiStore((s) => s.releaseMicrophone);
  const activeReportId = useReportStore((s) => s.activeReportId);

  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  // whether the caret currently sits inside the report document — the icon only
  // shows there, and insertion targets the editor's own selection
  const inDocRef = useRef(false);
  const recRef = useRef<Recording | null>(null);

  const computeCaret = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    // A non-collapsed range belongs to the floating selection toolkit. The
    // caret mic stays absent so only one dictation control is shown at a time.
    if (!range.collapsed) return null;
    const startEl =
      range.startContainer.nodeType === 1
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement;
    const host = startEl?.closest<HTMLElement>(".ProseMirror");
    if (!host || !host.closest(".report-doc")) return null;

    let rect = range.getBoundingClientRect();
    if (!rect || (rect.top === 0 && rect.left === 0 && rect.width === 0)) {
      rect = range.getClientRects()[0] || host.getBoundingClientRect();
    }
    return { rect };
  }, []);

  const refresh = useCallback(() => {
    if (phaseRef.current !== "idle") return; // freeze the icon while busy
    const info = computeCaret();
    if (!info) {
      inDocRef.current = false;
      setAnchor(null);
      return;
    }
    inDocRef.current = true;
    const controlH = 42;
    // Reserve the widest state ("Listening…") so the control never clips at
    // the right viewport edge after its position freezes for recording.
    const controlW = 132;
    const gap = 8;
    let y = info.rect.top - controlH - gap;
    if (y < 8) y = info.rect.bottom + gap; // flip below if near the top
    const x = Math.max(8, Math.min(info.rect.left - 4, window.innerWidth - controlW - 8));
    setAnchor({ x, y });
  }, [computeCaret]);

  useEffect(() => {
    const onSel = () => requestAnimationFrame(refresh);
    const onScroll = () => {
      if (phaseRef.current === "idle") refresh();
    };
    document.addEventListener("selectionchange", onSel);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [refresh]);

  useEffect(
    () => () => {
      recRef.current?.cancel();
      releaseMicrophone("report");
    },
    [releaseMicrophone]
  );

  const insertText = useCallback(
    (text: string) => {
      const ed = registry.active;
      if (!text || !ed || !inDocRef.current) return;
      insertDictation(ed, text);
    },
    [registry]
  );

  const onIconClick = async () => {
    if (phase === "processing") return;

    if (phase === "recording") {
      const rec = recRef.current;
      recRef.current = null;
      setPhase("processing");
      try {
        const out = await rec?.stop();
        releaseMicrophone("report");
        if (!out) {
          notify("No speech detected");
          setPhase("idle");
          return;
        }
        if (!activeReportId) throw new Error("No active report");
        const text = (await aiApi.transcribe(out.base64, out.mimeType, activeReportId)).trim();
        if (!text) {
          notify("No speech detected");
          setPhase("idle");
          return;
        }
        insertText(text);
        notify("Inserted at cursor");
      } catch (err) {
        notify(err instanceof NetworkError ? "AI backend offline" : "Transcription failed");
      } finally {
        releaseMicrophone("report");
        setPhase("idle");
        // re-anchor to the new caret position after insertion
        requestAnimationFrame(refresh);
      }
      return;
    }

    // idle → start a short recording at the caret
    if (!inDocRef.current) return;
    if (!acquireMicrophone("report")) {
      notify("Microphone is in use for selected text editing");
      return;
    }
    try {
      recRef.current = await startRecording();
      setPhase("recording");
    } catch {
      releaseMicrophone("report");
      notify("Microphone access denied");
      setPhase("idle");
    }
  };

  if (!anchor) return null;

  return (
    <div
      className="fixed z-40 flex items-center rounded-xl border p-1 shadow-lg"
      style={{
        left: anchor.x,
        top: anchor.y,
        background: "var(--panel)",
        borderColor: "var(--ring)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // keep the caret/selection alive
        onClick={onIconClick}
        title={
          phase === "recording"
            ? "Stop and insert dictation"
            : phase === "processing"
            ? "Transcribing…"
            : "Dictate at cursor"
        }
        aria-label="Dictate at cursor"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition hover:bg-[var(--hover)] ${
          phase === "recording" ? "mic-live bg-red-500 text-white" : ""
        }`}
        style={{ color: phase === "recording" ? "#fff" : "var(--text)" }}
      >
        {phase === "processing" ? (
          <LoaderCircle className="spin" size={15} style={{ color: "var(--accent)" }} />
        ) : phase === "recording" ? (
          <Square size={11} fill="currentColor" />
        ) : (
          <AudioLines size={15} />
        )}
        <span>{phase === "recording" ? "Listening…" : phase === "processing" ? "Transcribing…" : "Dictate"}</span>
      </button>
    </div>
  );
}
