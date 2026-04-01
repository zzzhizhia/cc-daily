import { describe, it, expect } from 'vitest';
import {
  getLocalDateRange,
  isDateInRange,
  formatDate,
  getToday,
  getActiveHours,
} from '../date.js';

describe('getLocalDateRange', () => {
  it('returns start at midnight and end at 23:59:59.999', () => {
    const [start, end] = getLocalDateRange('2026-03-27');
    const startDate = new Date(start);
    const endDate = new Date(end);

    expect(startDate.getFullYear()).toBe(2026);
    expect(startDate.getMonth()).toBe(2); // March = 2
    expect(startDate.getDate()).toBe(27);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(startDate.getSeconds()).toBe(0);
    expect(startDate.getMilliseconds()).toBe(0);

    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
    expect(endDate.getMilliseconds()).toBe(999);
  });

  it('end is greater than start', () => {
    const [start, end] = getLocalDateRange('2026-01-01');
    expect(end).toBeGreaterThan(start);
  });
});

describe('isDateInRange', () => {
  it('returns true for timestamp within the date', () => {
    const noon = new Date(2026, 2, 27, 12, 0, 0).getTime();
    expect(isDateInRange(noon, '2026-03-27')).toBe(true);
  });

  it('returns true for timestamp at start of day', () => {
    const midnight = new Date(2026, 2, 27, 0, 0, 0, 0).getTime();
    expect(isDateInRange(midnight, '2026-03-27')).toBe(true);
  });

  it('returns true for timestamp at end of day', () => {
    const endOfDay = new Date(2026, 2, 27, 23, 59, 59, 999).getTime();
    expect(isDateInRange(endOfDay, '2026-03-27')).toBe(true);
  });

  it('returns false for timestamp on the next day', () => {
    const nextDay = new Date(2026, 2, 28, 0, 0, 0, 0).getTime();
    expect(isDateInRange(nextDay, '2026-03-27')).toBe(false);
  });

  it('returns false for timestamp on the previous day', () => {
    const prevDay = new Date(2026, 2, 26, 23, 59, 59, 999).getTime();
    expect(isDateInRange(prevDay, '2026-03-27')).toBe(false);
  });
});

describe('formatDate', () => {
  it('formats 2026-03-27 as "Mar 27, Fri"', () => {
    // 2026-03-27 is a Friday
    expect(formatDate('2026-03-27')).toBe('Mar 27, Fri');
  });

  it('formats 2026-01-01 correctly', () => {
    // 2026-01-01 is a Thursday
    expect(formatDate('2026-01-01')).toBe('Jan 1, Thu');
  });

  it('formats 2025-12-25 correctly', () => {
    // 2025-12-25 is a Thursday
    expect(formatDate('2025-12-25')).toBe('Dec 25, Thu');
  });
});

describe('getToday', () => {
  it('returns YYYY-MM-DD format', () => {
    const today = getToday();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('matches current date', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(getToday()).toBe(expected);
  });
});

describe('getActiveHours', () => {
  /** Helper: create a timestamp for a given hour (local time) on a fixed date */
  function tsAtHour(hour: number): number {
    return new Date(2026, 2, 27, hour, 30, 0).getTime();
  }

  it('returns consecutive range', () => {
    const timestamps = [14, 15, 16, 17].map(tsAtHour);
    expect(getActiveHours(timestamps)).toBe('14:00-18:00');
  });

  it('handles midnight wrap (22,23,0,1)', () => {
    // hours that span midnight: 22, 23 on day 27 and 0, 1 on day 28
    const timestamps = [
      new Date(2026, 2, 27, 22, 30).getTime(),
      new Date(2026, 2, 27, 23, 30).getTime(),
      new Date(2026, 2, 28, 0, 30).getTime(),
      new Date(2026, 2, 28, 1, 30).getTime(),
    ];
    expect(getActiveHours(timestamps)).toBe('22:00-02:00');
  });

  it('returns empty string for no timestamps', () => {
    expect(getActiveHours([])).toBe('');
  });

  it('handles single hour', () => {
    const timestamps = [tsAtHour(10)];
    expect(getActiveHours(timestamps)).toBe('10:00-11:00');
  });

  it('handles non-consecutive hours', () => {
    const timestamps = [9, 10, 14, 15].map(tsAtHour);
    expect(getActiveHours(timestamps)).toBe('09:00-11:00, 14:00-16:00');
  });

  it('deduplicates same hour from multiple timestamps', () => {
    const timestamps = [
      new Date(2026, 2, 27, 10, 0).getTime(),
      new Date(2026, 2, 27, 10, 15).getTime(),
      new Date(2026, 2, 27, 10, 45).getTime(),
      new Date(2026, 2, 27, 11, 0).getTime(),
    ];
    expect(getActiveHours(timestamps)).toBe('10:00-12:00');
  });
});
