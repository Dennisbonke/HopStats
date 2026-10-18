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

let originalClipboardDescriptor: PropertyDescriptor | undefined;

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

const trendsSample = {
  start: "2026-01-01",
  end: "2026-01-02",
  timezone: "Europe/Amsterdam",
  daily: [
    { date: "2026-01-01", total: 2, discoveries: 1, repeats: 1 },
    { date: "2026-01-02", total: 0, discoveries: 0, repeats: 0 },
  ],
  weekday: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    total: 0,
    discoveries: 0,
    repeats: 0,
    days_in_period: weekday < 2 ? 1 : 0,
  })),
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    total: 0,
    discoveries: 0,
    repeats: 0,
  })),
  weekday_hour: Array.from({ length: 168 }, (_, index) => ({
    weekday: Math.floor(index / 24),
    hour: index % 24,
    total: 0,
    discoveries: 0,
    repeats: 0,
  })),
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

function LayoutDebugControls() {
  const navigate = useNavigate();
  return (
    <>
      <button
        onClick={() =>
          navigate(
            "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=week&debugLayout=1",
          )
        }
      >
        Enable layout diagnostics
      </button>
      <button
        onClick={() =>
          navigate(
            "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=week",
          )
        }
      >
        Disable layout diagnostics
      </button>
    </>
  );
}

function renderAnalytics(
  url = "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=day&timezone=Europe%2FAmsterdam",
  includeLayoutDebugControls = false,
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryView />
      {includeLayoutDebugControls && <LayoutDebugControls />}
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
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    originalClipboardDescriptor = undefined;
  } else if (Object.prototype.hasOwnProperty.call(navigator, "clipboard")) {
    Reflect.deleteProperty(navigator, "clipboard");
  }
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

test("layout diagnostics are opt-in and available with debugLayout=1", async () => {
  const { unmount } = renderAnalytics();
  expect(
    screen.queryByRole("complementary", { name: "Layout diagnostics" }),
  ).not.toBeInTheDocument();
  unmount();

  renderAnalytics(
    "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=week&debugLayout=1",
  );
  expect(
    await screen.findByRole("complementary", { name: "Layout diagnostics" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/No overflow captured/)).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Pause capture" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Copy \/ export JSON" }),
  ).toBeInTheDocument();
});

test("layout diagnostics react to query changes and survive filter canonicalization", async () => {
  renderAnalytics(undefined, true);
  expect(
    screen.queryByRole("complementary", { name: "Layout diagnostics" }),
  ).not.toBeInTheDocument();

  fireEvent.click(
    screen.getByRole("button", { name: "Enable layout diagnostics" }),
  );
  expect(
    await screen.findByRole("complementary", { name: "Layout diagnostics" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).toHaveTextContent(
      "debugLayout=1",
    ),
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Disable layout diagnostics" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("complementary", { name: "Layout diagnostics" }),
    ).not.toBeInTheDocument(),
  );
});

test("capture controls pause and resume recording; JSON export includes incidents", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  originalClipboardDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard",
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  vi.spyOn(window, "scrollX", "get").mockReturnValue(4);

  renderAnalytics(
    "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=week&debugLayout=1",
  );
  await screen.findByRole("complementary", { name: "Layout diagnostics" });
  fireEvent.click(screen.getByRole("button", { name: "Pause capture" }));
  const output = screen.getByText(/samples · .* incidents/);
  const pausedOutput = output.textContent;
  window.dispatchEvent(new Event("resize"));
  expect(output).toHaveTextContent(pausedOutput ?? "");

  fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
  expect(await screen.findByText("OVERFLOW CAPTURED")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Copy / export JSON" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  const exported = JSON.parse(writeText.mock.calls[0][0] as string);
  expect(exported.incidents).toHaveLength(1);
  expect(
    exported.incidents[0].samples.some(
      (entry: { anomaly?: boolean }) => entry.anomaly,
    ),
  ).toBe(true);
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

test("Overview remains the default and explicit overview is canonicalized", async () => {
  renderAnalytics("/analytics");
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    screen.queryByRole("heading", { name: "Drinking Trends" }),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "view=",
    ),
  );

  cleanup();
  renderAnalytics("/analytics?view=overview");
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "view=",
    ),
  );
});

test("invalid view and metric values fall back and are removed from the URL", async () => {
  renderAnalytics(
    "/analytics?period=custom&start=2026-01-01&end=2026-01-02&view=charts&metric=wat",
  );
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  expect(
    await screen.findByText(/Invalid analytics URL filters or drilldown/),
  ).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "view=",
    );
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "metric=",
    );
  });
});

