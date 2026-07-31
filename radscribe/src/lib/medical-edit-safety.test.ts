import { describe, expect, it } from "vitest";
import { validateMedicalEdit } from "./medical-edit-safety";

describe("medical selected-text edit safety", () => {
  it("allows a rewrite that preserves protected clinical facts", () => {
    expect(
      validateMedicalEdit(
        "Mild right pleural effusion measuring 2 cm. No pneumothorax.",
        "Mild right pleural effusion, 2 cm. No pneumothorax.",
        "Make this more concise."
      )
    ).toEqual({ safe: true, unexpectedFields: [] });
  });

  it("blocks an unrequested laterality or measurement change", () => {
    const result = validateMedicalEdit(
      "A 2 cm right renal lesion is present.",
      "A 3 cm left renal lesion is present.",
      "Make this more concise."
    );
    expect(result.safe).toBe(false);
    expect(result.unexpectedFields).toEqual(
      expect.arrayContaining(["measurements or numbers", "laterality"])
    );
  });

  it("allows a specifically requested replacement", () => {
    expect(
      validateMedicalEdit(
        "Mild right pleural effusion measuring 2 cm.",
        "Mild left pleural effusion measuring 3 cm.",
        "Replace right with left and 2 cm with 3 cm."
      )
    ).toEqual({ safe: true, unexpectedFields: [] });
  });

  it("allows an explicitly dictated addition", () => {
    expect(
      validateMedicalEdit(
        "Small right pleural effusion.",
        "Small right pleural effusion with mild surrounding edema.",
        "Add mild surrounding edema."
      )
    ).toEqual({ safe: true, unexpectedFields: [] });
  });

  it("allows removal of the entire selected sentence", () => {
    expect(
      validateMedicalEdit(
        "No right pleural effusion measuring 2 cm.",
        "",
        "Remove this sentence."
      )
    ).toEqual({ safe: true, unexpectedFields: [] });
  });
});
