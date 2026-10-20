import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DashboardData } from "./api/dashboard";
import { Insight } from "./api/insights";
import { Milestone } from "./api/milestones";
import App from "./App";
import { selectDashboardMilestones, sixMonthRange } from "./pages/Dashboard";

const dashboard: DashboardData = {
  total_checkins: 2924,
  unique_beers: 2325,
  unique_breweries: 640,
  unique_styles: 209,
  average_personal_rating: 4.5,
  rated_checkins: 1200,
  inventory_units: 183,
  unique_inventory_beers: 172,
  not_confirmed_checked_in: 30,
  match_coverage: {
    external_id: 100,
    exact: 42,
    ambiguous: 10,
    unmatched: 20,
  },
  freshness: {
    checkins_last_imported_at: "2026-10-14T10:00:00+00:00",
    inventory_last_imported_at: "2026-10-13T10:00:00+00:00",
    checkins_source_exported_at: null,
    inventory_source_exported_at: null,
  },
};

function milestone(
  id: number,
  status: Milestone["status"],
  overrides: Partial<Milestone> = {},
): Milestone {
  return {
    id,
    name: `Milestone ${id}`,
    metric: "discoveries",
    goal_type: "incremental",
    target: 100,
    calendar_year: null,
    start_date: "2026-01-01",
    deadline_date: "2026-12-31",
    timezone: "Europe/Amsterdam",
    archived_at: status === "archived" ? "2026-01-01T00:00:00Z" : null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    current: 20,
    remaining: 80,
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

const milestones = [
  milestone(2, "active", { current: 80, remaining: 20, progress_percent: 80 }),
  milestone(3, "scheduled", {
    goal_type: "calendar_year",
    calendar_year: 2027,
    start_date: null,
    deadline_date: null,
  }),
  milestone(4, "completed", {
    current: 100,
    remaining: 0,
    progress_percent: 100,
    completed_at: "2026-10-10T12:00:00Z",
  }),
  milestone(5, "overdue"),
  milestone(6, "period_ended", {
    goal_type: "calendar_year",
    calendar_year: 2024,
  }),
  milestone(7, "archived"),
];

const insights: Insight[] = [
  {
    id: "milestone-completed-4",
    type: "milestone_completed",
    category: "milestone",
    priority: 100,
    title: "Another milestone in the books!",
    description: "You've reached your goal of 100 unique beer discoveries.",
    href: "/milestones/4",
    data: { milestone_id: 4, current: 100, target: 100, remaining: 0 },
  },
  {
    id: "milestone-near-2",
    type: "milestone_near",
    category: "milestone",
    priority: 90,
    title: "The finish line is in sight!",
    description: "You've reached 94% of your milestone. 6 discoveries remain.",
    href: "/milestones/2",
    data: { milestone_id: 2, current: 94, target: 100, remaining: 6 },
  },
  {
    id: "checkin-trend-2026-10",
    type: "checkin_trend",
    category: "activity",
    priority: 50,
    title: "Your activity at a glance",
    description:
      "You've recorded 20 check-ins this month, compared with 10 last month.",
    href: null,
    data: { current_count: 20, previous_count: 10, difference: 10 },
  },
  {
    id: "milestone-below-5",
    type: "milestone_below",
    category: "milestone",
    priority: 40,
    title: "Below your target pace",
    description: "A factual observation.",
    href: "/milestones/5",
    data: { milestone_id: 5 },
  },
];

function monthlyBuckets() {
  const { start, currentMonth } = sixMonthRange();
  const [year, month] = start.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    const key = date.toISOString().slice(0, 7);
    return {
      key,
      label: new Intl.DateTimeFormat(undefined, {
        month: "short",
        timeZone: "UTC",
      }).format(date),
      start: `${key}-01`,
      end: `${key}-28`,
      new_discoveries: key === currentMonth ? 7 : index,
      repeat_checkins: 0,
      total_checkins: 0,
      cumulative_checkins: 0,
      cumulative_discoveries: 0,
    };
  });
}

