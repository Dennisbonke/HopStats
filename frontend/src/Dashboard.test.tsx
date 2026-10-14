import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

const dashboard = {
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

function renderDashboard(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => cleanup());

test("loads and formats dashboard metrics and freshness", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/v1/health") return Promise.resolve({ ok: true });
    if (url === "/api/v1/auth/me")
      return Promise.resolve({
        ok: true,
        json: async () => ({ username: "local" }),
      });
    return Promise.resolve({ ok: true, json: async () => dashboard });
  });

  renderDashboard(fetchMock);

  expect(await screen.findByText("2,924")).toBeInTheDocument();
  expect(screen.getByText("2,325")).toBeInTheDocument();
  expect(screen.getByText("4.50")).toBeInTheDocument();
  expect(screen.getByText("1,200 rated check-ins")).toBeInTheDocument();
  expect(screen.getByText("Confirmed by external ID")).toBeInTheDocument();
  expect(
    screen.getByText(
      new Date(dashboard.freshness.checkins_last_imported_at).toLocaleString(),
    ),
  ).toBeInTheDocument();
});

test("shows the empty state without implying imported data", async () => {
  const empty = {
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
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/v1/health") return Promise.resolve({ ok: true });
    if (url === "/api/v1/auth/me")
      return Promise.resolve({
        ok: true,
        json: async () => ({ username: "local" }),
      });
    return Promise.resolve({ ok: true, json: async () => empty });
  });

  renderDashboard(fetchMock);

  expect(
    await screen.findByText("Your dashboard is ready."),
  ).toBeInTheDocument();
  expect(screen.getByText("Go to Imports")).toBeInTheDocument();
  expect(screen.getByText("— rated check-ins")).toBeInTheDocument();
});

test("shows a useful error state when dashboard loading fails", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/v1/health") return Promise.resolve({ ok: true });
    if (url === "/api/v1/auth/me")
      return Promise.resolve({
        ok: true,
        json: async () => ({ username: "local" }),
      });
    return Promise.resolve({ ok: false, status: 503 });
  });

  renderDashboard(fetchMock);

  expect(
    await screen.findByText("Dashboard data is temporarily unavailable."),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Imports", { selector: "a" })).toHaveLength(2);
});
