import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { Milestone } from "./api/milestones";
import MilestoneDetail from "./pages/MilestoneDetail";

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 8,
    name: "First-ever discoveries",
    metric: "discoveries",
    goal_type: "incremental",
    target: 10,
    calendar_year: null,
    start_date: "2026-01-01",
    deadline_date: "2026-01-10",
    timezone: "Europe/Amsterdam",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    current: 4,
    remaining: 6,
    progress_percent: 40,
    status: "overdue",
    deadline_outcome: "pending",
    completed_at: null,
    completed_before_deadline: null,
    required_per_day: 0.5,
    required_per_week: 3.5,
    elapsed_per_day: 1,
    elapsed_per_week: 7,
    trajectory_difference: -2,
    ...overrides,
  };
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/milestones/8"]}>
      <Routes>
        <Route path="/milestones/:id" element={<MilestoneDetail />} />
        <Route path="/milestones" element={<h1>Milestone overview</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "confirm");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = "hopstats_csrf=; Max-Age=0; path=/";
});

test("detail uses backend values, describes overdue progress, and omits null pace", async () => {
  const item = milestone({
    required_per_day: null,
    required_per_week: null,
    elapsed_per_day: null,
    elapsed_per_week: null,
    trajectory_difference: null,
  });
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => item,
  }));
  vi.stubGlobal("fetch", fetchMock);
  mount();

  expect(
    await screen.findByRole("heading", { name: item.name }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/progress continues to count check-ins/),
  ).toBeInTheDocument();
  expect(screen.getByText("4 / 10")).toBeInTheDocument();
  expect(screen.getByText("6 remaining")).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Pace" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: `${item.name} progress` }),
  ).toHaveAttribute("value", "40");
});

test.each([
  ["scheduled", "Scheduled"],
  ["active", "In progress"],
  ["overdue", "Overdue"],
  ["completed", "Completed"],
  ["period_ended", "Period ended"],
  ["archived", "Archived"],
] as const)("formats the %s milestone status as %s", async (status, label) => {
  const item = milestone({ status });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => item })),
  );
  mount();
  expect(
    await screen.findByText(label, { selector: ".milestone-status" }),
  ).toBeInTheDocument();
});

test.each([
  ["pending", "Pending"],
  ["on_time", "Met"],
  ["late", "Completed late"],
  ["missed", "Missed"],
] as const)("formats deadline outcome %s as %s", async (outcome, label) => {
  const item = milestone({ deadline_outcome: outcome });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => item })),
  );
  mount();
  expect(
    await screen.findByText(label, { selector: ".milestone-detail-list dd" }),
  ).toBeInTheDocument();
});

test("completed milestones remain editable and display recalculated backend data", async () => {
  let current = milestone({
    status: "completed",
    target: 10,
    current: 10,
    remaining: 0,
    progress_percent: 100,
    completed_at: "2026-01-05T12:00:00Z",
  });
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/v1/auth/csrf")
        return { ok: true, status: 200 } as Response;
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { target: number };
        current = milestone({
          ...current,
          target: body.target,
          current: 12,
          remaining: 0,
          progress_percent: 120,
          completed_at: "2026-01-06T12:00:00Z",
        });
        return { ok: true, json: async () => current } as Response;
      }
      return { ok: true, json: async () => current } as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  mount();

  await screen.findByRole("heading", { name: "First-ever discoveries" });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Positive integer target"), {
    target: { value: "11" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save changes" }).closest("form")!,
  );

  await waitFor(() => expect(screen.getByText("12 / 11")).toBeInTheDocument());
  expect(screen.getByText("120%")).toBeInTheDocument();
  expect(screen.getByText(/Jan 6, 2026/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/milestones/8",
    expect.anything(),
  );
});

test("archive and restore refresh the milestone from the API", async () => {
  let item = milestone();
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/v1/auth/csrf")
        return { ok: true, status: 200 } as Response;
      if (init?.method === "PATCH") {
        const archived = (
          JSON.parse(String(init.body)) as { archived: boolean }
        ).archived;
        item = milestone({
          ...item,
          archived_at: archived ? "2026-01-03T00:00:00Z" : null,
          status: archived ? "archived" : "overdue",
        });
        return { ok: true, json: async () => item } as Response;
      }
      return { ok: true, json: async () => item } as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  mount();
  await screen.findByRole("heading", { name: item.name });

  fireEvent.click(screen.getByRole("button", { name: "Archive" }));
  expect(await screen.findByText("Archived")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
  expect(await screen.findByText("Overdue")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/v1/milestones/8",
    expect.anything(),
  );
});

test("delete cancellation retains detail, while confirmed deletion returns to overview", async () => {
  const confirm = vi.fn().mockReturnValue(false);
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: confirm,
  });
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/v1/auth/csrf")
        return { ok: true, status: 200 } as Response;
      if (init?.method === "DELETE") {
        return { ok: true, status: 204 } as Response;
      }
      return { ok: true, json: async () => milestone() } as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  mount();
  await screen.findByRole("heading", { name: "First-ever discoveries" });

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("cannot be undone"),
  );
  expect(
    screen.getByRole("heading", { name: "First-ever discoveries" }),
  ).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith(
    "/api/v1/milestones/8",
    expect.objectContaining({ method: "DELETE" }),
  );

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(
    await screen.findByRole("heading", { name: "Milestone overview" }),
  ).toBeInTheDocument();
});
