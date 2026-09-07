import { describe, expect, it } from 'vitest';
import { daysAgo, hoursAgo, minutesSince, startOfToday } from '@/lib/time';

// A fixed instant keeps these assertions independent of when they run.
const NOW = Date.parse('2026-09-07T12:00:00.000Z');

describe('time windows', () => {
  it('walks back whole hours', () => {
    expect(hoursAgo(24, NOW).toISOString()).toBe('2026-09-06T12:00:00.000Z');
    expect(hoursAgo(1, NOW).toISOString()).toBe('2026-09-07T11:00:00.000Z');
  });

  it('walks back whole days', () => {
    expect(daysAgo(7, NOW).toISOString()).toBe('2026-08-31T12:00:00.000Z');
  });

  it('treats a zero window as now', () => {
    expect(daysAgo(0, NOW).getTime()).toBe(NOW);
    expect(hoursAgo(0, NOW).getTime()).toBe(NOW);
  });
});

describe('minutesSince', () => {
  it('rounds to the nearest minute', () => {
    expect(minutesSince(new Date(NOW - 90_000), NOW)).toBe(2);
    expect(minutesSince(new Date(NOW - 60_000), NOW)).toBe(1);
  });

  it('never reports negative age for a clock skewed into the future', () => {
    expect(minutesSince(new Date(NOW + 600_000), NOW)).toBe(0);
  });
});

describe('startOfToday', () => {
  it('zeroes the time portion', () => {
    const start = startOfToday(new Date('2026-09-07T18:43:21.500Z'));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('does not mutate the date it was given', () => {
    const original = new Date('2026-09-07T18:43:21.500Z');
    const copy = new Date(original);
    startOfToday(original);
    expect(original.getTime()).toBe(copy.getTime());
  });
});
