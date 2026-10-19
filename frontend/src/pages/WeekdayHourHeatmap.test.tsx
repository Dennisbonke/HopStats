import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import WeekdayHourHeatmap, {
  buildHeatmapCells,
  heatmapBands,
} from "./WeekdayHourHeatmap";
import type { DrinkingTrends } from "../api/analytics";

afterEach(cleanup);

function fixture(): DrinkingTrends {
  return {
    start: "2025-12-28",
    end: "2026-01-05",
    timezone: "Europe/Amsterdam",
    daily: [],
    weekday: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      total: 0,
      discoveries: 0,
      repeats: 0,
      days_in_period:
        weekday === 0 ? 2 : weekday === 1 ? 2 : weekday === 4 ? 1 : 0,
    })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      total: 0,
      discoveries: 0,
      repeats: 0,
    })),
    weekday_hour: Array.from({ length: 168 }, (_, index) => {
      const weekday = Math.floor(index / 24);
      const hour = index % 24;
      const total =
        weekday === 4 && hour === 20 ? 24 : weekday === 0 && hour === 8 ? 6 : 0;
      const discoveries =
        weekday === 4 && hour === 20 ? 8 : weekday === 0 && hour === 8 ? 2 : 0;
      return {
        weekday,
        hour,
        total,
        discoveries,
        repeats: total - discoveries,
      };
    }),
  };
}

test("maps all 168 cells Monday-first and normalizes by weekday occurrences", () => {
  const data = fixture();
  const cells = buildHeatmapCells(data, "total", "average");
  expect(cells).toHaveLength(168);
  expect(cells[0]).toMatchObject({
    weekday: 0,
    hour: 0,
    count: 0,
    denominator: 2,
    average: 0,
    value: 0,
  });
  expect(cells[24]).toMatchObject({ weekday: 1, hour: 0, denominator: 2 });
  expect(cells[48]).toMatchObject({
    weekday: 2,
    hour: 0,
    denominator: 0,
    average: null,
    value: null,
  });
  expect(cells[4 * 24 + 20]).toMatchObject({
    count: 24,
    denominator: 1,
    average: 24,
    value: 24,
  });
  expect(cells.at(-1)).toMatchObject({ weekday: 6, hour: 23 });

  expect(
    buildHeatmapCells(data, "discoveries", "average")[4 * 24 + 20],
  ).toMatchObject({
    count: 8,
    average: 8,
    value: 8,
  });
  expect(
    buildHeatmapCells(data, "repeats", "total")[4 * 24 + 20],
  ).toMatchObject({
    count: 16,
    value: 16,
  });
});

test("adaptive quantile intensity is deterministic and resists one large outlier", () => {
  expect(heatmapBands([0, 0, 0])).toEqual([]);
  expect(heatmapBands([0, 4, 4, 4])).toEqual([
    { level: 1, minimum: 4, maximum: 4 },
  ]);
  const bands = heatmapBands([
    ...Array.from({ length: 24 }, (_, index) => index + 1),
    10000,
  ]);
  expect(bands).toHaveLength(4);
  expect(bands[0].maximum).toBeLessThan(10000);
  expect(bands.at(-1)).toMatchObject({ minimum: 20, maximum: 10000 });
});

