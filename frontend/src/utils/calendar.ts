export type ReportingRange = { start: string; end: string };
export type CalendarWeekStart = 0 | 6; // ISO weekday: Monday=0, Sunday=6.
export type ActivityMetric = "total" | "discoveries" | "repeats";

export type DailyActivity = {
  date: string;
  total: number;
  discoveries: number;
  repeats: number;
};

export type CalendarMonthLabel = { month: number; week: number };

export const ACTIVITY_BANDS = [
  { level: 0, min: 0, label: "0" },
  { level: 1, min: 1, label: "1–2" },
  { level: 2, min: 3, label: "3–5" },
  { level: 3, min: 6, label: "6–9" },
  { level: 4, min: 10, label: "10+" },
] as const;

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function mondayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
}

export function calendarWeeks(
  year: number,
  weekStart: CalendarWeekStart = 0,
): Array<Array<string | null>> {
  const dayCount =
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000;
  const leading = (mondayIndex(year, 0, 1) - weekStart + 7) % 7;
  const cells: Array<string | null> = Array(leading).fill(null);
  for (let day = 1; day <= dayCount; day++) cells.push(isoDate(year, 0, day));
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
}

export function calendarMonthLabels(
  year: number,
  weekStart: CalendarWeekStart = 0,
): CalendarMonthLabel[] {
  const leading = (mondayIndex(year, 0, 1) - weekStart + 7) % 7;
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    week: Math.floor(
      (leading +
        (Date.UTC(year, month, 1) - Date.UTC(year, 0, 1)) / 86_400_000) /
        7,
    ),
  }));
}

export function yearIntersection(
  range: ReportingRange,
  year: number,
): ReportingRange | null {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const start = range.start > yearStart ? range.start : yearStart;
  const end = range.end < yearEnd ? range.end : yearEnd;
  return start <= end ? { start, end } : null;
}

export function activityValue(
  activity: Pick<DailyActivity, ActivityMetric>,
  metric: ActivityMetric,
): number {
  return activity[metric];
}

export function activityLevel(value: number): 0 | 1 | 2 | 3 | 4 {
  for (let index = ACTIVITY_BANDS.length - 1; index >= 0; index--) {
    if (value >= ACTIVITY_BANDS[index].min) {
      return ACTIVITY_BANDS[index].level;
    }
  }
  return 0;
}

export function isFutureDate(date: string, today: string): boolean {
  return date > today;
}

export function shiftCalendarDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
