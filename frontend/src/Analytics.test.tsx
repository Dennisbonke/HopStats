import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Analytics from "./pages/Analytics";

const sample = {
  start: "2026-01-01",
  end: "2026-01-02",
  timezone: "Europe/Amsterdam",
  granularity: "day",
  summary: {
    total_checkins: 3,
    new_discoveries: 2,
    repeat_checkins: 1,
    distinct_beers: 2,
  },
  cumulative_baseline_checkins: 4,
  cumulative_baseline_discoveries: 3,
  buckets: [
    {
      key: "2026-01-01",
      label: "01 Jan 2026",
      start: "2026-01-01",
      end: "2026-01-01",
      new_discoveries: 1,
      repeat_checkins: 1,
      total_checkins: 2,
      cumulative_checkins: 6,
      cumulative_discoveries: 4,
    },
    {
      key: "2026-01-02",
      label: "02 Jan 2026",
      start: "2026-01-02",
      end: "2026-01-02",
      new_discoveries: 1,
      repeat_checkins: 0,
      total_checkins: 1,
      cumulative_checkins: 7,
      cumulative_discoveries: 5,
    },
  ],
};

function QueryView() {
  const location = useLocation();
  return <output aria-label="Current query">{location.search}</output>;
}

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Browser back</button>
      <button onClick={() => navigate(1)}>Browser forward</button>
    </>
  );
}

function renderAnalytics(
  url = "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=day&timezone=Europe%2FAmsterdam",
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryView />
      <Analytics />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => sample }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("loads one shared aggregate, renders summary, and preserves URL filters", async () => {
  renderAnalytics();
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  expect(screen.getByLabelText("Check-in summary")).toHaveTextContent("3");
  expect(screen.getByLabelText("Check-in summary")).toHaveTextContent("2");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "period=custom",
  );
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(globalThis.fetch).mock.calls[0][0])).toContain(
    "granularity=day",
  );
});

test("supports cumulative/activity controls and period changes", async () => {
  renderAnalytics();
  await screen.findByText("Check-in Breakdown");
  fireEvent.click(screen.getByRole("button", { name: "Cumulative" }));
  expect(screen.getByRole("button", { name: "Cumulative" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByLabelText("Cumulative discoveries"));
  fireEvent.change(screen.getByLabelText("Reporting period"), {
    target: { value: "last_30" },
  });
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "period=last_30",
  );
});

test("drills from both charts through shared annual, monthly, and daily views", async () => {
  const bucket = (key: string, label: string, start: string, end: string) => ({
    ...sample.buckets[0],
    key,
    label,
    start,
    end,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const granularity = url.searchParams.get("granularity");
      const result =
        granularity === "year"
          ? {
              ...sample,
              start: "2024-01-01",
              end: "2025-12-31",
              granularity: "year",
              summary: { ...sample.summary, total_checkins: 40 },
              buckets: [
                bucket("2024", "2024", "2024-01-01", "2024-12-31"),
                bucket("2025", "2025", "2025-01-01", "2025-12-31"),
              ],
            }
          : granularity === "month"
            ? {
                ...sample,
                start: "2025-01-01",
                end: "2025-12-31",
                granularity: "month",
                summary: { ...sample.summary, total_checkins: 20 },
                buckets: [
                  bucket("2025-03", "Mar 2025", "2025-03-01", "2025-03-31"),
                ],
              }
            : {
                ...sample,
                start: "2025-03-01",
                end: "2025-03-31",
                summary: { ...sample.summary, total_checkins: 3 },
              };
      return { ok: true, json: async () => result };
    }),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2024-01-01&end=2025-12-31&granularity=auto&timezone=Europe%2FAmsterdam",
  );
  expect(await screen.findByText("40")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Open 2025" })[1]);
  expect(await screen.findByText("20")).toBeInTheDocument();
  expect(screen.getByLabelText("Analytics drilldown")).toHaveTextContent(
    "2025",
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Open Mar 2025" })[1]);
  expect(await screen.findByText("3")).toBeInTheDocument();
  expect(screen.getByLabelText("Analytics drilldown")).toHaveTextContent(
    "March",
  );
  expect(screen.getByText("Daily detail · deepest level")).toBeInTheDocument();
  const requests = vi
    .mocked(globalThis.fetch)
    .mock.calls.map(([input]) => new URL(String(input), "http://localhost"));
  expect(requests).toHaveLength(3);
  expect(requests[1].searchParams.get("granularity")).toBe("month");
  expect(requests[1].searchParams.get("start")).toBe("2025-01-01");
  expect(requests[2].searchParams.get("granularity")).toBe("day");
  expect(requests[2].searchParams.get("start")).toBe("2025-03-01");
  expect(requests[2].searchParams.get("end")).toBe("2025-03-31");
});

test("keeps partial reporting boundaries through drilldown and restores URL history", async () => {
  const monthly = {
    ...sample,
    granularity: "month",
    buckets: [
      {
        ...sample.buckets[0],
        key: "2025-03",
        label: "Mar 2025",
        start: "2025-03-15",
        end: "2025-03-31",
      },
      {
        ...sample.buckets[0],
        key: "2025-08",
        label: "Aug 2025",
        start: "2025-08-01",
        end: "2025-08-20",
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const result =
        url.searchParams.get("granularity") === "month" ? monthly : sample;
      return { ok: true, json: async () => result };
    }),
  );
  render(
    <MemoryRouter
      initialEntries={[
        "/analytics?period=custom&start=2025-03-15&end=2025-08-20&granularity=auto&timezone=Europe%2FAmsterdam",
      ]}
    >
      <HistoryControls />
      <QueryView />
      <Analytics />
    </MemoryRouter>,
  );
  expect(await screen.findAllByText("Mar 2025")).toHaveLength(2);
  fireEvent.click(screen.getAllByRole("button", { name: "Open Mar 2025" })[0]);
  await screen.findByText("Daily detail · deepest level");
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).toHaveTextContent(
      "zoom=month%3A2025-03",
    ),
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "start=2025-03-15",
  );
  const dailyUrl = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]),
    "http://localhost",
  );
  expect(dailyUrl.searchParams.get("start")).toBe("2025-03-15");
  expect(dailyUrl.searchParams.get("end")).toBe("2025-03-31");

  fireEvent.click(screen.getByRole("button", { name: "2025" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).toHaveTextContent(
      "zoom=year%3A2025",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).toHaveTextContent(
      "zoom=month%3A2025-03",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).toHaveTextContent(
      "zoom=year%3A2025",
    ),
  );
});

