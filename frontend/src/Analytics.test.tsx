import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
