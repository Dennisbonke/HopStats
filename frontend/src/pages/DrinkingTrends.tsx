import { useEffect, useMemo, useState } from "react";
import ActivityMetricSelector from "../components/ActivityMetricSelector";
import { fetchDrinkingTrends } from "../api/analytics";
import CalendarHeatmap from "./CalendarHeatmap";
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
}: Props) {
  const [result, setResult] = useState<TrendResult | null>(null);
  const [failure, setFailure] = useState<TrendFailure | null>(null);
  const [loading, setLoading] = useState(false);
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
    </section>
  );
}
