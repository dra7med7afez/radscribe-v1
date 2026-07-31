import { create } from "zustand";
import { apiFetch } from "@/lib/api/client";
import type { Patient } from "@/types";

interface PatientState {
  patients: Patient[];
  completedPatientIds: string[];
  activePatientId: string | null;
  loading: boolean;
  loaded: boolean;
  getActive: () => Patient | null;
  loadWorklist: () => Promise<void>;
  addPatient: (p: Omit<Patient, "id" | "source">) => Promise<void>;
  selectPatient: (id: string | null) => Promise<void>;
  completePatient: (id: string) => Promise<void>;
  reset: () => void;
}

// Patient demographics are PHI. They must only exist in the authenticated
// in-memory session and the tenant-scoped database, never in localStorage.
export const usePatientStore = create<PatientState>((set, get) => ({
  patients: [],
  completedPatientIds: [],
  activePatientId: null,
  loading: false,
  loaded: false,

  getActive: () => {
    const id = get().activePatientId;
    return id ? get().patients.find((p) => p.id === id) || null : null;
  },

  loadWorklist: async () => {
    set({ loading: true });
    try {
      const patients = await apiFetch<Patient[]>("/patients");
      set({
        patients: patients.map((patient) => ({ ...patient, source: "local" as const })),
        completedPatientIds: patients
          .filter((patient) => patient.status === "Completed")
          .map((patient) => patient.id),
        loading: false,
        loaded: true,
      });
    } catch (error) {
      set({ patients: [], activePatientId: null, loading: false, loaded: true });
      throw error;
    }
  },

  addPatient: async (patient) => {
    const created = await apiFetch<Patient>("/patients", { method: "POST", body: patient });
    const canonical = { ...created, source: "local" as const };
    set((state) => ({ patients: [canonical, ...state.patients] }));
  },

  selectPatient: async (id) => {
    if (!id) {
      set({ activePatientId: null });
      return;
    }
    await apiFetch(`/patients/${id}/status`, {
      method: "PATCH",
      body: { status: "In Progress" },
    });
    set({ activePatientId: id });
  },
  completePatient: async (id) => {
    await apiFetch(`/patients/${id}/status`, {
      method: "PATCH",
      body: { status: "Completed" },
    });
    set((state) => ({
      completedPatientIds: state.completedPatientIds.includes(id)
        ? state.completedPatientIds
        : [...state.completedPatientIds, id],
      patients: state.patients.map((patient) =>
        patient.id === id ? { ...patient, status: "Completed" } : patient
      ),
    }));
  },
  reset: () =>
    set({
      patients: [],
      completedPatientIds: [],
      activePatientId: null,
      loading: false,
      loaded: false,
    }),
}));
