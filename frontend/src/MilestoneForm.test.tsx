import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import MilestoneFormDialog from "./components/MilestoneFormDialog";
import { Milestone } from "./api/milestones";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = "hopstats_csrf=; Max-Age=0; path=/";
});

function response(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 8,
    name: "Beer discoveries",
    metric: "discoveries",
    goal_type: "absolute",
    target: 10,
    calendar_year: null,
    start_date: null,
    deadline_date: null,
    timezone: "Europe/Amsterdam",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    current: 2,
    remaining: 8,
    progress_percent: 20,
    status: "active",
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

test("creation form validates target and submits calendar year metric mapping", async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/v1/auth/csrf")
        return { ok: true, status: 200 } as Response;
      expect(input).toBe("/api/v1/milestones");
      expect(init?.method).toBe("POST");
      return {
        ok: true,
        status: 201,
        json: async () => response(),
      } as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const onSaved = vi.fn();
  render(<MilestoneFormDialog onClose={vi.fn()} onSaved={onSaved} />);

  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "2027 discoveries" },
  });
  fireEvent.change(screen.getByLabelText("Metric"), {
    target: { value: "discoveries" },
  });
  fireEvent.change(screen.getByLabelText("Goal type"), {
    target: { value: "calendar_year" },
  });
  fireEvent.change(screen.getByLabelText("Calendar year"), {
    target: { value: "2027" },
  });
  fireEvent.change(screen.getByLabelText("Positive integer target"), {
    target: { value: "100" },
  });
  expect(screen.getByText(/first discovered during 2027/)).toBeInTheDocument();
  fireEvent.submit(
    screen.getByRole("button", { name: "Create milestone" }).closest("form")!,
  );

  await waitFor(() =>
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 8 })),
  );
  const request = fetchMock.mock.calls.find(
    ([url]) => url === "/api/v1/milestones",
  );
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({
    name: "2027 discoveries",
    metric: "discoveries",
    goal_type: "calendar_year",
    target: 100,
    calendar_year: 2027,
    start_date: null,
    deadline_date: null,
    timezone: "Europe/Amsterdam",
  });
});

test("editing a legacy unique_beers milestone preserves its metric unless changed", async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (input === "/api/v1/auth/csrf")
        return { ok: true, status: 200 } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => response({ metric: "unique_beers" }),
      } as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const legacy = response({
    metric: "unique_beers",
    status: "completed",
    current: 12,
  });
  render(
    <MilestoneFormDialog
      milestone={legacy}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("Metric")).toHaveValue("discoveries");
  fireEvent.submit(
    screen.getByRole("button", { name: "Save changes" }).closest("form")!,
  );
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/milestones/8",
      expect.objectContaining({ method: "PATCH" }),
    ),
  );
  const request = fetchMock.mock.calls.find(
    ([url]) => url === "/api/v1/milestones/8",
  );
  expect(JSON.parse(String(request?.[1]?.body)).metric).toBe("unique_beers");
});

test("form blocks zero target and clears fields irrelevant to goal type", () => {
  render(<MilestoneFormDialog onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Goal type"), {
    target: { value: "calendar_year" },
  });
  fireEvent.change(screen.getByLabelText("Calendar year"), {
    target: { value: "2027" },
  });
  fireEvent.change(screen.getByLabelText("Goal type"), {
    target: { value: "incremental" },
  });
  expect(screen.queryByLabelText("Calendar year")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-11-01" },
  });
  fireEvent.change(screen.getByLabelText("Positive integer target"), {
    target: { value: "0" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Create milestone" }).closest("form")!,
  );
  expect(
    screen.getByText("Enter a positive whole-number target."),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("Start date")).toHaveValue("2026-11-01");
});
