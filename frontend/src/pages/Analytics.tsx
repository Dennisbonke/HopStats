import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  useLocation,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
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
import LayoutDiagnostics from "../components/LayoutDiagnostics";
import {
  AnalyticsApiError,
  AnalyticsBucket,
  CheckinAnalytics,
  fetchCheckinAnalytics,
} from "../api/analytics";
import DrinkingTrendsView from "./DrinkingTrends";

const TIMEZONE = "Europe/Amsterdam";
type Period =
  "all" | "this_year" | "last_year" | "last_30" | "last_90" | "custom";
type Granularity = "auto" | "day" | "week" | "month";
type ApiGranularity = Granularity | "year";
type AnalyticsView = "overview" | "trends";
type Metric = "total" | "discoveries" | "repeats";
type Zoom = { kind: "year" | "month"; value: string } | null;
type DateRange = { start: string; end: string };
const MAX_VISIBLE_BUCKETS = 45;

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

function mondayOf(value: string) {
  const day = new Date(`${value}T12:00:00Z`);
  return shiftDate(value, -((day.getUTCDay() + 6) % 7));
}

function boundedWindow(
  start: string,
  end: string,
  granularity: "day" | "week",
  page: number,
) {
  const week = granularity === "week";
  const anchor = week ? mondayOf(start) : start;
  const lastAnchor = week ? mondayOf(end) : end;
  const bucketCount =
    Math.floor(
      (Date.parse(`${lastAnchor}T00:00:00Z`) -
        Date.parse(`${anchor}T00:00:00Z`)) /
        (week ? 7 : 1) /
        86400000,
    ) + 1;
  const pageCount = Math.ceil(bucketCount / MAX_VISIBLE_BUCKETS);
  const pageIndex = Math.min(page, Math.max(0, pageCount - 1));
  const pageAnchor = shiftDate(
    anchor,
    pageIndex * MAX_VISIBLE_BUCKETS * (week ? 7 : 1),
  );
  const pageEnd = shiftDate(
    pageAnchor,
    MAX_VISIBLE_BUCKETS * (week ? 7 : 1) - 1,
  );
  return {
    start: start > pageAnchor ? start : pageAnchor,
    end: end < pageEnd ? end : pageEnd,
    pageCount,
    pageIndex,
  };
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

function selectedView(search: URLSearchParams): AnalyticsView {
  return search.get("view") === "trends" ? "trends" : "overview";
}

function selectedMetric(search: URLSearchParams): Metric {
  const metric = search.get("metric");
  return metric === "discoveries" || metric === "repeats" ? metric : "total";
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

function parseWindowPage(value: string | null) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) return 0;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 0;
}

