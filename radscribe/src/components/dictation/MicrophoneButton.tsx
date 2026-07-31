"use client";

import { Mic, Square } from "lucide-react";

export type MicPhase = "idle" | "connecting" | "listening" | "processing" | "done";

// Compact microphone trigger. Listening turns it red and its outline expands
// with the measured microphone level; the adjacent AudioWave carries the more
// detailed voice response.
export default function MicrophoneButton({
  phase,
  onClick,
  level = 0,
  disabled = false,
}: {
  phase: MicPhase;
  onClick: () => void;
  level?: number;
  disabled?: boolean;
}) {
  const listening = phase === "listening";
  const processing = phase === "processing" || phase === "connecting";
  const energy = Math.max(0, Math.min(1, level));

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={
        listening
          ? "Stop dictation"
          : phase === "connecting"
            ? "Cancel microphone connection"
            : "Start dictation"
      }
      aria-pressed={listening}
      className="relative grid shrink-0 place-items-center rounded-2xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
      style={{
        width: 48,
        height: 48,
        color: listening ? "#fff" : "var(--accent)",
        background: listening ? "#e5484d" : "var(--accent-soft)",
        boxShadow: listening
          ? "0 8px 24px rgba(229,72,77,.24)"
          : "inset 0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)",
      }}
    >
      {listening && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl border border-[#e5484d] transition-transform duration-75"
          style={{
            opacity: 0.3 + energy * 0.4,
            transform: `scale(${1.08 + energy * 0.14})`,
          }}
        />
      )}
      {processing ? (
        <span
          className="spin"
          style={{
            width: 19,
            height: 19,
            borderRadius: 9999,
            border: "2px solid var(--accent-soft)",
            borderTopColor: "var(--accent)",
          }}
        />
      ) : listening ? (
        <Square size={16} fill="#fff" strokeWidth={0} />
      ) : (
        <Mic size={21} strokeWidth={2} />
      )}
    </button>
  );
}
