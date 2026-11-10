import { useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type Coordinate,
} from "recharts";
import type { CSSProperties, RefObject } from "react";
import { Link } from "react-router-dom";
import { AnalyticsBucket } from "../api/analytics";
import AnalyticsChartTooltip, {
  ANALYTICS_TOOLTIP_WRAPPER_STYLE,
} from "./AnalyticsChartTooltip";
import { Button, Card } from "./ui";
import { useChartTooltipInteraction } from "./useChartTooltipInteraction";

const countFormatter = new Intl.NumberFormat();

type DashboardChartDatum = AnalyticsBucket & {
  axis: string;
  tooltip: string;
  currentMonth: boolean;
};

function DashboardTooltip({
  active,
  coordinate,
  payload,
  label,
  chartRef,
  chartData,
}: {
  active?: boolean;
  coordinate?: Coordinate;
  payload?: Array<{
    value: number;
    color: string;
    payload?: DashboardChartDatum;
  }>;
  label?: string;
  chartRef: RefObject<HTMLElement | null>;
  chartData: DashboardChartDatum[];
}) {
  const datum = payload?.[0];
  const bucket =
    chartData.find((item) => item.axis === label) ?? datum?.payload;
  if (!active || !bucket || datum?.value === undefined) return null;

  return (
    <AnalyticsChartTooltip
      active={active}
      coordinate={coordinate}
      chartRef={chartRef}
    >
      <strong>{bucket.tooltip ?? String(label).replace("*", "")}</strong>
      <div style={{ "--tooltip-series-color": datum.color } as CSSProperties}>
        {countFormatter.format(Number(datum.value))} discoveries
      </div>
      <div>Unique beers</div>
    </AnalyticsChartTooltip>
  );
}

function dateOnly(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function localMonthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function localMonthYearLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function dashboardMonthLabels(key: string, currentMonth: string) {
  const year = key.slice(0, 4);
  const isJanuary = key.slice(5, 7) === "01";
  const isCurrentMonth = key === currentMonth;
  return {
    axis: `${localMonthLabel(key)}${isJanuary ? ` '${year.slice(2)}` : ""}${isCurrentMonth ? "*" : ""}`,
    tooltip: `${localMonthYearLabel(key)}${isCurrentMonth ? " (incomplete month)" : ""}`,
    currentMonth: isCurrentMonth,
  };
}

export default function DashboardDiscoveriesChart({
  resource,
  hasCheckins,
  availabilityLoading,
  currentMonth,
  endDate,
}: {
  resource: {
    data: AnalyticsBucket[] | null;
    loading: boolean;
    error: string | null;
    retry: () => void;
  };
  hasCheckins: boolean | null;
  availabilityLoading: boolean;
  currentMonth: string;
  endDate: string;
}) {
  const buckets = resource.data ?? [];
  const chartData = buckets.map((bucket) => ({
    ...bucket,
    ...dashboardMonthLabels(bucket.key, currentMonth),
  }));
  const chartRef = useRef<HTMLDivElement>(null);
  const tooltipInteraction = useChartTooltipInteraction(
    chartRef,
    `${currentMonth}|${endDate}|${chartData.map((bucket) => bucket.key).join(",")}`,
  );

  return (
    <Card
      as="section"
      className="dashboard-panel dashboard-discoveries"
      aria-labelledby="dashboard-discoveries-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-eyebrow">First-ever beer check-ins</p>
          <h2 id="dashboard-discoveries-title">Unique beer discoveries</h2>
        </div>
        <Link to="/analytics">More analytics</Link>
      </div>
      <p className="dashboard-chart-caption">
        Six calendar months · * Current month is incomplete through{" "}
        {dateOnly(endDate)}
      </p>
      {resource.loading ? (
        <p className="dashboard-inline-state" role="status" aria-busy="true">
          Loading discoveries…
        </p>
      ) : resource.error ? (
        <div
          className="dashboard-inline-state dashboard-inline-error"
          role="alert"
        >
          <span>{resource.error}</span>
          <Button type="button" variant="secondary" onClick={resource.retry}>
            Retry discoveries
          </Button>
        </div>
      ) : hasCheckins === false ? (
        <p className="dashboard-empty-compact">
          Import check-ins to see your monthly discoveries.{" "}
          <Link to="/imports">Go to Imports</Link>
        </p>
      ) : hasCheckins === null && availabilityLoading ? (
        <p className="dashboard-empty-compact" role="status">
          Checking imported check-in history…
        </p>
      ) : chartData.length === 0 ? (
        <p className="dashboard-empty-compact">
          No monthly discovery data is available yet.{" "}
          <Link to="/analytics">View Analytics</Link>
        </p>
      ) : (
        <>
          <p className="sr-only" id="dashboard-discoveries-summary">
            Monthly first-ever beer discoveries:{" "}
            {chartData
              .map((bucket) => `${bucket.tooltip}: ${bucket.new_discoveries}`)
              .join("; ")}
            .
          </p>
          <div
            className="dashboard-chart ui-chart"
            ref={chartRef}
            role="group"
            aria-label="Unique beer discoveries over the last six months"
            aria-describedby="dashboard-discoveries-summary"
            onPointerMove={tooltipInteraction.onPointerMove}
            onPointerLeave={tooltipInteraction.onPointerLeave}
            onPointerDown={tooltipInteraction.onPointerDown}
            onPointerUp={tooltipInteraction.onPointerUp}
            onPointerCancel={tooltipInteraction.onPointerCancel}
            onFocus={tooltipInteraction.onFocus}
            onBlur={tooltipInteraction.onBlur}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                accessibilityLayer
                aria-label="Monthly unique beer discoveries"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="axis" />
                <YAxis allowDecimals={false} width={38} />
                <Tooltip
                  active={tooltipInteraction.active}
                  content={
                    <DashboardTooltip
                      chartRef={chartRef}
                      chartData={chartData}
                    />
                  }
                  portal={document.body}
                  wrapperStyle={ANALYTICS_TOOLTIP_WRAPPER_STYLE}
                />
                <Bar
                  dataKey="new_discoveries"
                  name="Unique beer discoveries"
                  fill="var(--color-chart-primary)"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="dashboard-chart-footnote">
            Discoveries count the first-ever imported check-in for each beer.
          </p>
        </>
      )}
    </Card>
  );
}
