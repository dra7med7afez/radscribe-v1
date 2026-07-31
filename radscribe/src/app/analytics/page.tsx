"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";
import { apiFetch } from "@/lib/api/client";
import { timeAgo } from "@/lib/utils";

interface Summary {
  total: number;
  today: number;
  recent: { id: string; studyDescription: string; updatedAt: string }[];
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Summary>("/usage/summary")
      .then(setSummary)
      .catch(() => setError("Signed-report metrics could not be loaded."));
  }, []);

  return (
    <PageContainer>
      <Header title="Signed reports" subtitle="Server-derived finalization activity for your account." />
      {error && <p className="px-6 text-[13px]" style={{ color: "var(--abnormal)" }}>{error}</p>}
      <div className="grid max-w-2xl grid-cols-1 gap-3 px-6 sm:grid-cols-2">
        {[
          { label: "Signed today", value: summary?.today ?? "—", icon: FileText },
          { label: "Signed reports", value: summary?.total ?? "—", icon: CheckCircle2 },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl p-5" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
              <Icon size={18} style={{ color: "var(--accent)" }} />
              <div className="mt-3 text-[26px] font-semibold" style={{ color: "var(--text)" }}>{stat.value}</div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
            </div>
          );
        })}
      </div>
      <section className="mx-6 mt-5 max-w-2xl rounded-2xl p-5" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Recently signed</h2>
        <div className="mt-3 space-y-2">
          {summary?.recent.length ? summary.recent.map((report) => (
            <div key={report.id} className="flex gap-3 text-[13px]">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text)" }}>{report.studyDescription}</span>
              <span className="shrink-0 text-[11px]" style={{ color: "var(--text-subtle)" }}>{timeAgo(report.updatedAt)}</span>
            </div>
          )) : <p className="text-[13px]" style={{ color: "var(--text-subtle)" }}>No signed reports yet.</p>}
        </div>
      </section>
    </PageContainer>
  );
}
