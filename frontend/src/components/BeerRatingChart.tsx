import { useRef } from "react";
import type { RefObject } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Coordinate } from "recharts";
import type { RatingPoint } from "../api/explore";
import AnalyticsChartTooltip, {
  ANALYTICS_TOOLTIP_WRAPPER_STYLE,
} from "./AnalyticsChartTooltip";
import ChartBucketSelection from "./ChartBucketSelection";
import { useChartTooltipInteraction } from "./useChartTooltipInteraction";
import { checkinDate, personalRating } from "../utils/explorer";

type Datum = RatingPoint & { timestamp: number };
function RatingTooltip({
  active,
  coordinate,
  payload,
  chartRef,
}: {
  active?: boolean;
  coordinate?: Coordinate;
  payload?: Array<{ payload?: Datum }>;
  chartRef: RefObject<HTMLElement | null>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <AnalyticsChartTooltip
      active={active}
      coordinate={coordinate}
      chartRef={chartRef}
    >
      <strong>{checkinDate(point.occurred_at_utc, true)}</strong>
      <div>My rating: {personalRating(point.rating)}</div>
    </AnalyticsChartTooltip>
  );
}

export default function BeerRatingChart({ points }: { points: RatingPoint[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const interaction = useChartTooltipInteraction(chartRef, points);
  const data = points.map((p) => ({
    ...p,
    timestamp: new Date(p.occurred_at_utc).getTime(),
  }));
  return (
    <section
      className="beer-rating-section"
      aria-labelledby="beer-rating-title"
    >
      <h2 id="beer-rating-title">Rating history</h2>
      {data.length === 0 ? (
        <p>No rated check-ins yet.</p>
      ) : (
        <>
          <p id="beer-chart-description">
            {data.length} individual rated check-ins, in chronological order.
            Ratings from 0 to 5. Times shown in Europe/Amsterdam.
          </p>
          <div
            className="beer-rating-chart ui-chart"
            ref={chartRef}
            role="group"
            aria-label="Personal ratings over time"
            aria-describedby="beer-chart-description"
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
              <LineChart
                data={data}
                accessibilityLayer
                margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  type="number"
                  scale="time"
                  dataKey="timestamp"
                  domain={
                    data.length === 1
                      ? [
                          data[0].timestamp - 86400000,
                          data[0].timestamp + 86400000,
                        ]
                      : ["dataMin", "dataMax"]
                  }
                  tickFormatter={(v: number) =>
                    checkinDate(new Date(v).toISOString())
                  }
                  minTickGap={36}
                />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} width={28} />
                <ChartBucketSelection
                  data={data}
                  axisKey="timestamp"
                  selection={interaction.selection}
                  series={[
                    {
                      key: "rating",
                      name: "My rating",
                      color: "var(--color-chart-primary)",
                    },
                  ]}
                  content={<RatingTooltip chartRef={chartRef} />}
                />
                <Tooltip
                  active={interaction.active}
                  trigger={interaction.trigger}
                  content={<RatingTooltip chartRef={chartRef} />}
                  portal={document.body}
                  wrapperStyle={ANALYTICS_TOOLTIP_WRAPPER_STYLE}
                />
                <Line
                  dataKey="rating"
                  name="My rating"
                  type="linear"
                  stroke="var(--color-chart-primary)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "var(--color-chart-primary)" }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="beer-rating-data">
            <summary>View rating history as text</summary>
            <ol>
              {points.map((p) => (
                <li key={p.id}>
                  {checkinDate(p.occurred_at_utc, true)}:{" "}
                  {personalRating(p.rating)}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
