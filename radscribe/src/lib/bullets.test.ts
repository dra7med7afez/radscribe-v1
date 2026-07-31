import { describe, expect, it } from "vitest";
import {
  BULLET_SHAPES,
  bulletGlyph,
  bulletScale,
  listMarker,
  LIST_PRESETS,
} from "@/lib/bullets";

describe("bullets", () => {
  it("exposes the 7 configurable shapes with their glyphs", () => {
    const byKey = Object.fromEntries(BULLET_SHAPES.map((b) => [b.key, b.glyph]));
    expect(byKey).toMatchObject({
      disc: "•",
      circle: "◦",
      square: "▪",
      "square-hollow": "▫",
      dash: "–",
      arrow: "→",
      diamond: "◆",
    });
  });

  it("bulletGlyph falls back to disc for undefined", () => {
    expect(bulletGlyph(undefined)).toBe("•");
    expect(bulletGlyph("diamond")).toBe("◆");
  });

  it("scales small geometric glyphs up and leaves linear ones at 1x", () => {
    expect(bulletScale("disc")).toBeGreaterThan(1);
    expect(bulletScale("circle")).toBeGreaterThan(1);
    expect(bulletScale("dash")).toBe(1);
    expect(bulletScale("arrow")).toBe(1);
  });

  it("listMarker renders ordered styles by index", () => {
    expect(listMarker("decimal", 0)).toBe("1.");
    expect(listMarker("decimal", 9)).toBe("10.");
    expect(listMarker("lower-alpha", 2)).toBe("c.");
    expect(listMarker("upper-roman", 3)).toBe("IV.");
    expect(listMarker("lower-roman", 8)).toBe("ix.");
  });

  it("listMarker returns fixed glyphs for unordered styles", () => {
    expect(listMarker(undefined, 5)).toBe("•");
    expect(listMarker("checkbox", 5)).toBe("☐");
    expect(listMarker("diamond", 5)).toBe("◆");
  });

  it("list presets always define all three levels (organ, finding, parameter)", () => {
    for (const p of LIST_PRESETS) {
      expect(p.levels, p.id).toHaveLength(3);
      for (const level of p.levels) {
        expect(bulletGlyph(level), p.id).toBeTruthy();
      }
    }
  });
});
