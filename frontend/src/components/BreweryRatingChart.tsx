import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Coordinate } from "recharts";
import AnalyticsChartTooltip, {
  ANALYTICS_TOOLTIP_WRAPPER_STYLE,
} from "./AnalyticsChartTooltip";
import ChartBucketSelection from "./ChartBucketSelection";
import { useChartTooltipInteraction } from "./useChartTooltipInteraction";
type Bucket = { lower: number; upper: number; count: number };
function DistributionTooltip({
  active,
  coordinate,
  payload,
  chartRef,
  tooltipRef,
}: {
  active?: boolean;
  coordinate?: Coordinate;
  payload?: Array<{ payload?: Bucket & { label: string } }>;
  chartRef: RefObject<HTMLElement | null>;
  tooltipRef: RefObject<HTMLDivElement | null>;
}) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return (
    <AnalyticsChartTooltip
      active={active}
      coordinate={coordinate}
      chartRef={chartRef}
      contentRef={tooltipRef}
    >
      <strong>{item.label}</strong>
      <div>{item.count} rated check-ins</div>
    </AnalyticsChartTooltip>
  );
}
export default function BreweryRatingChart({ buckets }: { buckets: Bucket[] }) {
  const data = useMemo(
    () =>
      buckets.map((b, i) => ({
        ...b,
        label: `${b.lower.toFixed(2)}–${i === 9 ? "" : "<"}${b.upper.toFixed(2)}`,
      })),
    [buckets],
  );
  const chartRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const interaction = useChartTooltipInteraction(chartRef, data, tooltipRef);
  const total = data.reduce((sum, b) => sum + b.count, 0);
  return (
    <section
      className="beer-rating-section"
      aria-labelledby="brewery-distribution-title"
    >
      <h2 id="brewery-distribution-title">Rating distribution of check-ins</h2>
      {!total ? (
        <p>No rated check-ins yet.</p>
      ) : (
        <>
          <p>
            {total} rated check-ins. Each check-in belongs to one half-point
            bucket; 5.00 is included in the final bucket.
          </p>
          <div
            className="beer-rating-chart ui-chart"
            ref={chartRef}
            role="group"
            aria-label="Personal check-in rating distribution"
            onPointerMove={interaction.onPointerMove}
            onPointerLeave={interaction.onPointerLeave}
            onPointerDown={interaction.onPointerDown}
            onPointerUp={interaction.onPointerUp}
            onPointerCancel={interaction.onPointerCancel}
            onKeyDown={interaction.onKeyDown}
            onFocus={interaction.onFocus}
            onBlur={interaction.onBlur}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                accessibilityLayer
                margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickFormatter={(label: string) =>
                    String(Number(label.split("–")[0]))
                  }
                  minTickGap={12}
                />
                <YAxis allowDecimals={false} width={28} />
                <ChartBucketSelection
                  data={data}
                  axisKey="label"
                  selection={interaction.selection}
                  series={[
                    {
                      key: "count",
                      name: "Rated check-ins",
                      color: "var(--color-chart-primary)",
                    },
                  ]}
                  content={
                    <DistributionTooltip
                      chartRef={chartRef}
                      tooltipRef={tooltipRef}
                    />
                  }
                />
                <Tooltip
                  active={interaction.active}
                  trigger={interaction.trigger}
                  content={
                    <DistributionTooltip
                      chartRef={chartRef}
                      tooltipRef={tooltipRef}
                    />
                  }
                  portal={document.body}
                  wrapperStyle={ANALYTICS_TOOLTIP_WRAPPER_STYLE}
                />
                <Bar
                  dataKey="count"
                  name="Rated check-ins"
                  fill="var(--color-chart-primary)"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <details className="beer-rating-data">
        <summary>View rating distribution data</summary>
        <ol>
          {data.map((b) => (
            <li key={b.lower}>
              {b.label}: {b.count} check-ins
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
