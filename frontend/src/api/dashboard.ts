export type MatchCoverage = {
  external_id: number;
  exact: number;
  ambiguous: number;
  unmatched: number;
};

export type DashboardFreshness = {
  checkins_last_imported_at: string | null;
  inventory_last_imported_at: string | null;
  checkins_source_exported_at: string | null;
  inventory_source_exported_at: string | null;
};

export type DashboardData = {
  total_checkins: number;
  unique_beers: number;
  unique_breweries: number;
  unique_styles: number;
  average_personal_rating: number | null;
  rated_checkins: number;
  inventory_units: number;
  unique_inventory_beers: number;
  not_confirmed_checked_in: number;
  match_coverage: MatchCoverage;
  freshness: DashboardFreshness;
};

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await apiFetch("/api/v1/dashboard");
  if (!response.ok) {
    throw new Error(`Unable to load dashboard (${response.status})`);
  }
  return (await response.json()) as DashboardData;
}
import { apiFetch } from "./client";
