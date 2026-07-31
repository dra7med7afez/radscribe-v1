"use client";

import { useEffect, useState } from "react";
import { Plus, UserPlus, Check, RefreshCw } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";
import Header from "@/components/layout/Header";
import { usePatientStore } from "@/store/patientStore";
import { useUiStore } from "@/store/uiStore";
import type { Patient } from "@/types";

const EMPTY: Omit<Patient, "id" | "source"> = {
  mrn: "",
  name: "",
  dob: "",
  sex: "",
  accession: "",
  studyDescription: "",
  modality: "CT",
  status: "Scheduled",
};

export default function PatientsPage() {
  const {
    patients,
    completedPatientIds,
    activePatientId,
    loading,
    loaded,
    loadWorklist,
    addPatient,
    selectPatient,
  } = usePatientStore();
  const notify = useUiStore((s) => s.notify);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!loaded) {
      void loadWorklist().catch((error: unknown) => {
        notify(error instanceof Error ? error.message : "Could not load the patient queue");
      });
    }
  }, [loaded, loadWorklist, notify]);

  const onAdd = async () => {
    if (!form.name.trim() || !form.mrn.trim()) {
      notify("Name and MRN are required");
      return;
    }
    try {
      await addPatient(form);
      setForm(EMPTY);
      setShowForm(false);
      notify("Patient added");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not add patient");
    }
  };

  const onSelect = async (p: Patient) => {
    const clearing = activePatientId === p.id;
    try {
      await selectPatient(clearing ? null : p.id);
      notify(clearing ? "Patient cleared" : `Selected ${p.name}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not update patient status");
    }
  };

  const queuePatients = patients.filter((patient) => !completedPatientIds.includes(patient.id));
  const completedPatients = patients.filter((patient) => completedPatientIds.includes(patient.id));

  return (
    <PageContainer>
      <Header
        title="Queue"
        subtitle="Worklist from your connected integration, plus any patients you add."
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => {
                void loadWorklist().catch((error: unknown) => {
                  notify(error instanceof Error ? error.message : "Could not refresh the patient queue");
                });
              }}
              disabled={loading}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] transition hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ color: "var(--text)" }}
            >
              <RefreshCw size={15} /> Refresh
            </button>
            <button onClick={() => setShowForm((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-medium text-white" style={{ background: "var(--accent)" }}>
              <UserPlus size={15} /> Add patient
            </button>
          </div>
        }
      />

      {showForm && (
        <div className="animate-in mb-4 rounded-2xl p-6" style={{ background: "var(--panel)", boxShadow: "var(--shadow-card)" }}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Inp label="Name" v={form.name} on={(v) => setForm({ ...form, name: v })} />
            <Inp label="MRN" v={form.mrn} on={(v) => setForm({ ...form, mrn: v })} />
            <Inp label="DOB" v={form.dob || ""} on={(v) => setForm({ ...form, dob: v })} />
            <Inp label="Sex" v={form.sex || ""} on={(v) => setForm({ ...form, sex: v })} />
            <Inp label="Study" v={form.studyDescription || ""} on={(v) => setForm({ ...form, studyDescription: v })} className="sm:col-span-2" />
            <Inp label="Modality" v={form.modality || ""} on={(v) => setForm({ ...form, modality: v })} />
            <Inp label="Accession" v={form.accession || ""} on={(v) => setForm({ ...form, accession: v })} />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-[13px] hover:bg-[var(--hover)]" style={{ color: "var(--text)" }}>Cancel</button>
            <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-[13px] font-medium text-white" style={{ background: "var(--accent)" }}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl m-6" style={{ background: "var(--canvas)", boxShadow: "var(--shadow-card)" }}>
        {loading ? (
          <div className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Loading worklist…</div>
        ) : queuePatients.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[14px] font-medium" style={{ color: "var(--text)" }}>No patients in the queue</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Add a patient manually, or select from your connected worklist.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Patient", "MRN", "Study", "Modality", "Status", "Source", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queuePatients.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--ring)", color: "var(--text)" }}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.mrn}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.studyDescription || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.modality || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.status || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--canvas)", color: "var(--text-muted)" }}>
                      {p.source === "integration" ? "Worklist" : "Manual"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void onSelect(p)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition"
                      style={
                        activePatientId === p.id
                          ? { background: "var(--accent-soft)", color: "var(--accent)" }
                          : { color: "var(--text)" }
                      }
                    >
                      {activePatientId === p.id ? <><Check size={13} /> Active</> : "Select"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {completedPatients.length > 0 && (
        <div className="mx-6 mb-6 overflow-hidden rounded-2xl" style={{ background: "var(--canvas)", boxShadow: "var(--shadow-card)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--ring)" }}>
            <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Completed patients</p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Persisted in the organization worklist.
            </p>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Patient", "MRN", "Study", "Modality", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {completedPatients.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--ring)", color: "var(--text)" }}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.mrn}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.studyDescription || "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{p.modality || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                      <Check size={12} /> Completed
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}

function Inp({
  label,
  v,
  on,
  className,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input value={v} onChange={(e) => on(e.target.value)} className="h-9 w-full rounded-lg px-2.5 text-[13px] outline-none" style={{ background: "var(--canvas)", color: "var(--text)" }} />
    </div>
  );
}
