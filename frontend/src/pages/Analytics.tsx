import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
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
type ApiGranularity = Granularity | "year";
type Zoom = { kind: "year" | "month"; value: string } | null;

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
): Exclude<ApiGranularity, "auto"> {
  const days =
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000 +
    1;
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
  return days <= 45 ? "day" : years > 0 ? "year" : "month";
}

function parseZoom(value: string | null): Zoom {
  if (!value) return null;
  const year = value.match(/^year:(\d{4})$/);
  if (year) return { kind: "year", value: year[1] };
  const month = value.match(/^month:(\d{4}-(0[1-9]|1[0-2]))$/);
  if (month) return { kind: "month", value: month[1] };
  return null;
}

function makeApiParams(
  period: Period,
  start: string,
  end: string,
  granularity: ApiGranularity,
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
  const location = useLocation();
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
  const [zoom, setZoom] = useState<Zoom>(() =>
    parseZoom(searchParams.get("zoom")),
  );
  const automaticGranularity = zoom
    ? zoom.kind === "year"
      ? "month"
      : "day"
    : period === "all" && data
      ? data.granularity
      : suggestedGranularity(start, end);
  const actualGranularity =
    granularity === "auto" ? automaticGranularity : granularity;
  const zoomRange = zoom
    ? zoom.kind === "year"
      ? { start: `${zoom.value}-01-01`, end: `${zoom.value}-12-31` }
      : {
          start: `${zoom.value}-01`,
          end: `${zoom.value}-${String(new Date(Date.UTC(Number(zoom.value.slice(0, 4)), Number(zoom.value.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`,
        }
    : null;
  const visibleStart = zoomRange
    ? period === "all"
      ? zoomRange.start
      : start > zoomRange.start
        ? start
        : zoomRange.start
    : start;
  const visibleEnd = zoomRange
    ? period === "all"
      ? zoomRange.end
      : end < zoomRange.end
        ? end
        : zoomRange.end
    : end;
  const invalidZoom = !!zoom && visibleStart > visibleEnd;
  const invalidRange =
    (period !== "all" && (!start || !end || start > end)) || invalidZoom;
  const requestGranularity =
    period === "all" && !zoom && granularity === "auto"
      ? "auto"
      : actualGranularity;
  const requestParams = useMemo(
    () =>
      makeApiParams(
        zoom ? "custom" : period,
        zoom ? visibleStart : start,
        zoom ? visibleEnd : end,
        requestGranularity,
      ),
    [period, start, end, requestGranularity, zoom, visibleStart, visibleEnd],
  );

  useEffect(() => {
    const urlParams = makeApiParams(period, start, end, granularity);
    urlParams.set("period", period);
    const currentZoom = searchParams.get("zoom");
    if (currentZoom) urlParams.set("zoom", currentZoom);
    if (urlParams.toString() !== searchParams.toString()) {
      setSearchParams(urlParams, { replace: true });
    }
  }, [period, start, end, granularity, searchParams, setSearchParams]);

  useEffect(() => {
    const next = parseZoom(new URLSearchParams(location.search).get("zoom"));
    if (JSON.stringify(next) !== JSON.stringify(zoom)) setZoom(next);
    // URL navigation, including browser Back/Forward, is authoritative here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (!invalidZoom) return;
    setZoom(null);
    setUrlWarning(true);
    const params = new URLSearchParams(searchParams);
    params.delete("zoom");
    setSearchParams(params, { replace: true });
  }, [invalidZoom, searchParams, setSearchParams]);

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
    setZoom(null);
    const params = new URLSearchParams(searchParams);
    params.delete("zoom");
    setSearchParams(params, { replace: true });
    if (next !== "all") {
      setStart(range.start);
      setEnd(range.end);
    }
  }

  function drillTo(bucket: AnalyticsBucket) {
    if (actualGranularity === "year") {
      updateZoom({ kind: "year", value: bucket.key });
    } else if (actualGranularity === "month") {
      updateZoom({ kind: "month", value: bucket.key });
    }
  }

  function updateZoom(next: Zoom) {
    setZoom(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("zoom", `${next.kind}:${next.value}`);
    else params.delete("zoom");
    setSearchParams(params);
  }

  function drillFromChart(
    state: { activeTooltipIndex?: number | string | null } | undefined,
  ) {
    const index = state?.activeTooltipIndex;
    const bucket = typeof index === "number" ? chartData[index] : undefined;
    if (bucket) drillTo(bucket);
  }

  const canDrill =
    actualGranularity === "year" || actualGranularity === "month";

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
          Invalid analytics URL filters or drilldown. Showing a valid overview
          instead.
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
                  setZoom(null);
                  const params = new URLSearchParams(searchParams);
                  params.delete("zoom");
                  setSearchParams(params, { replace: true });
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
                  setZoom(null);
                  const params = new URLSearchParams(searchParams);
                  params.delete("zoom");
                  setSearchParams(params, { replace: true });
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
      <nav className="analytics-breadcrumb" aria-label="Analytics drilldown">
        <button type="button" disabled={!zoom} onClick={() => updateZoom(null)}>
          Overview
        </button>
        {zoom && (
          <>
            <span aria-hidden="true">›</span>
            {zoom.kind === "year" ? (
              <strong>{zoom.value}</strong>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() =>
                    updateZoom({ kind: "year", value: zoom.value.slice(0, 4) })
                  }
                >
                  {zoom.value.slice(0, 4)}
                </button>
                <span aria-hidden="true">›</span>
                <strong>
                  {new Date(`${zoom.value}-01T00:00:00Z`).toLocaleString("en", {
                    month: "long",
                    timeZone: "UTC",
                  })}
                </strong>
              </>
            )}
          </>
        )}
        {zoom?.kind === "month" && (
          <span className="deepest-zoom">
            {actualGranularity === "day"
              ? "Daily detail · deepest level"
              : `${actualGranularity[0].toUpperCase()}${actualGranularity.slice(1)} buckets · month selected`}
          </span>
        )}
        {zoom?.kind === "year" && (
          <span className="deepest-zoom">Monthly view</span>
        )}
      </nav>
      {invalidRange && (
        <p className="analytics-warning" role="alert">
          {invalidZoom
            ? "This drilldown period is outside the reporting range. Showing the overview instead."
            : !start || !end
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
        <div className="analytics-state error-state" role="alert">
          <p>{error}</p>
          {(error.includes("coarser granularity") ||
            error.includes("more than")) && (
            <button type="button" onClick={() => setGranularity("auto")}>
              Switch to automatic overview
            </button>
          )}
        </div>
      )}
      {!loading && !error && data && data.summary.total_checkins === 0 && (
        <p className="analytics-state">
          No check-ins to display for this reporting period.
        </p>
      )}
      {!loading && !error && data && data.summary.total_checkins > 0 && (
        <>
          <p className="analytics-scope">
            {zoom?.kind === "month"
              ? `${new Date(`${zoom.value}-01T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" })} ${zoom.value.slice(0, 4)} · ${visibleStart}–${visibleEnd}`
              : zoom?.kind === "year"
                ? `${zoom.value} · ${visibleStart}–${visibleEnd}`
                : `Reporting period · ${data.start ?? start}–${data.end ?? end}`}
          </p>
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
                  <div className="chart-canvas">
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
                          cursor={canDrill ? "pointer" : "default"}
                          onClick={(entry) =>
                            drillTo(entry.payload as AnalyticsBucket)
                          }
                        />
                        <Bar
                          dataKey="repeat_checkins"
                          name="Repeat check-ins"
                          stackId="checkins"
                          fill="#2563eb"
                          cursor={canDrill ? "pointer" : "default"}
                          onClick={(entry) =>
                            drillTo(entry.payload as AnalyticsBucket)
                          }
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {canDrill && (
                  <BucketActions buckets={chartData} onSelect={drillTo} />
                )}
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
                  <div className="chart-canvas">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart
                        data={lineData}
                        accessibilityLayer
                        onClick={drillFromChart}
                      >
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
                {canDrill && (
                  <BucketActions buckets={chartData} onSelect={drillTo} />
                )}
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

function BucketActions({
  buckets,
  onSelect,
}: {
  buckets: AnalyticsBucket[];
  onSelect: (bucket: AnalyticsBucket) => void;
}) {
  return (
    <div className="bucket-actions" aria-label="Available drilldown periods">
      {buckets.map((bucket) => (
        <button
          key={bucket.key}
          type="button"
          onClick={() => onSelect(bucket)}
          aria-label={`Open ${bucket.label}`}
          title={`Open ${bucket.label}`}
        >
          {bucket.label}
        </button>
      ))}
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
