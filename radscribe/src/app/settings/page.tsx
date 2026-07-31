"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUiStore } from "@/store/uiStore";

// Settings is now a WINDOW (modal), not a page. Hitting /settings directly opens
// the modal over the workspace and returns to it.
export default function SettingsRoute() {
  const router = useRouter();
  const openSettings = useUiStore((s) => s.openSettings);

  useEffect(() => {
    openSettings();
    router.replace("/");
  }, [openSettings, router]);

  return null;
}