function makeFetchMock(
  options: {
    dashboard?: DashboardData;
    dashboardFailure?: boolean;
    milestones?: Milestone[];
    milestonesFailure?: boolean;
    insights?: Insight[];
    insightsFailure?: boolean;
    chartFailure?: boolean;
  } = {},
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/v1/health") return { ok: true, status: 200 } as Response;
    if (url === "/api/v1/auth/me") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          username: "local",
          created_at: "2026-10-14T00:00:00Z",
        }),
      } as Response;
    }
    if (url === "/api/v1/dashboard") {
      return options.dashboardFailure
        ? ({ ok: false, status: 503 } as Response)
        : ({
            ok: true,
            json: async () => options.dashboard ?? dashboard,
          } as Response);
    }
    if (url.startsWith("/api/v1/milestones?")) {
      return options.milestonesFailure
        ? ({ ok: false, status: 503 } as Response)
        : ({
            ok: true,
            json: async () => ({
              milestones: options.milestones ?? milestones,
            }),
          } as Response);
    }
    if (url === "/api/v1/insights") {
      return options.insightsFailure
        ? ({ ok: false, status: 503 } as Response)
        : ({
            ok: true,
            json: async () => ({ insights: options.insights ?? insights }),
          } as Response);
    }
    if (url.startsWith("/api/v1/analytics/checkins?")) {
      return options.chartFailure
        ? ({
            ok: false,
            status: 503,
            json: async () => ({ detail: "Analytics unavailable" }),
          } as Response)
        : ({
            ok: true,
            json: async () => ({
              start: sixMonthRange().start,
              end: sixMonthRange().end,
              timezone: "Europe/Amsterdam",
              granularity: "month",
              summary: {
                total_checkins: 0,
                new_discoveries: 0,
                repeat_checkins: 0,
                distinct_beers: 0,
              },
              cumulative_baseline_checkins: 0,
              cumulative_baseline_discoveries: 0,
              buckets: monthlyBuckets(),
            }),
          } as Response);
    }
    return { ok: false, status: 404 } as Response;
  });
}

function renderDashboard(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows lifetime statistics, featured milestones, insights, and chart data", async () => {
  const fetchMock = makeFetchMock();
  renderDashboard(fetchMock);

  expect(
    await screen.findByRole("heading", { name: "Your beer journey" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("2,325")).toBeInTheDocument();
  expect(screen.getByText("2,325")).toBeInTheDocument();
  expect(screen.getByText("2,924")).toBeInTheDocument();
  expect(screen.getByText("640")).toBeInTheDocument();
  expect(screen.getByText("209")).toBeInTheDocument();

  const featured = screen.getByRole("link", {
    name: /Featured milestone: Milestone 2/,
  });
  expect(featured).toHaveAttribute("href", "/milestones/2");
  expect(within(featured).getByText("80")).toBeInTheDocument();
  expect(within(featured).getByText(/of 100 discoveries/)).toBeInTheDocument();
  expect(featured).toHaveTextContent("80%");
  expect(featured).toHaveTextContent("20 remaining");
  expect(screen.getByRole("link", { name: /Milestone 3/ })).toHaveTextContent(
    "20 / 100",
  );
  expect(screen.getByRole("link", { name: /Milestone 3/ })).toHaveAttribute(
    "href",
    "/milestones/3",
  );
  expect(screen.getByRole("link", { name: /Milestone 4/ })).toHaveAttribute(
    "href",
    "/milestones/4",
  );
  expect(
    screen.queryByRole("link", { name: /Milestone 6/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: /Milestone 7/ }),
  ).not.toBeInTheDocument();

  const insightCards = document.querySelectorAll(".dashboard-insight");
  expect(insightCards).toHaveLength(3);
  expect(
    screen.getByRole("link", { name: /Another milestone in the books/ }),
  ).toHaveAttribute("href", "/milestones/4");
  expect(
    await screen.findByText(/Current month is incomplete/),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/Monthly first-ever beer discoveries:/),
  ).toHaveTextContent("incomplete month");
  const analyticsRequest = fetchMock.mock.calls.find(([url]) =>
    String(url).startsWith("/api/v1/analytics/checkins?"),
  );
  const analyticsUrl = new URL(
    String(analyticsRequest?.[0]),
    "http://hopstats",
  );
  expect(analyticsUrl.searchParams.get("granularity")).toBe("month");
  expect(analyticsUrl.searchParams.get("timezone")).toBe("Europe/Amsterdam");
  expect(analyticsUrl.searchParams.get("start")).toBe(sixMonthRange().start);
  expect(analyticsUrl.searchParams.get("end")).toBe(sixMonthRange().end);
  expect(monthlyBuckets()).toHaveLength(6);
});

