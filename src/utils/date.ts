/** Get local date range [startMs, endMs] for a YYYY-MM-DD string */
export function getLocalDateRange(dateStr: string): [number, number] {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day, 23, 59, 59, 999);
  return [start.getTime(), end.getTime()];
}

/** Check if a UTC timestamp (ms) falls within a local date */
export function isDateInRange(timestampMs: number, dateStr: string): boolean {
  const [start, end] = getLocalDateRange(dateStr);
  return timestampMs >= start && timestampMs <= end;
}

/** Format date string for display: "Mar 27, Thu" */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${days[date.getDay()]}`;
}

/** Get today's date as YYYY-MM-DD in local timezone */
export function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert array of timestamps (ms) to active hour ranges string.
 * e.g., timestamps at hours 14,15,16,17,22,23,0 -> "14:00-18:00, 22:00-01:00"
 */
export function getActiveHours(timestamps: number[]): string {
  if (timestamps.length === 0) return '';

  // Count messages per hour -> set of active hours
  const activeHours = new Set<number>();
  for (const ts of timestamps) {
    activeHours.add(new Date(ts).getHours());
  }

  // Sort active hours
  const sorted = [...activeHours].sort((a, b) => a - b);
  if (sorted.length === 0) return '';

  // Group consecutive hours into ranges [start, end)
  // end is exclusive: the hour after the last active hour
  const ranges: { start: number; end: number }[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push({ start, end: prev + 1 });
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push({ start, end: prev + 1 });

  // Merge midnight wrap: last range ends at 24 (hour 23 active) and first starts at 0
  if (ranges.length >= 2 && ranges[ranges.length - 1].end === 24 && ranges[0].start === 0) {
    const last = ranges.pop()!;
    const first = ranges.shift()!;
    ranges.push({ start: last.start, end: first.end });
  }

  const fmt = (h: number): string => `${String(h % 24).padStart(2, '0')}:00`;
  return ranges.map(r => `${fmt(r.start)}-${fmt(r.end)}`).join(', ');
}
