import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AnalyticsApiError,
  AnalyticsBucket,
  CheckinAnalytics,
  fetchCheckinAnalytics,
} from "../api/analytics";

const TIMEZONE = "Europe/Amsterdam";
type Period =
  "all" | "this_year" | "last_year" | "last_30" | "last_90" | "custom";
type Granularity = "auto" | "day" | "week" | "month";

function todayInAmsterdam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(value: string, offset: number) {
  const day = new Date(`${value}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

function currentYearPeriod(now = todayInAmsterdam()) {
  const year = now.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function initialParams(search: URLSearchParams) {
  const period = search.get("period") as Period | null;
  const granularity = search.get("granularity") as Granularity | null;
  const timezone = search.get("timezone");
  const start = search.get("start");
  const end = search.get("end");
  const validDate = (value: string | null) =>
    value !== null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const validPeriod = [
    "all",
    "this_year",
    "last_year",
    "last_30",
    "last_90",
    "custom",
  ].includes(period ?? "");
  const validGranularity = ["auto", "day", "week", "month"].includes(
    granularity ?? "",
  );
  const invalid =
    (!!period && !validPeriod) ||
    (!!granularity && !validGranularity) ||
    (!!timezone && timezone !== TIMEZONE) ||
    !!start !== !!end ||
    (!!start && (!validDate(start) || !validDate(end))) ||
    (!!start && !!end && start > end);
  if (invalid)
    return {
      period: "this_year" as Period,
      granularity: "auto" as Granularity,
      ...currentYearPeriod(),
      invalid: true,
    };
  return {
    period: (period ?? "this_year") as Period,
    granularity: (granularity ?? "auto") as Granularity,
    ...(start && end ? { start, end } : currentYearPeriod()),
    invalid: false,
  };
}

function suggestedGranularity(
  start: string,
  end: string,
): Exclude<Granularity, "auto"> {
  const days =
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000 +
    1;
  return days <= 45 ? "day" : days <= 180 ? "week" : "month";
}

function makeApiParams(
  period: Period,
  start: string,
  end: string,
  granularity: Granularity,
) {
  const params = new URLSearchParams({ granularity, timezone: TIMEZONE });
  if (period !== "all") {
    params.set("start", start);
    params.set("end", end);
  }
  return params;
}

function ExactTooltip({
  active,
  payload,
  label,
  showShare = false,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload?: AnalyticsBucket;
  }>;
  label?: string;
  showShare?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  if (!bucket) return null;
  return (
    <div className="analytics-tooltip">
      <strong>
        {bucket.label} · {bucket.start} – {bucket.end}
      </strong>
      {payload.map((entry) => (
        <div key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </div>
      ))}
      {showShare && bucket && bucket.total_checkins > 0 && (
        <div>
          Discovery share:{" "}
          {((bucket.new_discoveries / bucket.total_checkins) * 100).toFixed(1)}%
        </div>
      )}
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

export default function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = useMemo(() => initialParams(searchParams), []);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [granularity, setGranularity] = useState<Granularity>(
    initial.granularity,
  );
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [urlWarning, setUrlWarning] = useState(initial.invalid);
  const [data, setData] = useState<CheckinAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const [mode, setMode] = useState<"activity" | "cumulative">("activity");
  const [visible, setVisible] = useState({ total: true, discoveries: true });
  const actualGranularity =
    granularity === "auto" ? suggestedGranularity(start, end) : granularity;
  const invalidRange = period !== "all" && (!start || !end || start > end);
  const requestParams = useMemo(
    () =>
      makeApiParams(
        period,
        start,
        end,
        period === "all" && granularity === "auto" ? "auto" : actualGranularity,
      ),
    [period, start, end, granularity, actualGranularity],
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(requestParams);
    urlParams.set("period", period);
    if (granularity === "auto") urlParams.set("granularity", "auto");
    if (urlParams.toString() !== searchParams.toString()) {
      setSearchParams(urlParams, { replace: true });
    }
  }, [period, granularity, requestParams, searchParams, setSearchParams]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (invalidRange) {
      setData(null);
      setLoading(false);
      setError(null);
      return () => {
        if (requestSequence.current === requestId) requestSequence.current++;
      };
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    fetchCheckinAnalytics(requestParams, controller.signal)
      .then((result) => {
        if (requestSequence.current === requestId) setData(result);
      })
      .catch((requestError: unknown) => {
        if (requestSequence.current === requestId) {
          setError(
            requestError instanceof AnalyticsApiError
              ? requestError.message
              : "Analytics are temporarily unavailable. Please try again.",
          );
        }
      })
      .finally(() => {
        if (requestSequence.current === requestId) setLoading(false);
      });
    return () => {
      controller.abort();
      if (requestSequence.current === requestId) requestSequence.current++;
    };
  }, [period, start, end, invalidRange, requestParams]);

  function choosePeriod(next: Period) {
    const today = todayInAmsterdam();
    let range = { start, end };
    if (next === "this_year") range = currentYearPeriod(today);
    if (next === "last_year") {
      const year = Number(today.slice(0, 4)) - 1;
      range = { start: `${year}-01-01`, end: `${year}-12-31` };
    }
    if (next === "last_30" || next === "last_90") {
      const days = next === "last_30" ? 30 : 90;
      range = { start: shiftDate(today, -(days - 1)), end: today };
    }
    setPeriod(next);
    if (next !== "all") {
      setStart(range.start);
      setEnd(range.end);
    }
  }

  const chartData = (data?.buckets ?? []).map((bucket) => ({ ...bucket }));
  const lineData = chartData.map((bucket) => ({
    ...bucket,
    activity_total: bucket.total_checkins,
    activity_discoveries: bucket.new_discoveries,
    cumulative_total: bucket.cumulative_checkins,
    cumulative_discoveries: bucket.cumulative_discoveries,
  }));
  const totalKey = mode === "activity" ? "activity_total" : "cumulative_total";
  const discoveryKey =
    mode === "activity" ? "activity_discoveries" : "cumulative_discoveries";

  return (
    <div className="analytics-page">
      <div className="page-heading">
        <h2>Check-in Analytics</h2>
        <p>
          Explore discoveries and check-in activity over time. Dates are grouped
          in {TIMEZONE}.
        </p>
      </div>
      {urlWarning && (
        <p className="analytics-warning" role="status">
          Invalid analytics URL filters. Showing the current year instead.
        </p>
      )}
      <section className="analytics-filters" aria-label="Reporting filters">
        <label className="filter-control">
          Reporting period
          <select
            value={period}
            onChange={(event) => choosePeriod(event.target.value as Period)}
          >
            <option value="this_year">This year</option>
            <option value="last_year">Last year</option>
            <option value="last_30">Last 30 days</option>
            <option value="last_90">Last 90 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {period !== "all" && (
          <>
            <label className="filter-control">
              Start date
              <input
                aria-label="Start date"
                type="date"
                required
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  setPeriod("custom");
                }}
              />
            </label>
            <label className="filter-control">
              End date
              <input
                aria-label="End date"
                type="date"
                required
                value={end}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setPeriod("custom");
                }}
              />
            </label>
          </>
        )}
        <label className="filter-control">
          Granularity
          <select
            value={granularity}
            onChange={(event) =>
              setGranularity(event.target.value as Granularity)
            }
          >
            <option value="auto">Automatic</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <span className="analytics-timezone">Timezone: {TIMEZONE}</span>
      </section>
      {invalidRange && (
        <p className="analytics-warning" role="alert">
          {!start || !end
            ? "Enter both a start date and an end date."
            : "Start date must be on or before end date."}
        </p>
      )}
      {loading && (
        <p className="analytics-state" role="status">
          Loading analytics…
        </p>
      )}
      {!loading && error && (
        <p className="analytics-state error-state" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && data && data.summary.total_checkins === 0 && (
        <p className="analytics-state">
          No check-ins to display for this reporting period.
        </p>
      )}
      {!loading && !error && data && data.summary.total_checkins > 0 && (
        <>
          <div className="analytics-summary" aria-label="Check-in summary">
            <Metric
              label="Total check-ins"
              value={data.summary.total_checkins}
            />
            <Metric
              label="New discoveries"
              value={data.summary.new_discoveries}
            />
            <Metric
              label="Repeat check-ins"
              value={data.summary.repeat_checkins}
            />
          </div>
          {data.buckets.length === 0 ? (
            <p className="analytics-state">
              No check-ins to display for this reporting period.
            </p>
          ) : (
            <>
              <ChartPanel
                title="Check-in Breakdown"
                description="Each bar decomposes check-ins into first discoveries and repeats."
              >
                <div
                  className="chart-scroll"
                  role="group"
                  aria-label="Stacked bar chart of new discovery and repeat check-ins"
                >
                  <div
                    className="chart-canvas"
                    style={{
                      minWidth:
                        chartData.length > 80
                          ? `${Math.min(chartData.length * 7, 1800)}px`
                          : undefined,
                    }}
                  >
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={chartData} accessibilityLayer>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" minTickGap={24} />
                        <YAxis allowDecimals={false} />
                        <Tooltip content={<ExactTooltip showShare />} />
                        <Legend />
                        <Bar
                          dataKey="new_discoveries"
                          name="New discoveries"
                          stackId="checkins"
                          fill="#15803d"
                        />
                        <Bar
                          dataKey="repeat_checkins"
                          name="Repeat check-ins"
                          stackId="checkins"
                          fill="#2563eb"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </ChartPanel>
              <ChartPanel
                title="Check-in Trends"
                description="Activity is period-only; cumulative lines include your complete history before the selected range."
              >
                <div
                  className="chart-controls"
                  role="group"
                  aria-label="Trend display mode"
                >
                  <button
                    type="button"
                    aria-pressed={mode === "activity"}
                    onClick={() => setMode("activity")}
                  >
                    Activity
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === "cumulative"}
                    onClick={() => setMode("cumulative")}
                  >
                    Cumulative
                  </button>
                  <label>
                    <input
                      type="checkbox"
                      checked={visible.total}
                      onChange={(event) =>
                        setVisible({ ...visible, total: event.target.checked })
                      }
                    />
                    {mode === "activity"
                      ? "All check-ins"
                      : "Cumulative check-ins"}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={visible.discoveries}
                      onChange={(event) =>
                        setVisible({
                          ...visible,
                          discoveries: event.target.checked,
                        })
                      }
                    />
                    {mode === "activity"
                      ? "New discoveries"
                      : "Cumulative discoveries"}
                  </label>
                </div>
                <div
                  className="chart-scroll"
                  role="group"
                  aria-label={`${mode} line chart of check-ins and discoveries`}
                >
                  <div
                    className="chart-canvas"
                    style={{
                      minWidth:
                        chartData.length > 80
                          ? `${Math.min(chartData.length * 7, 1800)}px`
                          : undefined,
                    }}
                  >
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={lineData} accessibilityLayer>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" minTickGap={24} />
                        <YAxis allowDecimals={false} />
                        <Tooltip content={<ExactTooltip />} />
                        <Legend />
                        {visible.total && (
                          <Line
                            type="linear"
                            dataKey={totalKey}
                            name={
                              mode === "activity"
                                ? "All check-ins"
                                : "Cumulative check-ins"
                            }
                            stroke="#2563eb"
                            dot={false}
                            activeDot={{ r: 5 }}
                          />
                        )}
                        {visible.discoveries && (
                          <Line
                            type="linear"
                            dataKey={discoveryKey}
                            name={
                              mode === "activity"
                                ? "New discoveries"
                                : "Cumulative discoveries"
                            }
                            stroke="#15803d"
                            dot={false}
                            activeDot={{ r: 5 }}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </ChartPanel>
            </>
          )}
          <p className="analytics-footnote">
            Distinct beers in this range: {data.summary.distinct_beers}.
            Cumulative baseline before range:{" "}
            {data.cumulative_baseline_checkins} check-ins and{" "}
            {data.cumulative_baseline_discoveries} discoveries.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <h3>{label}</h3>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="analytics-chart-panel">
      <h3>{title}</h3>
      <p className="panel-explanation">{description}</p>
      {children}
    </section>
  );
}
