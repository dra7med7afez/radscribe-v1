"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Splash from "./Splash";
import Toast from "./Toast";
import ErrorBoundary from "./ErrorBoundary";
import LoginView from "@/features/auth/LoginView";
import ChangePasswordView from "@/features/auth/ChangePasswordView";
import SettingsModal from "@/features/settings/SettingsModal";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useReportStore } from "@/store/reportStore";
import { usePatientStore } from "@/store/patientStore";
import { useIntegrationStore } from "@/store/integrationStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrateUi = useUiStore((s) => s.hydrate);
  const mounted = useUiStore((s) => s.mounted);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const status = useAuthStore((s) => s.status);
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword);
  const userId = useAuthStore((s) => s.user?.id);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    hydrateUi();
    hydrateAuth();
  }, [hydrateUi, hydrateAuth]);

  // Once signed in (and on account switch), pull the user's templates and
  // settings from the backend.
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const rs = useReportStore.getState();
    rs.hydrateSettings();
    void rs.hydrateTemplates();
    void useSubscriptionStore.getState().load();
  }, [status, userId]);

  // Clear all in-memory tenant data as soon as a session ends. This protects
  // shared workstations even before React swaps to the login screen.
  useEffect(() => {
    if (status !== "unauthenticated") return;
    useReportStore.getState().resetSession();
    usePatientStore.getState().reset();
    useIntegrationStore.getState().reset();
    useSubscriptionStore.getState().reset();
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const idleMs = 15 * 60 * 1000;
    let timer = window.setTimeout(() => void logout(), idleMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logout(), idleMs);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [status, logout]);

  if (!mounted || status === "loading") return <Splash />;
  if (status === "unauthenticated" && pathname === "/pricing") {
    return <div className="min-h-screen" style={{ background: "var(--canvas)" }}><main>{children}</main><Toast /></div>;
  }
  if (status === "unauthenticated") return <LoginView />;
  if (mustChangePassword) return <ChangePasswordView />;

  return (
    <div className="flex" style={{ background: "var(--canvas)" }}>
      <Sidebar />
      <main className="h-screen min-w-0 flex-1 overflow-hidden">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <SettingsModal />
      <Toast />
    </div>
  );
}
