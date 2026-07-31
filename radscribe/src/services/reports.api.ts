import { apiFetch } from "@/lib/api/client";

// reports.api (§13). All calls are best-effort; useReportSync swallows
// NetworkErrors so the app keeps working when the backend is offline.

export interface CreateReportDto {
  studyDescription: string;
  modality: string;
  bodyPart: string;
  clinicalInfo: string;
  patientId?: string;
  templateId?: string;
}

export interface BackendSection {
  sectionId: string;
  name: string;
  kind: "PROSE" | "FINDINGS";
  grouped: boolean;
  orderIndex: number;
  html?: string;
}

export interface BackendItem {
  sectionId: string;
  region: string;
  text: string;
  impressionLine: string;
  abnormal: boolean;
  score?: string;
  images?: { id: string; src: string }[];
  // level = 0-based multilevel-list depth; omitted at depth 0
  subpoints?: { id: string; text: string; level?: number }[];
  orderIndex: number;
}

export interface ReportContent {
  expectedRevision: number;
  clinicalInfo?: string;
  sections: BackendSection[];
  items: BackendItem[];
}

export interface BackendReport {
  id: string;
  revision: number;
  status: "DRAFT" | "FINAL";
  clinicalInfo?: string | null;
  templateId?: string | null;
  sections: BackendSection[];
  items: Array<BackendItem & { id?: string }>;
}

export const reportsApi = {
  create: (dto: CreateReportDto) =>
    apiFetch<{ id: string; revision: number }>("/reports", { method: "POST", body: dto }),
  update: (id: string, dto: { clinicalInfo?: string; patientId?: string }) =>
    apiFetch<{ id: string }>(`/reports/${id}`, { method: "PATCH", body: dto }),
  // one call, one transaction — the autosave path
  setContent: (id: string, content: ReportContent) =>
    apiFetch<{ ok: true; revision: number }>(`/reports/${id}/content`, {
      method: "PUT",
      body: content,
    }),
  sign: (id: string, expectedRevision: number, patientId: string) =>
    apiFetch<{ ok: true; revision: number }>(`/reports/${id}/sign`, {
      method: "POST",
      body: { expectedRevision, patientId, attested: true },
    }),
  get: (id: string) => apiFetch<BackendReport>(`/reports/${id}`),
  list: (opts: { take?: number; cursor?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.take) q.set("take", String(opts.take));
    if (opts.cursor) q.set("cursor", opts.cursor);
    const qs = q.toString();
    return apiFetch<{ reports: BackendReport[]; nextCursor: string | null }>(
      `/reports${qs ? `?${qs}` : ""}`
    );
  },
};