test("renders a keyboard grid and preserves the selected cell across metric and mode changes", () => {
  const trends = fixture();
  const props = {
    trends,
    metric: "total" as const,
    mode: "total" as const,
    reportingPeriod: "2025-12-28–2026-01-05",
  };
  const { container, rerender } = render(<WeekdayHourHeatmap {...props} />);
  const grid = screen.getByRole("grid", {
    name: /Check-in Activity.*2025-12-28/,
  });
  const cells = within(grid).getAllByRole("gridcell");
  expect(cells).toHaveLength(168);
  const legend = screen.getByLabelText("Heatmap intensity legend");
  expect(within(legend).getByText("0")).toBeInTheDocument();
  expect(within(legend).getByText("6")).toBeInTheDocument();
  expect(within(legend).getByText("24")).toBeInTheDocument();
  expect(cells[0]).toHaveAccessibleName(/Monday, 00:00–00:59, 0 all check-ins/);
  expect(cells[4 * 24 + 20]).toHaveAccessibleName(
    /Friday, 20:00–20:59, 24 all check-ins/,
  );
  expect(
    cells.filter((cell) => cell.getAttribute("tabindex") === "0"),
  ).toHaveLength(1);

  const target = cells[4 * 24 + 20] as HTMLButtonElement;
  target.focus();
  fireEvent.keyDown(target, { key: "ArrowRight" });
  expect(cells[4 * 24 + 21]).toHaveFocus();
  fireEvent.keyDown(cells[4 * 24 + 21], { key: "ArrowLeft" });
  expect(target).toHaveFocus();
  fireEvent.keyDown(target, { key: "ArrowUp" });
  expect(cells[3 * 24 + 20]).toHaveFocus();
  fireEvent.keyDown(cells[3 * 24 + 20], { key: "ArrowDown" });
  expect(target).toHaveFocus();
  fireEvent.keyDown(cells[3 * 24 + 20], { key: "Home" });
  expect(cells[3 * 24]).toHaveFocus();
  fireEvent.keyDown(cells[3 * 24], { key: "End" });
  expect(cells[3 * 24 + 23]).toHaveFocus();
  fireEvent.keyDown(cells[3 * 24 + 23], { key: "ArrowRight" });
  expect(cells[3 * 24 + 23]).toHaveFocus();

  fireEvent.keyDown(target, { key: "Enter" });
  expect(
    screen.getByRole("heading", { name: "Friday, 20:00–20:59" }),
  ).toBeInTheDocument();
  expect(
    within(container.querySelector(".weekday-hour-details")!).getAllByText(
      "24",
    ),
  ).toHaveLength(2);
  rerender(
    <WeekdayHourHeatmap {...props} metric="discoveries" mode="average" />,
  );
  expect(
    screen.getByRole("heading", { name: "Friday, 20:00–20:59" }),
  ).toBeInTheDocument();
  expect(screen.getByText("8", { selector: "dd" })).toBeInTheDocument();
  expect(screen.getAllByText("8.00", { selector: "dd" })).toHaveLength(2);
  expect(screen.getAllByText(/Average per weekday/).length).toBeGreaterThan(0);
  expect(cells[2 * 24].getAttribute("aria-label")).toContain(
    "average unavailable",
  );
  fireEvent.keyDown(target, { key: " " });
  expect(target).toHaveAttribute("aria-selected", "true");

  const expandedTable = screen.getByText("Show all 168 heatmap values");
  fireEvent.click(expandedTable);
  const table = screen.getByRole("table", { name: /2025-12-28–2026-01-05/ });
  expect(within(table).getAllByRole("row")).toHaveLength(169);
});

test("all-zero periods keep all cells neutral and explain zero activity", () => {
  const trends = fixture();
  const empty: DrinkingTrends = {
    ...trends,
    weekday_hour: trends.weekday_hour.map((cell) => ({
      ...cell,
      total: 0,
      discoveries: 0,
      repeats: 0,
    })),
  };
  render(
    <WeekdayHourHeatmap
      trends={empty}
      metric="total"
      mode="total"
      reportingPeriod="2025-12-28–2026-01-05"
    />,
  );
  const grid = screen.getByRole("grid");
  expect(within(grid).getAllByRole("gridcell")).toHaveLength(168);
  expect(
    within(grid)
      .getAllByRole("gridcell")
      .every((cell) => cell.getAttribute("data-heat-level") === "0"),
  ).toBe(true);
  expect(screen.getByLabelText("Heatmap intensity legend")).toHaveTextContent(
    "0",
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No check-ins in this reporting period.",
  );
});

test("changing reporting period remounts predictably and clears selection", () => {
  const trends = fixture();
  function HeatmapForPeriod({ period }: { period: string }) {
    return (
      <div>
        <WeekdayHourHeatmap
          key={period}
          trends={{
            ...trends,
            start: period === "period-a" ? trends.start : "2026-01-01",
            end: period === "period-a" ? trends.end : "2026-01-02",
          }}
          metric="total"
          mode="total"
          reportingPeriod={period}
        />
      </div>
    );
  }
  const { rerender } = render(<HeatmapForPeriod period="period-a" />);
  fireEvent.click(
    within(screen.getByRole("grid", { name: /period-a/ })).getAllByRole(
      "gridcell",
      { name: /Friday, 20:00/ },
    )[0],
  );
  expect(
    screen.getByRole("heading", { name: "Friday, 20:00–20:59" }),
  ).toBeInTheDocument();
  rerender(<HeatmapForPeriod period="period-b" />);
  expect(
    screen.queryByRole("heading", { name: "Friday, 20:00–20:59" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "Focus and select a cell to inspect its check-in count and average.",
    ),
  ).toBeInTheDocument();
});
