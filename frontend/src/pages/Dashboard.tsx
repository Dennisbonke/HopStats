import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardData, fetchDashboard } from "../api/dashboard";

const countFormatter = new Intl.NumberFormat();

function count(value: number, available: boolean): string {
  return available ? countFormatter.format(value) : "—";
}

function timestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not imported";
}

function MetricCard({
  title,
  value,
  detail,
  explanation,
}: {
  title: string;
  value: string;
  detail?: string;
  explanation?: string;
}) {
  return (
    <article className="metric-card" title={explanation}>
      <h3>{title}</h3>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const hasCheckins = data.total_checkins > 0;
  const hasInventory =
    data.unique_inventory_beers > 0 || data.inventory_units > 0;
  const average =
    data.average_personal_rating === null
      ? "No ratings"
      : data.average_personal_rating.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const coverageTotal = Object.values(data.match_coverage).reduce(
    (sum, value) => sum + value,
    0,
  );

  return (
    <>
      {!hasCheckins && !hasInventory && (
        <div className="empty-dashboard">
          <strong>Your dashboard is ready.</strong>
          <p>Import a check-in or stash export to see your HopStats metrics.</p>
          <Link className="button-link" to="/imports">
            Go to Imports
          </Link>
        </div>
      )}
      <div className="metric-grid">
        <MetricCard
          title="Total check-ins"
          value={count(data.total_checkins, hasCheckins)}
        />
        <MetricCard
          title="Unique beers"
          value={count(data.unique_beers, hasCheckins)}
        />
        <MetricCard
          title="Unique breweries"
          value={count(data.unique_breweries, hasCheckins)}
        />
        <MetricCard
          title="Unique styles"
          value={count(data.unique_styles, hasCheckins)}
        />
        <MetricCard
          title="Average personal rating"
          value={hasCheckins ? average : "—"}
          detail={`${count(data.rated_checkins, hasCheckins)} rated check-ins`}
          explanation="Only your non-empty check-in ratings are included; Untappd global ratings are excluded."
        />
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
          explanation="Unmatched or ambiguous inventory may have been tried previously but cannot be reliably linked to an imported check-in."
        />
      </div>

      <div className="dashboard-lower-grid">
        <section className="dashboard-panel">
          <h3>Inventory matching confidence</h3>
          <p className="panel-explanation">
            {coverageTotal === 0
              ? "No inventory beer identities are available yet."
              : "Each distinct inventory beer identity appears in exactly one category."}
          </p>
          <div className="coverage-list">
            <div>
              <span>Confirmed by external ID</span>
              <strong>
                {countFormatter.format(data.match_coverage.external_id)}
              </strong>
            </div>
            <div>
              <span>Confirmed by exact name and brewery</span>
              <strong>
                {countFormatter.format(data.match_coverage.exact)}
              </strong>
            </div>
            <div>
              <span>Ambiguous</span>
              <strong>
                {countFormatter.format(data.match_coverage.ambiguous)}
              </strong>
            </div>
            <div>
              <span>Unmatched</span>
              <strong>
                {countFormatter.format(data.match_coverage.unmatched)}
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
    </>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch(() => setError("Dashboard data is temporarily unavailable."));
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <h2>Dashboard</h2>
        <p>A lightweight view of your imported check-ins and current stash.</p>
      </div>
      {!data && !error && (
        <section className="dashboard-state">Loading dashboard…</section>
      )}
      {error && (
        <section className="dashboard-state error-state">
          <strong>{error}</strong>
          <p>
            Check the backend connection or visit{" "}
            <Link to="/imports">Imports</Link> to refresh your data.
          </p>
        </section>
      )}
      {data && <DashboardContent data={data} />}
    </div>
  );
}