test("pages full-year Daily windows without changing the reporting range", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const total = url.searchParams.get("start") === "2025-01-01" ? 3 : 7;
      return {
        ok: true,
        json: async () => ({
          ...sample,
          start: url.searchParams.get("start"),
          end: url.searchParams.get("end"),
          granularity: "day",
          summary: { ...sample.summary, total_checkins: total },
        }),
      };
    }),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2025-01-01&end=2025-12-31&granularity=day&timezone=Europe%2FAmsterdam",
  );
  expect(
    await screen.findByLabelText("Visible bucket window"),
  ).toHaveTextContent("page 1 of 9");
  const first = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[0][0]),
    "http://localhost",
  );
  expect(first.searchParams.get("start")).toBe("2025-01-01");
  expect(first.searchParams.get("end")).toBe("2025-02-14");

  fireEvent.click(screen.getByRole("button", { name: "Next 45 days" }));
  expect(await screen.findByText("7")).toBeInTheDocument();
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "start=2025-01-01",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "end=2025-12-31",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent("window=1");
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  const next = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[1][0]),
    "http://localhost",
  );
  expect(next.searchParams.get("granularity")).toBe("day");
  expect(next.searchParams.get("start")).toBe("2025-02-15");
  expect(next.searchParams.get("end")).toBe("2025-03-31");
  expect(
    screen.getByText(/Daily buckets · 2025-02-15–2025-03-31/),
  ).toBeInTheDocument();
});

test("bounds multi-year Weekly selections to navigable windows", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      return {
        ok: true,
        json: async () => ({
          ...sample,
          start: url.searchParams.get("start"),
          end: url.searchParams.get("end"),
          granularity: "week",
        }),
      };
    }),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2023-01-01&end=2025-12-31&granularity=week&timezone=Europe%2FAmsterdam",
  );
  expect(
    await screen.findByLabelText("Visible bucket window"),
  ).toHaveTextContent("page 1 of 4");
  const first = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[0][0]),
    "http://localhost",
  );
  expect(first.searchParams.get("granularity")).toBe("week");
  expect(first.searchParams.get("start")).toBe("2023-01-01");
  expect(first.searchParams.get("end")).toBe("2023-11-05");
  fireEvent.click(screen.getByRole("button", { name: "Next 45 weeks" }));
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  const next = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[1][0]),
    "http://localhost",
  );
  expect(next.searchParams.get("granularity")).toBe("week");
  expect(next.searchParams.get("start")).toBe("2023-11-06");
  expect(next.searchParams.get("end")).toBe("2024-09-15");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "start=2023-01-01",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "end=2025-12-31",
  );
});

test("normalizes malformed zoom URL parameters", async () => {
  renderAnalytics(
    "/analytics?period=custom&start=2025-01-01&end=2025-12-31&granularity=auto&zoom=month%3A2025-99&timezone=Europe%2FAmsterdam",
  );
  expect(
    await screen.findByText(/Invalid analytics URL filters or drilldown/),
  ).toHaveTextContent("Invalid analytics URL filters or drilldown");
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "zoom=",
    ),
  );
});

