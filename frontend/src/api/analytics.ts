import { apiFetch } from "./client";

export class AnalyticsApiError extends Error {}

export type AnalyticsBucket = {
  key: string;
  label: string;
  start: string;
  end: string;
  new_discoveries: number;
  repeat_checkins: number;
  total_checkins: number;
  cumulative_checkins: number;
  cumulative_discoveries: number;
};

export type CheckinAnalytics = {
  start: string | null;
  end: string | null;
  timezone: string;
  granularity: "day" | "week" | "month" | "year";
  summary: {
    total_checkins: number;
    new_discoveries: number;
    repeat_checkins: number;
    distinct_beers: number;
  };
  cumulative_baseline_checkins: number;
  cumulative_baseline_discoveries: number;
  buckets: AnalyticsBucket[];
};

type DrinkingTrendCounts = {
  total: number;
  discoveries: number;
  repeats: number;
};

export type DrinkingTrends = {
  start: string;
  end: string;
  timezone: string;
  daily: Array<DrinkingTrendCounts & { date: string }>;
  weekday: Array<
    DrinkingTrendCounts & { weekday: number; days_in_period: number }
  >;
  hourly: Array<DrinkingTrendCounts & { hour: number }>;
  weekday_hour: Array<DrinkingTrendCounts & { weekday: number; hour: number }>;
};

export async function fetchCheckinAnalytics(
  params: URLSearchParams,
  signal?: AbortSignal,
) {
  const response = await apiFetch(
    `/api/v1/analytics/checkins?${params.toString()}`,
    { signal },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new AnalyticsApiError(
      body?.detail ?? `Analytics request failed (${response.status})`,
    );
  }
  return (await response.json()) as CheckinAnalytics;
}

export async function fetchDrinkingTrends(
  start: string,
  end: string,
  timezone: string,
  signal?: AbortSignal,
  includeDaily = true,
): Promise<DrinkingTrends> {
  const params = new URLSearchParams({ start, end, timezone });
  if (!includeDaily) params.set("daily", "false");
  const response = await apiFetch(
    `/api/v1/analytics/drinking-trends?${params.toString()}`,
    { signal },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new AnalyticsApiError(
      body?.detail ?? `Analytics request failed (${response.status})`,
    );
  }
  return (await response.json()) as DrinkingTrends;
}