test("featured milestone ordering is deterministic and excludes archived and ended goals", () => {
  const ranked = selectDashboardMilestones([
    milestone(20, "active", { progress_percent: 90 }),
    milestone(10, "active", { progress_percent: 90 }),
    milestone(11, "active", { progress_percent: 95 }),
    milestone(12, "scheduled", { start_date: "2027-05-01" }),
    milestone(13, "scheduled", { start_date: "2027-01-01" }),
    milestone(14, "completed", { completed_at: "2026-10-15T12:00:00Z" }),
    milestone(15, "completed", { completed_at: "2026-10-18T12:00:00Z" }),
    milestone(16, "overdue"),
    milestone(17, "period_ended"),
    milestone(18, "archived"),
  ]);
  expect(ranked.map((item) => item.id)).toEqual([11, 10, 20]);
  expect(selectDashboardMilestones(ranked).length).toBe(3);
  const lowerPriority = selectDashboardMilestones([
    milestone(30, "scheduled", { start_date: "2027-05-01" }),
    milestone(31, "scheduled", { start_date: "2027-01-01" }),
    milestone(32, "completed", { completed_at: "2026-10-10T12:00:00Z" }),
    milestone(33, "completed", { completed_at: "2026-10-18T12:00:00Z" }),
    milestone(34, "overdue"),
  ]);
  expect(lowerPriority.map((item) => item.id)).toEqual([31, 30, 33]);
  expect(
    selectDashboardMilestones([
      milestone(35, "completed", { completed_at: "2026-10-18T12:00:00Z" }),
      milestone(36, "overdue"),
    ]).map((item) => item.id),
  ).toEqual([35, 36]);
});

test("inventory and data health details are collapsed by default and preserve diagnostics", async () => {
  renderDashboard(makeFetchMock());
  const summary = await screen.findByText("Inventory & data health");
  const details = summary.closest("details");
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(summary);
  expect(screen.getByText("Confirmed by external ID")).toBeInTheDocument();
  expect(screen.getByText("100")).toBeInTheDocument();
  expect(
    screen.getByText(
      /Unmatched or ambiguous inventory may have been tried previously/,
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/These timestamps show when HopStats imported data/),
  ).toBeInTheDocument();
  expect(screen.getByText("1,200 rated check-ins")).toBeInTheDocument();
});

test("does not imply zero values before importing and links to Imports", async () => {
  const empty: DashboardData = {
    ...dashboard,
    total_checkins: 0,
    unique_beers: 0,
    unique_breweries: 0,
    unique_styles: 0,
    average_personal_rating: null,
    rated_checkins: 0,
    inventory_units: 0,
    unique_inventory_beers: 0,
    not_confirmed_checked_in: 0,
    match_coverage: { external_id: 0, exact: 0, ambiguous: 0, unmatched: 0 },
    freshness: {
      checkins_last_imported_at: null,
      inventory_last_imported_at: null,
      checkins_source_exported_at: null,
      inventory_source_exported_at: null,
    },
  };
  renderDashboard(makeFetchMock({ dashboard: empty }));
  expect(
    await screen.findByText("Your dashboard is ready."),
  ).toBeInTheDocument();
  const uniqueBeers = screen.getByRole("heading", {
    name: "Unique beers",
  }).parentElement;
  expect(within(uniqueBeers!).getByText("—")).toBeInTheDocument();
  expect(
    screen
      .getAllByRole("link", { name: "Go to Imports" })
      .some((link) => link.getAttribute("href") === "/imports"),
  ).toBe(true);
});

test("dashboard statistics failure does not prevent milestones, insights, or chart from rendering", async () => {
  renderDashboard(makeFetchMock({ dashboardFailure: true }));
  expect(
    await screen.findByText(/Unable to load dashboard \(503\)/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Featured milestone: Milestone 2/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Another milestone in the books!"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Monthly first-ever beer discoveries:/),
  ).toBeInTheDocument();
  expect(
    screen
      .getAllByRole("link", { name: "Imports" })
      .some((link) => link.getAttribute("href") === "/imports"),
  ).toBe(true);
});

test("insights and chart failures stay local and retry controls are available", async () => {
  renderDashboard(makeFetchMock({ insightsFailure: true, chartFailure: true }));
  expect(
    await screen.findByText(/Unable to load insights/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Retry insights" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Analytics unavailable")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Retry discoveries" }),
  ).toBeInTheDocument();
  expect(screen.getByText("2,325")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: /Featured milestone/ }),
  ).toBeInTheDocument();
});

test("milestone failure does not prevent the remaining homepage content", async () => {
  renderDashboard(makeFetchMock({ milestonesFailure: true }));
  expect(await screen.findByText(/Request failed \(503\)/)).toBeInTheDocument();
  expect(
    screen.getByText("Another milestone in the books!"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Monthly first-ever beer discoveries:/),
  ).toBeInTheDocument();
  expect(screen.getByText("2,325")).toBeInTheDocument();
});

test("empty insights show the compact empty state", async () => {
  renderDashboard(makeFetchMock({ insights: [] }));
  expect(
    await screen.findByText(/No standout observations yet/),
  ).toBeInTheDocument();
});

test("independent dashboard loading states render useful status messages", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
  expect(screen.getByText("Checking session…")).toBeInTheDocument();
});
