"use client";

import { useState } from "react";
import { Check, ChevronDown, ListChevronsUpDown } from "lucide-react";
import { bulletGlyph, bulletScale, LIST_PRESETS } from "@/lib/bullets";
import type { BulletShape, ListPreset } from "@/lib/bullets";
import { cn } from "@/lib/utils";
import type { ReportSettings } from "@/types";
import { useEditorRegistry } from "./editor-context";
import { applyListPresetToEditor } from "./list-style";

// Word-style "list gallery" for the report's bullet HIERARCHY. The whole gallery
// is generated from the LIST_PRESETS data structure (no hardcoded cards). Picking
// a preset patches the three per-level bullet settings (organ → finding →
// parameter) at once, which re-renders every findings list in the report, saves
// the choice, and closes the dropdown.

const SELECTED = "#7c3aed"; // purple border + checkmark on the active preset

// One bullet glyph at its per-shape scale (matches the editor's Marker so the
// preview reads at the same size the report uses).
function Glyph({ shape }: { shape: BulletShape }) {
  const scale = bulletScale(shape);
  return (
    <span
      aria-hidden
      className="inline-block w-[0.9em] shrink-0 text-center leading-none"
      style={{ color: "var(--text)", transform: scale !== 1 ? `scale(${scale})` : undefined }}
    >
      {bulletGlyph(shape)}
    </span>
  );
}

// A single preview row: indent by level, the level's bullet, then a placeholder
// bar standing in for text (no real text per spec).
function PreviewRow({ shape, level }: { shape: BulletShape; level: number }) {
  return (
    <div className="flex items-center gap-1.5" style={{ marginLeft: level * 12 }}>
      <Glyph shape={shape} />
      <span
        className="block h-[5px] rounded-full"
        style={{ background: "var(--ring)", width: 46 - level * 8 }}
      />
    </div>
  );
}

// Indentation pattern shown in every card — 3 distinct levels across 4 lines so
// the hierarchy reads like a real nested list.
const PREVIEW_LEVELS = [0, 1, 2, 1] as const;

function PresetCard({
  preset,
  selected,
  onPick,
}: {
  preset: ListPreset;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "group/card relative flex flex-col gap-1.5 rounded-[12px] border p-3 text-left transition-all duration-150",
        "hover:-translate-y-0.5 hover:bg-[var(--hover)]"
      )}
      style={{
        borderColor: selected ? SELECTED : "var(--ring)",
        borderWidth: selected ? 2 : 1,
        background: selected ? "var(--accent-soft)" : "var(--canvas)",
      }}
    >
      {selected && (
        <span
          className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full text-white"
          style={{ background: SELECTED }}
        >
          <Check size={11} strokeWidth={3} />
        </span>
      )}
      {PREVIEW_LEVELS.map((lvl, i) => (
        <PreviewRow key={i} shape={preset.levels[lvl]} level={lvl} />
      ))}
    </button>
  );
}

export default function ListStylePicker({
  settings,
  onSettingsChange,
}: {
  settings: ReportSettings;
  onSettingsChange: (patch: Partial<ReportSettings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const registry = useEditorRegistry();

  const apply = (preset: ListPreset) => {
    onSettingsChange({
      organBullet: preset.levels[0],
      findingBullet: preset.levels[1],
      subpointBullet: preset.levels[2],
      listPreset: preset.id,
    });
    registry.format((editor) => applyListPresetToEditor(editor, preset));
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="List style"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 items-center gap-0.5 rounded-lg px-1.5 transition",
          open ? "bg-[var(--active)]" : "hover:bg-[var(--hover)]"
        )}
        style={{ color: "var(--text)" }}
      >
        <ListChevronsUpDown size={16} />
        <ChevronDown size={11} style={{ color: "var(--text-muted)" }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="animate-in absolute left-0 z-20 mt-1 w-[340px] rounded-2xl p-3"
            style={{ background: "var(--panel)", boxShadow: "var(--shadow-pop)" }}
          >
            <div className="mb-2 px-1 text-[12px] font-semibold" style={{ color: "var(--text)" }}>
              List style
            </div>
            <div className="grid grid-cols-3 gap-2">
              {LIST_PRESETS.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  selected={settings.listPreset === preset.id}
                  onPick={() => apply(preset)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
