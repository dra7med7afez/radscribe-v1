"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { AudioLines, Bold, LoaderCircle, Sparkles, Square, Underline, X } from "lucide-react";
import { startRecording, type Recording } from "@/utils/audio";
import { aiApi } from "@/services/ai.api";
import { applySelectedTextEdit } from "@/lib/selected-text-edit-service";
import type { SelectedTextEditAction } from "@/lib/voice-edit-command-parser";
import { insertDictation } from "@/lib/dictation-insertion";
import { useUiStore } from "@/store/uiStore";
import { useTextSelectionManager } from "./TextSelectionManager";
import { useReportStore } from "@/store/reportStore";

type DictationPhase = "idle" | "listening" | "transcribing";

const AI_ACTIONS: { label: string; action: SelectedTextEditAction; instruction: string }[] = [
  { label: "Make concise", action: "concise", instruction: "Remove redundancy and introductory filler such as 'there is' or 'there are'. Preserve every dictated clinical word and fact." },
  { label: "Restructure", action: "restructure", instruction: "Use this lesion order: location/organ, laterality and anatomical segment, number/distribution, size, shape, margins, internal composition/density/signal, enhancement or vascularity, associated effects or adjacent involvement, then interval change. Omit unstated attributes and introductory filler. Preserve every dictated clinical word and fact." },
  { label: "Improve grammar", action: "grammar", instruction: "Correct grammar and punctuation only. Preserve the radiologist's clinical wording and every clinical fact." },
  { label: "Standardize terminology", action: "standardize", instruction: "Preserve wording that is already accepted radiology terminology. Convert only nonstandard wording to the closest standard term without changing meaning." },
  { label: "Convert to bullets", action: "bullets", instruction: "Create one bullet per distinct lesion or finding. Keep all descriptors of the same lesion together and preserve every clinical fact." },
  { label: "Convert to paragraph", action: "paragraph", instruction: "Convert this into one paragraph while preserving every dictated clinical word and fact." },
  { label: "Split findings", action: "split", instruction: "Place each distinct lesion or finding in a separate bullet. Keep descriptors of the same lesion together and preserve every clinical fact." },
  { label: "Combine findings", action: "combine", instruction: "Combine these bullets into one professional radiology paragraph while preserving every clinical fact and already-standard term." },
];

function HoldSelectionButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      onMouseDown={(event) => {
        event.preventDefault();
        props.onMouseDown?.(event);
      }}
      className={className}
    >
      {children}
    </button>
  );
}

