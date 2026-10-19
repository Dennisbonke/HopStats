import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ActivityMetricSelector from "../components/ActivityMetricSelector";
import { fetchDrinkingTrends } from "../api/analytics";
import CalendarHeatmap from "./CalendarHeatmap";
import WeekdayHourHeatmap from "./WeekdayHourHeatmap";
import { yearIntersection } from "../utils/calendar";
import type { ActivityMetric, ReportingRange } from "../utils/calendar";
import type { DrinkingTrends } from "../api/analytics";

type Props = {
  active: boolean;
  metric: ActivityMetric;
  onMetricChange: (metric: ActivityMetric) => void;
  range: ReportingRange | null;
  year: number | null;
  availableYears: number[];
  onYearChange: (year: number) => void;
  resolvingAllTime: boolean;
  allTimeEmpty: boolean;
  resolveError: string | null;
  periodValidationError: string | null;
  distribution: "total" | "average";
  onDistributionChange: (value: "total" | "average") => void;
};

const TIMEZONE = "Europe/Amsterdam";
type TrendResult = { key: string; data: DrinkingTrends };
type TrendFailure = { key: string; message: string };

export default function DrinkingTrendsView({
  active,
  metric,
  onMetricChange,
  range,
  year,
  availableYears,
  onYearChange,
  resolvingAllTime,
  allTimeEmpty,
  resolveError,
  periodValidationError,
  distribution,
  onDistributionChange,
}: Props) {
  const [result, setResult] = useState<TrendResult | null>(null);
  const [failure, setFailure] = useState<TrendFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [distributionResult, setDistributionResult] =
    useState<TrendResult | null>(null);
  const [distributionFailure, setDistributionFailure] =
    useState<TrendFailure | null>(null);
  const requestedRange = useMemo(
    () => (range && year !== null ? yearIntersection(range, year) : null),
    [range?.start, range?.end, year],
  );
  const requestKey = requestedRange
    ? `${requestedRange.start}/${requestedRange.end}`
    : null;
  const data = result?.key === requestKey ? result.data : null;
  const error = failure?.key === requestKey ? failure.message : null;

  useEffect(() => {
    if (!active || !requestKey) {
      setResult(null);
      setFailure(null);
      setLoading(false);
      return;
    }
    const [requestStart, requestEnd] = requestKey.split("/");

    const controller = new AbortController();
    let current = true;
    setFailure(null);
    setLoading(true);
    fetchDrinkingTrends(requestStart, requestEnd, TIMEZONE, controller.signal)
      .then(
        (response) => current && setResult({ key: requestKey, data: response }),
      )
      .catch((requestError: unknown) => {
        if (!current || controller.signal.aborted) return;
        setFailure({
          key: requestKey ?? "",
          message:
            requestError instanceof Error
              ? requestError.message
              : "Analytics are temporarily unavailable. Please try again.",
        });
      })
      .finally(() => current && setLoading(false));

    return () => {
      current = false;
      controller.abort();
    };
  }, [active, requestKey]);

  const distributionKey = range ? `${range.start}/${range.end}` : null;
  const currentDistribution =
    distributionResult?.key === distributionKey
      ? distributionResult.data
      : null;
  const distributionError =
    distributionFailure?.key === distributionKey
      ? distributionFailure.message
      : null;
  const distributionLoading = Boolean(
    active &&
    distributionKey &&
    distributionResult?.key !== distributionKey &&
    distributionFailure?.key !== distributionKey,
  );
  useEffect(() => {
    if (!active || !distributionKey) {
      setDistributionResult(null);
      setDistributionFailure(null);
      return;
    }
    const [requestStart, requestEnd] = distributionKey.split("/");
    const controller = new AbortController();
    let current = true;
    setDistributionFailure(null);
    fetchDrinkingTrends(
      requestStart,
      requestEnd,
      TIMEZONE,
      controller.signal,
      false,
    )
      .then(
        (response) =>
          current &&
          setDistributionResult({ key: distributionKey, data: response }),
      )
      .catch((requestError: unknown) => {
        if (!current || controller.signal.aborted) return;
        setDistributionFailure({
          key: distributionKey,
          message:
            requestError instanceof Error
              ? requestError.message
              : "Unable to load distributions.",
        });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [active, distributionKey]);

  const overLimit =
    !!error && /range creates more than .* buckets/i.test(error);
  return (
    <section
      id="analytics-trends-panel"
      className="drinking-trends-view"
      role="tabpanel"
      aria-labelledby="analytics-trends-tab"
      tabIndex={0}
      hidden={!active}
      data-metric={metric}
      aria-busy={loading || resolvingAllTime}
    >
      <header className="page-heading">
        <h2>Drinking Trends</h2>
        <p>
          Explore daily check-in activity for a calendar year within the
          selected reporting period.
        </p>
      </header>

      <div className="trends-controls" aria-label="Drinking Trends controls">
        <ActivityMetricSelector value={metric} onChange={onMetricChange} />
        <label className="filter-control distribution-control">
          Distribution
          <select
            aria-label="Distribution display mode"
            value={distribution}
            onChange={(event) =>
              onDistributionChange(event.target.value as "total" | "average")
            }
          >
            <option value="total">Total check-ins</option>
            <option value="average">Average per day / weekday</option>
          </select>
        </label>
        <label className="filter-control">
          Calendar year
          <select
            aria-label="Calendar year"
            value={year ?? ""}
            disabled={!availableYears.length}
            onChange={(event) => onYearChange(Number(event.target.value))}
          >
            {availableYears.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {range && year !== null && (
        <p
          className="analytics-scope"
          aria-label="Drinking Trends reporting period"
        >
          Reporting period · {range.start}–{range.end} · {TIMEZONE}
          <span className="calendar-displayed-year">
            Calendar year · {year}
          </span>
        </p>
      )}

      {resolvingAllTime && (
        <p className="analytics-state" role="status">
          Resolving your full check-in history…
        </p>
      )}
      {!resolvingAllTime && resolveError && (
        <div className="analytics-state error-state" role="alert">
          <p>
            Unable to determine the full-history reporting period:{" "}
            {resolveError}
          </p>
        </div>
      )}
      {!resolvingAllTime && !resolveError && allTimeEmpty && (
        <p className="analytics-state" role="status">
          No check-ins are available for All time.
        </p>
      )}
      {periodValidationError && (
        <p className="analytics-warning" role="alert">
          {periodValidationError}
        </p>
      )}
      {loading && (
        <p className="analytics-state" role="status">
          Loading calendar activity…
        </p>
      )}
      {!loading && overLimit && (
        <div className="analytics-state error-state" role="alert">
          This calendar-year intersection exceeds the configured daily activity
          limit. Choose a shorter shared reporting period. {error}
        </div>
      )}
      {!loading && error && !overLimit && (
        <div className="analytics-state error-state" role="alert">
          <p>{error}</p>
        </div>
      )}
      {!loading && !error && data && year !== null && range && (
        <CalendarHeatmap
          year={year}
          reportingRange={range}
          daily={data.daily}
          metric={metric}
        />
      )}
      <section
        className="distribution-grid"
        aria-label="Check-in distributions"
        aria-busy={distributionLoading}
      >
        {distributionLoading && (
          <p className="analytics-state" role="status">
            Loading distributions…
          </p>
        )}
        {distributionError && (
          <p className="analytics-state error-state" role="alert">
            {distributionError}
          </p>
        )}
        {currentDistribution && !distributionError && (
          <>
            <DistributionChart
              title="Check-ins by Weekday"
              description="Monday through Sunday check-in distribution for the complete reporting period."
              reportingPeriod={`${currentDistribution.start}–${currentDistribution.end}`}
              rows={currentDistribution.weekday.map((row) => ({
                ...row,
                label: [
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                  "Sunday",
                ][row.weekday],
                denominator: row.days_in_period,
              }))}
              metric={metric}
              mode={distribution}
            />
            <DistributionChart
              title="Check-ins by Hour of Day"
              description="Local check-in clock hour (00:00 to 23:00), aggregated across the complete reporting period."
              reportingPeriod={`${currentDistribution.start}–${currentDistribution.end}`}
              rows={currentDistribution.hourly.map((row) => ({
                ...row,
                label: `${String(row.hour).padStart(2, "0")}:00`,
                denominator: inclusiveDays(
                  currentDistribution.start,
                  currentDistribution.end,
                ),
              }))}
              metric={metric}
              mode={distribution}
            />
          </>
        )}
      </section>
      {currentDistribution && !distributionError && distributionKey && (
        <WeekdayHourHeatmap
          key={distributionKey}
          trends={currentDistribution}
          metric={metric}
          mode={distribution}
          reportingPeriod={`${currentDistribution.start}–${currentDistribution.end}`}
        />
      )}
    </section>
  );
}

type DistributionRow = {
  label: string;
  total: number;
  discoveries: number;
  repeats: number;
  denominator: number;
};

function inclusiveDays(start: string, end: string) {
  return (
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86400000,
    ) + 1
  );
}

function DistributionChart({
  title,
  description,
  reportingPeriod,
  rows,
  metric,
  mode,
}: {
  title: string;
  description: string;
  reportingPeriod: string;
  rows: DistributionRow[];
  metric: ActivityMetric;
  mode: "total" | "average";
}) {
  const key =
    metric === "total"
      ? "total"
      : metric === "discoveries"
        ? "discoveries"
        : "repeats";
  const metricName =
    metric === "total"
      ? "All check-ins"
      : metric === "discoveries"
        ? "New discoveries"
        : "Repeat check-ins";
  const data = rows.map((row) => {
    const count = row[key];
    const average = row.denominator > 0 ? count / row.denominator : null;
    return {
      ...row,
      count,
      average,
      value: mode === "total" ? count : (average ?? 0),
    };
  });
  const descriptionId = `${title.replaceAll(" ", "-").toLowerCase()}-description`;
  const isHourly = rows.length > 7;
  return (
    <article className="distribution-chart">
      <h3>{title}</h3>
      <p className="sr-only" id={descriptionId}>
        {description} Reporting period: {reportingPeriod}. Displaying{" "}
        {metricName} as {mode === "total" ? "totals" : "averages"}.
      </p>
      <div
        className="distribution-canvas"
        role="img"
        aria-label={`${title}. ${description} Reporting period: ${reportingPeriod}. ${metricName}, ${mode === "total" ? "totals" : "averages"}.`}
        aria-describedby={descriptionId}
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              interval={isHourly ? 2 : 0}
              tick={{ fontSize: isHourly ? 10 : 12 }}
            />
            <YAxis allowDecimals={mode === "average"} />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as
                  | (DistributionRow & {
                      count: number;
                      average: number | null;
                      value: number;
                    })
                  | undefined;
                if (!active || !row) return null;
                return (
                  <div className="analytics-tooltip">
                    <strong>{row.label}</strong>
                    <div>
                      {mode === "total" ? "Total" : "Average"}:{" "}
                      {mode === "total"
                        ? row.count
                        : (row.average?.toFixed(2) ?? "Unavailable")}
                    </div>
                    <div>Selected count: {row.count}</div>
                    <div>
                      Denominator: {row.denominator}
                      {isHourly
                        ? " calendar days"
                        : " occurrences of this weekday"}
                    </div>
                    <div>
                      Average:{" "}
                      {row.average?.toFixed(2) ??
                        "Unavailable (no occurrences)"}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              name={mode === "total" ? "Check-ins" : "Average"}
              fill="#2f855a"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.every((row) => row.count === 0) && (
        <p className="analytics-state">
          No check-ins in this reporting period.
        </p>
      )}
      <table className="sr-only distribution-data-table">
        <caption>
          {title} · {reportingPeriod} · {metricName} ·{" "}
          {mode === "total" ? "Totals" : "Averages"}
        </caption>
        <thead>
          <tr>
            <th scope="col">{isHourly ? "Local hour" : "Weekday"}</th>
            <th scope="col">{metricName}</th>
            <th scope="col">Denominator</th>
            <th scope="col">Average</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.count}</td>
              <td>
                {row.denominator}
                {isHourly ? " calendar days" : " occurrences"}
              </td>
              <td>
                {row.average === null
                  ? "Unavailable (no occurrences)"
                  : row.average.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="distribution-axis-label">
        {mode === "total"
          ? "Check-ins"
          : isHourly
            ? "Average check-ins per calendar day"
            : "Average check-ins per occurrence of weekday"}
      </p>
    </article>
  );
}