test("invalid trends metric falls back to total without changing the selected view", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => trendsSample })),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2026-01-01&end=2026-01-02&view=trends&metric=unknown",
  );
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(
    screen.getByRole("tabpanel", { name: "Drinking Trends" }),
  ).toHaveAttribute("data-metric", "total");
  await waitFor(() => {
    expect(screen.getByLabelText("Current query")).toHaveTextContent(
      "view=trends",
    );
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "metric=",
    );
  });
});

test("tabs preserve shared filters and metric, use keyboard navigation, and restore history", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("drinking-trends")
        ? { ok: true, json: async () => trendsSample }
        : { ok: true, json: async () => sample },
    ),
  );
  render(
    <MemoryRouter
      initialEntries={[
        "/analytics?period=custom&start=2026-01-01&end=2026-01-02&granularity=week&timezone=Europe%2FAmsterdam&metric=discoveries&debugLayout=1",
      ]}
    >
      <HistoryControls />
      <QueryView />
      <Analytics />
    </MemoryRouter>,
  );
  await screen.findByText("Check-in Breakdown");
  const overview = screen.getByRole("tab", { name: "Overview" });
  const trends = screen.getByRole("tab", { name: "Drinking Trends" });
  expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(1);

  fireEvent.keyDown(overview, { key: "ArrowRight" });
  expect(trends).toHaveFocus();
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(trends).toHaveAttribute("aria-selected", "true");
  expect(
    screen.getByRole("tabpanel", { name: "Drinking Trends" }),
  ).toHaveAttribute("data-metric", "discoveries");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "view=trends",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "metric=discoveries",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "granularity=week",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "debugLayout=1",
  );
  expect(
    screen.getByRole("complementary", { name: "Layout diagnostics" }),
  ).toBeInTheDocument();
  const trendRequest = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]),
    "http://localhost",
  );
  expect(trendRequest.pathname).toBe("/api/v1/analytics/drinking-trends");
  expect(trendRequest.searchParams.get("start")).toBe("2026-01-01");
  expect(trendRequest.searchParams.get("end")).toBe("2026-01-02");
  expect(trendRequest.searchParams.get("timezone")).toBe("Europe/Amsterdam");

  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() =>
    expect(overview).toHaveAttribute("aria-selected", "true"),
  );
  expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
    "view=trends",
  );
  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  await waitFor(() => expect(trends).toHaveAttribute("aria-selected", "true"));

  fireEvent.click(overview);
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  expect(screen.getByLabelText("Granularity")).toHaveValue("week");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "metric=discoveries",
  );
});

test("Back and Forward restore reporting period, custom dates, and granularity from the URL", async () => {
  render(
    <MemoryRouter
      initialEntries={[
        "/analytics?period=last_30&start=2026-05-01&end=2026-05-30&granularity=month&timezone=Europe%2FAmsterdam",
        "/analytics?period=custom&start=2026-03-10&end=2026-04-20&granularity=week&timezone=Europe%2FAmsterdam",
      ]}
      initialIndex={1}
    >
      <HistoryControls />
      <QueryView />
      <Analytics />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  expect(screen.getByLabelText("Reporting period")).toHaveValue("custom");
  expect(screen.getByLabelText("Start date")).toHaveValue("2026-03-10");
  expect(screen.getByLabelText("Granularity")).toHaveValue("week");

  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() => {
    expect(screen.getByLabelText("Reporting period")).toHaveValue("last_30");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-05-01");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-05-30");
    expect(screen.getByLabelText("Granularity")).toHaveValue("month");
  });
  let query = new URLSearchParams(
    screen.getByLabelText("Current query").textContent ?? "",
  );
  expect(query.get("period")).toBe("last_30");
  expect(query.get("start")).toBe("2026-05-01");

  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  await waitFor(() => {
    expect(screen.getByLabelText("Reporting period")).toHaveValue("custom");
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-03-10");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-04-20");
    expect(screen.getByLabelText("Granularity")).toHaveValue("week");
  });
  query = new URLSearchParams(
    screen.getByLabelText("Current query").textContent ?? "",
  );
  expect(query.get("period")).toBe("custom");
  expect(query.get("end")).toBe("2026-04-20");
});

