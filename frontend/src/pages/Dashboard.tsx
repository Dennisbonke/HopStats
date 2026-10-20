import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import { fetchCheckinAnalytics } from "../api/analytics";
import { DashboardData, fetchDashboard } from "../api/dashboard";
import { Insight, fetchInsights } from "../api/insights";
import { fetchMilestones, Milestone } from "../api/milestones";

const countFormatter = new Intl.NumberFormat();
const dashboardTimezone = "Europe/Amsterdam";
const DiscoveriesChart = lazy(
  () => import("../components/DashboardDiscoveriesChart"),
);

type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

function useDashboardResource<T>(load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    load()
      .then((result) => active && setData(result))
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "This section is unavailable.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [attempt, load]);

  return {
    data,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}

function count(value: number, available: boolean): string {
  return available ? countFormatter.format(value) : "—";
}

function timestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not imported";
}

function dateOnly(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function localDateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function sixMonthRange(now = new Date()) {
  const parts = localDateParts(now, dashboardTimezone);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const start = new Date(Date.UTC(year, month - 1 - 5, 1))
    .toISOString()
    .slice(0, 10);
  const end = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    start,
    end,
    currentMonth: `${parts.year}-${parts.month}`,
  };
}

function metricNoun(milestone: Milestone): string {
  return milestone.metric === "checkins" ? "check-ins" : "discoveries";
}

function milestoneOrder(left: Milestone, right: Milestone): number {
  const rank: Record<Milestone["status"], number> = {
    active: 0,
    scheduled: 1,
    completed: 2,
    overdue: 3,
    archived: 4,
    period_ended: 5,
  };
  const statusDifference = rank[left.status] - rank[right.status];
  if (statusDifference !== 0) return statusDifference;
  if (left.status === "active" && right.status === "active") {
    const progressDifference = right.progress_percent - left.progress_percent;
    if (progressDifference !== 0) return progressDifference;
  }
  if (left.status === "scheduled" && right.status === "scheduled") {
    const startDifference = (left.start_date ?? "9999-12-31").localeCompare(
      right.start_date ?? "9999-12-31",
    );
    if (startDifference !== 0) return startDifference;
  }
  if (left.status === "completed" && right.status === "completed") {
    const leftCompleted = left.completed_at ?? "";
    const rightCompleted = right.completed_at ?? "";
    const recentDifference = rightCompleted.localeCompare(leftCompleted);
    if (recentDifference !== 0) return recentDifference;
  }
  if (left.status === "overdue" && right.status === "overdue") {
    const deadlineDifference = (
      left.deadline_date ?? "9999-12-31"
    ).localeCompare(right.deadline_date ?? "9999-12-31");
    if (deadlineDifference !== 0) return deadlineDifference;
  }
  return left.id - right.id;
}

export function selectDashboardMilestones(
  milestones: Milestone[],
): Milestone[] {
  return milestones
    .filter(
      (milestone) =>
        milestone.status !== "archived" && milestone.status !== "period_ended",
    )
    .sort(milestoneOrder)
    .slice(0, 3);
}

const milestoneStatusLabel: Record<Milestone["status"], string> = {
  scheduled: "Scheduled",
  active: "In progress",
  overdue: "Overdue",
  completed: "Completed",
  period_ended: "Period ended",
  archived: "Archived",
};

