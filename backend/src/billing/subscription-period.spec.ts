import { usagePeriodBounds } from "./subscription-period";

describe("usagePeriodBounds", () => {
  it("clamps a day-31 anchor to short months and returns to day 31", () => {
    const anchor = new Date("2026-01-31T10:15:00.000Z");
    expect(usagePeriodBounds(anchor, "MONTHLY", new Date("2026-02-20T00:00:00.000Z"))).toEqual({
      start: new Date("2026-01-31T10:15:00.000Z"),
      end: new Date("2026-02-28T10:15:00.000Z"),
    });
    expect(usagePeriodBounds(anchor, "MONTHLY", new Date("2026-03-15T00:00:00.000Z"))).toEqual({
      start: new Date("2026-02-28T10:15:00.000Z"),
      end: new Date("2026-03-31T10:15:00.000Z"),
    });
  });

  it("handles leap years", () => {
    const anchor = new Date("2024-01-31T00:00:00.000Z");
    expect(usagePeriodBounds(anchor, "MONTHLY", new Date("2024-02-29T12:00:00.000Z"))).toEqual({
      start: new Date("2024-02-29T00:00:00.000Z"),
      end: new Date("2024-03-31T00:00:00.000Z"),
    });
  });

  it("uses one open-ended lifetime period", () => {
    const anchor = new Date("2026-07-22T10:00:00.000Z");
    expect(usagePeriodBounds(anchor, "LIFETIME", new Date("2030-01-01T00:00:00.000Z"))).toEqual({
      start: anchor,
      end: null,
    });
  });
});
