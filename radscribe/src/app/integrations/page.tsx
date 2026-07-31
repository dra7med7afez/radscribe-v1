"use client";

import { ShieldAlert, PlugZap, FileCheck2 } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";

// No adapter in this distribution has been clinically validated. Keeping the
// screen explicit prevents an administrator from believing an endpoint is live
// merely because credentials were entered.
export default function IntegrationsPage() {
  return (
    <PageContainer>
      <Header
        title="Integrations"
        subtitle="External delivery and worklists are disabled in this deployment."
      />
      <section className="mx-6 max-w-3xl rounded-2xl p-6" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "#fff1f2", color: "#be123c" }}>
            <ShieldAlert size={20} />
          </span>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>No live adapter is configured</h2>
            <p className="mt-1 text-[13px] leading-6" style={{ color: "var(--text-muted)" }}>
              RadScribe will not fabricate connection tests, worklist patients, or delivery confirmations. Reports can be signed and exported, but they are not sent to an EHR, RIS, PACS, or webhook from this deployment.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl p-4" style={{ background: "var(--canvas)" }}>
            <PlugZap size={17} style={{ color: "var(--accent)" }} />
            <h3 className="mt-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>Deployment requirement</h3>
            <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-muted)" }}>
              Implement and validate the required FHIR, HL7, DICOM, or webhook adapter with the destination system before enabling delivery.
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--canvas)" }}>
            <FileCheck2 size={17} style={{ color: "var(--accent)" }} />
            <h3 className="mt-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>Clinical safety requirement</h3>
            <p className="mt-1 text-[12px] leading-5" style={{ color: "var(--text-muted)" }}>
              Validate identity matching, acknowledgement/retry behavior, audit trails, and a rollback procedure in a non-production environment.
            </p>
          </div>
        </div>
      </section>
    </PageContainer>
  );
}
