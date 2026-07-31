"use client";

import { useUiStore } from "@/store/uiStore";

export default function Toast() {
  const toast = useUiStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div
        className="animate-in pointer-events-auto rounded-xl px-4 py-2.5 text-[13px] font-medium"
        style={{ background: "var(--panel)", color: "var(--text)", boxShadow: "var(--shadow-pop)" }}
      >
        {toast}
      </div>
    </div>
  );
}