// A selection-scoped assistant. Dictation uses the same direct transcription
// insertion as the caret mic; the captured selection is replaced with the
// transcript, while AI Edit remains a separate explicit transformation.
export default function FloatingEditorToolbar({ editor }: { editor: Editor }) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const selection = useTextSelectionManager(editor, toolbarRef);
  const notify = useUiStore((s) => s.notify);
  const acquireMicrophone = useUiStore((s) => s.acquireMicrophone);
  const releaseMicrophone = useUiStore((s) => s.releaseMicrophone);
  const activeReportId = useReportStore((s) => s.activeReportId);

  const [menuOpen, setMenuOpen] = useState(false);
  const [dictationPhase, setDictationPhase] = useState<DictationPhase>("idle");
  const [processing, setProcessing] = useState(false);
  const recordingRef = useRef<Recording | null>(null);
  const dictationSelectionRef = useRef<typeof selection>(null);
  const editSelectionRef = useRef<typeof selection>(null);

  useEffect(
    () => () => {
      recordingRef.current?.cancel();
      releaseMicrophone("selected-text");
    },
    [releaseMicrophone]
  );

  useEffect(() => {
    if (!selection && !processing && dictationPhase === "idle") {
      setMenuOpen(false);
      editSelectionRef.current = null;
    }
  }, [selection, processing, dictationPhase]);

  const applyEdit = async (action: SelectedTextEditAction, instruction: string) => {
    const range = editSelectionRef.current ?? selection;
    if (!range || processing) return;
    editSelectionRef.current = range;
    setMenuOpen(false);
    setProcessing(true);
    try {
      await applySelectedTextEdit({ editor, range, instruction, action });
      editSelectionRef.current = null;
      notify("Selected text updated");
    } catch (error) {
      // Keep the captured target and reopen the choices so a temporary backend
      // failure does not force the user to select the text again.
      if (!editor.isDestroyed && editor.state.doc.textBetween(range.from, range.to, "\n") === range.text) {
        editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).run();
        setMenuOpen(true);
      } else {
        editSelectionRef.current = null;
      }
      notify(error instanceof Error ? error.message : "Could not edit selected text");
    } finally {
      setProcessing(false);
    }
  };

  const startDictation = async () => {
    if (!selection || dictationPhase !== "idle") return;
    if (!acquireMicrophone("selected-text")) {
      notify("Microphone is in use for report dictation");
      return;
    }
    dictationSelectionRef.current = selection;
    setMenuOpen(false);
    try {
      recordingRef.current = await startRecording();
      setDictationPhase("listening");
    } catch {
      releaseMicrophone("selected-text");
      notify("Microphone access denied");
    }
  };

  const cancelDictation = () => {
    recordingRef.current?.cancel();
    recordingRef.current = null;
    dictationSelectionRef.current = null;
    releaseMicrophone("selected-text");
    setDictationPhase("idle");
  };

  const stopDictation = async () => {
    const recording = recordingRef.current;
    const range = dictationSelectionRef.current;
    if (!recording || !range || dictationPhase !== "listening") return;
    recordingRef.current = null;
    setDictationPhase("transcribing");
    try {
      const audio = await recording.stop();
      releaseMicrophone("selected-text");
      if (!audio) throw new Error("No speech detected");
      if (!activeReportId) throw new Error("No active report");
      const transcript = (await aiApi.transcribe(audio.base64, audio.mimeType, activeReportId)).trim();
      if (!transcript) throw new Error("No speech detected");
      const selectedText = editor.state.doc.textBetween(range.from, range.to, "\n");
      if (selectedText !== range.text) {
        throw new Error("The selected text changed before dictation was inserted");
      }
      if (!insertDictation(editor, transcript, range)) throw new Error("Could not insert dictation");
      notify("Dictation inserted");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Dictation failed");
    } finally {
      releaseMicrophone("selected-text");
      dictationSelectionRef.current = null;
      setDictationPhase("idle");
    }
  };

  // Keep the controls reachable if the browser drops the visual selection
  // while recording. Otherwise a live microphone could be left with no Stop
  // or Cancel button.
  const activeSelection =
    selection ??
    (dictationPhase !== "idle" ? dictationSelectionRef.current : null) ??
    (menuOpen || processing ? editSelectionRef.current : null);
  if (!activeSelection) return null;

  const busy = processing || dictationPhase === "transcribing";

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selected text editing tools"
      className="fixed z-50 flex items-center gap-0.5 rounded-xl border p-1 shadow-lg"
      style={{
        left: activeSelection.position.x,
        top: activeSelection.position.y,
        background: "var(--panel)",
        borderColor: "var(--ring)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      {dictationPhase === "listening" ? (
        <>
          <HoldSelectionButton
            onClick={stopDictation}
            title="Stop and insert dictation"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-500 px-2.5 text-[12px] font-medium text-white"
          >
            <Square size={11} fill="currentColor" /> Listening…
          </HoldSelectionButton>
          <HoldSelectionButton
            onClick={cancelDictation}
            title="Cancel dictation"
            aria-label="Cancel dictation"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={16} />
          </HoldSelectionButton>
        </>
      ) : dictationPhase !== "idle" ? (
        <div className="flex h-8 items-center gap-2 px-2 text-[12px]" style={{ color: "var(--text)" }}>
          <LoaderCircle className="spin shrink-0" size={15} style={{ color: "var(--accent)" }} />
          <span>Transcribing…</span>
        </div>
      ) : (
        <>
          <HoldSelectionButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
            aria-label="Bold selected text"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--hover)]"
            style={{ color: "var(--text)" }}
          >
            <Bold size={16} />
          </HoldSelectionButton>
          <HoldSelectionButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
            aria-label="Underline selected text"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[var(--hover)]"
            style={{ color: "var(--text)" }}
          >
            <Underline size={16} />
          </HoldSelectionButton>
          <span className="mx-0.5 h-5 w-px" style={{ background: "var(--ring)" }} />
          <HoldSelectionButton
            onClick={dictationPhase === "idle" ? startDictation : undefined}
            disabled={busy}
            title="Dictate replacement text"
            aria-label="Dictate replacement text"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition hover:bg-[var(--hover)] disabled:opacity-45"
            style={{ color: "var(--text)" }}
          >
            {busy ? <LoaderCircle className="spin" size={15} /> : <AudioLines size={15} />}
            Dictate
          </HoldSelectionButton>
          <div className="relative">
            <HoldSelectionButton
              onClick={() => {
                if (!menuOpen && selection) editSelectionRef.current = selection;
                setMenuOpen((value) => {
                  if (value) editSelectionRef.current = null;
                  return !value;
                });
              }}
              disabled={busy}
              title="AI edit selected text"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition hover:bg-[var(--hover)] disabled:opacity-45"
              style={{ color: "var(--text)" }}
            >
              <Sparkles size={15} /> AI Edit
            </HoldSelectionButton>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border p-1.5"
                style={{ background: "var(--panel)", borderColor: "var(--ring)", boxShadow: "var(--shadow-pop)" }}
              >
                {AI_ACTIONS.map((item) => (
                  <HoldSelectionButton
                    key={item.action}
                    role="menuitem"
                    onClick={() => applyEdit(item.action, item.instruction)}
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-[12px] transition hover:bg-[var(--hover)]"
                    style={{ color: "var(--text)" }}
                  >
                    {item.label}
                  </HoldSelectionButton>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
