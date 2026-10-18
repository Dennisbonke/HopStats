import { useEffect, useState } from "react";
import { DrinkingTrends, fetchDrinkingTrends } from "../api/analytics";

type DateRange = { start: string; end: string };
type Metric = "total" | "discoveries" | "repeats";

type Props = {
  active: boolean;
  metric: Metric;
  range: DateRange | null;
  resolvingAllTime: boolean;
  allTimeEmpty: boolean;
  resolveError: string | null;
  periodValidationError: string | null;
  onChooseThisYear: () => void;
};

const TIMEZONE = "Europe/Amsterdam";

export default function DrinkingTrendsView({
  active,
  metric,
  range,
  resolvingAllTime,
  allTimeEmpty,
  resolveError,
  periodValidationError,
  onChooseThisYear,
}: Props) {
  const [data, setData] = useState<DrinkingTrends | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !range) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let current = true;
    setData(null);
    setError(null);
    setLoading(true);
    fetchDrinkingTrends(range.start, range.end, TIMEZONE, controller.signal)
      .then((result) => current && setData(result))
      .catch((requestError: unknown) => {
        if (!current || controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Analytics are temporarily unavailable. Please try again.",
        );
      })
      .finally(() => current && setLoading(false));

    return () => {
      current = false;
      controller.abort();
    };
  }, [active, range?.start, range?.end]);

  const overLimit =
    !!error && /range creates more than .* buckets/i.test(error);
  const isEmpty = !!data && data.daily.every((day) => day.total === 0);

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
          Activity patterns by calendar date, weekday, and local check-in time.
          The visualizations are coming in upcoming Analytics milestones.
        </p>
      </header>

      {range && (
        <p
          className="analytics-scope"
          aria-label="Drinking Trends reporting period"
        >
          Reporting period · {range.start}–{range.end} · {TIMEZONE}
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
          Loading drinking trends…
        </p>
      )}
      {!loading && overLimit && (
        <div className="analytics-state error-state" role="alert">
          <p>
            This reporting period is longer than the daily activity limit
            supports. Your selected period is unchanged; choose a shorter period
            to view Drinking Trends.
          </p>
          <button type="button" onClick={onChooseThisYear}>
            Choose this year instead
          </button>
        </div>
      )}
      {!loading && error && !overLimit && (
        <div className="analytics-state error-state" role="alert">
          <p>{error}</p>
        </div>
      )}
      {!loading && !error && range && data && isEmpty && (
        <p className="analytics-state" role="status">
          No check-ins to display for this reporting period.
        </p>
      )}
      {!loading && !error && range && data && !isEmpty && (
        <p className="analytics-state" role="status">
          Drinking Trends data is ready for this reporting period. The activity
          visualizations will be added in upcoming milestones.
        </p>
      )}

      <section
        className="analytics-chart-panel trends-placeholder"
        aria-label="Upcoming visualizations"
      >
        <h3>Coming next</h3>
        <ul>
          <li>Calendar activity heatmap</li>
          <li>Weekday and hour-of-day distributions</li>
          <li>Weekday-by-hour activity heatmap</li>
        </ul>
      </section>
    </section>
  );
}
