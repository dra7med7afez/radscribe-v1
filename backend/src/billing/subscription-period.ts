import { UsageInterval } from "@prisma/client";

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function anchoredMonth(anchor: Date, monthOffset: number): Date {
  const absoluteMonth = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth - year * 12;
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month));
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

export function usagePeriodBounds(
  anchor: Date,
  interval: UsageInterval,
  now = new Date()
): { start: Date; end: Date | null } {
  if (interval === "LIFETIME") return { start: anchor, end: null };

  let offset =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    now.getUTCMonth() -
    anchor.getUTCMonth();
  let start = anchoredMonth(anchor, offset);
  if (start > now) start = anchoredMonth(anchor, --offset);
  let end = anchoredMonth(anchor, offset + 1);
  while (end <= now) {
    start = end;
    end = anchoredMonth(anchor, ++offset + 1);
  }
  return { start, end };
}

