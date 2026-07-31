import { describe, expect, it } from "vitest";
import { describeSections } from "./ai.api";
import type { ReportSection } from "@/types";

describe("describeSections live-document map", () => {
  it("includes every prose, normal finding, abnormal finding, and parameter", () => {
    const sections: ReportSection[] = [
      {
        id: "technique",
        name: "Technique",
        kind: "prose",
        html: "<p>CT chest without contrast.</p>",
      },
      {
        id: "findings",
        name: "Findings",
        kind: "findings",
        grouped: true,
        findings: [
          {
            id: "liver-group",
            region: "Liver",
            normalText: "Normal liver.",
            abnormal: false,
            items: [{ id: "liver-item", text: "The liver is normal in size and attenuation." }],
            subpoints: [{ id: "liver-size", text: "Craniocaudal length: 14 cm" }],
          },
          {
            id: "lung-group",
            region: "Lungs",
            normalText: "Clear lungs.",
            abnormal: true,
            items: [
              { id: "lung-item-1", text: "A right upper lobe nodule is noted." },
              { id: "lung-item-2", text: "Mild bibasal atelectatic bands are seen." },
            ],
          },
        ],
      },
      {
        id: "impression",
        name: "Impression",
        kind: "prose",
        isConclusion: true,
        html: "<p>No acute abnormality.</p>",
      },
    ];

    expect(describeSections(sections)).toEqual([
      expect.objectContaining({
        id: "technique",
        text: "CT chest without contrast.",
      }),
      expect.objectContaining({
        id: "findings",
        findings: [
          {
            findingId: "liver-item",
            region: "Liver",
            text: "The liver is normal in size and attenuation.",
            abnormal: false,
          },
          {
            findingId: "lung-item-1",
            region: "Lungs",
            text: "A right upper lobe nodule is noted.",
            abnormal: true,
          },
          {
            findingId: "lung-item-2",
            region: "Lungs",
            text: "Mild bibasal atelectatic bands are seen.",
            abnormal: true,
          },
        ],
        subpoints: [
          {
            subpointId: "liver-size",
            region: "Liver",
            text: "Craniocaudal length: 14 cm",
          },
        ],
      }),
      expect.objectContaining({
        id: "impression",
        text: "No acute abnormality.",
      }),
    ]);
  });
});
