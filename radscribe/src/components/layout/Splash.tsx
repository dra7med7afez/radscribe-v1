"use client";

import { AudioLines } from "lucide-react";

export default function Splash() {
  return (
    <div
      className="grid h-screen w-screen place-items-center"
      style={{ background: "var(--canvas)" }}
    >
      <div className="flex flex-col items-center gap-3">
        <span
          className="mic-breathe grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <AudioLines size={28} />
        </span>
        <span className="text-[14px] font-medium" style={{ color: "var(--text-muted)" }}>
          RadScribe
        </span>
      </div>
    </div>
  );
}