async function verifyAllTimeManualPaging(
  granularity: "day" | "week",
  expectedFirstEnd: string,
  expectedNextStart: string,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const requestStart = url.searchParams.get("start");
      const requestEnd = url.searchParams.get("end");
      const bootstrap = !requestStart && !requestEnd;
      const pageOne = requestStart === "2024-01-01";
      return {
        ok: true,
        json: async () => ({
          ...sample,
          start: bootstrap ? "2024-01-01" : requestStart,
          end: bootstrap ? "2025-12-31" : requestEnd,
          granularity: bootstrap ? "year" : granularity,
          summary: {
            ...sample.summary,
            total_checkins: bootstrap ? 500 : pageOne ? 31 : 47,
          },
          cumulative_baseline_checkins: bootstrap ? 0 : pageOne ? 12 : 43,
          cumulative_baseline_discoveries: bootstrap ? 0 : pageOne ? 8 : 19,
        }),
      };
    }),
  );

  renderAnalytics(
    `/analytics?period=all&granularity=${granularity}&timezone=Europe%2FAmsterdam`,
  );
  expect(
    await screen.findByLabelText("Visible bucket window"),
  ).toHaveTextContent("page 1 of");
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));

  const bootstrap = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[0][0]),
    "http://localhost",
  );
  expect(bootstrap.searchParams.get("granularity")).toBe("auto");
  expect(bootstrap.searchParams.has("start")).toBe(false);
  expect(bootstrap.searchParams.has("end")).toBe(false);
  const firstPage = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[1][0]),
    "http://localhost",
  );
  expect(firstPage.searchParams.get("granularity")).toBe(granularity);
  expect(firstPage.searchParams.get("start")).toBe("2024-01-01");
  expect(firstPage.searchParams.get("end")).toBe(expectedFirstEnd);
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "period=all",
  );
  expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
    "start=",
  );
  expect(screen.getByLabelText("Current query")).not.toHaveTextContent("end=");
  expect(screen.getByLabelText("Check-in summary")).toHaveTextContent("31");
  expect(document.querySelector(".analytics-footnote")).toHaveTextContent(
    "Cumulative baseline before range: 12 check-ins and 8 discoveries",
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: granularity === "day" ? "Next 45 days" : "Next 45 weeks",
    }),
  );
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
  const nextPage = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[2][0]),
    "http://localhost",
  );
  expect(nextPage.searchParams.get("granularity")).toBe(granularity);
  expect(nextPage.searchParams.get("start")).toBe(expectedNextStart);
  expect(nextPage.searchParams.has("end")).toBe(true);
  expect(screen.getByLabelText("Check-in summary")).toHaveTextContent("47");
  expect(document.querySelector(".analytics-footnote")).toHaveTextContent(
    "Cumulative baseline before range: 43 check-ins and 19 discoveries",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "period=all",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent("window=1");
  expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
    "start=",
  );
  expect(screen.getByLabelText("Current query")).not.toHaveTextContent("end=");
}

test("all-time Daily pagination sends bounded dates and preserves cumulative totals", async () => {
  await verifyAllTimeManualPaging("day", "2024-02-14", "2024-02-15");
});

test("all-time Weekly pagination sends bounded dates and preserves cumulative totals", async () => {
  await verifyAllTimeManualPaging("week", "2024-11-10", "2024-11-11");
});

test("ignores out-of-order responses and stale loading/error handlers", async () => {
  type FakeResponse = { ok: boolean; json: () => Promise<unknown> };
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }
  const pending: ReturnType<typeof deferred<FakeResponse>>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      const request = deferred<FakeResponse>();
      pending.push(request);
      return request.promise;
    }),
  );
  renderAnalytics();
  await waitFor(() => expect(pending).toHaveLength(1));
  fireEvent.change(screen.getByLabelText("Granularity"), {
    target: { value: "week" },
  });
  await waitFor(() => expect(pending).toHaveLength(2));
  fireEvent.change(screen.getByLabelText("Granularity"), {
    target: { value: "month" },
  });
  await waitFor(() => expect(pending).toHaveLength(3));

  // An old completion must neither replace current results nor clear loading.
  pending[0].resolve({ ok: true, json: async () => sample });
  expect(await screen.findByText("Loading analytics…")).toBeInTheDocument();

  const latest = {
    ...sample,
    summary: { ...sample.summary, total_checkins: 99 },
  };
  pending[2].resolve({ ok: true, json: async () => latest });
  expect(await screen.findByText("99")).toBeInTheDocument();

  // A stale request failure must not replace the successful newest response.
  pending[1].reject(new Error("stale request failure"));
  await waitFor(() => {
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading analytics…")).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("Check-in summary")).toHaveTextContent("99");
});

test("validates reversed custom dates without requesting stale ranges", async () => {
  renderAnalytics();
  await screen.findByText("Check-in Breakdown");
  const before = vi.mocked(globalThis.fetch).mock.calls.length;
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-02-01" },
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Start date must be on or before end date",
  );
  await waitFor(() =>
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(before),
  );
});

test("shows fetch errors and empty data feedback", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  renderAnalytics();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Analytics are temporarily unavailable",
  );

  cleanup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Choose a coarser granularity." }),
    }),
  );
  renderAnalytics();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Choose a coarser granularity.",
  );

  cleanup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...sample,
        summary: { ...sample.summary, total_checkins: 0 },
        buckets: [],
      }),
    }),
  );
  cleanup();
  renderAnalytics();
  expect(
    await screen.findByText(
      "No check-ins to display for this reporting period.",
    ),
  ).toBeInTheDocument();
});
