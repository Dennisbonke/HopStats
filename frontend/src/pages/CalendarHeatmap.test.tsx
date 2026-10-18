import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import CalendarHeatmap from "./CalendarHeatmap";
import type { DailyActivity } from "../utils/calendar";

function day(
  date: string,
  total = 0,
  discoveries = 0,
  repeats = total - discoveries,
): DailyActivity {
  return { date, total, discoveries, repeats };
}

test("renders a partial leap-year calendar with unavailable dates and accessible details", () => {
  render(
    <CalendarHeatmap
      year={2024}
      reportingRange={{ start: "2024-02-29", end: "2024-03-01" }}
      daily={[day("2024-02-29", 2, 1, 1), day("2024-03-01", 1, 0, 1)]}
      metric="total"
    />,
  );

  const grid = screen.getByRole("grid", { name: /2024 daily activity/ });
  expect(grid).toBeInTheDocument();
  expect(screen.getByText("Feb")).toBeInTheDocument();
  expect(screen.getByText("Mar")).toBeInTheDocument();
  const leapDay = screen.getByRole("gridcell", {
    name: "Thursday, 29 February 2024: 2 check-ins, 1 discoveries, 1 repeats",
  });
  expect(leapDay).toHaveClass("calendar-level-1");
  expect(
    screen.getByRole("gridcell", {
      name: "Wednesday, 28 February 2024: outside the reporting period",
    }),
  ).toHaveClass("calendar-unavailable");
  const legend = screen.getByLabelText("Activity intensity levels");
  for (const label of ["0", "1–2", "3–5", "6–9", "10+", "Outside period"]) {
    expect(within(legend).getByText(label)).toBeInTheDocument();
  }
  expect(within(grid).getAllByRole("row")).toHaveLength(7);
  expect(
    within(grid)
      .getAllByRole("gridcell")
      .filter((cell) => cell.getAttribute("tabindex") === "0"),
  ).toHaveLength(1);

  fireEvent.keyDown(leapDay, { key: "ArrowDown" });
  const nextDay = screen.getByRole("gridcell", {
    name: "Friday, 1 March 2024: 1 check-ins, 0 discoveries, 1 repeats",
  });
  expect(nextDay).toHaveFocus();
  expect(
    screen.getByRole("heading", { name: "Friday, 1 March 2024" }),
  ).toBeInTheDocument();
  expect(screen.getByText("All check-ins")).toBeInTheDocument();
  expect(screen.getByText("Repeat check-ins")).toBeInTheDocument();
  expect(
    screen.getByText("Selected metric · All check-ins"),
  ).toBeInTheDocument();
  fireEvent.pointerEnter(leapDay);
  expect(
    screen.getByRole("heading", { name: "Thursday, 29 February 2024" }),
  ).toBeInTheDocument();
  fireEvent.click(nextDay);
  expect(
    screen.getByRole("heading", { name: "Friday, 1 March 2024" }),
  ).toBeInTheDocument();
});

test("metric changes update intensity without changing the daily counts", () => {
  const props = {
    year: 2026,
    reportingRange: { start: "2026-01-01", end: "2026-01-01" },
    daily: [day("2026-01-01", 10, 1, 9)],
  };
  const { rerender } = render(<CalendarHeatmap {...props} metric="total" />);
  const date = screen.getByRole("gridcell", {
    name: /1 January 2026: 10 check-ins, 1 discoveries, 9 repeats/,
  });
  expect(date).toHaveClass("calendar-level-4");

  rerender(<CalendarHeatmap {...props} metric="discoveries" />);
  expect(date).toHaveClass("calendar-level-1");
  expect(screen.getByText("Daily new discoveries")).toBeInTheDocument();
});

test("marks future dates separately and preserves included future check-ins", () => {
  render(
    <CalendarHeatmap
      year={2027}
      reportingRange={{ start: "2027-01-01", end: "2027-01-02" }}
      daily={[day("2027-01-01", 3, 2, 1), day("2027-01-02")]}
      metric="total"
    />,
  );
  const futureWithActivity = screen.getByRole("gridcell", {
    name: /1 January 2027: 3 check-ins, 2 discoveries, 1 repeats, future date/,
  });
  expect(futureWithActivity).toHaveClass("calendar-future", "calendar-level-2");
  expect(
    screen.getByRole("gridcell", {
      name: /2 January 2027: 0 check-ins.*future date/,
    }),
  ).toHaveClass("calendar-future", "calendar-level-0");
});

test("renders an empty year's available dates at zero intensity", () => {
  render(
    <CalendarHeatmap
      year={2025}
      reportingRange={{ start: "2025-06-01", end: "2025-06-03" }}
      daily={[day("2025-06-01"), day("2025-06-02"), day("2025-06-03")]}
      metric="repeats"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No check-ins in 2025");
  expect(
    screen.getByRole("gridcell", {
      name: "Sunday, 1 June 2025: 0 check-ins, 0 discoveries, 0 repeats",
    }),
  ).toHaveClass("calendar-level-0");
});
