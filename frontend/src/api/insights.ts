import { apiFetch } from "./client";

export type InsightType =
  | "milestone_completed"
  | "milestone_near"
  | "milestone_ahead"
  | "milestone_below"
  | "milestone_deadline_passed"
  | "discovery_trend"
  | "checkin_trend";

export type Insight = {
  id: string;
  type: InsightType;
  category: "milestone" | "activity";
  priority: number;
  title: string;
  description: string;
  href: string | null;
  data: Record<string, number | string>;
};

export async function fetchInsights(): Promise<Insight[]> {
  const response = await apiFetch("/api/v1/insights");
  if (!response.ok) {
    throw new Error(`Unable to load insights (${response.status})`);
  }
  const body = (await response.json()) as { insights: Insight[] };
  return body.insights;
}
