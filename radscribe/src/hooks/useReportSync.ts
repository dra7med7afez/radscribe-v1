"use client";

import { useEffect, useRef } from "react";
import { persistedTemplateId, useReportStore } from "@/store/reportStore";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { usePatientStore } from "@/store/patientStore";
import {
  reportsApi,
  type BackendItem,
  type BackendReport,
  type BackendSection,
  type ReportContent,
} from "@/services/reports.api";
import { ApiError, NetworkError } from "@/lib/api/client";
import { flushProjection } from "@/components/report-editor/projection-bridge";
import type { Finding, ReportSection } from "@/types";

const DRAFT_KEY = "rs_draft_report_id";
let activeSave: (() => Promise<boolean>) | null = null;

export async function flushReportSave(): Promise<boolean> {
  return activeSave ? activeSave() : false;
}

function draftKey() {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `${DRAFT_KEY}:${userId}` : DRAFT_KEY;
}

function toBackendSections(sections: ReportSection[]): BackendSection[] {
  return sections.map((s, i) => ({
    sectionId: s.id,
    name: s.name,
    kind: s.kind === "findings" ? "FINDINGS" : "PROSE",
    grouped: !!s.grouped,
    orderIndex: i,
    html: s.kind === "prose" ? s.html || "" : undefined,
  }));
}

function buildItems(sections: ReportSection[]): BackendItem[] {
  const items: BackendItem[] = [];
  let order = 0;
  for (const s of sections) {
    if (s.kind !== "findings" || !s.findings) continue;
    for (const f of s.findings) {
      let first = true;
      for (const it of f.items) {
        items.push({
          sectionId: s.id,
          region: f.region,
          text: it.text,
          impressionLine: it.impression || "",
          abnormal: f.abnormal,
          score: it.score || f.score,
          images: f.images,
          subpoints: first
            ? f.subpoints?.map((sp) => ({
                id: sp.id,
                text: sp.text,
                ...(sp.level ? { level: sp.level } : {}),
              }))
            : undefined,
          orderIndex: order++,
        });
        first = false;
      }
    }
  }
  return items;
}

function currentContent(): ReportContent {
  flushProjection();
  const { sections, clinicalInfo, revision } = useReportStore.getState();
  return {
    expectedRevision: revision,
    clinicalInfo: clinicalInfo || "",
    sections: toBackendSections(sections),
    items: buildItems(sections),
  };
}

function restoreSections(report: BackendReport): ReportSection[] {
  const items = Array.isArray(report.items) ? report.items : [];
  return (report.sections || []).map((section) => {
    if (section.kind === "PROSE") {
      return {
        id: section.sectionId,
        name: section.name,
        kind: "prose" as const,
        grouped: section.grouped,
        html: section.html || "<p></p>",
      };
    }
    const byRegion = new Map<string, Finding>();
    for (const item of items.filter((entry) => entry.sectionId === section.sectionId)) {
      const key = item.region || "";
      const finding: Finding = byRegion.get(key) || {
        id: `restored-${section.sectionId}-${byRegion.size}`,
        region: key,
        normalText: "",
        abnormal: false,
        items: [],
        images: item.images || [],
      };
      finding.abnormal ||= !!item.abnormal;
      finding.score ||= item.score || undefined;
      finding.items.push({
        id: item.id || `restored-item-${finding.items.length}`,
        text: item.text,
        impression: item.impressionLine || undefined,
        score: item.score || undefined,
      });
      if (!finding.subpoints && Array.isArray(item.subpoints)) {
        finding.subpoints = item.subpoints.map((subpoint, index: number) => ({
          id: subpoint.id || `restored-subpoint-${index}`,
          text: subpoint.text,
          level: subpoint.level,
        }));
      }
      byRegion.set(key, finding);
    }
    return {
      id: section.sectionId,
      name: section.name,
      kind: "findings" as const,
      grouped: section.grouped,
      findings: [...byRegion.values()],
    };
  });
}

