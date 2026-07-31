import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePatientStore } from "./patientStore";

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

describe("patientStore persisted completed queue", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({ id: "patient-1", status: "Completed" });
    usePatientStore.getState().reset();
    usePatientStore.setState({
      patients: [
        { id: "patient-1", mrn: "001", name: "Patient One", source: "local" },
        { id: "patient-2", mrn: "002", name: "Patient Two", source: "local" },
      ],
      loaded: true,
    });
  });

  it("persists completion and retains patient registration data", async () => {
    await usePatientStore.getState().completePatient("patient-1");
    await usePatientStore.getState().completePatient("patient-1");

    expect(usePatientStore.getState().patients).toHaveLength(2);
    expect(usePatientStore.getState().completedPatientIds).toEqual(["patient-1"]);
    expect(apiFetch).toHaveBeenCalledWith("/patients/patient-1/status", {
      method: "PATCH",
      body: { status: "Completed" },
    });
  });

  it("clears cached patient state with the authenticated session", async () => {
    await usePatientStore.getState().completePatient("patient-1");
    usePatientStore.getState().reset();

    expect(usePatientStore.getState().completedPatientIds).toEqual([]);
    expect(usePatientStore.getState().patients).toEqual([]);
  });
});
