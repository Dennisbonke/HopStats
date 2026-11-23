import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import ChartBucketSelection from "./components/ChartBucketSelection";

afterEach(cleanup);

test("real Recharts geometry gives zero bars full-height regions bounded by margins and axes", async () => {
  const data = [
    { label: "Empty before", count: 0 },
    { label: "Active", count: 120 },
    { label: "Empty after", count: 0 },
  ];
  const { container } = render(
    <BarChart
      width={360}
      height={240}
      data={data}
      margin={{ top: 20, right: 16, bottom: 12, left: 12 }}
    >
      <XAxis dataKey="label" height={30} />
      <YAxis width={40} />
      <Bar dataKey="count" isAnimationActive={false} />
      <ChartBucketSelection
        data={data}
        axisKey="label"
        selection={null}
        series={[{ key: "count", name: "Count", color: "red" }]}
        content={<div />}
      />
    </BarChart>,
  );
  await waitFor(() =>
    expect(container.querySelectorAll("[data-chart-bucket]")).toHaveLength(3),
  );
  const regions = Array.from(
    container.querySelectorAll("[data-chart-bucket]"),
  ).map((region) => ({
    x: Number(region.getAttribute("x")),
    y: Number(region.getAttribute("y")),
    width: Number(region.getAttribute("width")),
    height: Number(region.getAttribute("height")),
  }));
  expect(regions[0].x).toBe(52);
  expect(regions[2].x + regions[2].width).toBeCloseTo(344);
  for (let index = 0; index < regions.length; index++) {
    expect(regions[index].y).toBe(20);
    expect(regions[index].height).toBe(178);
    expect(regions[index].width).toBeCloseTo(292 / 3);
    if (index > 0)
      expect(regions[index].x).toBeCloseTo(
        regions[index - 1].x + regions[index - 1].width,
      );
  }
});