function MetricCard({
  title,
  value,
  detail,
  primary = false,
}: {
  title: string;
  value: string;
  detail?: string;
  primary?: boolean;
}) {
  return (
    <article className={`dashboard-metric-card${primary ? " primary" : ""}`}>
      <h2>{title}</h2>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

function SectionState({
  loading,
  error,
  retry,
  label,
}: {
  loading: boolean;
  error: string | null;
  retry?: () => void;
  label: string;
}) {
  if (loading) {
    return (
      <p className="dashboard-inline-state" role="status" aria-busy="true">
        Loading {label}…
      </p>
    );
  }
  if (error) {
    return (
      <div
        className="dashboard-inline-state dashboard-inline-error"
        role="alert"
      >
        <span>{error}</span>
        {retry && (
          <button type="button" className="secondary-button" onClick={retry}>
            Retry {label}
          </button>
        )}
      </div>
    );
  }
  return null;
}

function FeaturedMilestone({ milestone }: { milestone: Milestone }) {
  const progress = Math.max(0, Math.min(100, milestone.progress_percent));
  return (
    <Link
      className="featured-milestone"
      to={`/milestones/${milestone.id}`}
      aria-label={`Featured milestone: ${milestone.name}`}
    >
      <div className="featured-milestone-topline">
        <span>Featured milestone</span>
        <span className={`dashboard-milestone-status ${milestone.status}`}>
          {milestoneStatusLabel[milestone.status]}
        </span>
        <span>{milestone.progress_percent.toLocaleString()}%</span>
      </div>
      <h3>{milestone.name}</h3>
      <p className="featured-milestone-count">
        <strong>{countFormatter.format(milestone.current)}</strong>
        <span>
          of {countFormatter.format(milestone.target)} {metricNoun(milestone)}
        </span>
      </p>
      <progress
        max={100}
        value={progress}
        aria-label={`${milestone.name} progress`}
      />
      <div className="featured-milestone-bottomline">
        <span>{countFormatter.format(milestone.remaining)} remaining</span>
        {milestone.deadline_date && (
          <span>Due {dateOnly(milestone.deadline_date)}</span>
        )}
      </div>
    </Link>
  );
}

function MilestoneSection({ resource }: { resource: Resource<Milestone[]> }) {
  const milestones = useMemo(
    () => selectDashboardMilestones(resource.data ?? []),
    [resource.data],
  );
  const [featured, ...additional] = milestones;

  return (
    <section
      className="dashboard-panel dashboard-milestones"
      aria-labelledby="dashboard-milestones-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-eyebrow">Goals in progress</p>
          <h2 id="dashboard-milestones-title">Milestones</h2>
        </div>
        <Link to="/milestones">View all milestones</Link>
      </div>
      <SectionState
        loading={resource.loading}
        error={resource.error}
        retry={resource.retry}
        label="milestones"
      />
      {!resource.loading && !resource.error && !featured && (
        <div className="dashboard-empty-compact">
          <p>No current milestones to feature.</p>
          <Link to="/milestones">Create a milestone</Link>
        </div>
      )}
      {!resource.loading && !resource.error && featured && (
        <>
          <FeaturedMilestone milestone={featured} />
          {additional.length > 0 && (
            <div className="dashboard-milestone-list">
              {additional.map((milestone) => {
                const progress = Math.max(
                  0,
                  Math.min(100, milestone.progress_percent),
                );
                return (
                  <Link
                    to={`/milestones/${milestone.id}`}
                    className="dashboard-milestone-row"
                    key={milestone.id}
                  >
                    <span className="dashboard-milestone-row-name">
                      {milestone.name}
                    </span>
                    <span className="dashboard-milestone-row-count">
                      {countFormatter.format(milestone.current)} /{" "}
                      {countFormatter.format(milestone.target)}
                    </span>
                    <progress
                      max={100}
                      value={progress}
                      aria-label={`${milestone.name} progress`}
                    />
                    <span>{milestone.progress_percent.toLocaleString()}%</span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function positiveInsight(insight: Insight): boolean {
  if (
    insight.type === "milestone_completed" ||
    insight.type === "milestone_near" ||
    insight.type === "milestone_ahead"
  ) {
    return true;
  }
  return insight.category === "activity" && Number(insight.data.difference) > 0;
}

function InsightCard({ insight }: { insight: Insight }) {
  const className = `dashboard-insight${positiveInsight(insight) ? " positive" : ""}`;
  const content = (
    <>
      <h3>{insight.title}</h3>
      <p>{insight.description}</p>
    </>
  );
  return insight.href ? (
    <Link className={className} to={insight.href}>
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}

function InsightsSection({ resource }: { resource: Resource<Insight[]> }) {
  const insights = resource.data?.slice(0, 3) ?? [];
  return (
    <section
      className="dashboard-panel dashboard-insights"
      aria-labelledby="dashboard-insights-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="dashboard-eyebrow">From your activity</p>
          <h2 id="dashboard-insights-title">A few things to notice</h2>
        </div>
        <Link to="/analytics">Explore analytics</Link>
      </div>
      <SectionState
        loading={resource.loading}
        error={resource.error}
        retry={resource.retry}
        label="insights"
      />
      {!resource.loading && !resource.error && insights.length === 0 && (
        <p className="dashboard-empty-compact">
          No standout observations yet. Your insights will grow as you import
          more check-ins and milestones.
        </p>
      )}
      {!resource.loading && !resource.error && insights.length > 0 && (
        <div className="dashboard-insight-list">
          {insights.map((insight) => (
            <InsightCard insight={insight} key={insight.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function InventoryHealth({
  data,
  hasInventory,
}: {
  data: DashboardData;
  hasInventory: boolean;
}) {
  const coverageTotal = Object.values(data.match_coverage).reduce(
    (sum, value) => sum + value,
    0,
  );
  return (
    <details className="dashboard-health">
      <summary>Inventory &amp; data health</summary>
      <div className="dashboard-health-grid">
        <section className="dashboard-panel">
          <h3>Inventory snapshot</h3>
          <div className="dashboard-secondary-stats">
            <MetricCard
              title="Inventory units"
              value={count(data.inventory_units, hasInventory)}
            />
            <MetricCard
              title="Unique inventory beers"
              value={count(data.unique_inventory_beers, hasInventory)}
            />
            <MetricCard
              title="Not confirmed checked in"
              value={count(data.not_confirmed_checked_in, hasInventory)}
            />
          </div>
          <p className="panel-explanation">
            Unmatched or ambiguous inventory may have been tried previously but
            cannot be reliably linked to an imported check-in.
          </p>
        </section>
        <section className="dashboard-panel">
          <h3>Inventory matching confidence</h3>
          <p className="panel-explanation">
            {!hasInventory
              ? "Import a stash export to see inventory identity matching."
              : coverageTotal === 0
                ? "No inventory beer identities are available yet."
                : "Each distinct inventory beer identity appears in exactly one category."}
          </p>
          <div className="coverage-list">
            <div>
              <span>Confirmed by external ID</span>
              <strong>
                {count(data.match_coverage.external_id, hasInventory)}
              </strong>
            </div>
            <div>
              <span>Confirmed by exact name and brewery</span>
              <strong>{count(data.match_coverage.exact, hasInventory)}</strong>
            </div>
            <div>
              <span>Ambiguous</span>
              <strong>
                {count(data.match_coverage.ambiguous, hasInventory)}
              </strong>
            </div>
            <div>
              <span>Unmatched</span>
              <strong>
                {count(data.match_coverage.unmatched, hasInventory)}
              </strong>
            </div>
          </div>
        </section>
        <section className="dashboard-panel">
          <h3>Dataset freshness</h3>
          <p className="panel-explanation">
            These timestamps show when HopStats imported data, not when Untappd
            created the export.
          </p>
          <dl className="freshness-list">
            <div>
              <dt>Check-ins last imported</dt>
              <dd>{timestamp(data.freshness.checkins_last_imported_at)}</dd>
            </div>
            <div>
              <dt>Inventory last imported</dt>
              <dd>{timestamp(data.freshness.inventory_last_imported_at)}</dd>
            </div>
            {data.freshness.checkins_source_exported_at && (
              <div>
                <dt>Check-in source exported</dt>
                <dd>{timestamp(data.freshness.checkins_source_exported_at)}</dd>
              </div>
            )}
            {data.freshness.inventory_source_exported_at && (
              <div>
                <dt>Inventory source exported</dt>
                <dd>
                  {timestamp(data.freshness.inventory_source_exported_at)}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </details>
  );
}

function DashboardPanel({ children }: { children: ReactNode }) {
  return <section className="dashboard-panel">{children}</section>;
}

export default function Dashboard() {
  const dashboard = useDashboardResource(fetchDashboard);
  const milestones = useDashboardResource(fetchMilestones);
  const insights = useDashboardResource(fetchInsights);
  const range = useMemo(() => sixMonthRange(), []);
  const chartParams = useMemo(
    () =>
      new URLSearchParams({
        start: range.start,
        end: range.end,
        granularity: "month",
        timezone: dashboardTimezone,
      }),
    [range],
  );
  const loadChart = useCallback(
    async () => (await fetchCheckinAnalytics(chartParams)).buckets,
    [chartParams],
  );
  const chart = useDashboardResource(loadChart);
  const data = dashboard.data;
  const hasCheckins: boolean | null = data
    ? Boolean(data.freshness.checkins_last_imported_at) ||
      data.total_checkins > 0
    : null;
  const hasInventory = data
    ? Boolean(data.freshness.inventory_last_imported_at) ||
      data.inventory_units > 0 ||
      data.unique_inventory_beers > 0
    : false;
  const averageRating = data?.average_personal_rating;

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <p className="dashboard-eyebrow">HopStats</p>
        <h1>Your beer journey</h1>
        <p>Discoveries, milestones, and the moments in between.</p>
      </div>

      <section className="dashboard-primary" aria-label="Lifetime statistics">
        <MetricCard
          title="Unique beers"
          value={data ? count(data.unique_beers, hasCheckins === true) : "—"}
          detail="Distinct beers checked in"
          primary
        />
        <MetricCard
          title="Total check-ins"
          value={data ? count(data.total_checkins, hasCheckins === true) : "—"}
          detail="Your imported history"
          primary
        />
        <MetricCard
          title="Unique breweries"
          value={
            data ? count(data.unique_breweries, hasCheckins === true) : "—"
          }
          detail="Across your check-ins"
          primary
        />
        <MetricCard
          title="Unique styles"
          value={data ? count(data.unique_styles, hasCheckins === true) : "—"}
          detail="Across your check-ins"
          primary
        />
      </section>
      <SectionState
        loading={dashboard.loading}
        error={dashboard.error}
        retry={dashboard.retry}
        label="statistics"
      />
      {data && !hasCheckins && !hasInventory && (
        <div className="dashboard-empty" role="status">
          <strong>Your dashboard is ready.</strong>
          <p>
            Import check-ins or an inventory export to see your beer journey.
          </p>
          <Link className="button-link" to="/imports">
            Go to Imports
          </Link>
        </div>
      )}

      <div className="dashboard-feature-grid">
        <MilestoneSection resource={milestones} />
        <InsightsSection resource={insights} />
      </div>

      <Suspense
        fallback={
          <section className="dashboard-panel" role="status" aria-busy="true">
            Loading monthly discoveries…
          </section>
        }
      >
        <DiscoveriesChart
          resource={chart}
          hasCheckins={hasCheckins}
          availabilityLoading={dashboard.loading}
          currentMonth={range.currentMonth}
          endDate={range.end}
        />
      </Suspense>

      <DashboardPanel>
        <p className="dashboard-eyebrow">Your ratings</p>
        <h2>Average personal rating</h2>
        <strong className="dashboard-secondary-value">
          {data
            ? hasCheckins
              ? averageRating == null
                ? "No ratings"
                : averageRating.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
              : "—"
            : "—"}
        </strong>
        <p className="panel-explanation">
          {data
            ? `${count(data.rated_checkins, hasCheckins === true)} rated check-ins`
            : "Rating statistics are loading."}
        </p>
        <p className="panel-explanation">
          Only your non-empty check-in ratings are included; Untappd global
          ratings are excluded.
        </p>
      </DashboardPanel>

      {data && <InventoryHealth data={data} hasInventory={hasInventory} />}
      {dashboard.error && !data && (
        <DashboardPanel>
          <h2>Statistics could not be loaded</h2>
          <p className="panel-explanation">
            Other dashboard sections are still available. You can retry the
            lifetime statistics above or visit{" "}
            <Link to="/imports">Imports</Link>.
          </p>
        </DashboardPanel>
      )}
    </div>
  );
}
