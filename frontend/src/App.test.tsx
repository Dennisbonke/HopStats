import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi, test, expect } from "vitest";
import App from "./App";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/auth/me")
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 1,
            username: "local",
            created_at: "2026-10-14T00:00:00Z",
          }),
        });
      if (url === "/api/v1/health") return Promise.resolve({ ok: true });
      if (url === "/api/v1/dashboard") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total_checkins: 0,
            unique_beers: 0,
            unique_breweries: 0,
            unique_styles: 0,
            average_personal_rating: null,
            rated_checkins: 0,
            inventory_units: 0,
            unique_inventory_beers: 0,
            not_confirmed_checked_in: 0,
            match_coverage: {
              external_id: 0,
              exact: 0,
              ambiguous: 0,
              unmatched: 0,
            },
            freshness: {
              checkins_last_imported_at: null,
              inventory_last_imported_at: null,
              checkins_source_exported_at: null,
              inventory_source_exported_at: null,
            },
          }),
        });
      }
      if (String(url).startsWith("/api/v1/milestones"))
        return Promise.resolve({
          ok: true,
          json: async () => ({ milestones: [] }),
        });
      if (url === "/api/v1/insights")
        return Promise.resolve({
          ok: true,
          json: async () => ({ insights: [] }),
        });
      return Promise.resolve({
        ok: true,
        json: async () => ({ buckets: [] }),
      });
    }),
  );
});
afterEach(() => cleanup());
test("renders shell and navigation", async () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("🍺 HopStats")).toBeInTheDocument();
  expect(screen.getByText("Inventory")).toBeInTheDocument();
  expect(await screen.findByText("Backend: connected")).toBeInTheDocument();
});
test("shows connection failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      url === "/api/v1/auth/me"
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 1,
              username: "local",
              created_at: "2026-10-14T00:00:00Z",
            }),
          })
        : Promise.reject(new Error("offline")),
    ),
  );
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Backend: unavailable")).toBeInTheDocument();
});
