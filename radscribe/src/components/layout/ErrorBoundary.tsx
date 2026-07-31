"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Last-resort guard so a render crash in one page never blanks the whole app —
// the radiologist keeps the shell and can retry or navigate away.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Unhandled render error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full w-full place-items-center p-8">
        <div
          className="w-[420px] rounded-3xl p-7 text-center"
          style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}
        >
          <span
            className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl"
            style={{ background: "var(--abnormal-soft)", color: "var(--abnormal)" }}
          >
            <AlertTriangle size={24} />
          </span>
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
            Something went wrong
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            This view hit an unexpected error. Your report data is saved — reload to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            <RotateCcw size={14} /> Reload
          </button>
        </div>
      </div>
    );
  }
}
