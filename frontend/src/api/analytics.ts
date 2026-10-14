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
  granularity: "day" | "week" | "month";
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
