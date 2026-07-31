import { unexpectedMedicalChanges } from "./medical-edit-safety";

describe("selected-text medical edit safety", () => {
  it("rejects protected changes that were not requested", () => {
    expect(
      unexpectedMedicalChanges(
        "No mild right pleural effusion measuring 2 cm.",
        "Moderate left pleural effusion measuring 3 cm.",
        "Make this more concise."
      )
    ).toEqual(
      expect.arrayContaining(["measurements or numbers", "laterality", "negation", "severity"])
    );
  });

  it("permits a named replacement", () => {
    expect(
      unexpectedMedicalChanges(
        "A 2 cm right renal lesion.",
        "A 3 cm left renal lesion.",
        "Replace right with left and 2 cm with 3 cm."
      )
    ).toEqual([]);
  });

  it("permits removing the entire selected sentence", () => {
    expect(
      unexpectedMedicalChanges(
        "No right pleural effusion measuring 2 cm.",
        "",
        "Remove this sentence."
      )
    ).toEqual([]);
  });
});