test("trends fetch is scoped to its active view and custom date changes preserve view and metric", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("drinking-trends")
        ? { ok: true, json: async () => trendsSample }
        : { ok: true, json: async () => sample },
    ),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2026-01-01&end=2026-01-02&view=trends&metric=repeats",
  );
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-01-02" },
  });
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "view=trends",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "metric=repeats",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "start=2026-01-02",
  );
});

test("calendar year and metric URL state drive one-year requests without refetching on metric changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("drinking-trends")
        ? { ok: true, json: async () => trendsSample }
        : { ok: true, json: async () => sample },
    ),
  );
  render(
    <MemoryRouter
      initialEntries={[
        "/analytics?period=custom&start=2023-04-15&end=2025-09-30&granularity=week&timezone=Europe%2FAmsterdam&view=trends&year=2024&metric=discoveries&debugLayout=1",
      ]}
    >
      <HistoryControls />
      <QueryView />
      <Analytics />
    </MemoryRouter>,
  );
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(screen.getByLabelText("Calendar year")).toHaveValue("2024");
  expect(screen.getByLabelText("Activity metric")).toHaveValue("discoveries");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "granularity=week",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "debugLayout=1",
  );
  const initialRequest = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[0][0]),
    "http://localhost",
  );
  expect(initialRequest.pathname).toBe("/api/v1/analytics/drinking-trends");
  expect(initialRequest.searchParams.get("start")).toBe("2024-01-01");
  expect(initialRequest.searchParams.get("end")).toBe("2024-12-31");
  expect(initialRequest.searchParams.get("timezone")).toBe("Europe/Amsterdam");

  fireEvent.change(screen.getByLabelText("Activity metric"), {
    target: { value: "repeats" },
  });
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "metric=repeats",
  );
  expect(
    screen.getByRole("tabpanel", { name: "Drinking Trends" }),
  ).toHaveAttribute("data-metric", "repeats");
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText("Calendar year"), {
    target: { value: "2023" },
  });
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
  const nextRequest = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[1][0]),
    "http://localhost",
  );
  expect(nextRequest.searchParams.get("start")).toBe("2023-04-15");
  expect(nextRequest.searchParams.get("end")).toBe("2023-12-31");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "metric=repeats",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent("year=2023");
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "debugLayout=1",
  );
  expect(screen.getByLabelText("Current query")).toHaveTextContent(
    "granularity=week",
  );

  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Calendar year")).toHaveValue("2024"),
  );
  expect(screen.getByLabelText("Activity metric")).toHaveValue("repeats");
  fireEvent.click(screen.getByRole("button", { name: "Browser forward" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Calendar year")).toHaveValue("2023"),
  );
  fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
  expect(await screen.findByText("Check-in Breakdown")).toBeInTheDocument();
  expect(screen.getByLabelText("Current query")).toHaveTextContent("year=2023");
  fireEvent.click(screen.getByRole("tab", { name: "Drinking Trends" }));
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(screen.getByLabelText("Calendar year")).toHaveValue("2023");
});

test("invalid ineligible calendar year safely falls back and is canonicalized", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => trendsSample })),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2023-01-01&end=2025-12-31&view=trends&year=1999",
  );
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(screen.getByLabelText("Calendar year")).toHaveValue("2025");
  await waitFor(() =>
    expect(screen.getByLabelText("Current query")).not.toHaveTextContent(
      "year=",
    ),
  );
  const request = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls[0][0]),
    "http://localhost",
  );
  expect(request.searchParams.get("start")).toBe("2025-01-01");
  expect(request.searchParams.get("end")).toBe("2025-12-31");
});