// The server is the source of truth for report content. The only browser
// persistence is a non-PHI, user-scoped draft identifier used to reopen a
// report after refresh; report bodies are never cached locally.
export function useReportSync() {
  const status = useAuthStore((s) => s.status);
  const notify = useUiStore((s) => s.notify);
  const reportNonce = useReportStore((s) => s.reportNonce);
  const activeReportId = useReportStore((s) => s.activeReportId);
  const activePatientId = usePatientStore((s) => s.activePatientId);
  const reportIdRef = useRef<string | null>(null);
  const initializedNonceRef = useRef<number | null>(null);
  // Kept until the requested report is actually created. React development
  // Strict Mode runs effect setup → cleanup → setup once; without a durable
  // pending marker, the second setup mistakes the previous draft for the
  // requested template and restores it over the new document.
  const pendingNewNonceRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const notifiedRef = useRef(false);
  const suppressAutosaveRef = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    const nonceChanged =
      initializedNonceRef.current !== null && initializedNonceRef.current !== reportNonce;
    // A template may be chosen on /templates before this hook mounts. In that
    // case the nonce is already non-zero and there is deliberately no active
    // report: create from the chosen template instead of restoring the old
    // draft id from localStorage.
    const queuedBeforeMount =
      initializedNonceRef.current === null &&
      reportNonce > 0 &&
      !useReportStore.getState().activeReportId;
    if (nonceChanged || queuedBeforeMount) pendingNewNonceRef.current = reportNonce;
    initializedNonceRef.current = reportNonce;
    const isNewReport = pendingNewNonceRef.current === reportNonce;
    let cancelled = false;

    if (isNewReport) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      saveTimer.current = null;
      retryTimer.current = null;
      reportIdRef.current = null;
      dirtyRef.current = false;
      notifiedRef.current = false;
    }

    const createReport = async () => {
      // Let Strict Mode's immediate cleanup cancel its probe setup before any
      // network mutation, preventing an orphan draft from that probe.
      await Promise.resolve();
      if (cancelled) return;
      const state = useReportStore.getState();
      const template = state.getTemplate();
      const templateId = template ? persistedTemplateId(template.id) : undefined;
      const patientId = usePatientStore.getState().activePatientId || undefined;
      const created = await reportsApi.create({
        studyDescription: template?.name || "Report",
        modality: template?.modality || "",
        bodyPart: template?.bodyPart || "",
        clinicalInfo: state.clinicalInfo || "",
        ...(templateId ? { templateId } : {}),
        ...(patientId ? { patientId } : {}),
      });
      if (cancelled) return;
      reportIdRef.current = created.id;
      useReportStore.getState().setPersistence(created.id, created.revision, "DRAFT");
      window.localStorage.setItem(draftKey(), created.id);
      dirtyRef.current = true;
      if (pendingNewNonceRef.current === reportNonce) pendingNewNonceRef.current = null;
      if (activeSave) {
        await activeSave();
      } else {
        const saved = await reportsApi.setContent(created.id, currentContent());
        if (!cancelled && reportIdRef.current === created.id) {
          dirtyRef.current = false;
          useReportStore.getState().setPersistence(created.id, saved.revision, "DRAFT");
        }
      }
    };

    (async () => {
      try {
        const stored = !isNewReport ? window.localStorage.getItem(draftKey()) : null;
        if (stored) {
          try {
            const report = await reportsApi.get(stored);
            if (cancelled) return;
            reportIdRef.current = report.id;
            suppressAutosaveRef.current = true;
            useReportStore.getState().restoreReport({
              id: report.id,
              revision: report.revision,
              status: report.status === "FINAL" ? "FINAL" : "DRAFT",
              clinicalInfo: report.clinicalInfo || "",
              sections: restoreSections(report),
              templateId: report.templateId,
            });
            return;
          } catch (err) {
            if (err instanceof NetworkError) throw err;
            window.localStorage.removeItem(draftKey());
          }
        }
        await createReport();
      } catch (err) {
        if (!reportIdRef.current) {
          notify(
            err instanceof NetworkError
              ? "Report service is offline; editing is disabled until a secure draft can be created"
              : "Could not create or reopen the report"
          );
        } else {
          notify("The secure draft was created, but its initial content has not saved yet. Saving will retry.");
          retryTimer.current = setTimeout(() => void activeSave?.(), 2_000);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, reportNonce, notify]);

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !activeReportId ||
      !activePatientId ||
      useReportStore.getState().activeReportStatus === "FINAL"
    ) return;
    reportsApi.update(activeReportId, { patientId: activePatientId }).catch(() => {
      notify("Could not associate the selected patient with this report");
    });
  }, [status, activeReportId, activePatientId, notify]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const scheduleRetry = (save: () => Promise<boolean>) => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        void save();
      }, 2_000);
    };
    const save = async (): Promise<boolean> => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const id = reportIdRef.current;
      if (!id) return false;
      if (useReportStore.getState().activeReportStatus === "FINAL") return true;
      if (savingRef.current) {
        dirtyRef.current = true;
        while (savingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return dirtyRef.current ? save() : true;
      }
      savingRef.current = true;
      const content = currentContent();
      dirtyRef.current = false;
      let saved = false;
      try {
        const response = await reportsApi.setContent(id, content);
        if (
          reportIdRef.current !== id ||
          useReportStore.getState().activeReportId !== id
        ) {
          return false;
        }
        useReportStore.getState().setPersistence(id, response.revision, "DRAFT");
        saved = true;
        if (!notifiedRef.current) {
          notifiedRef.current = true;
          notify("Report saved securely");
        }
      } catch (err) {
        dirtyRef.current = true;
        if (err instanceof ApiError && err.status === 409) {
          notify("This report changed in another session. Your local text was preserved; reload to reconcile it.");
        } else {
          notify("Report save failed. Your text remains open and saving will retry.");
          scheduleRetry(save);
        }
      } finally {
        savingRef.current = false;
        if (dirtyRef.current && saved) {
          return save();
        }
      }
      return saved;
    };

    activeSave = save;

    const unsubscribe = useReportStore.subscribe((state, previous) => {
      if (suppressAutosaveRef.current) {
        suppressAutosaveRef.current = false;
        return;
      }
      if (
        state.sections === previous.sections &&
        state.clinicalInfo === previous.clinicalInfo &&
        state.reportNonce === previous.reportNonce
      ) {
        return;
      }
      if (state.reportNonce !== previous.reportNonce) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (retryTimer.current) clearTimeout(retryTimer.current);
        saveTimer.current = null;
        retryTimer.current = null;
        reportIdRef.current = null;
        dirtyRef.current = false;
        return;
      }
      if (state.activeReportStatus === "FINAL") return;
      dirtyRef.current = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void save(), 800);
    });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      if (activeSave === save) activeSave = null;
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [status, notify]);

  const loaded = usePatientStore((s) => s.loaded);
  const loadWorklist = usePatientStore((s) => s.loadWorklist);
  useEffect(() => {
    if (status === "authenticated" && !loaded) {
      void loadWorklist().catch((error: unknown) => {
        notify(error instanceof Error ? error.message : "Could not load the patient queue");
      });
    }
  }, [status, loaded, loadWorklist, notify]);
}
