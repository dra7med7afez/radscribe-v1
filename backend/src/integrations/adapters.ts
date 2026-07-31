// Typed adapter interface (§10b). A real system is wired in by implementing
// one of these — no UI or schema changes required.

export interface WorklistPatient {
  id: string;
  mrn: string;
  name: string;
  dob?: string;
  sex?: string;
  accession?: string;
  studyDescription?: string;
  modality?: string;
  status?: string;
}

export interface IntegrationAdapter {
  test(): Promise<boolean>;
  fetchWorklist(): Promise<WorklistPatient[]>;
  pushReport(report: unknown): Promise<{ ok: boolean; id?: string }>;
}

// Adapter contract only. Concrete FHIR/HL7/DICOM implementations require a
// separately validated deployment integration. This application must never
// fabricate worklist rows or delivery confirmations.
abstract class BaseAdapter implements IntegrationAdapter {
  constructor(protected config: Record<string, string>) {}
  abstract readonly label: string;

  async test(): Promise<boolean> {
    return false;
  }

  async fetchWorklist(): Promise<WorklistPatient[]> {
    return [];
  }

  async pushReport(): Promise<{ ok: boolean; id?: string }> {
    return { ok: false };
  }
}

class FhirAdapter extends BaseAdapter {
  readonly label = "fhir";
}
class Hl7Adapter extends BaseAdapter {
  readonly label = "hl7";
}
class DicomAdapter extends BaseAdapter {
  readonly label = "dicom";
}
class GenericAdapter extends BaseAdapter {
  readonly label = "generic";
}

export function getAdapter(type: string, config: Record<string, string>): IntegrationAdapter {
  switch (String(type).toUpperCase()) {
    case "FHIR":
      return new FhirAdapter(config);
    case "HL7":
      return new Hl7Adapter(config);
    case "DICOM":
      return new DicomAdapter(config);
    default:
      return new GenericAdapter(config);
  }
}