test("all time uses M7 bounds but requests only the selected calendar-year intersection", async () => {
  let trendRequests = 0;
  let historyBoundsRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("drinking-trends")) {
        trendRequests++;
        return { ok: true, json: async () => trendsSample };
      }
      historyBoundsRequests++;
      return {
        ok: true,
        json: async () => ({
          ...sample,
          start: historyBoundsRequests === 1 ? "2019-01-01" : "2020-06-01",
          end: "2026-12-31",
          granularity: "year",
          buckets: [
            {
              ...sample.buckets[0],
              key: historyBoundsRequests === 1 ? "2024" : "2025",
              label: historyBoundsRequests === 1 ? "2024" : "2025",
              start: historyBoundsRequests === 1 ? "2024-01-01" : "2025-01-01",
              end: historyBoundsRequests === 1 ? "2024-12-31" : "2025-12-31",
              total_checkins: 10,
            },
          ],
        }),
      };
    }),
  );
  renderAnalytics("/analytics?period=all&view=trends&metric=total");
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  const requests = vi
    .mocked(globalThis.fetch)
    .mock.calls.map(([input]) => new URL(String(input), "http://localhost"));
  expect(requests).toHaveLength(2);
  expect(requests[0].pathname).toBe("/api/v1/analytics/checkins");
  expect(requests[0].searchParams.has("start")).toBe(false);
  expect(requests[1].pathname).toBe("/api/v1/analytics/drinking-trends");
  expect(screen.getByLabelText("Calendar year")).toHaveValue("2024");
  expect(requests[1].searchParams.get("start")).toBe("2024-01-01");
  expect(requests[1].searchParams.get("end")).toBe("2024-12-31");
  expect(
    screen.getByLabelText("Drinking Trends reporting period"),
  ).toHaveTextContent("2019-01-01–2026-12-31");
  fireEvent.change(screen.getByLabelText("Calendar year"), {
    target: { value: "2025" },
  });
  await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
  expect(await screen.findByRole("grid")).toBeInTheDocument();
  expect(screen.getByLabelText("Reporting period")).toHaveValue("all");
  expect(screen.getByLabelText("Calendar year")).toHaveValue("2025");
  const yearRequest = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]),
    "http://localhost",
  );
  expect(yearRequest.pathname).toBe("/api/v1/analytics/drinking-trends");
  expect(yearRequest.searchParams.get("start")).toBe("2025-01-01");
  expect(yearRequest.searchParams.get("end")).toBe("2025-12-31");
  expect(screen.getByLabelText("Current query")).toHaveTextContent("year=2025");

  fireEvent.change(screen.getByLabelText("Reporting period"), {
    target: { value: "this_year" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Calendar year")).toHaveValue("2026"),
  );
  fireEvent.change(screen.getByLabelText("Reporting period"), {
    target: { value: "all" },
  });
  await waitFor(() => expect(historyBoundsRequests).toBe(2));
  await waitFor(() =>
    expect(
      screen.getByLabelText("Drinking Trends reporting period"),
    ).toHaveTextContent("2020-06-01–2026-12-31"),
  );
  const refreshedRequest = new URL(
    String(vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0]),
    "http://localhost",
  );
  expect(refreshedRequest.pathname).toBe("/api/v1/analytics/drinking-trends");
  expect(screen.getByLabelText("Calendar year")).toHaveValue("2025");
  expect(refreshedRequest.searchParams.get("start")).toBe("2025-01-01");
  expect(refreshedRequest.searchParams.get("end")).toBe("2025-12-31");
  expect(screen.getByLabelText("Current query")).not.toHaveTextContent("year=");
});

test("all time with empty M7 history does not call trends and explains unsupported history clearly", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...sample,
        start: null,
        end: null,
        summary: { ...sample.summary, total_checkins: 0 },
        buckets: [],
      }),
    })),
  );
  renderAnalytics("/analytics?period=all&view=trends");
  expect(
    await screen.findByText("No check-ins are available for All time."),
  ).toBeInTheDocument();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test("trends handles empty aggregates and ignores stale period responses", async () => {
  const pending: Array<{
    resolve: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    signal?: AbortSignal;
  }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).includes("drinking-trends")) {
        return Promise.resolve({ ok: true, json: async () => sample });
      }
      return new Promise((resolve) =>
        pending.push({
          resolve,
          signal: init?.signal as AbortSignal | undefined,
        }),
      );
    }),
  );
  renderAnalytics(
    "/analytics?period=custom&start=2026-01-01&end=2026-01-02&view=trends",
  );
  await waitFor(() => expect(pending).toHaveLength(1));
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-01-02" },
  });
  await waitFor(() => expect(pending).toHaveLength(2));
  expect(pending[0].signal?.aborted).toBe(true);
  pending[0].resolve({ ok: true, json: async () => trendsSample });
  expect(screen.getByText("Loading calendar activity…")).toBeInTheDocument();
  pending[1].resolve({
    ok: true,
    json: async () => ({
      ...trendsSample,
      daily: trendsSample.daily.map((day) => ({
        ...day,
        total: 0,
        discoveries: 0,
        repeats: 0,
      })),
    }),
  });
  expect(
    await screen.findByText(
      /No check-ins in 2026 for the selected reporting period/,
    ),
  ).toBeInTheDocument();
});
