import { expect, test } from "vitest";
import { milestoneStatusVariant } from "./milestones";

test.each([
  ["scheduled", "info"],
  ["active", "success"],
  ["overdue", "error"],
  ["completed", "success"],
  ["period_ended", "neutral"],
  ["archived", "neutral"],
] as const)("maps %s milestones to the %s badge", (status, variant) => {
  expect(milestoneStatusVariant(status)).toBe(variant);
});
