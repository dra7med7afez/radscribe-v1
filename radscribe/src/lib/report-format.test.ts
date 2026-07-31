import { describe, it, expect } from "vitest";
import { reportToHtml, reportToPlainText } from "./report-format";
import type { ReportSection, ReportSettings } from "@/types";

const settings: ReportSettings = {
  fontFamily: "Georgia",
  fontSize: 15,
  lineSpacing: 1.6,
  showSeparators: true,
  defaultMode: "concise",
  defaultItalic: false,
  organBullet: "disc",
  findingBullet: "dash",
  subpointBullet: "circle",
  signature: "Dr. Test Radiologist, MD\nConsultant Radiologist",
};

const sections: ReportSection[] = [
  {
    id: "s1",
    name: "Findings",
    kind: "findings",
    grouped: true,
    findings: [
      {
        id: "f1",
        region: "Lungs",
        normalText: "Clear.",
        abnormal: false,
        items: [{ id: "i1", text: "Clear." }],
        images: [{ id: "im1", src: "data:image/png;base64,AAA" }],
      },
    ],
  },
];

describe("report-format signature", () => {
  it("renders the signature BOLD at the end of the html export, one div per line", () => {
    const html = reportToHtml("MRI Brain", sections, null, settings);
    const sigAt = html.indexOf("Dr. Test Radiologist, MD");
    expect(sigAt).toBeGreaterThan(html.indexOf("FINDINGS") - 1);
    expect(html).toContain(
      `<div style="font-weight:bold;margin:1px 0">Dr. Test Radiologist, MD</div>`
    );
    expect(html).toContain(
      `<div style="font-weight:bold;margin:1px 0">Consultant Radiologist</div>`
    );
  });

  it("appends the signature lines to the plain-text export", () => {
    const txt = reportToPlainText("MRI Brain", sections, null, settings);
    expect(txt.trimEnd().endsWith("Dr. Test Radiologist, MD\nConsultant Radiologist")).toBe(true);
  });

  it("omits the signature block when the setting is empty", () => {
    const html = reportToHtml("MRI Brain", sections, null, { ...settings, signature: "" });
    expect(html).not.toContain("font-weight:bold;margin:1px 0");
  });
});

describe("report-format finding images", () => {
  it("lays the image out BESIDE the finding text in a two-column table", () => {
    const html = reportToHtml("MRI Brain", sections, null, settings);
    const table = html.match(/<table[^>]*><tr>([\s\S]*?)<\/tr><\/table>/);
    expect(table).not.toBeNull();
    const [, row] = table!;
    // left cell holds the finding text, right cell the image column
    const cells = row.split("</td>");
    expect(cells[0]).toContain("Lungs");
    expect(cells[1]).toContain('img src="data:image/png;base64,AAA"');
    expect(cells[1]).toContain('width="170"');
  });
});

describe("report-format live editor document", () => {
  it("materializes exact Word-safe list markers while preserving nesting and inline formatting", () => {
    const documentHtml = [
      '<h2 data-section-key="findings">Findings</h2>',
      '<ul data-list-style="square">',
      '<li><p><strong>Lungs:</strong> Clear.</p>',
      '<ol><li><p><em>First nested point</em></p></li></ol>',
      '</li></ul>',
      '<h2 data-section-key="impression">Impression</h2>',
      '<p style="text-align: center"><u>No acute abnormality.</u></p>',
    ].join("");

    const html = reportToHtml("MRI Brain", sections, null, settings, documentHtml);

    expect(html).toContain('<div class="rd-export"><p');
    expect(html).toContain(">Findings</p>");
    expect(html).toContain("font-family:inherit;font-size:1.08em");
    expect(html).toContain("font-weight:600");
    expect(html).toContain("text-transform:none");
    expect(html).not.toContain("font-size:12px");
    expect(html).toContain('role="presentation"');
    expect(html).toContain(">▪</span>");
    expect(html).toContain(">1.</span>");
    expect(html).toContain("margin:3px 0 3px 22px");
    expect(html).toContain("<em>First nested point</em>");
    expect(html).toContain('<p style="text-align: center"><u>No acute abnormality.</u></p>');
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("data-export-markers");
    expect(html).not.toContain('aria-hidden="true"');
    expect(html).not.toMatch(/<h[1-6]\b/i);
    expect(html).not.toContain("data-section-key");
  });

  it("uses the live editor order, list markers, and nesting in plain-text clipboard fallback", () => {
    const documentHtml = [
      '<h2 data-section-key="findings">Findings</h2>',
      '<ul data-list-style="triangle">',
      '<li><p><strong>Lungs:</strong> Clear.</p>',
      '<ol start="3"><li><p>Third nested point</p></li></ol>',
      "</li></ul>",
      '<h2 data-section-key="impression">Impression</h2>',
      "<p>No acute abnormality.</p>",
    ].join("");

    const text = reportToPlainText("MRI Brain", sections, null, settings, documentHtml);

    expect(text).toContain(
      "Findings\n▲   Lungs: Clear.\n    3.   Third nested point\nImpression\nNo acute abnormality."
    );
  });

  it("preserves template section-name casing and uses slightly larger normal-font headings in fallback export", () => {
    const html = reportToHtml("MRI Brain", sections, null, settings);
    const text = reportToPlainText("MRI Brain", sections, null, settings);

    expect(html).toContain(
      '<p style="font-family:inherit;font-size:1.08em;font-style:inherit;font-weight:600'
    );
    expect(html).toContain(">Findings</p>");
    expect(text).toContain("\nFindings\n");
  });

  it("removes editor-only node ids and dictation highlights from export", () => {
    const documentHtml =
      '<h2 data-node-id="heading-1">Findings</h2><p data-node-id="p-1" data-inserted="true">Text</p>';

    const html = reportToHtml("MRI Brain", sections, null, settings, documentHtml);

    expect(html).not.toContain("data-node-id");
    expect(html).not.toContain("data-inserted");
    expect(html).toContain("<p>Text</p>");
  });
});
