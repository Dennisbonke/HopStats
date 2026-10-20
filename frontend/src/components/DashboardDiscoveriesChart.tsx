import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { AnalyticsBucket } from "../api/analytics";

const countFormatter = new Intl.NumberFormat();

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
    month_label: `${localMonthLabel(bucket.key)}${bucket.key === currentMonth ? "*" : ""}`,
    current_month: bucket.key === currentMonth,
  }));

  return (
    <section
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
          <button
            type="button"
            className="secondary-button"
            onClick={resource.retry}
          >
            Retry discoveries
          </button>
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
              .map(
                (bucket) =>
                  `${localMonthLabel(bucket.key)}${bucket.current_month ? " (incomplete month)" : ""}: ${bucket.new_discoveries}`,
              )
              .join("; ")}
            .
          </p>
          <div
            className="dashboard-chart"
            role="group"
            aria-label="Unique beer discoveries over the last six months"
            aria-describedby="dashboard-discoveries-summary"
          >
            <ResponsiveContainer width="100%" height={230}>
              <BarChart
                data={chartData}
                accessibilityLayer
                aria-label="Monthly unique beer discoveries"
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month_label" />
                <YAxis allowDecimals={false} width={38} />
                <Tooltip
                  formatter={(value) => [
                    `${countFormatter.format(Number(value))} discoveries`,
                    "Unique beers",
                  ]}
                  labelFormatter={(label) =>
                    `${String(label).replace("*", "")} ${String(label).includes("*") ? "(incomplete month)" : ""}`
                  }
                />
                <Bar
                  dataKey="new_discoveries"
                  name="Unique beer discoveries"
                  fill="#23835e"
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
    </section>
  );
}
