import type { MilestoneStatus } from "../api/milestones";

export type MilestoneStatusVariant =
  "success" | "warning" | "error" | "info" | "neutral";

export function milestoneStatusVariant(
  status: MilestoneStatus,
): MilestoneStatusVariant {
  if (status === "overdue") return "error";
  if (status === "scheduled") return "info";
  if (status === "completed" || status === "active") return "success";
  return "neutral";
}
