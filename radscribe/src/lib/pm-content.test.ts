import { describe, it, expect } from "vitest";
import {
  jsonToHtml,
  htmlToJson,
  jsonToText,
  textToDoc,
  emptyDoc,
  htmlToInline,
  inlineToHtml,
  inlineToText,
} from "./pm-content";

// html → json → html must be stable for everything the toolbar can produce.
function roundTrip(html: string): string {
  return jsonToHtml(htmlToJson(html));
}

describe("pm-content round-trips", () => {
  it("plain paragraph", () => {
    expect(roundTrip("<p>Normal heart size.</p>")).toBe("<p>Normal heart size.</p>");
  });

  it("bold / italic / underline / strike marks", () => {
    const html = "<p><strong>Liver:</strong> <em>mildly</em> <u>enlarged</u> <s>normal</s></p>";
    expect(roundTrip(html)).toBe(html);
  });

  it("multiple paragraphs", () => {
    const html = "<p>Line one.</p><p>Line two.</p>";
    expect(roundTrip(html)).toBe(html);
  });

  it("text-box block wrapper survives", () => {
    const html = '<div class="text-box"><p>Boxed impression.</p></div>';
    expect(roundTrip(html)).toBe(html);
  });

  it("legacy inline span text-box is parsed into the block wrapper", () => {
    const out = roundTrip('<p>before</p><span class="text-box">boxed</span>');
    expect(out).toContain("boxed");
  });

  it("literal bullet glyphs and nbsp indents survive as text", () => {
    // nbsp re-serializes as &nbsp; (same character, different HTML spelling) --
    // assert JSON content equality plus serialization idempotence instead.
    const html = "<p>• First finding</p><p>   ◦ Indented</p>";
    const once = roundTrip(html);
    expect(htmlToJson(once)).toEqual(htmlToJson(html));
    expect(roundTrip(once)).toBe(once);
    expect(jsonToText(htmlToJson(html))).toBe("• First finding\n   ◦ Indented");
  });

  it("bullet lists round-trip, including the library's marker style", () => {
    const plain = "<ul><li><p>First finding</p></li><li><p>Second</p></li></ul>";
    expect(roundTrip(plain)).toBe(plain);
    const styled = '<ul data-list-style="dash"><li><p>First</p></li></ul>';
    expect(roundTrip(styled)).toBe(styled);
  });

  it("an unknown marker style is dropped, not round-tripped", () => {
    const out = roundTrip('<ul data-list-style="wingding"><li><p>x</p></li></ul>');
    expect(out).toBe("<ul><li><p>x</p></li></ul>");
  });

  it("hard breaks survive", () => {
    const html = "<p>line one<br>line two</p>";
    expect(roundTrip(html)).toBe(html);
  });

  it("text alignment survives the HTML persistence boundary", () => {
    const html = '<p style="text-align: center">Centered report text.</p>';
    expect(roundTrip(html)).toContain("text-align: center");
  });
});

describe("textToDoc", () => {
  it("wraps plain text in a paragraph without escaping issues", () => {
    const doc = textToDoc("Size < 5 mm & stable");
    expect(jsonToText(doc)).toBe("Size < 5 mm & stable");
    expect(jsonToHtml(doc)).toBe("<p>Size &lt; 5 mm &amp; stable</p>");
  });

  it("splits lines into paragraphs", () => {
    const doc = textToDoc("one\ntwo");
    expect(doc.content).toHaveLength(2);
    expect(jsonToText(doc)).toBe("one\ntwo");
  });

  it("empty text yields a valid empty doc", () => {
    expect(textToDoc("")).toEqual(emptyDoc());
  });
});

describe("jsonToText", () => {
  it("extracts text across paragraphs", () => {
    const doc = htmlToJson("<p><strong>Liver:</strong> normal.</p><p>Spleen: normal.</p>");
    expect(jsonToText(doc)).toBe("Liver: normal.\nSpleen: normal.");
  });

  it("empty doc gives empty string", () => {
    expect(jsonToText(emptyDoc())).toBe("");
  });
});

describe("inline helpers", () => {
  it("htmlToInline + inlineToHtml round-trips a one-line rich fragment", () => {
    const inline = htmlToInline("<strong>enlarged</strong> spleen");
    expect(inlineToHtml(inline)).toBe("<strong>enlarged</strong> spleen");
    expect(inlineToText(inline)).toBe("enlarged spleen");
  });

  it("collapses multi-paragraph fragments onto one line", () => {
    const inline = htmlToInline("<p>first</p><p>second</p>");
    expect(inlineToText(inline)).toBe("first second");
  });

  it("empty input", () => {
    expect(htmlToInline("")).toEqual([]);
    expect(inlineToHtml([])).toBe("");
  });
});
