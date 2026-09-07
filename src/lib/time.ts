/**
 * Small time helpers.
 *
 * These exist so pages express a window as `daysAgo(7)` rather than repeating
 * millisecond arithmetic with magic constants, and so the one place that reads
 * the clock is named and testable.
 */
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The instant `hours` hours before now. */
export function hoursAgo(hours: number, now: number = Date.now()): Date {
  return new Date(now - hours * HOUR_MS);
}

/** The instant `days` days before now. */
export function daysAgo(days: number, now: number = Date.now()): Date {
  return new Date(now - days * DAY_MS);
}

/** Whole minutes elapsed since `date`, floored at zero for a future date. */
export function minutesSince(date: Date, now: number = Date.now()): number {
  return Math.max(0, Math.round((now - date.getTime()) / MINUTE_MS));
}

/** Local midnight at the start of the current day. */
export function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}
