import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import Milestones from "./pages/Milestones";
import { Milestone } from "./api/milestones";

function milestone(
  id: number,
  status: Milestone["status"],
  overrides: Partial<Milestone> = {},
): Milestone {
  return {
    id,
    name: `Goal ${id}`,
    metric: "discoveries",
    goal_type: "absolute",
    target: 10,
    calendar_year: null,
    start_date: null,
    deadline_date: null,
    timezone: "Europe/Amsterdam",
    archived_at: status === "archived" ? "2026-01-02T00:00:00Z" : null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    current: 2,
    remaining: 8,
    progress_percent: 20,
    status,
    deadline_outcome: null,
    completed_at: null,
    completed_before_deadline: null,
    required_per_day: null,
    required_per_week: null,
    elapsed_per_day: null,
    elapsed_per_week: null,
    trajectory_difference: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("overview renders status counts, filters, period-ended status, and clamps visual progress", async () => {
  const goals = [
    milestone(1, "active", {
      metric: "unique_beers",
      current: 12,
      progress_percent: 120,
    }),
    milestone(2, "scheduled"),
    milestone(3, "completed"),
    milestone(4, "overdue"),
    milestone(5, "period_ended", {
      goal_type: "calendar_year",
      calendar_year: 2024,
    }),
  ];
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ milestones: goals }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/milestones"]}>
      <Milestones />
    </MemoryRouter>,
  );

  expect(await screen.findByText("Goal 1")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Goal 1/ })).toHaveAttribute(
    "href",
    "/milestones/1",
  );
  expect(screen.getByText("120%")).toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: "Goal 1 progress" }),
  ).toHaveAttribute("value", "100");
  expect(screen.getByText("Period ended")).toBeInTheDocument();
  expect(
    screen.getByText("This calendar-year counting window has closed."),
  ).toBeInTheDocument();
  const counts = within(screen.getByLabelText("Milestone counts"));
  expect(counts.getByText("In progress").parentElement).toHaveTextContent("1");
  expect(counts.getByText("Scheduled").parentElement).toHaveTextContent("1");

  fireEvent.click(screen.getByRole("button", { name: "Completed" }));
  expect(screen.getByText("Goal 3")).toBeInTheDocument();
  expect(screen.queryByText("Goal 1")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Goal 3/ })).toHaveAttribute(
    "href",
    "/milestones/3",
  );
});

test("overview handles empty, error, retry, and archived filter", async () => {
  let requests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("archived=true")) {
      return {
        ok: true,
        json: async () => ({ milestones: [milestone(9, "archived")] }),
      };
    }
    requests += 1;
    if (requests === 1)
      return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, json: async () => ({ milestones: [] }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <MemoryRouter initialEntries={["/milestones"]}>
      <Milestones />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("503");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No milestones yet")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Archived" }));
  expect(await screen.findByText("Goal 9")).toBeInTheDocument();
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/milestones?archived=true",
      expect.anything(),
    ),
  );
});

test("overview announces loading state", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  render(
    <MemoryRouter initialEntries={["/milestones"]}>
      <Milestones />
    </MemoryRouter>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Loading milestones");
});
