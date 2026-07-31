"use client";

import type { CSSProperties, ReactNode } from "react";
import { EditorRegistryProvider } from "./editor-context";
import EditorToolbar from "./EditorToolbar";
import CaretDictation from "./CaretDictation";
import { useReportStore } from "@/store/reportStore";
import { cn } from "@/lib/utils";
import type { ReportSettings } from "@/types";
import { bulletGlyph, bulletScale } from "@/lib/bullets";

export default function DocumentEditor({
  mode,
  children,
  settings: settingsOverride,
  onSettingsChange,
  className,
}: {
  mode: "report" | "template";
  children: ReactNode;
  settings?: ReportSettings;
  onSettingsChange?: (patch: Partial<ReportSettings>) => void;
  className?: string;
}) {
  const reportSettings = useReportStore((s) => s.settings);
  const settings = settingsOverride ?? reportSettings;
  const fontFamily =
    settings.fontFamily === "System"
      ? "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      : settings.fontFamily;
  const documentStyle = {
    background: "var(--page)",
    color: "var(--text)",
    fontFamily,
    fontSize: settings.fontSize,
    lineHeight: settings.lineSpacing,
    "--rd-l0-glyph": `"${bulletGlyph(settings.organBullet)}"`,
    "--rd-l1-glyph": `"${bulletGlyph(settings.findingBullet)}"`,
    "--rd-l2-glyph": `"${bulletGlyph(settings.subpointBullet)}"`,
    "--rd-l0-scale": bulletScale(settings.organBullet),
    "--rd-l1-scale": bulletScale(settings.findingBullet),
    "--rd-l2-scale": bulletScale(settings.subpointBullet),
  } as CSSProperties;

  return (
    <EditorRegistryProvider>
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <EditorToolbar
          mode={mode}
          settings={settingsOverride}
          onSettingsChange={onSettingsChange}
        />
        <div
          className={cn(
            "report-doc min-h-0 flex-1 overflow-auto px-10 py-7",
            settings.defaultItalic && "italic-default"
          )}
          style={documentStyle}
        >
          {children}
        </div>
      </div>
      <CaretDictation />
    </EditorRegistryProvider>
  );
}
