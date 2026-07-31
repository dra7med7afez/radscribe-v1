"use client";

import ReportingWorkspace from "./ReportingWorkspace";
import { useReportSync } from "@/hooks/useReportSync";

export default function ReportingPage() {
  // AppShell hydrates account settings once on authentication. Rehydrating
  // again every time the workspace route mounts would overwrite the font,
  // spacing and bullet settings intentionally loaded from a template.
  useReportSync();
  return <ReportingWorkspace />;
}