function makeApiParams(
  period: Period,
  start: string,
  end: string,
  granularity: ApiGranularity,
  includeDateRange = false,
) {
  const params = new URLSearchParams({ granularity, timezone: TIMEZONE });
  if (period !== "all" || includeDateRange) {
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
  const navigationType = useNavigationType();
  const locationSearch = new URLSearchParams(location.search);
  const locationFilters = initialParams(locationSearch);
  const locationZoom = parseZoom(locationSearch.get("zoom"));
  const locationPage = parseWindowPage(locationSearch.get("window"));
  const view = selectedView(searchParams);
  const metric = selectedMetric(searchParams);
  const invalidView =
    !!searchParams.get("view") &&
    !["overview", "trends"].includes(searchParams.get("view") ?? "");
  const invalidMetric =
    !!searchParams.get("metric") &&
    !["total", "discoveries", "repeats"].includes(
      searchParams.get("metric") ?? "",
    );
  const layoutDebug = searchParams.get("debugLayout") === "1";
  const initial = useMemo(() => initialParams(searchParams), []);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [granularity, setGranularity] = useState<Granularity>(
    initial.granularity,
  );
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [urlWarning, setUrlWarning] = useState(
    initial.invalid || invalidView || invalidMetric,
  );
  const [allRange, setAllRange] = useState<DateRange | null>(null);
  const [allRangeLoaded, setAllRangeLoaded] = useState(false);
  // Bind the cached bounds to one continuous All-time selection. Leaving and
  // returning forces a fresh M7 metadata request in case imported history changed.
  const previousPeriod = useRef(period);
  const allRangeLoadedForPeriod =
    period === "all" && previousPeriod.current === "all" && allRangeLoaded;
  const allRangeForPeriod = allRangeLoadedForPeriod ? allRange : null;
  const [data, setData] = useState<CheckinAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const [mode, setMode] = useState<"activity" | "cumulative">("activity");
  const [visible, setVisible] = useState({ total: true, discoveries: true });
  // `false` suppresses stale tooltip state during resize; `undefined` leaves
  // normal active-state management to Recharts.
  const [tooltipsEnabled, setTooltipsEnabled] = useState(true);
  const tooltipDismissedByResize = useRef(false);
  const tooltipDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastChartPointer = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState<Zoom>(() =>
    parseZoom(searchParams.get("zoom")),
  );
  const [pageIndex, setPageIndex] = useState(() =>
    parseWindowPage(searchParams.get("window")),
  );
  const overviewTabRef = useRef<HTMLButtonElement>(null);
  const trendsTabRef = useRef<HTMLButtonElement>(null);
  // React Router exposes the POP URL before the restoration effect updates the
  // controlled filters. Do not canonicalize or fetch from stale values meanwhile.
  const popFiltersPending =
    navigationType === "POP" &&
    (period !== locationFilters.period ||
      granularity !== locationFilters.granularity ||
      start !== locationFilters.start ||
      end !== locationFilters.end ||
      JSON.stringify(zoom) !== JSON.stringify(locationZoom) ||
      pageIndex !== locationPage);

  useEffect(() => {
    const dismissTooltip = () => {
      tooltipDismissedByResize.current = true;
      setTooltipsEnabled(false);
      if (tooltipDismissTimer.current) {
        clearTimeout(tooltipDismissTimer.current);
      }
      // Safari can emit hover updates for the stationary pointer while it
      // relayouts the chart. Keep those from reopening the tooltip until the
      // orientation/resize event burst has settled.
      tooltipDismissTimer.current = setTimeout(() => {
        tooltipDismissedByResize.current = false;
        tooltipDismissTimer.current = null;
      }, 250);
    };
    window.addEventListener("resize", dismissTooltip);
    return () => {
      window.removeEventListener("resize", dismissTooltip);
      if (tooltipDismissTimer.current) {
        clearTimeout(tooltipDismissTimer.current);
      }
    };
  }, []);
  const reportStart =
    period === "all" ? (allRange?.start ?? data?.start ?? null) : start;
  const reportEnd =
    period === "all" ? (allRange?.end ?? data?.end ?? null) : end;
  const invalidSelectedDates =
    period !== "all" && (!start || !end || start > end);
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
  const pageRange =
    !zoom &&
    (granularity === "day" || granularity === "week") &&
    reportStart &&
    reportEnd
      ? boundedWindow(reportStart, reportEnd, granularity, pageIndex)
      : null;
  const visibleStart = zoomRange
    ? period === "all"
      ? zoomRange.start
      : start > zoomRange.start
        ? start
        : zoomRange.start
    : (pageRange?.start ?? reportStart ?? start);
  const visibleEnd = zoomRange
    ? period === "all"
      ? zoomRange.end
      : end < zoomRange.end
        ? end
        : zoomRange.end
    : (pageRange?.end ?? reportEnd ?? end);
  const invalidZoom = !!zoom && visibleStart > visibleEnd;
  const invalidRange =
    (period !== "all" && (!start || !end || start > end)) || invalidZoom;
  const needsAllRangeBootstrap =
    period === "all" &&
    !zoom &&
    (granularity === "day" || granularity === "week") &&
    !allRange;
  const needsTrendsAllRangeBootstrap =
    view === "trends" && period === "all" && !allRangeLoadedForPeriod;
  const requestGranularity =
    needsAllRangeBootstrap || needsTrendsAllRangeBootstrap
      ? "auto"
      : period === "all" && !zoom && granularity === "auto"
        ? "auto"
        : actualGranularity;
  const requestRange =
    !needsAllRangeBootstrap && !needsTrendsAllRangeBootstrap && zoomRange
      ? { start: visibleStart, end: visibleEnd }
      : !needsAllRangeBootstrap && !needsTrendsAllRangeBootstrap && pageRange
        ? { start: pageRange.start, end: pageRange.end }
        : null;
  const requestParams = useMemo(
    () =>
      makeApiParams(
        period,
        requestRange?.start ?? start,
        requestRange?.end ?? end,
        requestGranularity,
        requestRange !== null,
      ),
    [
      period,
      start,
      end,
      requestGranularity,
      requestRange?.start,
      requestRange?.end,
      view,
      allRangeLoaded,
    ],
  );

  useEffect(() => {
    if (popFiltersPending) return;
    const urlParams = makeApiParams(period, start, end, granularity);
    urlParams.set("period", period);
    if (view === "trends") urlParams.set("view", "trends");
    if (metric !== "total") urlParams.set("metric", metric);
    if (searchParams.get("debugLayout") === "1") {
      urlParams.set("debugLayout", "1");
    }
    const currentZoom = searchParams.get("zoom");
    if (currentZoom && parseZoom(currentZoom)) {
      urlParams.set("zoom", currentZoom);
    }
    const currentWindow = parseWindowPage(searchParams.get("window"));
    if (currentWindow > 0) urlParams.set("window", String(currentWindow));
    if (urlParams.toString() !== searchParams.toString()) {
      setSearchParams(urlParams, { replace: true });
    }
  }, [
    period,
    start,
    end,
    granularity,
    view,
    metric,
    searchParams,
    setSearchParams,
    popFiltersPending,
  ]);

  useEffect(() => {
    if (navigationType !== "POP") return;
    const parsed = initialParams(new URLSearchParams(location.search));
    setPeriod(parsed.period);
    setGranularity(parsed.granularity);
    setStart(parsed.start);
    setEnd(parsed.end);
    setUrlWarning(parsed.invalid || invalidView || invalidMetric);
  }, [location.search, navigationType]);

  useEffect(() => {
    if (previousPeriod.current === period) return;
    previousPeriod.current = period;
    setAllRange(null);
    setAllRangeLoaded(false);
  }, [period]);

  useEffect(() => {
    const next = parseZoom(new URLSearchParams(location.search).get("zoom"));
    if (JSON.stringify(next) !== JSON.stringify(zoom)) setZoom(next);
    setPageIndex(
      parseWindowPage(new URLSearchParams(location.search).get("window")),
    );
    // URL navigation, including browser Back/Forward, is authoritative here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    const rawZoom = searchParams.get("zoom");
    if (!rawZoom || parseZoom(rawZoom)) return;
    setUrlWarning(true);
    const params = new URLSearchParams(searchParams);
    params.delete("zoom");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (popFiltersPending) return;
    if (!pageRange || pageRange.pageIndex === pageIndex) return;
    setPageIndex(pageRange.pageIndex);
    const params = new URLSearchParams(searchParams);
    if (pageRange.pageIndex > 0) {
      params.set("window", String(pageRange.pageIndex));
    } else {
      params.delete("window");
    }
    setSearchParams(params, { replace: true });
  }, [pageIndex, pageRange, searchParams, setSearchParams, popFiltersPending]);

  useEffect(() => {
    if (popFiltersPending) return;
    if (!invalidZoom) return;
    setZoom(null);
    setUrlWarning(true);
    const params = new URLSearchParams(searchParams);
    params.delete("zoom");
    setSearchParams(params, { replace: true });
  }, [invalidZoom, searchParams, setSearchParams, popFiltersPending]);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    if (popFiltersPending) {
      return () => {
        if (requestSequence.current === requestId) requestSequence.current++;
      };
    }
    if (view === "trends" && period !== "all") {
      setLoading(false);
      setError(null);
      return () => {
        if (requestSequence.current === requestId) requestSequence.current++;
      };
    }
    if (view === "trends" && period === "all" && allRangeLoadedForPeriod) {
      setLoading(false);
      setError(null);
      return () => {
        if (requestSequence.current === requestId) requestSequence.current++;
      };
    }
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
        if (requestSequence.current === requestId) {
          setData(result);
          if (period === "all" && requestRange === null) {
            setAllRangeLoaded(true);
            setAllRange(
              result.start && result.end
                ? { start: result.start, end: result.end }
                : null,
            );
          }
        }
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
  }, [
    period,
    start,
    end,
    invalidRange,
    requestParams,
    view,
    allRangeLoadedForPeriod,
    popFiltersPending,
  ]);

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
    if (next === "all") {
      setAllRange(null);
      setAllRangeLoaded(false);
    }
    setZoom(null);
    setPageIndex(0);
    const params = new URLSearchParams(searchParams);
    params.delete("zoom");
    params.delete("window");
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
    setPageIndex(0);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("zoom", `${next.kind}:${next.value}`);
    else params.delete("zoom");
    params.delete("window");
    setSearchParams(params);
  }

  function updatePage(next: number) {
    setPageIndex(next);
    const params = new URLSearchParams(searchParams);
    if (next > 0) params.set("window", String(next));
    else params.delete("window");
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

  function changeView(next: AnalyticsView) {
    if (next === view) return;
    const params = new URLSearchParams(searchParams);
    if (next === "trends") params.set("view", "trends");
    else params.delete("view");
    setSearchParams(params);
  }

  function navigateViewWithKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowLeft"
        ? view === "overview"
          ? "trends"
          : "overview"
        : event.key === "Home"
          ? "overview"
          : event.key === "End"
            ? "trends"
            : null;
    if (!next) return;
    event.preventDefault();
    changeView(next);
    (next === "overview" ? overviewTabRef : trendsTabRef).current?.focus();
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

  function enableTooltipOnPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const { clientX: x, clientY: y } = event;
    // WebKit can synthesize pointer moves while a viewport is being resized.
    // Do not let those stale hover coordinates immediately reopen the tooltip.
    if (tooltipDismissedByResize.current) {
      lastChartPointer.current = { x, y };
      return;
    }
    const previous = lastChartPointer.current;
    lastChartPointer.current = { x, y };
    if (previous && previous.x === x && previous.y === y) return;
    setTooltipsEnabled(true);
  }

  function enableTooltipFromInteraction() {
    tooltipDismissedByResize.current = false;
    if (tooltipDismissTimer.current) {
      clearTimeout(tooltipDismissTimer.current);
      tooltipDismissTimer.current = null;
    }
    setTooltipsEnabled(true);
  }

  return (
    <div className="analytics-page">
      <div className="page-heading">
        <h2>{view === "overview" ? "Check-in Analytics" : "Analytics"}</h2>
        {view === "overview" && (
          <p>
            Explore discoveries and check-in activity over time. Dates are
            grouped in {TIMEZONE}.
          </p>
        )}
      </div>
      {(urlWarning || invalidView || invalidMetric) && (
        <p className="analytics-warning" role="status">
          Invalid analytics URL filters or drilldown. Using safe defaults
          instead.
        </p>
      )}
      <div
        className="analytics-view-tabs"
        role="tablist"
        aria-label="Analytics views"
      >
        <button
          ref={overviewTabRef}
          id="analytics-overview-tab"
          type="button"
          role="tab"
          aria-selected={view === "overview"}
          aria-controls="analytics-overview-panel"
          tabIndex={view === "overview" ? 0 : -1}
          onClick={() => changeView("overview")}
          onKeyDown={navigateViewWithKeyboard}
        >
          Overview
        </button>
        <button
          ref={trendsTabRef}
          id="analytics-trends-tab"
          type="button"
          role="tab"
          aria-selected={view === "trends"}
          aria-controls="analytics-trends-panel"
          tabIndex={view === "trends" ? 0 : -1}
          onClick={() => changeView("trends")}
          onKeyDown={navigateViewWithKeyboard}
        >
          Drinking Trends
        </button>
      </div>
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
                  setPageIndex(0);
                  const params = new URLSearchParams(searchParams);
                  params.delete("zoom");
                  params.delete("window");
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
                  setPageIndex(0);
                  const params = new URLSearchParams(searchParams);
                  params.delete("zoom");
                  params.delete("window");
                  setSearchParams(params, { replace: true });
                }}
              />
            </label>
          </>
        )}
        {view === "overview" && (
          <label className="filter-control">
            Granularity
            <select
              value={granularity}
              onChange={(event) => {
                setGranularity(event.target.value as Granularity);
                setPageIndex(0);
                const params = new URLSearchParams(searchParams);
                params.delete("window");
                setSearchParams(params, { replace: true });
              }}
            >
              <option value="auto">Automatic</option>
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </label>
        )}
        <span className="analytics-timezone">Timezone: {TIMEZONE}</span>
      </section>
      <DrinkingTrendsView
        active={view === "trends" && !popFiltersPending}
        metric={metric}
        range={
          period === "all"
            ? allRangeForPeriod
            : invalidSelectedDates
              ? null
              : { start, end }
        }
        resolvingAllTime={period === "all" && !allRangeLoadedForPeriod}
        allTimeEmpty={
          period === "all" &&
          allRangeLoadedForPeriod &&
          !allRangeForPeriod &&
          !error
        }
        resolveError={
          period === "all" && !allRangeLoadedForPeriod ? error : null
        }
        periodValidationError={
          invalidSelectedDates
            ? !start || !end
              ? "Enter both a start date and an end date."
              : "Start date must be on or before end date."
            : null
        }
        onChooseThisYear={() => choosePeriod("this_year")}
      />
      <section
        id="analytics-overview-panel"
        className="analytics-overview-panel"
        role="tabpanel"
        aria-labelledby="analytics-overview-tab"
        tabIndex={0}
        hidden={view !== "overview" || popFiltersPending}
      >
        {view === "overview" && (
          <>
            <nav
              className="analytics-breadcrumb"
              aria-label="Analytics drilldown"
            >
              <button
                type="button"
                disabled={!zoom}
                onClick={() => updateZoom(null)}
              >
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
                          updateZoom({
                            kind: "year",
                            value: zoom.value.slice(0, 4),
                          })
                        }
                      >
                        {zoom.value.slice(0, 4)}
                      </button>
                      <span aria-hidden="true">›</span>
                      <strong>
                        {new Date(`${zoom.value}-01T00:00:00Z`).toLocaleString(
                          "en",
                          {
                            month: "long",
                            timeZone: "UTC",
                          },
                        )}
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
            {pageRange && pageRange.pageCount > 1 && !zoom && (
              <nav
                className="analytics-window-nav"
                aria-label="Visible bucket window"
              >
                <button
                  type="button"
                  disabled={pageRange.pageIndex === 0}
                  onClick={() => updatePage(pageRange.pageIndex - 1)}
                >
                  Previous {granularity === "day" ? "45 days" : "45 weeks"}
                </button>
                <span>
                  Showing {visibleStart}–{visibleEnd} · page{" "}
                  {pageRange.pageIndex + 1} of {pageRange.pageCount}
                </span>
                <button
                  type="button"
                  disabled={pageRange.pageIndex + 1 >= pageRange.pageCount}
                  onClick={() => updatePage(pageRange.pageIndex + 1)}
                >
                  Next {granularity === "day" ? "45 days" : "45 weeks"}
                </button>
              </nav>
            )}
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
            {!loading &&
              !error &&
              data &&
              data.summary.total_checkins === 0 && (
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
                      : pageRange && pageRange.pageCount > 1
                        ? `${granularity === "day" ? "Daily" : "Weekly"} buckets · ${visibleStart}–${visibleEnd} of ${reportStart}–${reportEnd}`
                        : `Reporting period · ${data.start ?? start}–${data.end ?? end}`}
                </p>
                <div
                  className="analytics-summary"
                  aria-label="Check-in summary"
                >
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
                        onPointerMove={enableTooltipOnPointerMove}
                        onPointerDown={enableTooltipFromInteraction}
                        onTouchMove={enableTooltipFromInteraction}
                      >
                        <div className="chart-canvas">
                          <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={chartData} accessibilityLayer>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="key" minTickGap={24} />
                              <YAxis allowDecimals={false} />
                              <Tooltip
                                active={tooltipsEnabled ? undefined : false}
                                content={<ExactTooltip showShare />}
                              />
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
                              setVisible({
                                ...visible,
                                total: event.target.checked,
                              })
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
                        onPointerMove={enableTooltipOnPointerMove}
                        onPointerDown={enableTooltipFromInteraction}
                        onTouchMove={enableTooltipFromInteraction}
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
                              <Tooltip
                                active={tooltipsEnabled ? undefined : false}
                                content={<ExactTooltip />}
                              />
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
          </>
        )}
      </section>
      {layoutDebug && <LayoutDiagnostics />}
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
