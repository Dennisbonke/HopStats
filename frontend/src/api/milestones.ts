import { apiFetch } from "./client";

export type MilestoneMetric = "discoveries" | "unique_beers" | "checkins";
export type MilestoneGoalType = "absolute" | "calendar_year" | "incremental";
export type MilestoneStatus =
  | "scheduled"
  | "active"
  | "overdue"
  | "completed"
  | "period_ended"
  | "archived";

export type Milestone = {
  id: number;
  name: string;
  metric: MilestoneMetric;
  goal_type: MilestoneGoalType;
  target: number;
  calendar_year: number | null;
  start_date: string | null;
  deadline_date: string | null;
  timezone: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  current: number;
  remaining: number;
  progress_percent: number;
  status: MilestoneStatus;
  deadline_outcome: "on_time" | "late" | "missed" | "pending" | null;
  completed_at: string | null;
  completed_before_deadline: boolean | null;
  required_per_day: number | null;
  required_per_week: number | null;
  elapsed_per_day: number | null;
  elapsed_per_week: number | null;
  trajectory_difference: number | null;
};

export type MilestoneSummary = {
  active_count: number;
  completed_count: number;
  overdue_count: number;
  milestones: Array<
    Pick<
      Milestone,
      | "id"
      | "name"
      | "metric"
      | "goal_type"
      | "target"
      | "current"
      | "remaining"
      | "progress_percent"
      | "status"
      | "deadline_date"
      | "deadline_outcome"
      | "completed_at"
    >
  >;
};

export type MilestoneInput = {
  name: string;
  metric: MilestoneMetric;
  goal_type: MilestoneGoalType;
  target: number;
  calendar_year: number | null;
  start_date: string | null;
  deadline_date: string | null;
  timezone: string;
};

async function responseError(response: Response): Promise<Error> {
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as {
      detail?: string | Array<{ loc?: Array<string | number>; msg?: string }>;
    };
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail)) {
      message = body.detail
        .map(
          (issue) =>
            `${issue.loc?.at(-1) ?? "Value"}: ${issue.msg ?? "Invalid value"}`,
        )
        .join(". ");
    }
  } catch {
    // Preserve the status message for non-JSON responses.
  }
  return new Error(message);
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as T;
}

export async function fetchMilestones(archived = false): Promise<Milestone[]> {
  const response = await apiFetch(
    `/api/v1/milestones?archived=${String(archived)}`,
  );
  return (await parse<{ milestones: Milestone[] }>(response)).milestones;
}

export async function fetchMilestoneSummary(): Promise<MilestoneSummary> {
  return parse<MilestoneSummary>(await apiFetch("/api/v1/milestones/summary"));
}

export async function fetchMilestone(id: number): Promise<Milestone> {
  return parse<Milestone>(await apiFetch(`/api/v1/milestones/${id}`));
}

export async function createMilestone(
  input: MilestoneInput,
): Promise<Milestone> {
  return parse<Milestone>(
    await apiFetch("/api/v1/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateMilestone(
  id: number,
  input: MilestoneInput,
): Promise<Milestone> {
  return parse<Milestone>(
    await apiFetch(`/api/v1/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function setMilestoneArchived(
  id: number,
  archived: boolean,
): Promise<Milestone> {
  return parse<Milestone>(
    await apiFetch(`/api/v1/milestones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    }),
  );
}

export async function deleteMilestone(id: number): Promise<void> {
  const response = await apiFetch(`/api/v1/milestones/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw await responseError(response);
}
