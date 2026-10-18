import { expect, test } from "vitest";
import {
  activityLevel,
  activityValue,
  calendarMonthLabels,
  calendarWeeks,
  isFutureDate,
  yearIntersection,
} from "./calendar";

test.each([
  { year: 2021, days: 365, leading: 4 }, // Friday, Monday-first.
  { year: 2023, days: 365, leading: 6 }, // Sunday, Monday-first.
  { year: 2024, days: 366, leading: 0 }, // Monday, leap year.
])(
  "creates a Monday-first $year calendar with alignment cells",
  ({ year, days, leading }) => {
    const weeks = calendarWeeks(year);
    const dates = weeks.flat();
    const realDates = dates.filter((date): date is string => date !== null);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(dates.slice(0, leading).every((date) => date === null)).toBe(true);
    expect(realDates).toHaveLength(days);
    expect(new Set(realDates).size).toBe(days);
    expect(realDates[0]).toBe(`${year}-01-01`);
    expect(realDates.at(-1)).toBe(`${year}-12-31`);
    expect(realDates.some((date) => date === `${year}-02-29`)).toBe(
      year === 2024,
    );
  },
);

test("keeps a January 1 Sunday in the final Monday-first row", () => {
  const weeks = calendarWeeks(2023);
  expect(weeks[0]).toEqual([null, null, null, null, null, null, "2023-01-01"]);
  expect(weeks.at(-1)?.at(-1)).toBe("2023-12-31");
});

test("supports a future Sunday-first calendar alignment", () => {
  expect(calendarWeeks(2023, 6)[0]).toEqual([
    "2023-01-01",
    "2023-01-02",
    "2023-01-03",
    "2023-01-04",
    "2023-01-05",
    "2023-01-06",
    "2023-01-07",
  ]);
});

test("places month labels at the week containing each month's first date", () => {
  expect(calendarMonthLabels(2024).slice(0, 3)).toEqual([
    { month: 0, week: 0 },
    { month: 1, week: 4 },
    { month: 2, week: 8 },
  ]);
  expect(calendarMonthLabels(2023, 6)[0]).toEqual({ month: 0, week: 0 });
});

test("intersects reporting dates with a selected year without truncating the period", () => {
  expect(
    yearIntersection({ start: "2022-06-15", end: "2026-03-10" }, 2024),
  ).toEqual({
    start: "2024-01-01",
    end: "2024-12-31",
  });
  expect(
    yearIntersection({ start: "2022-06-15", end: "2026-03-10" }, 2022),
  ).toEqual({
    start: "2022-06-15",
    end: "2022-12-31",
  });
  expect(
    yearIntersection({ start: "2022-06-15", end: "2026-03-10" }, 2026),
  ).toEqual({
    start: "2026-01-01",
    end: "2026-03-10",
  });
  expect(
    yearIntersection({ start: "2022-06-15", end: "2026-03-10" }, 2021),
  ).toBeNull();
});

test("uses fixed numerical intensity bands and selects the requested metric", () => {
  expect([0, 1, 2, 3, 5, 6, 9, 10, 100].map(activityLevel)).toEqual([
    0, 1, 1, 2, 2, 3, 3, 4, 4,
  ]);
  const counts = { total: 7, discoveries: 2, repeats: 5 };
  expect(activityValue(counts, "total")).toBe(7);
  expect(activityValue(counts, "discoveries")).toBe(2);
  expect(activityValue(counts, "repeats")).toBe(5);
});

test("compares future local calendar dates lexically", () => {
  expect(isFutureDate("2026-10-19", "2026-10-18")).toBe(true);
  expect(isFutureDate("2026-10-18", "2026-10-18")).toBe(false);
});
