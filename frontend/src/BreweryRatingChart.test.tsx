import { cloneElement, type ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import BreweryRatingChart from "./components/BreweryRatingChart";

// Supply geometry without a browser layout engine; keep the real chart and axes.
const geometry = vi.hoisted(() => ({ width: 240 }));
vi.mock("recharts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("recharts")>()),
  ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children as ReactElement<{ width: number; height: number }>, {
      width: geometry.width,
      height: 240,
    }),
}));

afterEach(cleanup);

test.each([240, 800])(
  "rendered rating axis retains the final bucket at %ipx",
  async (width) => {
    geometry.width = width;
    render(
      <BreweryRatingChart
        buckets={Array.from({ length: 10 }, (_, index) => ({
          lower: index / 2,
          upper: (index + 1) / 2,
          count: index === 9 ? 1 : 0,
        }))}
      />,
    );
    const chart = screen.getByRole("group", {
      name: "Personal check-in rating distribution",
    });
    await waitFor(() => {
      const labels = chart.querySelectorAll(
        ".recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value",
      );
      expect(labels.length).toBeGreaterThan(0);
      expect(labels[labels.length - 1]).toHaveTextContent("4.5");
    });
    expect(chart.querySelectorAll("[data-chart-bucket]")).toHaveLength(10);
    expect(screen.getByText("4.50–5.00: 1 check-ins")).toBeInTheDocument();
  },
);
